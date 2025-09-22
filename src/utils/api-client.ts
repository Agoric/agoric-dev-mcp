async function makeRequest<T>(
  url: string,
  options: RequestInit = {},
  acceptHeaders = 'application/json',
  toJson = true,
  retries = 3,
  retryDelay = 1000,
): Promise<T | null> {
  const headers = {
    Accept: acceptHeaders,
    ...options.headers,
  };

  let lastError: Error | null = null;
  let currentRetryDelay = retryDelay;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} - ${response.statusText}`,
        );
      }

      return toJson ? ((await response.json()) as T) : (response.text() as T);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `API request attempt ${attempt + 1} failed:`,
        lastError.message,
      );

      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, currentRetryDelay));
        currentRetryDelay *= 2; // Exponential backoff
      }
    }
  }

  console.error(
    `All ${retries} API request attempts failed for URL: ${url}`,
    lastError,
  );
  return null;
}

export async function get<T>(
  url: string,
  acceptHeaders = 'application/json',
  toJson = true,
  retries = 3,
  customHeaders?: Record<string, string>,
): Promise<T | null> {
  const options: RequestInit = {
    method: 'GET',
    headers: customHeaders || {},
  };
  return makeRequest<T>(url, options, acceptHeaders, toJson, retries);
}

export async function post<T>(
  url: string,
  data: unknown,
  toJson = true,
  retries = 3,
): Promise<T | null> {
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };

  return makeRequest<T>(url, options, 'application/json', toJson, retries);
}

export function buildUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/$/, '')}${endpoint}`;
}
