import type { MarstekStatus } from '../types/marstek';
import { callNativeQueryStatus, hasNativeAndroidBridge } from './nativeBridge';

export interface MarstekFetchOutcome {
  status: MarstekStatus;
  rawResponse: string;
  method: string;
  durationMs: number;
  extraLogs?: Array<{ method: string; rawResponse: string }>;
}

export class MarstekFetchError extends Error {
  rawResponse: string | null;
  method: string;
  durationMs: number;

  constructor(
    message: string,
    options: { rawResponse: string | null; method: string; durationMs: number }
  ) {
    super(message);
    this.name = 'MarstekFetchError';
    this.rawResponse = options.rawResponse;
    this.method = options.method;
    this.durationMs = options.durationMs;
  }
}

export async function fetchMarstekStatus(
  ip: string,
  port: number
): Promise<MarstekFetchOutcome> {
  const trimmedIp = ip.trim();
  if (!trimmedIp) {
    throw new MarstekFetchError('IP address cannot be empty', {
      rawResponse: null,
      method: 'ES.GetStatus',
      durationMs: 0,
    });
  }

  const started = Date.now();

  if (hasNativeAndroidBridge()) {
    const rawJson = await callNativeQueryStatus(trimmedIp, port);
    const payload = JSON.parse(rawJson) as {
      status?: MarstekStatus;
      rawResponse?: string | null;
      method?: string;
      durationMs?: number;
      extraLogs?: Array<{ method: string; rawResponse: string }>;
      error?: string;
    };

    if (payload.error || !payload.status) {
      throw new MarstekFetchError(payload.error || 'Timeout or unreachable', {
        rawResponse: payload.rawResponse ?? null,
        method: payload.method || 'ES.GetStatus',
        durationMs: payload.durationMs ?? Date.now() - started,
      });
    }

    return {
      status: payload.status,
      rawResponse: payload.rawResponse ?? JSON.stringify(payload.status),
      method: payload.method || 'ES.GetStatus',
      durationMs: payload.durationMs ?? Date.now() - started,
      extraLogs: payload.extraLogs,
    };
  }

  const response = await fetch('/api/marstek/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip: trimmedIp, port }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    status?: MarstekStatus;
    rawResponse?: string | null;
    method?: string;
    durationMs?: number;
    extraLogs?: Array<{ method: string; rawResponse: string }>;
    error?: string;
  };

  if (!response.ok || !payload.status) {
    throw new MarstekFetchError(payload.error || 'Timeout or unreachable', {
      rawResponse: payload.rawResponse ?? null,
      method: payload.method || 'ES.GetStatus',
      durationMs: payload.durationMs ?? Date.now() - started,
    });
  }

  return {
    status: payload.status,
    rawResponse: payload.rawResponse ?? JSON.stringify(payload.status),
    method: payload.method || 'ES.GetStatus',
    durationMs: payload.durationMs ?? Date.now() - started,
    extraLogs: payload.extraLogs,
  };
}
