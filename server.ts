import dgram from 'node:dgram';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.APP_PORT) || 3000;
const SOCKET_TIMEOUT_MS = 3500;
const PROBE_TIMEOUT_MS = 2500;
const MAX_RETRIES = 2;

interface RawMarstekPayload {
  error?: { message?: string } | string | null;
  result?: Record<string, unknown>;
  last_success_payload?: {
    result?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface MarstekStatusDto {
  batSoc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  totalPvEnergy: number;
  totalGridOutputEnergy: number;
  totalGridInputEnergy: number;
  totalLoadEnergy: number;
  deviceName?: string;
  workMode?: string;
  batTemp?: number;
  timestamp: number;
}

interface ExtraLog {
  method: string;
  rawResponse: string;
}

interface QueryOutcome {
  status: MarstekStatusDto;
  rawResponse: string;
  method: string;
  durationMs: number;
  extraLogs?: ExtraLog[];
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return fallback;
}

function toTempC(value: unknown): number | undefined {
  let num: number | undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    num = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = value
      .trim()
      .replace(/°C/gi, '')
      .replace(/℃/g, '')
      .replace(',', '.')
      .trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      num = parsed;
    }
  }
  if (num === undefined) return undefined;
  const normalized = num > 120 ? num / 10 : num;
  return Math.round(normalized * 10) / 10;
}

function extractResultRecord(root: RawMarstekPayload): Record<string, unknown> {
  if (Array.isArray(root.result) && root.result.length > 0 && typeof root.result[0] === 'object' && root.result[0] !== null) {
    return root.result[0] as Record<string, unknown>;
  }
  if (root.result && typeof root.result === 'object') {
    return root.result;
  }
  if (
    root.last_success_payload &&
    typeof root.last_success_payload === 'object' &&
    root.last_success_payload.result &&
    typeof root.last_success_payload.result === 'object'
  ) {
    return root.last_success_payload.result;
  }
  return root;
}

function findTempInRecord(record: Record<string, unknown>): number | undefined {
  const priorityKeys = [
    'bat_temp',
    'temp',
    'temperature',
    'cell_temp',
    'bms_temp',
    'bat_t',
    'mos_temp',
    'env_temp',
  ];
  for (const key of priorityKeys) {
    const parsed = toTempC(record[key]);
    if (parsed !== undefined) return parsed;
  }
  for (const [key, val] of Object.entries(record)) {
    if (key.toLowerCase().includes('temp')) {
      const parsed = toTempC(val);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMarstekJson(jsonStr: string): MarstekStatusDto {
  const root = JSON.parse(jsonStr) as RawMarstekPayload;

  if (root.error !== undefined && root.error !== null) {
    const errMsg =
      typeof root.error === 'object' && root.error !== null
        ? root.error.message ?? JSON.stringify(root.error)
        : String(root.error);
    throw new Error(`Marstek API error: ${errMsg}`);
  }

  const result = extractResultRecord(root);

  const deviceName = typeof root.src === 'string' && root.src.trim() ? root.src.trim() : undefined;

  return {
    batSoc: toInt(result.bat_soc, 0),
    batCap: toInt(result.bat_cap, 0),
    pvPower: toInt(result.pv_power, 0),
    onGridPower: toInt(result.ongrid_power, 0),
    offGridPower: toInt(result.offgrid_power, 0),
    totalPvEnergy: toInt(result.total_pv_energy, 0),
    totalGridOutputEnergy: toInt(result.total_grid_output_energy, 0),
    totalGridInputEnergy: toInt(result.total_grid_input_energy, 0),
    totalLoadEnergy: toInt(result.total_load_energy, 0),
    deviceName,
    batTemp: findTempInRecord(result),
    timestamp: Date.now(),
  };
}

class UdpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UdpTimeoutError';
  }
}

class MarstekQueryError extends Error {
  rawResponse: string | null;
  method: string;
  durationMs: number;

  constructor(
    message: string,
    options: { rawResponse: string | null; method: string; durationMs: number }
  ) {
    super(message);
    this.name = 'MarstekQueryError';
    this.rawResponse = options.rawResponse;
    this.method = options.method;
    this.durationMs = options.durationMs;
  }
}

function sendUdpCommand(
  ipAddress: string,
  port: number,
  payload: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;

    const cleanup = () => {
      try {
        socket.close();
      } catch {
        // Ignore already-closed socket
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new UdpTimeoutError(`No UDP reply from ${ipAddress}:${port}`));
    }, timeoutMs);

    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(err);
    });

    socket.on('message', (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(msg.toString('utf8').trim());
    });

    const buffer = Buffer.from(payload, 'utf8');
    socket.send(buffer, 0, buffer.length, port, ipAddress, (err) => {
      if (err && !settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    });
  });
}

async function probeDevice(ipAddress: string, port: number): Promise<string | null> {
  try {
    const payload = '{"id": 0, "method": "Marstek.GetDevice", "params": {"ble_mac": "0"}}';
    return await sendUdpCommand(ipAddress, port, payload, PROBE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function queryOptionalDetails(
  ipAddress: string,
  port: number
): Promise<{
  extraLogs: ExtraLog[];
  ratedCapacity: number;
  workMode?: string;
  batTemp?: number;
}> {
  const extraLogs: ExtraLog[] = [];
  let ratedCapacity = 0;
  let workMode: string | undefined;
  let batTemp: number | undefined;

  // Query sequentially with 250ms pause + 1 retry so Venus D UDP stack does not drop packets
  let batLastErr: string | null = null;
  let batSucceeded = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sleepMs(250);
      const batRaw = await sendUdpCommand(
        ipAddress,
        port,
        '{"id": 2, "method": "Bat.GetStatus", "params": {"id": 0}}',
        2000
      );
      if (batRaw) {
        extraLogs.push({ method: 'Bat.GetStatus', rawResponse: batRaw });
        const parsed = JSON.parse(batRaw) as RawMarstekPayload;
        if (parsed.error === undefined || parsed.error === null) {
          const rec = extractResultRecord(parsed);
          ratedCapacity = toInt(rec.rated_capacity, 0);
          batTemp = findTempInRecord(rec);
          batSucceeded = true;
          break;
        }
        batLastErr = batRaw;
        break;
      }
    } catch (err) {
      batLastErr = err instanceof Error ? err.message : 'Bat.GetStatus timeout';
    }
  }
  if (!batSucceeded && batLastErr && !batLastErr.trim().startsWith('{')) {
    extraLogs.push({ method: 'Bat.GetStatus', rawResponse: `ERROR: ${batLastErr}` });
  }

  try {
    await sleepMs(120);
    const modeRaw = await sendUdpCommand(
      ipAddress,
      port,
      '{"id": 3, "method": "ES.GetMode", "params": {"id": 0}}',
      1500
    );
    if (modeRaw) {
      extraLogs.push({ method: 'ES.GetMode', rawResponse: modeRaw });
      const parsed = JSON.parse(modeRaw) as RawMarstekPayload;
      if (parsed.result && typeof parsed.result === 'object' && typeof parsed.result.mode === 'string') {
        workMode = parsed.result.mode;
      }
    }
  } catch {
    // Optional telemetry
  }

  return { extraLogs, ratedCapacity, batTemp, workMode };
}

async function queryMarstekStatus(ipAddress: string, port: number): Promise<QueryOutcome> {
  const startedAt = Date.now();
  const requestPayload = '{"id": 1, "method": "ES.GetStatus", "params": {"id": 0}}';
  let lastError: Error | null = null;
  let lastRawResponse: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const responseJson = await sendUdpCommand(
        ipAddress,
        port,
        requestPayload,
        SOCKET_TIMEOUT_MS
      );
      lastRawResponse = responseJson;
      const status = parseMarstekJson(responseJson);
      const { extraLogs, ratedCapacity, batTemp, workMode } = await queryOptionalDetails(
        ipAddress,
        port
      );
      if (status.batCap <= 0 && ratedCapacity > 0) {
        status.batCap = ratedCapacity;
      }
      if (batTemp !== undefined) {
        status.batTemp = batTemp;
      }
      if (workMode) {
        status.workMode = workMode;
      }
      return {
        status,
        rawResponse: responseJson,
        method: 'ES.GetStatus',
        durationMs: Date.now() - startedAt,
        extraLogs,
      };
    } catch (err) {
      if (err instanceof UdpTimeoutError) {
        lastError = new Error(
          `Timeout on attempt ${attempt + 1}: No UDP reply from ${ipAddress}:${port}`
        );
      } else if (err instanceof Error) {
        lastError = err;
        if (err.message.startsWith('Marstek API error:') || 'code' in err) {
          break;
        }
      } else {
        lastError = new Error('Unknown UDP error');
      }
    }
  }

  const probeResult = await probeDevice(ipAddress, port);
  if (probeResult !== null) {
    throw new MarstekQueryError(
      `Device responded to Marstek.GetDevice (${probeResult}), but ES.GetStatus timed out. Battery may need firmware restart.`,
      {
        rawResponse: probeResult,
        method: 'Marstek.GetDevice',
        durationMs: Date.now() - startedAt,
      }
    );
  }

  throw new MarstekQueryError(
    lastError?.message ?? 'Poll timed out after multiple attempts',
    {
      rawResponse: lastRawResponse,
      method: 'ES.GetStatus',
      durationMs: Date.now() - startedAt,
    }
  );
}

interface OutageSlotDto {
  id: string;
  start: string;
  end: string;
}

interface OutageScheduleResponse {
  providerId: string;
  providerName: string;
  availableGroups: string[];
  selectedGroup: string;
  status: string;
  updatedOn: string | null;
  dateLabel: string;
  slots: OutageSlotDto[];
  tomorrowSlots: OutageSlotDto[];
  sourceUrl: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  kind: 'prykarpattya' | 'yasno' | 'outage-data-ua';
  url: string;
}

const PRYKARPATTYA_QUEUES = [
  '1.1',
  '1.2',
  '2.1',
  '2.2',
  '3.1',
  '3.2',
  '4.1',
  '4.2',
  '5.1',
  '5.2',
  '6.1',
  '6.2',
];

const OUTAGE_PROVIDERS: ProviderConfig[] = [
  {
    id: 'prykarpattya-oe',
    name: 'Прикарпаттяобленерго (Івано-Франківська обл.)',
    kind: 'prykarpattya',
    url: 'https://be-svitlo.oe.if.ua/schedule-by-queue',
  },
  {
    id: 'yasno-kyiv',
    name: 'Київ (ДТЕК КЕМ · Yasno)',
    kind: 'yasno',
    url: 'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages',
  },
  {
    id: 'yasno-dnipro-dnem',
    name: 'Дніпро (ДнЕМ · Yasno)',
    kind: 'yasno',
    url: 'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages',
  },
  {
    id: 'yasno-dnipro-cek',
    name: 'Дніпро (ЦЕК · Yasno)',
    kind: 'yasno',
    url: 'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages',
  },
  {
    id: 'dtek-kyiv-region',
    name: 'Київська обл. (ДТЕК КРЕМ)',
    kind: 'outage-data-ua',
    url: 'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv-region.json',
  },
  {
    id: 'dtek-odesa',
    name: 'Одеська обл. (ДТЕК ОЕМ)',
    kind: 'outage-data-ua',
    url: 'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/odesa.json',
  },
];

const OUTAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const outageCache = new Map<string, { fetchedAt: number; data: unknown }>();

function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string, isEnd = false): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const total = h * 60 + m;
  if (isEnd && total === 0) return 1440;
  return Math.max(0, Math.min(1440, total));
}

function parseUkDateTimeToIso(raw?: string): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+02:00`;
}

function mergeMinuteIntervals(
  intervals: Array<{ start: number; end: number }>
): OutageSlotDto[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const item of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && item.start <= prev.end) {
      prev.end = Math.max(prev.end, item.end);
    } else {
      merged.push({ start: item.start, end: item.end });
    }
  }

  return merged.map((m, idx) => ({
    id: `api-slot-${idx}-${m.start}`,
    start: minutesToHHMM(m.start),
    end: minutesToHHMM(m.end),
  }));
}

interface YasnoDayBlock {
  slots?: Array<{ start?: number; end?: number; type?: string }>;
  date?: string;
  status?: string;
}

interface YasnoGroupData {
  today?: YasnoDayBlock;
  tomorrow?: YasnoDayBlock;
  updatedOn?: string;
}

function sortGroupNames(groups: string[]): string[] {
  return [...groups].sort((a, b) => {
    const numA = Number.parseFloat(a.replace(/[^\d.]/g, '')) || 0;
    const numB = Number.parseFloat(b.replace(/[^\d.]/g, '')) || 0;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

async function fetchUpstreamJson(
  url: string,
  forceRefresh: boolean,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  const cached = outageCache.get(url);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < OUTAGE_CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MarstekVenusWidget/1.0',
      Accept: 'application/json',
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream outage API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  outageCache.set(url, { fetchedAt: Date.now(), data });
  return data;
}

interface PrykarpattyaDayItem {
  eventDate?: string;
  queues?: Record<
    string,
    Array<{ from?: string; to?: string; shutdownHours?: string; status?: number }>
  >;
  createdAt?: string;
  scheduleApprovedSince?: string;
}

async function getOutageSchedule(
  providerId: string,
  requestedGroup: string,
  forceRefresh: boolean
): Promise<OutageScheduleResponse> {
  const provider =
    OUTAGE_PROVIDERS.find((p) => p.id === providerId) ?? OUTAGE_PROVIDERS[0];

  if (provider.kind === 'prykarpattya') {
    const selectedGroup = PRYKARPATTYA_QUEUES.includes(requestedGroup)
      ? requestedGroup
      : '5.2';
    const requestUrl = `${provider.url}?queue=${encodeURIComponent(selectedGroup)}`;

    const rawData = (await fetchUpstreamJson(requestUrl, forceRefresh, {
      Origin: 'https://svitlo.oe.if.ua',
      Referer: 'https://svitlo.oe.if.ua/',
    })) as PrykarpattyaDayItem[];

    const days = Array.isArray(rawData) ? rawData : [];
    const kyivTodayStr = new Date().toLocaleDateString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const todayIndex = days.findIndex((d) => d.eventDate === kyivTodayStr);
    const resolvedTodayIdx = todayIndex >= 0 ? todayIndex : 0;
    const todayDay = days[resolvedTodayIdx];
    const tomorrowDay = days[resolvedTodayIdx + 1];

    const parseQueueDay = (day?: PrykarpattyaDayItem): OutageSlotDto[] => {
      const list = day?.queues?.[selectedGroup] ?? [];
      const intervals = list
        .filter((s) => typeof s.from === 'string' && typeof s.to === 'string')
        .map((s) => ({
          start: hhmmToMinutes(s.from as string, false),
          end: hhmmToMinutes(s.to as string, true),
        }));
      return mergeMinuteIntervals(intervals);
    };

    const slots = parseQueueDay(todayDay);
    const tomorrowSlots = parseQueueDay(tomorrowDay);
    const updatedOn =
      parseUkDateTimeToIso(todayDay?.scheduleApprovedSince) ??
      parseUkDateTimeToIso(todayDay?.createdAt) ??
      null;

    return {
      providerId: provider.id,
      providerName: provider.name,
      availableGroups: PRYKARPATTYA_QUEUES,
      selectedGroup,
      status: 'ScheduleApplies',
      updatedOn,
      dateLabel: todayDay?.eventDate ?? kyivTodayStr,
      slots,
      tomorrowSlots,
      sourceUrl: requestUrl,
    };
  }

  const rawData = await fetchUpstreamJson(provider.url, forceRefresh);

  if (provider.kind === 'yasno') {
    const record = rawData as Record<string, YasnoGroupData>;
    const availableGroups = sortGroupNames(Object.keys(record));
    const selectedGroup = availableGroups.includes(requestedGroup)
      ? requestedGroup
      : availableGroups[0] ?? '1.1';

    const groupData = record[selectedGroup];
    const todaySlotsRaw = groupData?.today?.slots ?? [];
    const tomorrowSlotsRaw = groupData?.tomorrow?.slots ?? [];

    const toIntervals = (
      arr: Array<{ start?: number; end?: number; type?: string }>
    ) =>
      arr
        .filter((s) => s.type === 'Definite' && typeof s.start === 'number' && typeof s.end === 'number')
        .map((s) => ({ start: s.start as number, end: s.end as number }));

    const slots = mergeMinuteIntervals(toIntervals(todaySlotsRaw));
    const tomorrowSlots = mergeMinuteIntervals(toIntervals(tomorrowSlotsRaw));

    const rawDate = groupData?.today?.date ?? '';
    const dateLabel = rawDate ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    return {
      providerId: provider.id,
      providerName: provider.name,
      availableGroups,
      selectedGroup,
      status: groupData?.today?.status ?? 'Unknown',
      updatedOn: groupData?.updatedOn ?? null,
      dateLabel,
      slots,
      tomorrowSlots,
      sourceUrl: provider.url,
    };
  }

  // outage-data-ua format (Kyiv region / Odesa)
  const doc = rawData as {
    lastUpdated?: string;
    fact?: {
      today?: number;
      data?: Record<string, Record<string, Record<string, string>>>;
    };
  };

  const dataMap = doc.fact?.data ?? {};
  const dayKeys = Object.keys(dataMap).sort();
  const todayKey =
    doc.fact?.today !== undefined && dataMap[String(doc.fact.today)]
      ? String(doc.fact.today)
      : dayKeys[0] ?? '';

  const todayMap = todayKey ? dataMap[todayKey] ?? {} : {};
  const tomorrowKey = dayKeys.find((k) => Number(k) > Number(todayKey));
  const tomorrowMap = tomorrowKey ? dataMap[tomorrowKey] ?? {} : {};

  const availableGroups = sortGroupNames(Object.keys(todayMap));
  const selectedGroup = availableGroups.includes(requestedGroup)
    ? requestedGroup
    : availableGroups[0] ?? 'GPV1.1';

  const parseHourlyMap = (hourly?: Record<string, string>): OutageSlotDto[] => {
    if (!hourly) return [];
    const intervals: Array<{ start: number; end: number }> = [];
    for (let h = 1; h <= 24; h++) {
      const state = hourly[String(h)];
      const startHourMin = (h - 1) * 60;
      if (state === 'no') {
        intervals.push({ start: startHourMin, end: startHourMin + 60 });
      } else if (state === 'first') {
        intervals.push({ start: startHourMin, end: startHourMin + 30 });
      } else if (state === 'second') {
        intervals.push({ start: startHourMin + 30, end: startHourMin + 60 });
      }
    }
    return mergeMinuteIntervals(intervals);
  };

  const slots = parseHourlyMap(todayMap[selectedGroup]);
  const tomorrowSlots = parseHourlyMap(tomorrowMap[selectedGroup]);
  const dateLabel = todayKey
    ? new Date(Number(todayKey) * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Europe/Kyiv',
      })
    : new Date().toISOString().slice(0, 10);

  return {
    providerId: provider.id,
    providerName: provider.name,
    availableGroups,
    selectedGroup,
    status: 'ScheduleApplies',
    updatedOn: doc.lastUpdated ?? null,
    dateLabel,
    slots,
    tomorrowSlots,
    sourceUrl: provider.url,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/outages/providers', (_req: Request, res: Response) => {
    res.json({
      providers: OUTAGE_PROVIDERS.map((p) => ({ id: p.id, name: p.name })),
    });
  });

  app.get('/api/outages/schedule', async (req: Request, res: Response) => {
    const providerId =
      typeof req.query.provider === 'string' ? req.query.provider : 'prykarpattya-oe';
    const group =
      typeof req.query.group === 'string' ? req.query.group : '5.2';
    const forceRefresh = req.query.refresh === '1';

    try {
      const schedule = await getOutageSchedule(providerId, group, forceRefresh);
      res.json(schedule);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load outage schedule';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/marstek/status', async (req: Request, res: Response) => {
    const body = req.body as { ip?: unknown; port?: unknown } | undefined;
    const ip = typeof body?.ip === 'string' ? body.ip.trim() : '';
    const rawPort = body?.port !== undefined ? Number(body.port) : 30000;
    const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 30000;

    if (!ip) {
      res.status(400).json({ error: 'IP address cannot be empty' });
      return;
    }

    try {
      const outcome = await queryMarstekStatus(ip, port);
      res.json(outcome);
    } catch (err) {
      if (err instanceof MarstekQueryError) {
        res.status(504).json({
          error: err.message,
          rawResponse: err.rawResponse,
          method: err.method,
          durationMs: err.durationMs,
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Timeout or unreachable';
      res.status(504).json({
        error: message,
        rawResponse: null,
        method: 'ES.GetStatus',
        durationMs: 0,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Marstek Venus Widget server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
