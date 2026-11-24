interface MarstekNativeInterface {
  queryStatusAsync(requestId: string, ip: string, port: number): void;
  fetchOutagesAsync(
    requestId: string,
    providerId: string,
    group: string,
    forceRefresh: boolean
  ): void;
  saveConfig?: (
    ip: string,
    port: number,
    providerId: string,
    group: string
  ) => void;
  loadConfig?: () => string;
}

interface PendingCallback {
  resolve: (json: string) => void;
  reject: (err: Error) => void;
}

declare global {
  interface Window {
    MarstekNative?: MarstekNativeInterface;
    __marstekNativeCallback?: (requestId: string, ok: boolean, payload: string) => void;
  }
}

const pending = new Map<string, PendingCallback>();

function ensureCallbackRegistered(): void {
  if (typeof window !== 'undefined' && !window.__marstekNativeCallback) {
    window.__marstekNativeCallback = (requestId: string, ok: boolean, payload: string) => {
      const entry = pending.get(requestId);
      if (!entry) return;
      pending.delete(requestId);
      if (ok) {
        entry.resolve(payload);
      } else {
        entry.reject(new Error(payload || 'Native bridge error'));
      }
    };
  }
}

export function hasNativeAndroidBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.MarstekNative);
}

export function syncConfigToNativeAndroid(params: {
  ip: string;
  port: number;
  providerId: string;
  group: string;
}): void {
  if (typeof window !== 'undefined' && window.MarstekNative?.saveConfig) {
    window.MarstekNative.saveConfig(
      params.ip,
      params.port,
      params.providerId,
      params.group
    );
  }
}

export function callNativeQueryStatus(ip: string, port: number): Promise<string> {
  ensureCallbackRegistered();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    window.MarstekNative!.queryStatusAsync(requestId, ip, port);
  });
}

export function callNativeFetchOutages(
  providerId: string,
  group: string,
  forceRefresh: boolean
): Promise<string> {
  ensureCallbackRegistered();
  const requestId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    window.MarstekNative!.fetchOutagesAsync(requestId, providerId, group, forceRefresh);
  });
}
