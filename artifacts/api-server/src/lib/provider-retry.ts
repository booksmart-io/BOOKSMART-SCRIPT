export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function providerRetryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const retryAfter = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(4_000, retryAfter * 1_000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export function isRetryableProviderStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithProviderRetry(input: string | URL, init: RequestInit,
  options: { fetchImpl?: FetchLike; attempts?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let response: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      if (attempt + 1 >= attempts) throw error;
      await sleep(Math.min(4_000, 250 * (2 ** attempt)));
      continue;
    }
    if (!isRetryableProviderStatus(response.status) || attempt + 1 >= attempts) return response;
    await sleep(providerRetryDelayMs(response, attempt));
  }
  throw new Error("Provider retry limit reached");
}
