import type { RefObject } from 'react';
import {
  formatPowerUk,
  getBatteryMode,
  getModeVisuals,
  getNetBatteryPower,
  getTemperatureVisuals,
  type MarstekLogEntry,
  type MarstekStatus,
  type OutageConfig,
  type OutageProviderInfo,
  type OutageSlot,
} from '../types/marstek';
import { MarstekLogsPanel } from './MarstekLogsPanel';
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
  logs: MarstekLogEntry[];
  ipInputRef?: RefObject<HTMLInputElement | null>;
  onIpChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onOutageConfigChange: (config: OutageConfig) => void;
  onNotifyOutagesChange: (enabled: boolean) => void;
  onTestNotification?: () => void;
  onRefreshOutages: () => void;
  onClearLogs: () => void;
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
  logs,
  ipInputRef,
  onIpChange,
  onPortChange,
  onOutageConfigChange,
  onNotifyOutagesChange,
  onTestNotification,
  onRefreshOutages,
  onClearLogs,
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
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[#F2F4F5] tracking-tight text-balance">
          Підключення Marstek Venus D
        </h1>
        <p className="mt-1 text-[13px] text-[#A8B0B8]">
          Налаштуйте локальне UDP-з&apos;єднання, чергу відключень світла та переглядайте логи відповідей.
        </p>
      </div>

      {/* UDP Connection Input Card */}
      <div className="rounded-[20px] bg-[#1B2025] border border-[#2A2F35] p-4 space-y-3">
        <div>
          <label
            htmlFor="device-ip"
            className="block text-xs font-medium text-[#A8B0B8] mb-1.5"
          >
            IP-адреса пристрою Marstek (напр. 192.168.1.150)
          </label>
          <input
            ref={ipInputRef}
            id="device-ip"
            type="text"
            inputMode="url"
            value={ip}
            onChange={(e) => onIpChange(e.target.value)}
            placeholder="192.168.0.190"
            className={`w-full rounded-[12px] bg-[#101316] border px-3.5 py-2.5 text-sm text-[#F2F4F5] placeholder-[#616973] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#5AB0FF] transition-colors ${
              ipError ? 'border-[#F44336]' : 'border-[#2A2F35]'
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
            Локальний порт API (За замовчуванням: 30000)
          </label>
          <input
            id="device-port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => onPortChange(e.target.value)}
            placeholder="30000"
            className="w-full rounded-[12px] bg-[#101316] border border-[#2A2F35] px-3.5 py-2.5 text-sm text-[#F2F4F5] placeholder-[#616973] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#5AB0FF] transition-colors"
          />
        </div>

        <div className="pt-1 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={testState.kind === 'testing'}
            className="flex-1 rounded-[12px] bg-[#2A2F35] hover:bg-[#353C44] active:bg-[#3F4750] disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-[#F2F4F5] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5AB0FF] whitespace-nowrap"
          >
            {testState.kind === 'testing'
              ? 'Перевірка UDP...'
              : 'Перевірити з’єднання'}
          </button>

          <button
            type="button"
            onClick={onSaveSettings}
            className="flex-1 rounded-[12px] bg-[#3DDC84] hover:bg-[#4EE592] active:bg-[#2EC973] px-4 py-2.5 text-sm font-semibold text-[#101316] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3DDC84] whitespace-nowrap"
          >
            Зберегти та оновити віджет
          </button>
        </div>
      </div>

      {/* Test Result Card */}
      {testState.kind !== 'idle' && (
        <div
          className={`rounded-[20px] border p-4 transition-colors ${
            testState.kind === 'error'
              ? 'bg-[#261818] border-[#4E2C2C]'
              : 'bg-[#15241D] border-[#264D38]'
          }`}
          role="status"
          aria-live="polite"
        >
          {testState.kind === 'testing' && (
            <>
              <div className="text-sm font-bold text-[#3DDC84]">
                Перевірка UDP-з&apos;єднання...
              </div>
              <p className="mt-2 font-mono-tabular text-xs text-[#C9CFD5]">
                Надсилання ES.GetStatus до {testState.ip}:{testState.port}...
              </p>
            </>
          )}

          {testState.kind === 'success' && (
            <>
              <div className="text-sm font-bold text-[#3DDC84]">
                ✓ З&apos;єднання успішне
                {testState.status.deviceName ? ` · ${testState.status.deviceName}` : ''}
              </div>
              <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono-tabular text-xs text-[#F2F4F5]">
                {testState.status.workMode && (
                  <>
                    <dt className="text-[#A8B0B8]">Режим роботи:</dt>
                    <dd>{testState.status.workMode}</dd>
                  </>
                )}
                <dt className="text-[#A8B0B8]">Заряд (SOC):</dt>
                <dd>{testState.status.batSoc}%</dd>
                {typeof testState.status.batTemp === 'number' && (
                  <>
                    <dt className="text-[#A8B0B8]">Температура:</dt>
                    <dd style={{ color: getTemperatureVisuals(testState.status.batTemp).color }}>
                      {getTemperatureVisuals(testState.status.batTemp).label}
                    </dd>
                  </>
                )}
                <dt className="text-[#A8B0B8]">Ємність батареї:</dt>
                <dd>{testState.status.batCap} Вт·год</dd>
                <dt className="text-[#A8B0B8]">Батарея (нетто):</dt>
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
                <dt className="text-[#A8B0B8]">Сонячна (PV):</dt>
                <dd>{testState.status.pvPower} Вт</dd>
                <dt className="text-[#A8B0B8]">Мережа (Grid):</dt>
                <dd>{testState.status.onGridPower} Вт</dd>
                <dt className="text-[#A8B0B8]">Автономний вихід:</dt>
                <dd>{testState.status.offGridPower} Вт</dd>
                <dt className="text-[#A8B0B8]">Всього PV:</dt>
                <dd>{testState.status.totalPvEnergy} Вт·год</dd>
                <dt className="text-[#A8B0B8]">Всього з мережі:</dt>
                <dd>{testState.status.totalGridInputEnergy} Вт·год</dd>
                <dt className="text-[#A8B0B8]">Всього в мережу:</dt>
                <dd>{testState.status.totalGridOutputEnergy} Вт·год</dd>
                {typeof testState.status.totalLoadEnergy === 'number' && (
                  <>
                    <dt className="text-[#A8B0B8]">Навантаження:</dt>
                    <dd>{testState.status.totalLoadEnergy} Вт·год</dd>
                  </>
                )}
              </dl>
            </>
          )}

          {testState.kind === 'error' && (
            <>
              <div className="text-sm font-bold text-[#F44336]">
                ✗ Помилка з&apos;єднання
              </div>
              <div className="mt-2 font-mono-tabular text-xs text-[#E0E0E0] space-y-2 whitespace-pre-line">
                <p>Помилка: {testState.message}</p>
                <div className="text-[#A8B0B8]">
                  Перевірте:
                  {'\n'}1. Пристрій та телефон у одній локальній мережі Wi-Fi?
                  {'\n'}2. Чи увімкнено «Local API / Open API» у додатку Marstek?
                  {'\n'}3. Чи відповідає IP-адреса DHCP-призначенню роутера?
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Real Outage Schedule API Card */}
      <div className="rounded-[20px] bg-[#1B2025] border border-[#2A2F35] p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold text-[#F2F4F5]">
            Графік відключень світла
          </div>
          <div className="text-[11px] text-[#A8B0B8]">
            Оберіть оператора та свою чергу для автоматичного отримання графіків
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2.5">
          <div>
            <label
              htmlFor="outage-provider"
              className="block text-[11px] text-[#A8B0B8] mb-1"
            >
              Регіон / Оператор
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
              className="w-full rounded-[12px] bg-[#101316] border border-[#2A2F35] px-3 py-2 text-xs text-[#F2F4F5] focus:outline-none focus:ring-2 focus:ring-[#FFC24D]"
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
              className="block text-[11px] text-[#A8B0B8] mb-1"
            >
              Черга / Група
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
              className="w-full rounded-[12px] bg-[#101316] border border-[#2A2F35] px-3 py-2 text-xs text-[#F2F4F5] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#FFC24D]"
            >
              {(availableGroups.length > 0
                ? availableGroups
                : [outageConfig.group]
              ).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="text-[#A8B0B8] font-mono-tabular">
            {outageLoading
              ? 'Завантаження графіка...'
              : outageError
              ? `Помилка: ${outageError}`
              : formattedUpdatedAt
              ? `Оновлено: ${formattedUpdatedAt} (Київ)`
              : 'Дані готові'}
          </div>

          <button
            type="button"
            onClick={onRefreshOutages}
            disabled={outageLoading}
            className="rounded-lg bg-[#2A2F35] hover:bg-[#353C44] disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-[#FFC24D] transition-colors cursor-pointer whitespace-nowrap"
          >
            {outageLoading ? 'Оновлення...' : 'Оновити графік'}
          </button>
        </div>

        {outageSlots.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {outageSlots.map((slot) => (
              <span
                key={slot.id}
                className="rounded-lg bg-[#101316] border border-[#2A2F35] px-2.5 py-1 text-xs font-mono-tabular text-[#FFC24D]"
              >
                {slot.start} – {slot.end}
              </span>
            ))}
          </div>
        ) : (
          !outageLoading && (
            <div className="rounded-lg bg-[#101316] border border-[#2A2F35] px-3 py-2 text-xs text-[#A8B0B8]">
              На сьогодні планових відключень для черги {outageConfig.group} не знайдено.
            </div>
          )
        )}

        {tomorrowOutageSlots.length > 0 && (
          <div className="pt-2 border-t border-[#2A2F35] space-y-1.5">
            <div className="text-[11px] font-semibold text-[#A8B0B8]">
              Графік на завтра:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tomorrowOutageSlots.map((slot) => (
                <span
                  key={slot.id}
                  className="rounded-lg bg-[#101316] border border-[#2A2F35] px-2.5 py-1 text-xs font-mono-tabular text-[#C9CFD5]"
                >
                  {slot.start} – {slot.end}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Outage Change Notifications Toggle */}
        <div className="pt-2.5 border-t border-[#2A2F35] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F2F4F5]">
              Сповіщення про зміну графіка
            </div>
            <div className="text-[11px] text-[#A8B0B8]">
              Push на телефон при змінах на сьогодні або появі графіка на завтра (раз на 30 хв, без розряду при розблокуванні)
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isNativeAndroid && onTestNotification && notifyOutages && (
              <button
                type="button"
                onClick={onTestNotification}
                className="rounded-lg bg-[#101316] border border-[#2A2F35] hover:border-[#FFC24D] px-2.5 py-1 text-[11px] text-[#FFC24D] transition-colors cursor-pointer"
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                notifyOutages ? 'bg-[#3DDC84]' : 'bg-[#2A2F35]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[#101316] transition-transform ${
                  notifyOutages ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Marstek Response Logs Panel (in App, not in widget) */}
      <MarstekLogsPanel logs={logs} onClearLogs={onClearLogs} />

      {/* How to add widget to Home Screen */}
      <div className="rounded-[20px] bg-[#1B2025] border border-[#2A2F35] p-4 space-y-2">
        <div className="text-sm font-semibold text-[#F2F4F5]">
          Як додати віджет на головний екран Android
        </div>
        <ol className="space-y-1 text-xs leading-relaxed text-[#A8B0B8] list-decimal list-inside">
          <li>Затисніть порожнє місце на головному екрані телефону.</li>
          <li>Оберіть пункт <strong className="text-[#F2F4F5]">Віджети</strong> (Widgets).</li>
          <li>Знайдіть <strong className="text-[#F2F4F5]">Marstek Venus Widget</strong> і оберіть <strong className="text-[#F2F4F5]">Повний</strong>, <strong className="text-[#F2F4F5]">Компактний</strong> або <strong className="text-[#F2F4F5]">Міні (2×2 / 1×1)</strong>.</li>
          <li>Розтягуйте віджет під будь-яку ширину (1×1 … 5×3) — сітка, шкала 00–24 та перехід на завтра підлаштуються автоматично.</li>
        </ol>
      </div>
    </div>
  );
}
