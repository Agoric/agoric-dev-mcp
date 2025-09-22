export const ResponseFormatter = {
  success(data: any, fallbackMessage?: string) {
    return {
      content: [
        {
          type: 'text' as const,
          text: data
            ? JSON.stringify(data, null, 2)
            : fallbackMessage || 'No data available',
        },
      ],
    };
  },

  error(message: string) {
    return {
      content: [
        {
          type: 'text' as const,
          text: message,
        },
      ],
    };
  },
};
