import type { MarstekStatus } from '../types/marstek';

export type SimulationPreset = 'charging' | 'discharging' | 'idle';

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

export function formatRawMarstekJson(status: MarstekStatus): string {
  return JSON.stringify({
    id: 1,
    src: 'VenusD-demo',
    result: {
      id: 0,
      bat_soc: status.batSoc,
      bat_cap: status.batCap,
      pv_power: status.pvPower,
      ongrid_power: status.onGridPower,
      offgrid_power: status.offGridPower,
      total_pv_energy: status.totalPvEnergy,
      total_grid_output_energy: status.totalGridOutputEnergy,
      total_grid_input_energy: status.totalGridInputEnergy,
    },
  });
}

export function buildSimulatedStatus(preset: SimulationPreset = 'charging'): MarstekStatus {
  const presets: Record<SimulationPreset, Omit<MarstekStatus, 'timestamp'>> = {
    charging: {
      batSoc: 72,
      batCap: 5120,
      pvPower: 1450,
      onGridPower: 1152,
      offGridPower: 0,
      totalPvEnergy: 284600,
      totalGridOutputEnergy: 91400,
      totalGridInputEnergy: 118200,
    },
    discharging: {
      batSoc: 54,
      batCap: 5120,
      pvPower: 120,
      onGridPower: -800,
      offGridPower: 800,
      totalPvEnergy: 285100,
      totalGridOutputEnergy: 92850,
      totalGridInputEnergy: 118200,
    },
    idle: {
      batSoc: 90,
      batCap: 5120,
      pvPower: 0,
      onGridPower: 0,
      offGridPower: 0,
      totalPvEnergy: 289400,
      totalGridOutputEnergy: 93100,
      totalGridInputEnergy: 118250,
    },
  };

  return { ...presets[preset], timestamp: Date.now() };
}

export async function fetchMarstekStatus(
  ip: string,
  port: number,
  options?: { simulate?: boolean; preset?: SimulationPreset }
): Promise<MarstekFetchOutcome> {
  const trimmedIp = ip.trim();
  if (!trimmedIp) {
    throw new MarstekFetchError('IP address cannot be empty', {
      rawResponse: null,
      method: 'ES.GetStatus',
      durationMs: 0,
    });
  }

  if (options?.simulate) {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const status = buildSimulatedStatus(options.preset ?? 'charging');
    return {
      status,
      rawResponse: formatRawMarstekJson(status),
      method: 'ES.GetStatus',
      durationMs: Date.now() - started,
    };
  }

  const started = Date.now();
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
