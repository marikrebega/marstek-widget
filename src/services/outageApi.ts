import type { OutageProviderInfo, OutageScheduleData } from '../types/marstek';

export async function fetchOutageProviders(): Promise<OutageProviderInfo[]> {
  const response = await fetch('/api/outages/providers');
  const payload = (await response.json().catch(() => ({}))) as {
    providers?: OutageProviderInfo[];
    error?: string;
  };
  if (!response.ok || !payload.providers) {
    throw new Error(payload.error || 'Не вдалося завантажити список регіонів');
  }
  return payload.providers;
}

export async function fetchOutageSchedule(
  providerId: string,
  group: string,
  forceRefresh = false
): Promise<OutageScheduleData> {
  const params = new URLSearchParams({
    provider: providerId,
    group,
  });
  if (forceRefresh) {
    params.set('refresh', '1');
  }

  const response = await fetch(`/api/outages/schedule?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as OutageScheduleData & {
    error?: string;
  };

  if (!response.ok || !payload.slots) {
    throw new Error(payload.error || 'Не вдалося завантажити графік відключень');
  }

  return payload;
}
