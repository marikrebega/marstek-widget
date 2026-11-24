import type { OutageProviderInfo, OutageScheduleData } from '../types/marstek';
import { callNativeFetchOutages, hasNativeAndroidBridge } from './nativeBridge';

const NATIVE_PROVIDERS: OutageProviderInfo[] = [
  { id: 'prykarpattya-oe', name: 'Прикарпаттяобленерго (Івано-Франківська обл.)' },
  { id: 'yasno-kyiv', name: 'Київ (ДТЕК КЕМ · Yasno)' },
  { id: 'yasno-dnipro-dnem', name: 'Дніпро (ДнЕМ · Yasno)' },
  { id: 'yasno-dnipro-cek', name: 'Дніпро (ЦЕК · Yasno)' },
  { id: 'dtek-kyiv-region', name: 'Київська обл. (ДТЕК КРЕМ)' },
  { id: 'dtek-odesa', name: 'Одеська обл. (ДТЕК ОЕМ)' },
];

export async function fetchOutageProviders(): Promise<OutageProviderInfo[]> {
  if (hasNativeAndroidBridge()) {
    return NATIVE_PROVIDERS;
  }

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
  if (hasNativeAndroidBridge()) {
    const rawJson = await callNativeFetchOutages(providerId, group, forceRefresh);
    const payload = JSON.parse(rawJson) as OutageScheduleData & { error?: string };
    if (payload.error || !payload.slots) {
      throw new Error(payload.error || 'Не вдалося завантажити графік відключень');
    }
    return payload;
  }

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
