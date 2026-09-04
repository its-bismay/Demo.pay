const MAX_RPM = 15;
const MAX_TPM = 250000;
const MAX_RPD = 500;

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

const requestHistory: RequestRecord[] = [];
let backoffUntil = 0;

function cleanupOldRequests(now: number): void {
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  while (requestHistory.length > 0 && requestHistory[0].timestamp < oneDayAgo) {
    requestHistory.shift();
  }
}

export function isGeminiRateLimited(): boolean {
  const now = Date.now();
  if (now < backoffUntil) {
    return true;
  }

  cleanupOldRequests(now);

  const oneMinuteAgo = now - 60 * 1000;
  let requestsLastMinute = 0;
  let tokensLastMinute = 0;

  for (let i = requestHistory.length - 1; i >= 0; i--) {
    const item = requestHistory[i];
    if (item.timestamp >= oneMinuteAgo) {
      requestsLastMinute++;
      tokensLastMinute += item.tokens;
    } else {
      break;
    }
  }

  if (requestsLastMinute >= MAX_RPM) {
    return true;
  }

  if (tokensLastMinute >= MAX_TPM) {
    return true;
  }

  if (requestHistory.length >= MAX_RPD) {
    return true;
  }

  return false;
}

export function recordGeminiRequest(estimatedTokens = 800): void {
  const now = Date.now();
  cleanupOldRequests(now);
  requestHistory.push({ timestamp: now, tokens: estimatedTokens });
}

export function recordGeminiRateLimitHit(retryAfterSeconds = 60): void {
  backoffUntil = Date.now() + retryAfterSeconds * 1000;
}

export async function executeWithGeminiRateLimit<T>(
  action: () => Promise<T>,
  fallback: (() => Promise<T> | T) | T,
  estimatedTokens = 800
): Promise<T> {
  const resolveFallback = async (): Promise<T> => {
    if (typeof fallback === 'function') {
      return await (fallback as () => Promise<T> | T)();
    }
    return fallback;
  };

  if (isGeminiRateLimited()) {
    console.warn('Gemini rate limit threshold reached (15 RPM / 250K TPM / 500 RPD). Triggering rule fallback.');
    return await resolveFallback();
  }

  try {
    recordGeminiRequest(estimatedTokens);
    return await action();
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      console.warn('Gemini 429 quota exhausted. Backing off and invoking fallback.');
      recordGeminiRateLimitHit(60);
    }
    return await resolveFallback();
  }
}
