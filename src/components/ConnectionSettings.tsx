import type { RefObject } from 'react';
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
import { hasNativeAndroidBridge } from '../services/nativeBridge';

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
    <div className="space-y-5">
      {/* UDP Connection Card */}
      <section className="rounded-2xl bg-[#14181D] border border-[#22272E] p-4 space-y-3.5">
        <div>
          <h2 className="text-base font-semibold text-[#F2F4F5]">
            Пристрій Marstek
          </h2>
          <p className="text-xs text-[#8FA3B8] mt-0.5">
            Локальне UDP-з’єднання в домашній Wi-Fi мережі
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
          <div>
            <label
              htmlFor="device-ip"
              className="block text-xs font-medium text-[#A8B0B8] mb-1.5"
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
              className={`w-full min-h-[44px] rounded-xl bg-[#0F1216] border px-3.5 py-2 text-sm text-[#F2F4F5] placeholder-[#616973] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#5AB0FF] transition-colors ${
                ipError ? 'border-[#F44336]' : 'border-[#252B32]'
              }`}
            />
            {ipError && (
              <p className="mt-1 text-xs text-[#F44336]" role="alert">
                {ipError}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="device-port"
              className="block text-xs font-medium text-[#A8B0B8] mb-1.5"
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
              className="w-full min-h-[44px] rounded-xl bg-[#0F1216] border border-[#252B32] px-3.5 py-2 text-sm text-[#F2F4F5] placeholder-[#616973] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#5AB0FF] transition-colors"
            />
          </div>
        </div>

        <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={testState.kind === 'testing'}
            className="flex-1 min-h-[44px] rounded-xl bg-[#22272E] hover:bg-[#2C323B] active:bg-[#343B46] disabled:opacity-60 px-4 py-2 text-sm font-medium text-[#F2F4F5] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5AB0FF] whitespace-nowrap"
          >
            {testState.kind === 'testing' ? 'Перевірка UDP...' : 'Перевірити з’єднання'}
          </button>

          <button
            type="button"
            onClick={onSaveSettings}
            className="flex-1 min-h-[44px] rounded-xl bg-[#3DDC84] hover:bg-[#4EE592] active:bg-[#2EC973] px-4 py-2 text-sm font-semibold text-[#101316] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3DDC84] whitespace-nowrap"
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
              ? 'bg-[#211516] border-[#4E2C2C]'
              : 'bg-[#132019] border-[#264D38]'
          }`}
          role="status"
          aria-live="polite"
        >
          {testState.kind === 'testing' && (
            <p className="font-mono-tabular text-xs text-[#3DDC84]">
              Надсилання ES.GetStatus до {testState.ip}:{testState.port}...
            </p>
          )}

          {testState.kind === 'success' && (
            <>
              <div className="text-sm font-semibold text-[#3DDC84]">
                З’єднання успішне
                {testState.status.deviceName ? ` · ${testState.status.deviceName}` : ''}
              </div>
              <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono-tabular text-xs text-[#F2F4F5]">
                {testState.status.workMode && (
                  <>
                    <dt className="text-[#8FA3B8]">Режим:</dt>
                    <dd>{testState.status.workMode}</dd>
                  </>
                )}
                <dt className="text-[#8FA3B8]">Заряд:</dt>
                <dd>{testState.status.batSoc}%</dd>
                <dt className="text-[#8FA3B8]">Температура:</dt>
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
                <dt className="text-[#8FA3B8]">Ємність:</dt>
                <dd>{testState.status.batCap} Вт·год</dd>
                <dt className="text-[#8FA3B8]">Батарея (нетто):</dt>
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
                <dt className="text-[#8FA3B8]">Сонце / Мережа:</dt>
                <dd>
                  {testState.status.pvPower} Вт / {testState.status.onGridPower} Вт
                </dd>
              </dl>
            </>
          )}

          {testState.kind === 'error' && (
            <>
              <div className="text-sm font-semibold text-[#F44336]">
                Помилка з’єднання
              </div>
              <p className="mt-1.5 font-mono-tabular text-xs text-[#E0E0E0]">
                {testState.message}
              </p>
              <p className="mt-2 text-xs text-[#A8B0B8]">
                Переконайтеся, що телефон у тому ж Wi-Fi, у додатку Marstek увімкнено Local API, а IP збігається з роутером.
              </p>
            </>
          )}
        </div>
      )}

      {/* Outage Schedule Card */}
      <section className="rounded-2xl bg-[#14181D] border border-[#22272E] p-4 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#F2F4F5]">
              Графік відключень
            </h2>
            <p className="text-xs text-[#8FA3B8] mt-0.5 tabular-nums">
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
            className="min-h-[36px] rounded-lg bg-[#22272E] hover:bg-[#2C323B] disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-[#FFC24D] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {outageLoading ? 'Оновлення...' : 'Оновити'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2.5">
          <div>
            <label
              htmlFor="outage-provider"
              className="block text-xs text-[#A8B0B8] mb-1"
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
              className="w-full min-h-[44px] rounded-xl bg-[#0F1216] border border-[#252B32] px-3 py-2 text-xs text-[#F2F4F5] focus:outline-none focus:ring-2 focus:ring-[#FFC24D]"
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
              className="block text-xs text-[#A8B0B8] mb-1"
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
              className="w-full min-h-[44px] rounded-xl bg-[#0F1216] border border-[#252B32] px-3 py-2 text-xs text-[#F2F4F5] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#FFC24D]"
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

        {/* Today Slots (clean unboxed tabular list) */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-medium text-[#A8B0B8]">Сьогодні</div>
          {outageSlots.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-xs text-[#FFC24D]">
              {outageSlots.map((slot) => (
                <span key={slot.id}>
                  {slot.start}–{slot.end}
                </span>
              ))}
            </div>
          ) : (
            !outageLoading && (
              <p className="text-xs text-[#8FA3B8]">
                На сьогодні планових відключень для черги {outageConfig.group} немає.
              </p>
            )
          )}
        </div>

        {/* Tomorrow Slots */}
        <div className="pt-2.5 border-t border-[#22272E] space-y-1">
          <div className="text-xs font-medium text-[#A8B0B8]">Завтра</div>
          {tomorrowOutageSlots.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-xs text-[#5AB0FF]">
              {tomorrowOutageSlots.map((slot) => (
                <span key={slot.id}>
                  {slot.start}–{slot.end}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#616973]">
              Обленерго ще не опублікувало графік на завтра. Щойно з’явиться — на шкалі додасться синій розділювач «ЗВТ» і перемикач днів.
            </p>
          )}
        </div>

        {/* Outage Change Notifications Toggle */}
        <div className="pt-3 border-t border-[#22272E] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F2F4F5]">
              Сповіщення про зміну графіка
            </div>
            <div className="text-[11px] text-[#8FA3B8]">
              Push при змінах на сьогодні або появі графіка на завтра
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isNativeAndroid && onTestNotification && notifyOutages && (
              <button
                type="button"
                onClick={onTestNotification}
                className="min-h-[36px] rounded-lg bg-[#0F1216] border border-[#252B32] hover:border-[#FFC24D] px-2.5 py-1 text-xs text-[#FFC24D] transition-colors cursor-pointer"
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
                notifyOutages ? 'bg-[#3DDC84]' : 'bg-[#252B32]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-[#101316] transition-transform ${
                  notifyOutages ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Collapsible Android Widget Guide */}
      <details className="rounded-2xl bg-[#14181D] border border-[#22272E] px-4 py-3 group">
        <summary className="text-xs font-medium text-[#C9CFD5] cursor-pointer list-none flex items-center justify-between gap-2 select-none">
          <span>Як додати віджет на головний екран Android</span>
          <span className="text-[#8FA3B8] group-open:rotate-180 transition-transform text-[10px]">
            ▼
          </span>
        </summary>
        <ol className="mt-3 pt-2.5 border-t border-[#22272E] space-y-1.5 text-xs leading-relaxed text-[#A8B0B8] list-decimal list-inside">
          <li>Затисніть порожнє місце на головному екрані телефону.</li>
          <li>Оберіть <strong className="text-[#F2F4F5]">Віджети</strong> (Widgets).</li>
          <li>Знайдіть <strong className="text-[#F2F4F5]">Marstek Venus Widget</strong> і оберіть Повний, Компактний або Міні.</li>
          <li>Розтягуйте віджет під потрібну ширину (1×1 … 5×3) — сітка, шкала та перехід на завтра адаптуються автоматично.</li>
        </ol>
      </details>
    </div>
  );
}
