export interface TraceItem {
  label: string;
  value: string;
  href?: string;
}

export interface TraceResult {
  step: string;
  title: string;
  found: boolean;
  items: TraceItem[];
  message?: string;
  rawData?: unknown;
  burnAmount?: string;
  txHash?: string;
  tokenTransferAmount?: string | null;
  rawTx?: unknown;
}
