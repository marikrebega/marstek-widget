export interface MarstekStatus {
  batSoc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  totalPvEnergy: number;
  totalGridOutputEnergy: number;
  totalGridInputEnergy: number;
  timestamp: number;
}

export interface MarstekLogEntry {
  id: string;
  timestamp: string;
  target: string;
  method: string;
  source: 'udp' | 'demo';
  ok: boolean;
  durationMs: number;
  rawPayload: string;
}

export type BatteryMode = 'charging' | 'discharging' | 'idle';

export interface OutageSlot {
  id: string;
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface OutageConfig {
  mode: 'api' | 'manual';
  providerId: string;
  group: string;
}

export interface OutageProviderInfo {
  id: string;
  name: string;
}

export interface OutageScheduleData {
  providerId: string;
  providerName: string;
  availableGroups: string[];
  selectedGroup: string;
  status: string;
  updatedOn: string | null;
  dateLabel: string;
  slots: OutageSlot[];
  tomorrowSlots: OutageSlot[];
  sourceUrl: string;
}

export interface BatteryLimits {
  dischargeLimit: number; // % e.g. 10
  chargeLimit: number;    // % e.g. 90
}

export const DEFAULT_OUTAGE_SLOTS: OutageSlot[] = [
  { id: 'slot-1', start: '02:00', end: '04:30' },
  { id: 'slot-2', start: '10:00', end: '12:30' },
  { id: 'slot-3', start: '18:00', end: '20:30' },
];

export const DEFAULT_OUTAGE_CONFIG: OutageConfig = {
  mode: 'api',
  providerId: 'prykarpattya-oe',
  group: '1.1',
};

export const DEFAULT_LIMITS: BatteryLimits = {
  dischargeLimit: 10,
  chargeLimit: 90,
};

export function getKyivMinutes(date: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return (hour % 24) * 60 + minute;
    }
  } catch {
    // Fallback to local clock
  }
  return date.getHours() * 60 + date.getMinutes();
}

export function getBatteryMode(onGridPower: number): BatteryMode {
  if (onGridPower > 50) return 'charging';
  if (onGridPower < -50) return 'discharging';
  return 'idle';
}

export function getModeVisuals(mode: BatteryMode): {
  label: string;
  color: string;
} {
  switch (mode) {
    case 'charging':
      return { label: 'Заряджається', color: '#3DDC84' };
    case 'discharging':
      return { label: 'Розряджається', color: '#5AB0FF' };
    case 'idle':
      return { label: 'Очікування', color: '#8FA3B8' };
  }
}

export function formatPowerUk(watts: number): string {
  const absW = Math.abs(watts);
  const sign = watts > 50 ? '+' : watts < -50 ? '−' : '';
  if (absW >= 1000) {
    const kw = (absW / 1000).toFixed(1).replace('.', ',');
    return `${sign}${kw} кВт`;
  }
  if (Math.abs(watts) <= 50 && watts === 0) {
    return '0 Вт';
  }
  return `${sign}${absW} Вт`;
}

export function formatDurationUk(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const minsPadded = hours > 0 ? String(mins).padStart(2, '0') : String(mins);
  return `${hours} год ${minsPadded} хв`;
}

export function computeEnergyDurations(
  soc: number,
  batCapWh: number,
  onGridPower: number,
  limits: BatteryLimits
): {
  mode: BatteryMode;
  withLimitsText: string;
  withoutLimitsText: string;
  compactSubText: string;
  leftLabel: string;
  rightLabel: string;
  cardTitle: string;
} {
  const mode = getBatteryMode(onGridPower);
  const capacityWh = batCapWh > 0 ? batCapWh : 5120;
  const clampedSoc = Math.max(0, Math.min(100, soc));

  if (mode === 'charging') {
    const powerW = Math.max(1, onGridPower);
    const toLimitPct = Math.max(0, limits.chargeLimit - clampedSoc);
    const toFullPct = Math.max(0, 100 - clampedSoc);

    const minsToLimit = ((toLimitPct / 100) * capacityWh) / powerW * 60;
    const minsToFull = ((toFullPct / 100) * capacityWh) / powerW * 60;

    const withLimitsText =
      clampedSoc >= limits.chargeLimit ? 'Досягнуто' : formatDurationUk(minsToLimit);
    const withoutLimitsText =
      clampedSoc >= 100 ? 'Заряджено' : formatDurationUk(minsToFull);

    return {
      mode,
      cardTitle: 'До повного заряду',
      leftLabel: `З лімітами (до ${limits.chargeLimit}%)`,
      rightLabel: 'Без лімітів (до 100%)',
      withLimitsText,
      withoutLimitsText,
      compactSubText: `до ${limits.chargeLimit}% · без ліміту ${withoutLimitsText}`,
    };
  }

  if (mode === 'discharging') {
    const powerW = Math.max(1, Math.abs(onGridPower));
    const toLimitPct = Math.max(0, clampedSoc - limits.dischargeLimit);
    const toZeroPct = clampedSoc;

    const minsToLimit = ((toLimitPct / 100) * capacityWh) / powerW * 60;
    const minsToZero = ((toZeroPct / 100) * capacityWh) / powerW * 60;

    const withLimitsText =
      clampedSoc <= limits.dischargeLimit ? 'Досягнуто' : formatDurationUk(minsToLimit);
    const withoutLimitsText =
      clampedSoc <= 0 ? 'Розряджено' : formatDurationUk(minsToZero);

    return {
      mode,
      cardTitle: 'До розряду',
      leftLabel: `З лімітами (до ${limits.dischargeLimit}%)`,
      rightLabel: 'Без лімітів (до 0%)',
      withLimitsText,
      withoutLimitsText,
      compactSubText: `до ${limits.dischargeLimit}% · без ліміту ${withoutLimitsText}`,
    };
  }

  const isAtChargeLimit = clampedSoc >= limits.chargeLimit;
  const isAtDischargeLimit = clampedSoc <= limits.dischargeLimit;
  const remainingPct = Math.max(0, 100 - clampedSoc);
  const estTopOffMins = ((remainingPct / 100) * capacityWh) / 800 * 60;
  const availableWh = Math.round(((Math.max(0, clampedSoc - limits.dischargeLimit)) / 100) * capacityWh);

  return {
    mode,
    cardTitle: 'Очікування',
    leftLabel: isAtChargeLimit
      ? 'Ліміт заряду'
      : isAtDischargeLimit
      ? 'Ліміт розряду'
      : 'Режим',
    rightLabel: isAtChargeLimit ? 'Без лімітів (до 100%)' : 'Доступний запас',
    withLimitsText: isAtChargeLimit || isAtDischargeLimit ? 'Досягнуто' : 'Готово',
    withoutLimitsText: isAtChargeLimit
      ? `ще ${formatDurationUk(estTopOffMins)}`
      : `${availableWh} Вт·год`,
    compactSubText: isAtChargeLimit
      ? `ліміт ${limits.chargeLimit}% досягнуто`
      : `запас ${availableWh} Вт·год`,
  };
}

export function timeStringToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export interface OutageSummary {
  rangeText: string;
  countdownText: string;
  compactCountdownText: string;
  isActiveNow: boolean;
  nowPercent: number;
  blocks: Array<{ id: string; leftPct: number; widthPct: number }>;
}

export function evaluateOutageSchedule(
  slots: OutageSlot[],
  nowMinutes: number,
  tomorrowSlots: OutageSlot[] = []
): OutageSummary {
  const clampedNow = Math.max(0, Math.min(1440, nowMinutes));
  const normalize = (arr: OutageSlot[]) =>
    [...arr]
      .map((slot) => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        startMin: timeStringToMinutes(slot.start),
        endMin: timeStringToMinutes(slot.end),
      }))
      .filter((s) => s.endMin > s.startMin)
      .sort((a, b) => a.startMin - b.startMin);

  const sorted = normalize(slots);
  const sortedTomorrow = normalize(tomorrowSlots);

  const blocks = sorted.map((s) => ({
    id: s.id,
    leftPct: (s.startMin / 1440) * 100,
    widthPct: ((s.endMin - s.startMin) / 1440) * 100,
  }));

  const currentSlot = sorted.find(
    (s) => clampedNow >= s.startMin && clampedNow < s.endMin
  );

  if (currentSlot) {
    const minsLeft = currentSlot.endMin - clampedNow;
    const dur = formatDurationUk(minsLeft);
    return {
      rangeText: `${currentSlot.start} – ${currentSlot.end}`,
      countdownText: `Відключення зараз · світло через ${dur}`,
      compactCountdownText: `Світло увімкнуть через ${dur}`,
      isActiveNow: true,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
    };
  }

  const nextSlot = sorted.find((s) => s.startMin > clampedNow);
  if (nextSlot) {
    const minsUntil = nextSlot.startMin - clampedNow;
    const dur = formatDurationUk(minsUntil);
    return {
      rangeText: `${nextSlot.start} – ${nextSlot.end}`,
      countdownText: `Наступне відключення через ${dur}`,
      compactCountdownText: `Світло вимкнуть через ${dur}`,
      isActiveNow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
    };
  }

  if (sortedTomorrow.length > 0) {
    const firstTomorrow = sortedTomorrow[0];
    const minsUntil = 1440 - clampedNow + firstTomorrow.startMin;
    const dur = formatDurationUk(minsUntil);
    return {
      rangeText: `${firstTomorrow.start} – ${firstTomorrow.end}`,
      countdownText: `Завтра · через ${dur}`,
      compactCountdownText: `Завтра о ${firstTomorrow.start}`,
      isActiveNow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
    };
  }

  if (sorted.length > 0) {
    return {
      rangeText: 'Без відключень',
      countdownText: 'На сьогодні відключень більше немає',
      compactCountdownText: 'На сьогодні відключень немає',
      isActiveNow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
    };
  }

  return {
    rangeText: 'Немає відключень',
    countdownText: 'На сьогодні відключень не заплановано',
    compactCountdownText: 'Без відключень сьогодні',
    isActiveNow: false,
    nowPercent: (clampedNow / 1440) * 100,
    blocks,
  };
}

export function formatTimeHHMM(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatTimeHHMMSS(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
