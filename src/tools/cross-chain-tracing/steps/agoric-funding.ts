import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import { get as httpGet } from '../../../utils/api-client';
import { bech32Agoric, bech32Noble } from '../schemas';
import { getMintscanHeaders, getNobleTxByIbc } from '../helpers';
import type { TraceItem } from '../types';
import { LogEventType } from '../constants';

export const agoricFundingTxHandlerSchema = {
  agoricAddress: bech32Agoric.describe('Agoric address (agoric1...)'),
  nobleAddress: bech32Noble.describe('Noble ICA address (noble1...)'),
  take: z
    .number()
    .optional()
    .default(20)
    .describe('Number of transactions to fetch (max 20, Mintscan API limit)'),
};

// Helper to extract receiver from logs
export function extractReceiverFromLogs(logs: any[]): string | null {
  if (!Array.isArray(logs)) return null;

  const events = logs.flatMap((log) => log?.events ?? []);

  for (const event of events) {
    const { type, attributes = [] } = event ?? {};

    if (
      type === LogEventType.RecvPacket.toString() ||
      type === LogEventType.WriteAcknowledgement.toString()
    ) {
      const packetData = attributes.find(
        (a: any) => a.key === 'packet_data',
      )?.value;
      if (!packetData) continue;

      try {
        const packet = JSON.parse(packetData);
        if (packet?.receiver) return packet.receiver;
      } catch {
        // Ignore invalid JSON
      }
    }

    if (type === LogEventType.FungibleTokenPacket.toString()) {
      const receiver = attributes.find((a: any) => a.key === 'receiver')?.value;
      if (receiver) return receiver;
    }
  }

  return null;
}

/**
 * Traces the Agoric funding transaction and IBC acknowledgment to Noble ICA.
 * This is Step 2 of the cross-chain flow, where funds are transferred from Agoric
 * to the Noble Interchain Account (ICA) via IBC (Inter-Blockchain Communication).
 *
 * High-level flow:
 * 1. Query Mintscan API for IBC acknowledgment transactions from Agoric address
 * 2. Parse transaction logs to extract the receiver address
 * 3. Match transactions where receiver is the Noble ICA address
 * 4. Extract IBC packet details (sequence, channel, port)
 * 5. Look up corresponding Noble transaction using IBC packet data
 * 6. Return links to both Agoric and Noble transactions on Mintscan
 */
export const agoricFundingTxHandler = async (params: {
  agoricAddress?: string;
  nobleAddress?: string;
  take?: number;
}) => {
  const { agoricAddress, nobleAddress, take = 20 } = params;
  if (!agoricAddress || !nobleAddress) {
    return ResponseFormatter.error('Missing required parameters');
  }

  try {
    const messageTypesKey = encodeURIComponent('messageTypes[0]');
    const messageTypeValue = '/ibc.core.channel.v1.MsgAcknowledgement';
    const url = `https://apis.mintscan.io/v1/agoric/accounts/${agoricAddress}/transactions?take=${take}&${messageTypesKey}=${messageTypeValue}`;

    const response = await httpGet(
      url,
      'application/json',
      true,
      3,
      getMintscanHeaders(),
    );

    const transactions =
      (response as any)?.data?.transactions ||
      (response as any)?.transactions ||
      [];

    const items: TraceItem[] = [];
    let foundRelevantTx = false;

    for (const tx of transactions) {
      const receiverAddress = extractReceiverFromLogs(tx?.logs || []);

      if (receiverAddress === nobleAddress) {
        foundRelevantTx = true;
        const txHash = tx.txhash;
        const messages = tx?.tx?.body?.messages || [];

        items.push({
          label: 'Agoric Tx',
          value: txHash,
          href: `https://www.mintscan.io/agoric/txs/${txHash}`,
        });

        items.push({
          label: 'Receiver',
          value: nobleAddress,
        });

        // Extract IBC packet details from messages
        for (const msg of messages) {
          if (msg?.packet?.sequence) {
            items.push({
              label: 'IBC Packet Seq',
              value: String(msg.packet.sequence),
            });
          }
          if (msg?.packet?.destination_channel) {
            items.push({
              label: 'IBC Channel',
              value: String(msg.packet.destination_channel),
            });
          }
          if (msg?.packet?.destination_port) {
            items.push({
              label: 'IBC Port',
              value: String(msg.packet.destination_port),
            });
          }
        }

        // Find Noble transaction
        const packetMsg = messages.find((m: any) => m?.packet);
        if (packetMsg?.packet) {
          try {
            const destChannel = packetMsg.packet.destination_channel;
            const sequence = packetMsg.packet.sequence;

            if (destChannel && sequence) {
              const nobleData = await getNobleTxByIbc(destChannel, sequence);
              const hashes = nobleData.hashes || [];

              if (hashes.length > 0) {
                const nobleHash = hashes[0];
                items.push({
                  label: 'Noble Tx',
                  value: nobleHash,
                  href: `https://www.mintscan.io/noble/txs/${nobleHash}`,
                });
              }
            }
          } catch (e) {
            console.error('Error fetching Noble tx by IBC:', e);
          }
        }

        break;
      }
    }

    return ResponseFormatter.success({
      title: 'Funding of Noble ICA + IBC ACK',
      found: foundRelevantTx,
      items,
      message: foundRelevantTx
        ? undefined
        : `No relevant IBC acknowledgment transactions found in the last ${transactions.length} transactions (Mintscan limit: 20)`,
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error tracing Agoric funding ACK step: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
