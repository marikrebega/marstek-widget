import { useEffect, useState, type RefObject } from 'react';
import {
  formatPowerUk,
  getBatteryMode,
  getModeVisuals,
  getNetBatteryPower,
  getTemperatureVisuals,
  type MarstekStatus,
  type OutageConfig,
  type OutageProviderInfo,
  type OutageSlot,
} from '../types/marstek';
import {
  hasNativeAndroidBridge,
  isNativeBatteryUnrestricted,
  openNativeBatterySettings,
  subscribeNativeResume,
} from '../services/nativeBridge';

export type TestState =
  | { kind: 'idle' }
  | { kind: 'testing'; ip: string; port: number }
  | { kind: 'success'; status: MarstekStatus }
  | { kind: 'error'; message: string };

interface ConnectionSettingsProps {
  ip: string;
  port: string;
  ipError: string | null;
  testState: TestState;
  outageConfig: OutageConfig;
  outageProviders: OutageProviderInfo[];
  availableGroups: string[];
  outageSlots: OutageSlot[];
  tomorrowOutageSlots?: OutageSlot[];
  outageLoading: boolean;
  outageError: string | null;
  outageUpdatedAt: string | null;
  notifyOutages: boolean;
  ipInputRef?: RefObject<HTMLInputElement | null>;
  onIpChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onOutageConfigChange: (config: OutageConfig) => void;
  onNotifyOutagesChange: (enabled: boolean) => void;
  onTestNotification?: () => void;
  onRefreshOutages: () => void;
  onTestConnection: () => void;
  onSaveSettings: () => void;
}

export function ConnectionSettings({
  ip,
  port,
  ipError,
  testState,
  outageConfig,
  outageProviders,
  availableGroups,
  outageSlots,
  tomorrowOutageSlots = [],
  outageLoading,
  outageError,
  outageUpdatedAt,
  notifyOutages,
  ipInputRef,
  onIpChange,
  onPortChange,
  onOutageConfigChange,
  onNotifyOutagesChange,
  onTestNotification,
  onRefreshOutages,
  onTestConnection,
  onSaveSettings,
}: ConnectionSettingsProps) {
  const isNativeAndroid = hasNativeAndroidBridge();
  const [batteryUnrestricted, setBatteryUnrestricted] = useState<boolean>(() =>
    isNativeAndroid ? isNativeBatteryUnrestricted() : true
  );
  const todayTouchesMidnight = outageSlots.some((s) => s.end === '24:00');

  useEffect(() => {
    if (!isNativeAndroid) return;
    setBatteryUnrestricted(isNativeBatteryUnrestricted());
    return subscribeNativeResume(() => {
      setBatteryUnrestricted(isNativeBatteryUnrestricted());
    });
  }, [isNativeAndroid]);
  const formattedUpdatedAt = outageUpdatedAt
    ? new Date(outageUpdatedAt).toLocaleString('uk-UA', {
        timeZone: 'Europe/Kyiv',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="space-y-4">
      {/* UDP Connection Card */}
      <section className="rounded-2xl bg-bg-card border border-border-default p-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Пристрій Marstek
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Локальне UDP-з’єднання в домашній Wi-Fi мережі
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
          <div>
            <label
              htmlFor="device-ip"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              IP-адреса
            </label>
            <input
              ref={ipInputRef}
              id="device-ip"
              type="text"
              inputMode="url"
              value={ip}
              onChange={(e) => onIpChange(e.target.value)}
              placeholder="192.168.0.190"
              className={`w-full min-h-[44px] rounded-xl bg-bg-inset border px-3 py-2 text-sm text-text-primary placeholder-text-tertiary font-mono-tabular focus:outline-none focus:ring-2 focus:ring-accent-discharge transition-colors ${
                ipError ? 'border-status-error' : 'border-border-control'
              }`}
            />
            {ipError && (
              <p className="mt-1 text-xs text-status-error" role="alert">
                {ipError}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="device-port"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Порт API
            </label>
            <input
              id="device-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              placeholder="30000"
              className="w-full min-h-[44px] rounded-xl bg-bg-inset border border-border-control px-3 py-2 text-sm text-text-primary placeholder-text-tertiary font-mono-tabular focus:outline-none focus:ring-2 focus:ring-accent-discharge transition-colors"
            />
          </div>
        </div>

        <div className="pt-1 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={testState.kind === 'testing'}
            className="flex-1 min-h-[44px] rounded-xl bg-bg-button-secondary hover:bg-bg-button-secondary-hover active:bg-bg-button-secondary-active disabled:opacity-60 px-4 py-2 text-sm font-medium text-text-primary transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-discharge whitespace-nowrap"
          >
            {testState.kind === 'testing' ? 'Перевірка…' : 'Перевірити з’єднання'}
          </button>

          <button
            type="button"
            onClick={onSaveSettings}
            className="flex-1 min-h-[44px] rounded-xl bg-accent-primary hover:bg-accent-primary-hover active:bg-accent-primary-pressed px-4 py-2 text-sm font-semibold text-text-on-accent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary whitespace-nowrap"
          >
            Зберегти та оновити
          </button>
        </div>
      </section>

      {/* Test Result Feedback */}
      {testState.kind !== 'idle' && (
        <div
          className={`rounded-2xl border p-4 transition-colors ${
            testState.kind === 'error'
              ? 'bg-bg-card border-status-error'
              : 'bg-status-success-bg border-accent-primary/40'
          }`}
          role="status"
          aria-live="polite"
        >
          {testState.kind === 'testing' && (
            <p className="font-mono-tabular text-xs text-accent-primary">
              Надсилання ES.GetStatus до {testState.ip}:{testState.port}...
            </p>
          )}

          {testState.kind === 'success' && (
            <>
              <div className="text-sm font-semibold text-accent-primary">
                З’єднання успішне
                {testState.status.deviceName ? ` · ${testState.status.deviceName}` : ''}
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono-tabular text-xs text-text-primary">
                {testState.status.workMode && (
                  <>
                    <dt className="text-text-muted">Режим:</dt>
                    <dd>{testState.status.workMode}</dd>
                  </>
                )}
                <dt className="text-text-muted">Заряд:</dt>
                <dd>{testState.status.batSoc}%</dd>
                <dt className="text-text-muted">Температура:</dt>
                <dd
                  style={{
                    color:
                      typeof testState.status.batTemp === 'number'
                        ? getTemperatureVisuals(testState.status.batTemp).color
                        : '#8FA3B8',
                  }}
                >
                  {typeof testState.status.batTemp === 'number'
                    ? getTemperatureVisuals(testState.status.batTemp).label
                    : '--°C'}
                </dd>
                <dt className="text-text-muted">Ємність:</dt>
                <dd>{testState.status.batCap} Вт·год</dd>
                <dt className="text-text-muted">Батарея (нетто):</dt>
                <dd>
                  {(() => {
                    const net = getNetBatteryPower(
                      testState.status.pvPower,
                      testState.status.onGridPower,
                      testState.status.offGridPower
                    );
                    const mode = getModeVisuals(getBatteryMode(net));
                    return `${formatPowerUk(net)} (${mode.label})`;
                  })()}
                </dd>
                <dt className="text-text-muted">Сонце / Мережа:</dt>
                <dd>
                  {testState.status.pvPower} Вт / {testState.status.onGridPower} Вт
                </dd>
              </dl>
            </>
          )}

          {testState.kind === 'error' && (
            <>
              <div className="text-sm font-semibold text-status-error">
                Помилка з’єднання
              </div>
              <p className="mt-1.5 font-mono-tabular text-xs text-status-error-text">
                {testState.message}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                Переконайтеся, що телефон у тому ж Wi-Fi, у додатку Marstek увімкнено Local API, а IP збігається з роутером.
              </p>
            </>
          )}
        </div>
      )}

      {/* Outage Schedule Card */}
      <section className="rounded-2xl bg-bg-card border border-border-default p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Графік відключень
            </h2>
            <p className="text-xs text-text-muted mt-1 tabular-nums">
              {outageLoading
                ? 'Завантаження графіка...'
                : outageError
                ? `Помилка: ${outageError}`
                : formattedUpdatedAt
                ? `Оновлено: ${formattedUpdatedAt} (Київ)`
                : 'Автосинхронізація за чергою'}
            </p>
          </div>

          <button
            type="button"
            onClick={onRefreshOutages}
            disabled={outageLoading}
            className="min-h-[36px] rounded-lg bg-bg-button-secondary hover:bg-bg-button-secondary-hover active:bg-bg-button-secondary-active disabled:opacity-60 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {outageLoading ? 'Оновлення...' : 'Оновити графік'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-3">
          <div>
            <label
              htmlFor="outage-provider"
              className="block text-xs text-text-secondary mb-1"
            >
              Оператор
            </label>
            <select
              id="outage-provider"
              value={outageConfig.providerId}
              onChange={(e) =>
                onOutageConfigChange({
                  ...outageConfig,
                  providerId: e.target.value,
                })
              }
              className="w-full min-h-[44px] rounded-xl bg-bg-inset border border-border-control px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-outage"
            >
              {outageProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="outage-group"
              className="block text-xs text-text-secondary mb-1"
            >
              Черга
            </label>
            <select
              id="outage-group"
              value={outageConfig.group}
              onChange={(e) =>
                onOutageConfigChange({
                  ...outageConfig,
                  group: e.target.value,
                })
              }
              className="w-full min-h-[44px] rounded-xl bg-bg-inset border border-border-control px-3 py-2 text-xs text-text-primary font-mono-tabular focus:outline-none focus:ring-2 focus:ring-accent-outage"
            >
              {(availableGroups.length > 0 ? availableGroups : [outageConfig.group]).map(
                (g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* Today Slots */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-medium text-text-secondary">Сьогодні</div>
          {outageSlots.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-xs text-accent-outage">
              {outageSlots.map((slot) => (
                <span key={slot.id}>
                  {slot.start}–{slot.end}
                </span>
              ))}
            </div>
          ) : (
            !outageLoading && (
              <p className="text-xs text-text-muted">
                На сьогодні планових відключень для черги {outageConfig.group} немає.
              </p>
            )
          )}
        </div>

        {/* Tomorrow Slots */}
        <div className="pt-3 border-t border-border-default space-y-1">
          <div className="text-xs font-medium text-text-secondary">Завтра</div>
          {tomorrowOutageSlots.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-xs">
              {tomorrowOutageSlots.map((slot) => {
                const isContiguous = todayTouchesMidnight && slot.start === '00:00';
                return (
                  <span
                    key={slot.id}
                    className={isContiguous ? 'text-accent-outage' : 'text-accent-discharge'}
                  >
                    {slot.start}–{slot.end}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Графік ще не опубліковано. Щойно з’явиться — на шкалі додасться розділювач «ЗВТ» і перемикач днів.
            </p>
          )}
        </div>

        {/* Outage Change Notifications Toggle */}
        <div className="pt-3 border-t border-border-default space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary">
                Сповіщення про зміну графіка
              </div>
              <div className="text-[11px] text-text-muted">
                Push при змінах на сьогодні або появі графіка на завтра
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isNativeAndroid && onTestNotification && notifyOutages && (
                <button
                  type="button"
                  onClick={onTestNotification}
                  className="min-h-[36px] rounded-lg bg-bg-inset border border-border-control hover:border-accent-outage px-3 py-1 text-xs text-accent-outage transition-colors cursor-pointer"
                >
                  Тест
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={notifyOutages}
                aria-label="Сповіщення про зміну графіка"
                onClick={() => onNotifyOutagesChange(!notifyOutages)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${
                  notifyOutages ? 'bg-accent-primary' : 'bg-border-control'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-bg-surface transition-transform ${
                    notifyOutages ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {isNativeAndroid && notifyOutages && (
            <div className="rounded-xl bg-bg-inset border border-border-control px-3 py-2 flex items-center justify-between gap-3">
              <div className="text-[11px] text-text-secondary leading-snug">
                {batteryUnrestricted
                  ? 'Фонова перевірка кожні 15 хв · віджет — кожні 30 хв'
                  : 'Для стабільних фонових сповіщень на Samsung / Android оберіть Акумулятор → Необмежено'}
              </div>
              {!batteryUnrestricted && (
                <button
                  type="button"
                  onClick={openNativeBatterySettings}
                  className="min-h-[32px] shrink-0 rounded-lg bg-bg-button-secondary hover:bg-bg-button-secondary-hover px-3 py-1 text-[11px] font-medium text-accent-outage transition-colors cursor-pointer whitespace-nowrap"
                >
                  Налаштувати
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Collapsible Android Widget Guide */}
      <details className="rounded-2xl bg-bg-card border border-border-default px-4 py-3 group">
        <summary className="text-xs font-medium text-text-body cursor-pointer list-none flex items-center justify-between gap-2 select-none">
          <span>Як додати віджет на головний екран Android</span>
          <span className="text-text-muted group-open:rotate-180 transition-transform text-[11px]">
            ▼
          </span>
        </summary>
        <ol className="mt-3 pt-3 border-t border-border-default space-y-1.5 text-xs leading-relaxed text-text-secondary list-decimal list-inside">
          <li>Затисніть порожнє місце на головному екрані телефону.</li>
          <li>Оберіть <strong className="text-text-primary">Віджети</strong> (Widgets).</li>
          <li>Знайдіть <strong className="text-text-primary">Marstek Venus Widget</strong> і оберіть Повний, Компактний або Міні.</li>
          <li>Розтягуйте віджет під потрібну ширину (1×1 … 5×3) — сітка, шкала та перехід на завтра адаптуються автоматично.</li>
        </ol>
      </details>
    </div>
  );
}
