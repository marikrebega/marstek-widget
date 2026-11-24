import {
  DEFAULT_LIMITS,
  DEFAULT_OUTAGE_CONFIG,
  DEFAULT_OUTAGE_SLOTS,
  type BatteryLimits,
  type MarstekStatus,
  type OutageConfig,
  type OutageSlot,
} from '../types/marstek';

const STORAGE_KEYS = {
  DEVICE_IP: 'marstek_pref_device_ip',
  DEVICE_PORT: 'marstek_pref_device_port',
  LAST_SOC: 'marstek_pref_last_soc',
  LAST_CAP: 'marstek_pref_last_cap',
  LAST_PV: 'marstek_pref_last_pv',
  LAST_GRID: 'marstek_pref_last_grid',
  LAST_UPDATE_TIME: 'marstek_pref_last_update_time',
  LAST_FULL_STATUS: 'marstek_pref_last_full_status',
  DEMO_MODE: 'marstek_pref_demo_mode',
  LIMITS: 'marstek_pref_limits',
  OUTAGES: 'marstek_pref_outages',
  OUTAGE_CONFIG: 'marstek_pref_outage_config',
  WIDGET_SIZE: 'marstek_pref_widget_size',
} as const;

export type WidgetSizeMode = 'full' | 'compact';

export interface StoredPreferences {
  deviceIp: string;
  devicePort: number;
  lastCachedSoc: number;
  lastCachedCap: number;
  lastCachedPv: number;
  lastCachedGrid: number;
  lastUpdateTime: string;
  lastFullStatus: MarstekStatus | null;
  demoMode: boolean;
  limits: BatteryLimits;
  outageSlots: OutageSlot[];
  outageConfig: OutageConfig;
  widgetSize: WidgetSizeMode;
}

export function loadPreferences(): StoredPreferences {
  try {
    const rawIp = localStorage.getItem(STORAGE_KEYS.DEVICE_IP);
    const rawPort = localStorage.getItem(STORAGE_KEYS.DEVICE_PORT);
    const rawSoc = localStorage.getItem(STORAGE_KEYS.LAST_SOC);
    const rawCap = localStorage.getItem(STORAGE_KEYS.LAST_CAP);
    const rawPv = localStorage.getItem(STORAGE_KEYS.LAST_PV);
    const rawGrid = localStorage.getItem(STORAGE_KEYS.LAST_GRID);
    const rawTime = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE_TIME);
    const rawFull = localStorage.getItem(STORAGE_KEYS.LAST_FULL_STATUS);
    const rawDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE);
    const rawLimits = localStorage.getItem(STORAGE_KEYS.LIMITS);
    const rawOutages = localStorage.getItem(STORAGE_KEYS.OUTAGES);
    const rawOutageConfig = localStorage.getItem(STORAGE_KEYS.OUTAGE_CONFIG);
    const rawWidgetSize = localStorage.getItem(STORAGE_KEYS.WIDGET_SIZE);

    const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : 30000;
    const parsedSoc = rawSoc ? Number.parseInt(rawSoc, 10) : 72;
    const parsedCap = rawCap ? Number.parseInt(rawCap, 10) : 5120;
    const parsedPv = rawPv ? Number.parseInt(rawPv, 10) : 1200;
    const parsedGrid = rawGrid ? Number.parseInt(rawGrid, 10) : 1200;

    let lastFullStatus: MarstekStatus | null = null;
    if (rawFull) {
      try {
        lastFullStatus = JSON.parse(rawFull) as MarstekStatus;
      } catch {
        lastFullStatus = null;
      }
    }

    let limits: BatteryLimits = DEFAULT_LIMITS;
    if (rawLimits) {
      try {
        const parsed = JSON.parse(rawLimits) as Partial<BatteryLimits>;
        if (
          typeof parsed.dischargeLimit === 'number' &&
          typeof parsed.chargeLimit === 'number'
        ) {
          limits = {
            dischargeLimit: parsed.dischargeLimit,
            chargeLimit: parsed.chargeLimit,
          };
        }
      } catch {
        limits = DEFAULT_LIMITS;
      }
    }

    let outageSlots: OutageSlot[] = DEFAULT_OUTAGE_SLOTS;
    if (rawOutages) {
      try {
        const parsed = JSON.parse(rawOutages) as OutageSlot[];
        if (Array.isArray(parsed)) {
          outageSlots = parsed;
        }
      } catch {
        outageSlots = DEFAULT_OUTAGE_SLOTS;
      }
    }

    let outageConfig: OutageConfig = DEFAULT_OUTAGE_CONFIG;
    if (rawOutageConfig) {
      try {
        const parsed = JSON.parse(rawOutageConfig) as Partial<OutageConfig>;
        if (
          (parsed.mode === 'api' || parsed.mode === 'manual') &&
          typeof parsed.providerId === 'string' &&
          typeof parsed.group === 'string'
        ) {
          outageConfig = {
            mode: parsed.mode,
            providerId: parsed.providerId,
            group: parsed.group,
          };
        }
      } catch {
        outageConfig = DEFAULT_OUTAGE_CONFIG;
      }
    }

    const demoMode = rawDemo === null ? true : rawDemo === 'true';

    return {
      deviceIp: rawIp && rawIp.trim() ? rawIp.trim() : '192.168.0.190',
      devicePort: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 30000,
      lastCachedSoc: Number.isFinite(parsedSoc) ? parsedSoc : 72,
      lastCachedCap: Number.isFinite(parsedCap) ? parsedCap : 5120,
      lastCachedPv: Number.isFinite(parsedPv) ? parsedPv : 1200,
      lastCachedGrid: Number.isFinite(parsedGrid) ? parsedGrid : 1200,
      lastUpdateTime: rawTime || '15:30',
      lastFullStatus,
      demoMode,
      limits,
      outageSlots,
      outageConfig,
      widgetSize: rawWidgetSize === 'compact' ? 'compact' : 'full',
    };
  } catch {
    return {
      deviceIp: '192.168.0.190',
      devicePort: 30000,
      lastCachedSoc: 72,
      lastCachedCap: 5120,
      lastCachedPv: 1200,
      lastCachedGrid: 1200,
      lastUpdateTime: '15:30',
      lastFullStatus: null,
      demoMode: true,
      limits: DEFAULT_LIMITS,
      outageSlots: DEFAULT_OUTAGE_SLOTS,
      outageConfig: DEFAULT_OUTAGE_CONFIG,
      widgetSize: 'full',
    };
  }
}

export function saveDeviceConfig(ip: string, port: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DEVICE_IP, ip.trim());
    localStorage.setItem(STORAGE_KEYS.DEVICE_PORT, String(port));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveDemoMode(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DEMO_MODE, String(enabled));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveLimits(limits: BatteryLimits): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LIMITS, JSON.stringify(limits));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveOutageSlots(slots: OutageSlot[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OUTAGES, JSON.stringify(slots));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveOutageConfig(config: OutageConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OUTAGE_CONFIG, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveWidgetSize(size: WidgetSizeMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WIDGET_SIZE, size);
  } catch {
    // Ignore storage quota errors
  }
}

export function saveLatestStatus(status: MarstekStatus, formattedTime: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SOC, String(status.batSoc));
    localStorage.setItem(STORAGE_KEYS.LAST_CAP, String(status.batCap));
    localStorage.setItem(STORAGE_KEYS.LAST_PV, String(status.pvPower));
    localStorage.setItem(STORAGE_KEYS.LAST_GRID, String(status.onGridPower));
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_TIME, formattedTime);
    localStorage.setItem(STORAGE_KEYS.LAST_FULL_STATUS, JSON.stringify(status));
  } catch {
    // Ignore storage quota errors
  }
}
