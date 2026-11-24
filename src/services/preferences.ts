import {
  DEFAULT_OUTAGE_CONFIG,
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
  OUTAGE_CONFIG: 'marstek_pref_outage_config',
  CACHED_OUTAGES_TODAY: 'marstek_pref_cached_outages_today',
  CACHED_OUTAGES_TOMORROW: 'marstek_pref_cached_outages_tomorrow',
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
  outageConfig: OutageConfig;
  cachedOutageToday: OutageSlot[];
  cachedOutageTomorrow: OutageSlot[];
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
    const rawOutageConfig = localStorage.getItem(STORAGE_KEYS.OUTAGE_CONFIG);
    const rawToday = localStorage.getItem(STORAGE_KEYS.CACHED_OUTAGES_TODAY);
    const rawTomorrow = localStorage.getItem(STORAGE_KEYS.CACHED_OUTAGES_TOMORROW);
    const rawWidgetSize = localStorage.getItem(STORAGE_KEYS.WIDGET_SIZE);

    const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : 30000;
    const parsedSoc = rawSoc ? Number.parseInt(rawSoc, 10) : -1;
    const parsedCap = rawCap ? Number.parseInt(rawCap, 10) : 0;
    const parsedPv = rawPv ? Number.parseInt(rawPv, 10) : 0;
    const parsedGrid = rawGrid ? Number.parseInt(rawGrid, 10) : 0;

    let lastFullStatus: MarstekStatus | null = null;
    if (rawFull) {
      try {
        lastFullStatus = JSON.parse(rawFull) as MarstekStatus;
      } catch {
        lastFullStatus = null;
      }
    }

    let outageConfig: OutageConfig = DEFAULT_OUTAGE_CONFIG;
    if (rawOutageConfig) {
      try {
        const parsed = JSON.parse(rawOutageConfig) as Partial<OutageConfig>;
        if (
          typeof parsed.providerId === 'string' &&
          typeof parsed.group === 'string'
        ) {
          outageConfig = {
            providerId: parsed.providerId,
            group: parsed.group,
          };
        }
      } catch {
        outageConfig = DEFAULT_OUTAGE_CONFIG;
      }
    }

    let cachedOutageToday: OutageSlot[] = [];
    if (rawToday) {
      try {
        const parsed = JSON.parse(rawToday) as OutageSlot[];
        if (Array.isArray(parsed)) cachedOutageToday = parsed;
      } catch {
        cachedOutageToday = [];
      }
    }

    let cachedOutageTomorrow: OutageSlot[] = [];
    if (rawTomorrow) {
      try {
        const parsed = JSON.parse(rawTomorrow) as OutageSlot[];
        if (Array.isArray(parsed)) cachedOutageTomorrow = parsed;
      } catch {
        cachedOutageTomorrow = [];
      }
    }

    return {
      deviceIp: rawIp && rawIp.trim() ? rawIp.trim() : '192.168.0.190',
      devicePort: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 30000,
      lastCachedSoc: Number.isFinite(parsedSoc) ? parsedSoc : -1,
      lastCachedCap: Number.isFinite(parsedCap) ? parsedCap : 0,
      lastCachedPv: Number.isFinite(parsedPv) ? parsedPv : 0,
      lastCachedGrid: Number.isFinite(parsedGrid) ? parsedGrid : 0,
      lastUpdateTime: rawTime || '--:--',
      lastFullStatus,
      outageConfig,
      cachedOutageToday,
      cachedOutageTomorrow,
      widgetSize: rawWidgetSize === 'compact' ? 'compact' : 'full',
    };
  } catch {
    return {
      deviceIp: '192.168.0.190',
      devicePort: 30000,
      lastCachedSoc: -1,
      lastCachedCap: 0,
      lastCachedPv: 0,
      lastCachedGrid: 0,
      lastUpdateTime: '--:--',
      lastFullStatus: null,
      outageConfig: DEFAULT_OUTAGE_CONFIG,
      cachedOutageToday: [],
      cachedOutageTomorrow: [],
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

export function saveOutageConfig(config: OutageConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OUTAGE_CONFIG, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCachedOutages(today: OutageSlot[], tomorrow: OutageSlot[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_OUTAGES_TODAY, JSON.stringify(today));
    localStorage.setItem(STORAGE_KEYS.CACHED_OUTAGES_TOMORROW, JSON.stringify(tomorrow));
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
