export interface MarstekStatus {
  batSoc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  totalPvEnergy: number;
  totalGridOutputEnergy: number;
  totalGridInputEnergy: number;
  totalLoadEnergy?: number;
  deviceName?: string;
  workMode?: string;
  batTemp?: number;
  timestamp: number;
}

export interface MarstekLogEntry {
  id: string;
  timestamp: string;
  target: string;
  method: string;
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

export const DEFAULT_OUTAGE_CONFIG: OutageConfig = {
  providerId: 'prykarpattya-oe',
  group: '5.2',
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

export function getNetBatteryPower(
  pvPower: number,
  onGridPower: number,
  offGridPower: number = 0
): number {
  // Marstek ES.GetStatus convention:
  // ongrid_power < 0 = importing from grid (charging)
  // ongrid_power > 0 = exporting to grid/load (discharging)
  // offgrid_power > 0 = supplying EPS load (discharging)
  // pv_power > 0 = solar input (charging)
  return pvPower - onGridPower - offGridPower;
}

export function getBatteryMode(netBatteryPower: number): BatteryMode {
  if (netBatteryPower > 25) return 'charging';
  if (netBatteryPower < -25) return 'discharging';
  return 'idle';
}

export function getTemperatureVisuals(tempC?: number): {
  label: string;
  color: string;
  bgColor: string;
  level: 'normal' | 'warn' | 'critical' | 'unknown';
} {
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) {
    return {
      label: '--°C',
      color: '#A8B0B8',
      bgColor: '#1B2025',
      level: 'unknown',
    };
  }
  const rounded = Math.round(tempC);
  const label = `${rounded}°C`;
  if (rounded <= 0 || rounded >= 50) {
    return {
      label,
      color: '#F44336',
      bgColor: 'rgba(244,67,54,0.16)',
      level: 'critical',
    };
  }
  if (rounded <= 9 || rounded >= 41) {
    return {
      label,
      color: '#FFC24D',
      bgColor: 'rgba(255,194,77,0.16)',
      level: 'warn',
    };
  }
  return {
    label,
    color: '#3DDC84',
    bgColor: 'rgba(61,220,132,0.16)',
    level: 'normal',
  };
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
      return { label: 'Пауза', color: '#8FA3B8' };
  }
}

export function formatPowerUk(netBatteryPower: number): string {
  const absW = Math.abs(netBatteryPower);
  if (absW <= 25) {
    return '0 Вт';
  }
  if (absW >= 1000) {
    const kw = (absW / 1000).toFixed(1).replace('.', ',');
    return `${kw} кВт`;
  }
  return `${absW} Вт`;
}

export function formatDurationUk(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const minsPadded = hours > 0 ? String(mins).padStart(2, '0') : String(mins);
  return `${hours} год ${minsPadded} хв`;
}

export function formatCompactDurationUk(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  if (hours === 0) return `${mins}хв`;
  return `${hours}г${String(mins).padStart(2, '0')}хв`;
}

export function computeEnergyDurations(
  soc: number,
  batCapWh: number,
  netBatteryPower: number
): {
  mode: BatteryMode;
  primaryValueText: string;
  compactPrimaryValueText: string;
  secondaryValueText: string;
  compactSubText: string;
  leftLabel: string;
  rightLabel: string;
  cardTitle: string;
  dischargeMinutesLeft: number | null;
} {
  const mode = getBatteryMode(netBatteryPower);
  const capacityWh = batCapWh > 0 ? batCapWh : 2560;
  const clampedSoc = Math.max(0, Math.min(100, soc));
  const availableWh = Math.round((clampedSoc / 100) * capacityWh);
  const remainingWh = Math.max(0, capacityWh - availableWh);

  if (mode === 'charging') {
    const powerW = Math.max(1, Math.abs(netBatteryPower));
    const toFullPct = Math.max(0, 100 - clampedSoc);
    const minsToFull = ((toFullPct / 100) * capacityWh) / powerW * 60;
    const primaryValueText =
      clampedSoc >= 100 ? 'Заряджено' : formatDurationUk(minsToFull);
    const compactPrimaryValueText =
      clampedSoc >= 100 ? 'Заряджено' : formatCompactDurationUk(minsToFull);

    return {
      mode,
      cardTitle: 'До повного заряду',
      leftLabel: 'До 100%',
      rightLabel: 'Залишилось зарядити',
      primaryValueText,
      compactPrimaryValueText,
      secondaryValueText: `${remainingWh} Вт·год`,
      compactSubText: `до 100% · ${formatPowerUk(netBatteryPower)}`,
      dischargeMinutesLeft: null,
    };
  }

  if (mode === 'discharging') {
    const powerW = Math.max(1, Math.abs(netBatteryPower));
    const minsToZero = ((clampedSoc / 100) * capacityWh) / powerW * 60;
    const primaryValueText =
      clampedSoc <= 0 ? 'Розряджено' : formatDurationUk(minsToZero);
    const compactPrimaryValueText =
      clampedSoc <= 0 ? 'Розряджено' : formatCompactDurationUk(minsToZero);

    return {
      mode,
      cardTitle: 'До розряду',
      leftLabel: 'До 0%',
      rightLabel: 'Залишок енергії',
      primaryValueText,
      compactPrimaryValueText,
      secondaryValueText: `${availableWh} Вт·год`,
      compactSubText: `до 0% · ${formatPowerUk(netBatteryPower)}`,
      dischargeMinutesLeft: Math.round(minsToZero),
    };
  }

  return {
    mode,
    cardTitle: 'Стан батареї',
    leftLabel: 'Запас енергії',
    rightLabel: 'Ємність батареї',
    primaryValueText: `${availableWh} Вт·год`,
    compactPrimaryValueText: `${availableWh} Вт·г`,
    secondaryValueText: `${capacityWh} Вт·год`,
    compactSubText: `ємність ${capacityWh} Вт·год`,
    dischargeMinutesLeft: null,
  };
}

export function timeStringToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export interface OutageRollingMarker {
  id: string;
  leftPct: number;
  label: string;
}

export interface OutageSummary {
  rangeText: string;
  countdownText: string;
  compactCountdownText: string;
  shortActionText: string;
  microTimeText: string;
  targetOutageMinutes: number | null;
  isActiveNow: boolean;
  isHeadlineTomorrow: boolean;
  nowPercent: number;
  blocks: Array<{ id: string; leftPct: number; widthPct: number }>;
  rollingBlocks: Array<{ id: string; leftPct: number; widthPct: number }>;
  rollingMarkers: OutageRollingMarker[];
  rollingEndLabel: string;
  todaySlotChips: Array<{ id: string; label: string; isHighlight: boolean }>;
}

function minutesToHHMM(absMinutes: number): string {
  const normalized = ((Math.round(absMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function toDayBlocks(
  slots: OutageSlot[]
): Array<{ id: string; leftPct: number; widthPct: number }> {
  return slots
    .map((s) => {
      const [sh, sm] = s.start.split(':').map((n) => Number.parseInt(n, 10));
      const [eh, em] = s.end.split(':').map((n) => Number.parseInt(n, 10));
      const startMin =
        (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
      const endMin =
        (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
      return {
        id: s.id,
        leftPct: (startMin / 1440) * 100,
        widthPct: Math.max(0, ((endMin - startMin) / 1440) * 100),
      };
    })
    .filter((b) => b.widthPct > 0);
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

  // Compute rolling +12h (720 min) window starting at clampedNow
  const windowMinutes = 720;
  const windowEnd = clampedNow + windowMinutes;
  const combinedAbsSlots = [
    ...sorted.map((s) => ({
      id: `today-${s.id}`,
      absStart: s.startMin,
      absEnd: s.endMin,
      startLabel: s.start,
      endLabel: s.end,
    })),
    ...sortedTomorrow.map((s) => ({
      id: `tomorrow-${s.id}`,
      absStart: 1440 + s.startMin,
      absEnd: 1440 + s.endMin,
      startLabel: s.start,
      endLabel: s.end,
    })),
  ];

  const rollingBlocks: Array<{ id: string; leftPct: number; widthPct: number }> = [];
  const candidateMarks: Array<{ id: string; leftPct: number; label: string; priority: number }> = [];

  for (const s of combinedAbsSlots) {
    if (s.absEnd <= clampedNow || s.absStart >= windowEnd) continue;
    const clipStart = Math.max(clampedNow, s.absStart);
    const clipEnd = Math.min(windowEnd, s.absEnd);
    const leftPct = ((clipStart - clampedNow) / windowMinutes) * 100;
    const widthPct = ((clipEnd - clipStart) / windowMinutes) * 100;
    rollingBlocks.push({
      id: s.id,
      leftPct,
      widthPct,
    });

    const isOngoing = s.absStart <= clampedNow && s.absEnd > clampedNow;
    if (!isOngoing && s.absStart > clampedNow && s.absStart < windowEnd) {
      candidateMarks.push({
        id: `${s.id}-start`,
        leftPct,
        label: s.startLabel,
        priority: 1,
      });
    }
    if (s.absEnd > clampedNow && s.absEnd < windowEnd) {
      const endPct = ((s.absEnd - clampedNow) / windowMinutes) * 100;
      candidateMarks.push({
        id: `${s.id}-end`,
        leftPct: endPct,
        label: s.endLabel,
        priority: isOngoing ? 0 : 2,
      });
    }
  }

  // Filter rolling markers so they never collide with "Зараз" (0%), "+12г" (100%), or each other
  const rollingMarkers: OutageRollingMarker[] = [];
  const sortedCandidates = [...candidateMarks].sort(
    (a, b) => a.priority - b.priority || a.leftPct - b.leftPct
  );
  for (const cand of sortedCandidates) {
    if (cand.leftPct < 23 || cand.leftPct > 77) continue;
    const collides = rollingMarkers.some((m) => Math.abs(m.leftPct - cand.leftPct) < 26);
    if (!collides) {
      rollingMarkers.push({
        id: cand.id,
        leftPct: cand.leftPct,
        label: cand.label,
      });
    }
    if (rollingMarkers.length >= 2) break;
  }
  rollingMarkers.sort((a, b) => a.leftPct - b.leftPct);

  const rollingEndLabel = minutesToHHMM(windowEnd);

  const currentSlot = sorted.find(
    (s) => clampedNow >= s.startMin && clampedNow < s.endMin
  );
  const nextSlot = sorted.find((s) => s.startMin > clampedNow);

  const todaySlotChips = sorted.map((s) => ({
    id: s.id,
    label: `${s.start}–${s.end}`,
    isHighlight: s.id === (currentSlot?.id ?? nextSlot?.id),
  }));

  if (currentSlot) {
    const minsLeft = currentSlot.endMin - clampedNow;
    const dur = formatDurationUk(minsLeft);
    const shortDur = formatCompactDurationUk(minsLeft);
    return {
      rangeText: `${currentSlot.start}–${currentSlot.end}`,
      countdownText: `Світло о ${currentSlot.end} (через ${dur})`,
      compactCountdownText: `Світло о ${currentSlot.end} · ${shortDur}`,
      shortActionText: `о ${currentSlot.end} (${shortDur})`,
      microTimeText: `о ${currentSlot.end}`,
      targetOutageMinutes: minsLeft,
      isActiveNow: true,
      isHeadlineTomorrow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
      rollingBlocks,
      rollingMarkers,
      rollingEndLabel,
      todaySlotChips,
    };
  }

  if (nextSlot) {
    const minsUntil = nextSlot.startMin - clampedNow;
    const dur = formatDurationUk(minsUntil);
    const shortDur = formatCompactDurationUk(minsUntil);
    return {
      rangeText: `${nextSlot.start}–${nextSlot.end}`,
      countdownText: `Вимкнення о ${nextSlot.start} (через ${dur})`,
      compactCountdownText: `Вимкн. о ${nextSlot.start} · ${shortDur}`,
      shortActionText: `${nextSlot.start} (${shortDur})`,
      microTimeText: `о ${nextSlot.start}`,
      targetOutageMinutes: nextSlot.endMin - nextSlot.startMin,
      isActiveNow: false,
      isHeadlineTomorrow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
      rollingBlocks,
      rollingMarkers,
      rollingEndLabel,
      todaySlotChips,
    };
  }

  if (sortedTomorrow.length > 0) {
    const firstTomorrow = sortedTomorrow[0];
    const minsUntil = 1440 - clampedNow + firstTomorrow.startMin;
    const dur = formatDurationUk(minsUntil);
    const shortDur = formatCompactDurationUk(minsUntil);
    const todayTouchesMidnight = sorted.some((s) => s.endMin >= 1440);
    const isContiguousWithToday = todayTouchesMidnight && firstTomorrow.startMin === 0;
    return {
      rangeText: `${firstTomorrow.start}–${firstTomorrow.end}`,
      countdownText: `Завтра о ${firstTomorrow.start} (через ${dur})`,
      compactCountdownText: `Завтра о ${firstTomorrow.start} · ${shortDur}`,
      shortActionText: `завтра ${firstTomorrow.start}`,
      microTimeText: firstTomorrow.start,
      targetOutageMinutes: firstTomorrow.endMin - firstTomorrow.startMin,
      isActiveNow: false,
      isHeadlineTomorrow: !isContiguousWithToday,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
      rollingBlocks,
      rollingMarkers,
      rollingEndLabel,
      todaySlotChips,
    };
  }

  if (sorted.length > 0) {
    return {
      rangeText: 'Без відключень',
      countdownText: 'На сьогодні відключень більше немає',
      compactCountdownText: 'Без відключень',
      shortActionText: 'Світло є',
      microTimeText: 'Є світло',
      targetOutageMinutes: null,
      isActiveNow: false,
      isHeadlineTomorrow: false,
      nowPercent: (clampedNow / 1440) * 100,
      blocks,
      rollingBlocks,
      rollingMarkers,
      rollingEndLabel,
      todaySlotChips,
    };
  }

  return {
    rangeText: 'Немає відключень',
    countdownText: 'На сьогодні відключень не заплановано',
    compactCountdownText: 'Без відключень',
    shortActionText: 'Без відключень',
    microTimeText: 'Є світло',
    targetOutageMinutes: null,
    isActiveNow: false,
    isHeadlineTomorrow: false,
    nowPercent: (clampedNow / 1440) * 100,
    blocks,
    rollingBlocks,
    rollingMarkers,
    rollingEndLabel,
    todaySlotChips,
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
