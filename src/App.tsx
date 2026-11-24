import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionSettings, type TestState } from './components/ConnectionSettings';
import { MarstekCompactWidget } from './components/MarstekCompactWidget';
import { MarstekFullWidget } from './components/MarstekFullWidget';
import {
  buildSimulatedStatus,
  fetchMarstekStatus,
  formatRawMarstekJson,
  MarstekFetchError,
  type SimulationPreset,
} from './services/marstekApi';
import { fetchOutageProviders, fetchOutageSchedule } from './services/outageApi';
import {
  loadPreferences,
  saveDemoMode,
  saveDeviceConfig,
  saveLatestStatus,
  saveLimits,
  saveOutageConfig,
  saveOutageSlots,
  saveWidgetSize,
  type WidgetSizeMode,
} from './services/preferences';
import {
  formatTimeHHMM,
  formatTimeHHMMSS,
  getKyivMinutes,
  type BatteryLimits,
  type MarstekLogEntry,
  type OutageConfig,
  type OutageProviderInfo,
  type OutageSlot,
} from './types/marstek';

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const VISIBILITY_RATE_LIMIT_MS = 60 * 1000;
const MAX_LOG_ENTRIES = 50;

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

  const [ipInput, setIpInput] = useState(initialPrefs.current.deviceIp);
  const [portInput, setPortInput] = useState(String(initialPrefs.current.devicePort));
  const [savedIp, setSavedIp] = useState(initialPrefs.current.deviceIp);
  const [savedPort, setSavedPort] = useState(initialPrefs.current.devicePort);

  const [soc, setSoc] = useState(initialPrefs.current.lastCachedSoc);
  const [batCap, setBatCap] = useState(initialPrefs.current.lastCachedCap);
  const [onGridPower, setOnGridPower] = useState(initialPrefs.current.lastCachedGrid);

  const [limits, setLimits] = useState<BatteryLimits>(initialPrefs.current.limits);
  const [outageConfig, setOutageConfig] = useState<OutageConfig>(
    initialPrefs.current.outageConfig
  );
  const [outageProviders, setOutageProviders] =
    useState<OutageProviderInfo[]>(FALLBACK_PROVIDERS);
  const [availableGroups, setAvailableGroups] = useState<string[]>([
    initialPrefs.current.outageConfig.group,
  ]);
  const [manualOutageSlots, setManualOutageSlots] = useState<OutageSlot[]>(
    initialPrefs.current.outageSlots
  );
  const [apiOutageSlots, setApiOutageSlots] = useState<OutageSlot[]>([]);
  const [tomorrowApiOutageSlots, setTomorrowApiOutageSlots] = useState<OutageSlot[]>([]);
  const [outageLoading, setOutageLoading] = useState(false);
  const [outageError, setOutageError] = useState<string | null>(null);
  const [outageUpdatedAt, setOutageUpdatedAt] = useState<string | null>(null);

  const [widgetSize, setWidgetSize] = useState<WidgetSizeMode>(
    initialPrefs.current.widgetSize
  );

  const [demoMode, setDemoMode] = useState(initialPrefs.current.demoMode);
  const [activePreset, setActivePreset] = useState<SimulationPreset>('charging');
  const [nowMinutes, setNowMinutes] = useState(() => getKyivMinutes());

  const [isUpdating, setIsUpdating] = useState(false);
  const [isError, setIsError] = useState(false);

  const [ipError, setIpError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [logs, setLogs] = useState<MarstekLogEntry[]>(() => {
    if (initialPrefs.current.demoMode) {
      const sample = buildSimulatedStatus('charging');
      return [
        {
          id: `log-${Date.now()}`,
          timestamp: formatTimeHHMMSS(new Date()),
          target: `${initialPrefs.current.deviceIp}:${initialPrefs.current.devicePort}`,
          method: 'ES.GetStatus',
          source: 'demo',
          ok: true,
          durationMs: 12,
          rawPayload: formatRawMarstekJson(sample),
        },
      ];
    }
    return [];
  });

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
        if (data.selectedGroup && data.selectedGroup !== group) {
          const updatedConfig: OutageConfig = {
            mode: 'api',
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

  // Load outage providers once
  useEffect(() => {
    void fetchOutageProviders()
      .then((list) => setOutageProviders(list))
      .catch(() => {
        // Keep fallback list
      });
  }, []);

  // Fetch real outage schedule when in API mode or when provider/group changes
  useEffect(() => {
    if (outageConfig.mode === 'api') {
      void loadOutageSchedule(outageConfig.providerId, outageConfig.group, false);
    }
  }, [outageConfig.mode, outageConfig.providerId, outageConfig.group, loadOutageSchedule]);

  const refreshWidget = useCallback(
    async (
      targetIp: string,
      targetPort: number,
      useDemo: boolean,
      preset?: SimulationPreset
    ) => {
      if (!targetIp.trim()) return;

      setIsUpdating(true);
      setIsError(false);

      try {
        const outcome = await fetchMarstekStatus(targetIp, targetPort, {
          simulate: useDemo,
          preset,
        });
        const formatted = formatTimeHHMM(new Date(outcome.status.timestamp));
        saveLatestStatus(outcome.status, formatted);
        setSoc(outcome.status.batSoc);
        setBatCap(outcome.status.batCap);
        setOnGridPower(outcome.status.onGridPower);
        setIsError(false);

        appendLog({
          target: `${targetIp}:${targetPort}`,
          method: outcome.method,
          source: useDemo ? 'demo' : 'udp',
          ok: true,
          durationMs: outcome.durationMs,
          rawPayload: outcome.rawResponse,
        });
        if (outcome.extraLogs) {
          for (const extra of outcome.extraLogs) {
            appendLog({
              target: `${targetIp}:${targetPort}`,
              method: extra.method,
              source: useDemo ? 'demo' : 'udp',
              ok: true,
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
          source: useDemo ? 'demo' : 'udp',
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
    const intervalId = window.setInterval(() => {
      void refreshWidget(savedIp, savedPort, demoMode, activePreset);
      if (outageConfig.mode === 'api') {
        void loadOutageSchedule(outageConfig.providerId, outageConfig.group, false);
      }
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
          void refreshWidget(savedIp, savedPort, demoMode, activePreset);
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
    demoMode,
    activePreset,
    outageConfig.mode,
    outageConfig.providerId,
    outageConfig.group,
    refreshWidget,
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
      const outcome = await fetchMarstekStatus(trimmedIp, parsedPort, {
        simulate: demoMode,
        preset: activePreset,
      });
      setTestState({ kind: 'success', status: outcome.status });
      appendLog({
        target: `${trimmedIp}:${parsedPort}`,
        method: outcome.method,
        source: demoMode ? 'demo' : 'udp',
        ok: true,
        durationMs: outcome.durationMs,
        rawPayload: outcome.rawResponse,
      });
      if (outcome.extraLogs) {
        for (const extra of outcome.extraLogs) {
          appendLog({
            target: `${trimmedIp}:${parsedPort}`,
            method: extra.method,
            source: demoMode ? 'demo' : 'udp',
            ok: true,
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
        source: demoMode ? 'demo' : 'udp',
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

    showToast('Налаштування збережено! Оновлення віджета...');
    void refreshWidget(trimmedIp, parsedPort, demoMode, activePreset);
  };

  const handleToggleDemoMode = (enabled: boolean) => {
    setDemoMode(enabled);
    saveDemoMode(enabled);
    if (enabled) {
      const sample = buildSimulatedStatus(activePreset);
      const formatted = formatTimeHHMM(new Date(sample.timestamp));
      saveLatestStatus(sample, formatted);
      setSoc(sample.batSoc);
      setBatCap(sample.batCap);
      setOnGridPower(sample.onGridPower);
      setIsError(false);
      setTestState({ kind: 'success', status: sample });
      appendLog({
        target: `${savedIp}:${savedPort}`,
        method: 'ES.GetStatus',
        source: 'demo',
        ok: true,
        durationMs: 12,
        rawPayload: formatRawMarstekJson(sample),
      });
      showToast('Увімкнено демо-телеметрію');
    } else {
      setTestState({ kind: 'idle' });
      showToast('Перемкнуто на локальний UDP');
    }
  };

  const handleApplyPreset = (preset: SimulationPreset) => {
    setActivePreset(preset);
    if (!demoMode) {
      setDemoMode(true);
      saveDemoMode(true);
    }
    const sample = buildSimulatedStatus(preset);
    const formatted = formatTimeHHMM(new Date(sample.timestamp));
    saveLatestStatus(sample, formatted);
    setSoc(sample.batSoc);
    setBatCap(sample.batCap);
    setOnGridPower(sample.onGridPower);
    setIsError(false);
    appendLog({
      target: `${savedIp}:${savedPort}`,
      method: 'ES.GetStatus',
      source: 'demo',
      ok: true,
      durationMs: 8,
      rawPayload: formatRawMarstekJson(sample),
    });
  };

  const handleLimitsChange = (nextLimits: BatteryLimits) => {
    setLimits(nextLimits);
    saveLimits(nextLimits);
  };

  const handleOutageConfigChange = (nextConfig: OutageConfig) => {
    setOutageConfig(nextConfig);
    saveOutageConfig(nextConfig);
  };

  const handleManualOutageSlotsChange = (nextSlots: OutageSlot[]) => {
    setManualOutageSlots(nextSlots);
    saveOutageSlots(nextSlots);
  };

  const handleWidgetSizeChange = (size: WidgetSizeMode) => {
    setWidgetSize(size);
    saveWidgetSize(size);
  };

  const effectiveOutageSlots =
    outageConfig.mode === 'api' ? apiOutageSlots : manualOutageSlots;
  const effectiveTomorrowSlots =
    outageConfig.mode === 'api' ? tomorrowApiOutageSlots : [];

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#F2F4F5] flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-[#1E2329] bg-[#101316]">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-base font-bold tracking-tight text-[#F2F4F5] whitespace-nowrap shrink-0"
          >
            Marstek Widget
          </a>

          <nav className="hidden sm:flex items-center gap-6 text-sm text-[#A8B0B8]">
            <a
              href="#widget-preview"
              className="hover:text-[#F2F4F5] transition-colors whitespace-nowrap shrink-0"
            >
              Віджет
            </a>
            <a
              href="#connection-settings"
              className="hover:text-[#F2F4F5] transition-colors whitespace-nowrap shrink-0"
            >
              Підключення
            </a>
            <a
              href="#marstek-logs"
              className="hover:text-[#F2F4F5] transition-colors whitespace-nowrap shrink-0"
            >
              Логи
            </a>
          </nav>

          <button
            type="button"
            onClick={() => void refreshWidget(savedIp, savedPort, demoMode, activePreset)}
            disabled={isUpdating}
            className="px-4 py-2 rounded-lg bg-[#3DDC84] hover:bg-[#4EE592] disabled:opacity-60 text-xs font-semibold text-[#101316] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3DDC84]"
          >
            {isUpdating ? 'Оновлення...' : 'Оновити'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-5xl w-full mx-auto px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[410px_1fr] gap-8 items-start">
          {/* Left Column: Widget Preview + Controls */}
          <section id="widget-preview" className="lg:sticky lg:top-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-[#1B2025] p-0.5 border border-[#2A2F35]">
                <button
                  type="button"
                  onClick={() => handleWidgetSizeChange('full')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    widgetSize === 'full'
                      ? 'bg-[#2A2F35] text-[#F2F4F5]'
                      : 'text-[#A8B0B8] hover:text-[#F2F4F5]'
                  }`}
                >
                  Повний 390×720
                </button>
                <button
                  type="button"
                  onClick={() => handleWidgetSizeChange('compact')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    widgetSize === 'compact'
                      ? 'bg-[#2A2F35] text-[#F2F4F5]'
                      : 'text-[#A8B0B8] hover:text-[#F2F4F5]'
                  }`}
                >
                  Компактний 360×170
                </button>
              </div>

              <span className="text-xs font-mono-tabular text-[#A8B0B8]">
                {savedIp}:{savedPort}
              </span>
            </div>

            {/* Widget Canvas */}
            <div className="flex justify-center">
              {widgetSize === 'full' ? (
                <MarstekFullWidget
                  soc={soc}
                  batCap={batCap}
                  onGridPower={onGridPower}
                  limits={limits}
                  outageSlots={effectiveOutageSlots}
                  tomorrowOutageSlots={effectiveTomorrowSlots}
                  outageGroupLabel={
                    outageConfig.mode === 'api' ? outageConfig.group : undefined
                  }
                  nowMinutes={nowMinutes}
                  isUpdating={isUpdating}
                  isError={isError}
                  onRefresh={() =>
                    void refreshWidget(savedIp, savedPort, demoMode, activePreset)
                  }
                />
              ) : (
                <MarstekCompactWidget
                  soc={soc}
                  batCap={batCap}
                  onGridPower={onGridPower}
                  limits={limits}
                  outageSlots={effectiveOutageSlots}
                  tomorrowOutageSlots={effectiveTomorrowSlots}
                  nowMinutes={nowMinutes}
                  onRefresh={() =>
                    void refreshWidget(savedIp, savedPort, demoMode, activePreset)
                  }
                />
              )}
            </div>

            {/* Source & State Switcher */}
            <div className="rounded-[20px] bg-[#1B2025] border border-[#2A2F35] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#F2F4F5]">
                    Джерело даних Marstek
                  </div>
                  <div className="text-[11px] text-[#A8B0B8]">
                    {demoMode
                      ? 'Демо-режим (симуляція станів батареї)'
                      : 'Локальний UDP ES.GetStatus'}
                  </div>
                </div>

                <div className="inline-flex rounded-lg bg-[#101316] p-0.5 border border-[#2A2F35] shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleDemoMode(false)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      !demoMode
                        ? 'bg-[#5AB0FF] text-[#101316]'
                        : 'text-[#A8B0B8] hover:text-[#F2F4F5]'
                    }`}
                  >
                    Live UDP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleDemoMode(true)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      demoMode
                        ? 'bg-[#3DDC84] text-[#101316]'
                        : 'text-[#A8B0B8] hover:text-[#F2F4F5]'
                    }`}
                  >
                    Демо
                  </button>
                </div>
              </div>

              {demoMode && (
                <div className="pt-2 border-t border-[#2A2F35]">
                  <div className="text-[11px] text-[#A8B0B8] mb-2">
                    Стани віджета:
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'charging', label: 'Заряджається' },
                        { id: 'discharging', label: 'Розряджається' },
                        { id: 'idle', label: 'Очікування' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.id)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                          activePreset === preset.id
                            ? 'bg-[#2A2F35] text-[#F2F4F5] border border-[#3E4650]'
                            : 'bg-[#101316] hover:bg-[#23282E] text-[#A8B0B8]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Settings, Outages API, Logs, Limits */}
          <section id="connection-settings">
            <ConnectionSettings
              ip={ipInput}
              port={portInput}
              ipError={ipError}
              testState={testState}
              demoMode={demoMode}
              limits={limits}
              outageConfig={outageConfig}
              outageProviders={outageProviders}
              availableGroups={availableGroups}
              outageSlots={effectiveOutageSlots}
              outageLoading={outageLoading}
              outageError={outageError}
              outageUpdatedAt={outageUpdatedAt}
              logs={logs}
              ipInputRef={ipInputRef}
              onIpChange={(val) => {
                setIpInput(val);
                if (ipError) setIpError(null);
              }}
              onPortChange={setPortInput}
              onLimitsChange={handleLimitsChange}
              onOutageConfigChange={handleOutageConfigChange}
              onRefreshOutages={() =>
                void loadOutageSchedule(
                  outageConfig.providerId,
                  outageConfig.group,
                  true
                )
              }
              onOutageSlotsChange={handleManualOutageSlotsChange}
              onClearLogs={() => setLogs([])}
              onTestConnection={() => void handleTestConnection()}
              onSaveSettings={handleSaveSettings}
              onEnableDemoAndTest={() => handleToggleDemoMode(true)}
            />
          </section>
        </div>
      </main>

      {/* Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#1B2025] border border-[#2A2F35] px-5 py-2.5 text-xs font-medium text-[#F2F4F5] shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
