import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionSettings, type TestState } from './components/ConnectionSettings';
import { MarstekLogsPanel } from './components/MarstekLogsPanel';
import { StatusDashboard } from './components/StatusDashboard';
import { fetchMarstekStatus, MarstekFetchError } from './services/marstekApi';
import {
  readLastNativeWidgetError,
  requestNativeNotificationPermission,
  sendNativeTestNotification,
  syncConfigToNativeAndroid,
} from './services/nativeBridge';
import { fetchOutageProviders, fetchOutageSchedule } from './services/outageApi';
import {
  loadPreferences,
  saveCachedOutages,
  saveDeviceConfig,
  saveLatestStatus,
  saveNotifyOutages,
  saveOutageConfig,
} from './services/preferences';
import {
  formatTimeHHMM,
  formatTimeHHMMSS,
  getKyivMinutes,
  type MarstekLogEntry,
  type MarstekStatus,
  type OutageConfig,
  type OutageProviderInfo,
  type OutageSlot,
} from './types/marstek';

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const VISIBILITY_RATE_LIMIT_MS = 60 * 1000;
const MAX_LOG_ENTRIES = 50;

type AppTab = 'status' | 'settings' | 'logs';

const FALLBACK_PROVIDERS: OutageProviderInfo[] = [
  { id: 'prykarpattya-oe', name: 'Прикарпаттяобленерго (Івано-Франківська обл.)' },
  { id: 'yasno-kyiv', name: 'Київ (ДТЕК КЕМ · Yasno)' },
  { id: 'yasno-dnipro-dnem', name: 'Дніпро (ДнЕМ · Yasno)' },
  { id: 'yasno-dnipro-cek', name: 'Дніпро (ЦЕК · Yasno)' },
  { id: 'dtek-kyiv-region', name: 'Київська обл. (ДТЕК КРЕМ)' },
  { id: 'dtek-odesa', name: 'Одеська обл. (ДТЕК ОЕМ)' },
];

export function App() {
  const initialPrefs = useRef(loadPreferences());

  const [activeTab, setActiveTab] = useState<AppTab>('status');

  const [ipInput, setIpInput] = useState(initialPrefs.current.deviceIp);
  const [portInput, setPortInput] = useState(String(initialPrefs.current.devicePort));
  const [savedIp, setSavedIp] = useState(initialPrefs.current.deviceIp);
  const [savedPort, setSavedPort] = useState(initialPrefs.current.devicePort);

  const [soc, setSoc] = useState(initialPrefs.current.lastCachedSoc);
  const [batCap, setBatCap] = useState(initialPrefs.current.lastCachedCap);
  const [pvPower, setPvPower] = useState(initialPrefs.current.lastCachedPv);
  const [onGridPower, setOnGridPower] = useState(initialPrefs.current.lastCachedGrid);
  const [offGridPower, setOffGridPower] = useState(
    initialPrefs.current.lastFullStatus?.offGridPower ?? 0
  );
  const [batTemp, setBatTemp] = useState<number | undefined>(
    initialPrefs.current.lastFullStatus?.batTemp
  );
  const [fullStatus, setFullStatus] = useState<MarstekStatus | null>(
    initialPrefs.current.lastFullStatus
  );
  const [lastUpdateTime, setLastUpdateTime] = useState(
    initialPrefs.current.lastUpdateTime
  );

  const [outageConfig, setOutageConfig] = useState<OutageConfig>(
    initialPrefs.current.outageConfig
  );
  const [outageProviders, setOutageProviders] =
    useState<OutageProviderInfo[]>(FALLBACK_PROVIDERS);
  const [availableGroups, setAvailableGroups] = useState<string[]>([
    initialPrefs.current.outageConfig.group,
  ]);
  const [apiOutageSlots, setApiOutageSlots] = useState<OutageSlot[]>(
    initialPrefs.current.cachedOutageToday
  );
  const [tomorrowApiOutageSlots, setTomorrowApiOutageSlots] = useState<OutageSlot[]>(
    initialPrefs.current.cachedOutageTomorrow
  );
  const [outageLoading, setOutageLoading] = useState(false);
  const [outageError, setOutageError] = useState<string | null>(null);
  const [outageUpdatedAt, setOutageUpdatedAt] = useState<string | null>(null);

  const [notifyOutages, setNotifyOutages] = useState<boolean>(
    initialPrefs.current.notifyOutages
  );
  const [nowMinutes, setNowMinutes] = useState(() => getKyivMinutes());

  const [isUpdating, setIsUpdating] = useState(false);
  const [isError, setIsError] = useState(false);

  const [ipError, setIpError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<MarstekLogEntry[]>([]);

  const ipInputRef = useRef<HTMLInputElement | null>(null);
  const lastVisibilityRefreshRef = useRef<number>(0);
  const toastTimerRef = useRef<number | null>(null);

  const appendLog = useCallback((entry: Omit<MarstekLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: MarstekLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: formatTimeHHMMSS(new Date()),
    };
    setLogs((prev) => [newEntry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const loadOutageSchedule = useCallback(
    async (providerId: string, group: string, forceRefresh = false) => {
      setOutageLoading(true);
      setOutageError(null);
      try {
        const data = await fetchOutageSchedule(providerId, group, forceRefresh);
        setAvailableGroups(data.availableGroups);
        setApiOutageSlots(data.slots);
        setTomorrowApiOutageSlots(data.tomorrowSlots);
        setOutageUpdatedAt(data.updatedOn);
        saveCachedOutages(data.slots, data.tomorrowSlots);
        if (data.selectedGroup && data.selectedGroup !== group) {
          const updatedConfig: OutageConfig = {
            providerId: data.providerId,
            group: data.selectedGroup,
          };
          setOutageConfig(updatedConfig);
          saveOutageConfig(updatedConfig);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Помилка завантаження';
        setOutageError(msg);
      } finally {
        setOutageLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    syncConfigToNativeAndroid({
      ip: savedIp,
      port: savedPort,
      providerId: outageConfig.providerId,
      group: outageConfig.group,
      notifyOutages,
    });
  }, [savedIp, savedPort, outageConfig.providerId, outageConfig.group, notifyOutages]);

  useEffect(() => {
    const diag = readLastNativeWidgetError();
    if (diag && diag.isError && diag.message) {
      appendLog({
        target: `${diag.ip}:${diag.port}`,
        method: `Widget (wifi=${diag.wifiConnected})`,
        ok: false,
        durationMs: 0,
        rawPayload: `${diag.time ? `[${diag.time}] ` : ''}${diag.message}`,
      });
    }
  }, [appendLog]);

  useEffect(() => {
    void fetchOutageProviders()
      .then((list) => setOutageProviders(list))
      .catch(() => {
        // Keep fallback list
      });
  }, []);

  useEffect(() => {
    void loadOutageSchedule(outageConfig.providerId, outageConfig.group, false);
  }, [outageConfig.providerId, outageConfig.group, loadOutageSchedule]);

  const refreshStatus = useCallback(
    async (targetIp: string, targetPort: number) => {
      if (!targetIp.trim()) return;

      setIsUpdating(true);
      setIsError(false);

      try {
        const outcome = await fetchMarstekStatus(targetIp, targetPort);
        const formatted = formatTimeHHMM(new Date(outcome.status.timestamp));
        saveLatestStatus(outcome.status, formatted);
        setSoc(outcome.status.batSoc);
        setBatCap(outcome.status.batCap);
        setPvPower(outcome.status.pvPower);
        setOnGridPower(outcome.status.onGridPower);
        setOffGridPower(outcome.status.offGridPower);
        setBatTemp((prev) => outcome.status.batTemp ?? prev);
        setFullStatus((prev) => ({
          ...outcome.status,
          batTemp: outcome.status.batTemp ?? prev?.batTemp,
        }));
        setLastUpdateTime(formatted);
        setIsError(false);

        appendLog({
          target: `${targetIp}:${targetPort}`,
          method: outcome.method,
          ok: true,
          durationMs: outcome.durationMs,
          rawPayload: outcome.rawResponse,
        });
        if (outcome.extraLogs) {
          for (const extra of outcome.extraLogs) {
            const isErrLog =
              extra.rawResponse.startsWith('ERROR:') ||
              extra.rawResponse.includes('"error"');
            appendLog({
              target: `${targetIp}:${targetPort}`,
              method: extra.method,
              ok: !isErrLog,
              durationMs: outcome.durationMs,
              rawPayload: extra.rawResponse,
            });
          }
        }
      } catch (err) {
        setIsError(true);
        const rawPayload =
          err instanceof MarstekFetchError && err.rawResponse
            ? err.rawResponse
            : err instanceof Error
            ? err.message
            : 'Timeout or unreachable';
        const method = err instanceof MarstekFetchError ? err.method : 'ES.GetStatus';
        const durationMs = err instanceof MarstekFetchError ? err.durationMs : 0;

        appendLog({
          target: `${targetIp}:${targetPort}`,
          method,
          ok: false,
          durationMs,
          rawPayload,
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [appendLog]
  );

  useEffect(() => {
    void refreshStatus(savedIp, savedPort);
  }, [savedIp, savedPort, refreshStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshStatus(savedIp, savedPort);
      void loadOutageSchedule(outageConfig.providerId, outageConfig.group, false);
    }, AUTO_REFRESH_INTERVAL_MS);

    const clockId = window.setInterval(() => {
      setNowMinutes(getKyivMinutes());
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNowMinutes(getKyivMinutes());
        const now = Date.now();
        if (now - lastVisibilityRefreshRef.current > VISIBILITY_RATE_LIMIT_MS) {
          lastVisibilityRefreshRef.current = now;
          void refreshStatus(savedIp, savedPort);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(clockId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    savedIp,
    savedPort,
    outageConfig.providerId,
    outageConfig.group,
    refreshStatus,
    loadOutageSchedule,
  ]);

  const parsePort = (raw: string): number => {
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 30000;
  };

  const handleTestConnection = async () => {
    const trimmedIp = ipInput.trim();
    const parsedPort = parsePort(portInput);

    if (!trimmedIp) {
      setIpError('Введіть IP-адресу пристрою Marstek');
      return;
    }
    setIpError(null);
    setTestState({ kind: 'testing', ip: trimmedIp, port: parsedPort });

    try {
      const outcome = await fetchMarstekStatus(trimmedIp, parsedPort);
      setTestState({ kind: 'success', status: outcome.status });
      appendLog({
        target: `${trimmedIp}:${parsedPort}`,
        method: outcome.method,
        ok: true,
        durationMs: outcome.durationMs,
        rawPayload: outcome.rawResponse,
      });
      if (outcome.extraLogs) {
        for (const extra of outcome.extraLogs) {
          const isErrLog =
            extra.rawResponse.startsWith('ERROR:') ||
            extra.rawResponse.includes('"error"');
          appendLog({
            target: `${trimmedIp}:${parsedPort}`,
            method: extra.method,
            ok: !isErrLog,
            durationMs: outcome.durationMs,
            rawPayload: extra.rawResponse,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Timeout or unreachable';
      setTestState({ kind: 'error', message });
      appendLog({
        target: `${trimmedIp}:${parsedPort}`,
        method: err instanceof MarstekFetchError ? err.method : 'ES.GetStatus',
        ok: false,
        durationMs: err instanceof MarstekFetchError ? err.durationMs : 0,
        rawPayload:
          err instanceof MarstekFetchError && err.rawResponse
            ? `${message}\n\nRaw reply:\n${err.rawResponse}`
            : message,
      });
    }
  };

  const handleSaveSettings = () => {
    const trimmedIp = ipInput.trim();
    const parsedPort = parsePort(portInput);

    if (!trimmedIp) {
      setIpError('Введіть IP-адресу');
      return;
    }

    setIpError(null);
    setSavedIp(trimmedIp);
    setSavedPort(parsedPort);
    setPortInput(String(parsedPort));
    saveDeviceConfig(trimmedIp, parsedPort);

    syncConfigToNativeAndroid({
      ip: trimmedIp,
      port: parsedPort,
      providerId: outageConfig.providerId,
      group: outageConfig.group,
      notifyOutages,
    });

    showToast('Налаштування збережено');
    void refreshStatus(trimmedIp, parsedPort);
  };

  const handleOutageConfigChange = (nextConfig: OutageConfig) => {
    setOutageConfig(nextConfig);
    saveOutageConfig(nextConfig);
  };

  const handleNotifyOutagesChange = (enabled: boolean) => {
    setNotifyOutages(enabled);
    saveNotifyOutages(enabled);
    if (enabled) {
      requestNativeNotificationPermission();
      showToast('Сповіщення про зміни графіка увімкнено');
    } else {
      showToast('Сповіщення вимкнено');
    }
  };

  const handleTestNotification = () => {
    const sent = sendNativeTestNotification();
    if (sent) {
      showToast('Тестове сповіщення надіслано');
    } else {
      requestNativeNotificationPermission();
      showToast('Надайте дозвіл на сповіщення для перевірки');
    }
  };

  const errorCount = logs.filter((l) => !l.ok).length;
  const rightDesktopTab: 'settings' | 'logs' = activeTab === 'logs' ? 'logs' : 'settings';

  return (
    <div className="min-h-screen bg-bg-canvas text-text-primary flex flex-col overflow-x-hidden">
      {/* Compact 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg-surface/95 backdrop-blur-md">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-5 h-14 flex items-center justify-between gap-4 sm:gap-5">
          <span className="text-base font-bold tracking-tight text-text-primary whitespace-nowrap shrink-0">
            Marstek Venus
          </span>

          <nav className="hidden md:flex items-center gap-5 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`min-h-[40px] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 ${
                rightDesktopTab === 'settings'
                  ? 'text-text-primary border-accent-primary font-medium'
                  : 'text-text-muted border-transparent hover:text-text-primary'
              }`}
            >
              Налаштування
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`min-h-[40px] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 tabular-nums ${
                rightDesktopTab === 'logs'
                  ? 'text-text-primary border-accent-primary font-medium'
                  : 'text-text-muted border-transparent hover:text-text-primary'
              }`}
            >
              Логи ({logs.length})
            </button>
          </nav>

          <button
            type="button"
            onClick={() => void refreshStatus(savedIp, savedPort)}
            disabled={isUpdating}
            className={`${
              activeTab === 'status' ? 'inline-flex' : 'hidden md:inline-flex'
            } items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary-hover active:bg-accent-primary-pressed disabled:opacity-60 text-xs font-semibold text-text-on-accent transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-discharge`}
          >
            {isUpdating ? 'Оновлення...' : 'Оновити'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-5 py-5 pb-20 md:py-5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-5 items-start">
          {/* Status View (on mobile visible only when activeTab === 'status') */}
          <section
            id="status-overview"
            className={`min-w-0 w-full md:sticky md:top-20 ${
              activeTab === 'status' ? 'block' : 'hidden md:block'
            }`}
          >
            <StatusDashboard
              soc={soc}
              batCap={batCap}
              pvPower={pvPower}
              onGridPower={onGridPower}
              offGridPower={offGridPower}
              batTemp={batTemp}
              fullStatus={fullStatus}
              deviceIp={savedIp}
              devicePort={savedPort}
              lastUpdateTime={lastUpdateTime}
              isUpdating={isUpdating}
              isError={isError}
              outageSlots={apiOutageSlots}
              tomorrowOutageSlots={tomorrowApiOutageSlots}
              outageGroupLabel={outageConfig.group}
              nowMinutes={nowMinutes}
            />
          </section>

          {/* Settings & Logs Column */}
          <div className="min-w-0 w-full">
            <div
              className={
                activeTab === 'settings'
                  ? 'block'
                  : activeTab === 'status'
                  ? 'hidden md:block'
                  : 'hidden'
              }
            >
              <ConnectionSettings
                ip={ipInput}
                port={portInput}
                ipError={ipError}
                testState={testState}
                outageConfig={outageConfig}
                outageProviders={outageProviders}
                availableGroups={availableGroups}
                outageSlots={apiOutageSlots}
                tomorrowOutageSlots={tomorrowApiOutageSlots}
                outageLoading={outageLoading}
                outageError={outageError}
                outageUpdatedAt={outageUpdatedAt}
                notifyOutages={notifyOutages}
                ipInputRef={ipInputRef}
                onIpChange={(val) => {
                  setIpInput(val);
                  if (ipError) setIpError(null);
                }}
                onPortChange={setPortInput}
                onOutageConfigChange={handleOutageConfigChange}
                onNotifyOutagesChange={handleNotifyOutagesChange}
                onTestNotification={handleTestNotification}
                onRefreshOutages={() =>
                  void loadOutageSchedule(
                    outageConfig.providerId,
                    outageConfig.group,
                    true
                  )
                }
                onTestConnection={() => void handleTestConnection()}
                onSaveSettings={handleSaveSettings}
              />
            </div>

            <div className={activeTab === 'logs' ? 'block' : 'hidden'}>
              <MarstekLogsPanel logs={logs} onClearLogs={() => setLogs([])} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Навігація"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-bg-surface/95 backdrop-blur-md border-t border-border-subtle grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
            activeTab === 'status' ? 'text-accent-primary' : 'text-text-muted'
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
          <span>Стан</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
            activeTab === 'settings' ? 'text-accent-primary' : 'text-text-muted'
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Налаштування</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer tabular-nums ${
            activeTab === 'logs'
              ? 'text-accent-primary'
              : errorCount > 0
              ? 'text-accent-outage'
              : 'text-text-muted'
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
          <span>Логи ({logs.length})</span>
        </button>
      </nav>

      {/* Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-bg-surface-elevated border border-border-widget px-4 py-2 text-xs font-medium text-text-primary shadow-xl whitespace-nowrap"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
