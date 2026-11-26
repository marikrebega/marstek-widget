import { useState } from 'react';
import {
  computeEnergyDurations,
  evaluateOutageSchedule,
  formatPowerUk,
  getModeVisuals,
  getNetBatteryPower,
  getTemperatureVisuals,
  toDayBlocks,
  type MarstekStatus,
  type OutageSlot,
} from '../types/marstek';
import { ModeIcon, ScrollableOutageBar } from './MarstekAdaptiveWidget';

interface StatusDashboardProps {
  soc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  batTemp?: number;
  fullStatus: MarstekStatus | null;
  deviceIp: string;
  devicePort: number;
  lastUpdateTime: string;
  isUpdating: boolean;
  isError: boolean;
  outageSlots: OutageSlot[];
  tomorrowOutageSlots: OutageSlot[];
  outageGroupLabel: string;
  nowMinutes: number;
}

const CIRCUMFERENCE = 2 * Math.PI * 44;

function formatEnergyWh(wh: number): string {
  const rounded = Math.round(wh);
  if (Math.abs(rounded) >= 10000) {
    const kwh = (rounded / 1000).toFixed(1).replace('.', ',');
    return `${kwh} кВт·год`;
  }
  return `${rounded.toLocaleString('uk-UA')} Вт·год`;
}

function formatWatts(watts: number): string {
  const rounded = Math.round(watts);
  return `${rounded.toLocaleString('uk-UA')} Вт`;
}

export function StatusDashboard({
  soc,
  batCap,
  pvPower,
  onGridPower,
  offGridPower,
  batTemp,
  fullStatus,
  deviceIp,
  devicePort,
  lastUpdateTime,
  isUpdating,
  isError,
  outageSlots,
  tomorrowOutageSlots,
  outageGroupLabel,
  nowMinutes,
}: StatusDashboardProps) {
  const [activeDay, setActiveDay] = useState<'today' | 'tomorrow'>('today');
  const [jumpSeq, setJumpSeq] = useState(0);

  const hasSoc = soc >= 0;
  const clampedSoc = hasSoc ? Math.max(0, Math.min(100, soc)) : 0;
  const capacityWh = batCap > 0 ? batCap : 2560;
  const availableWh = Math.round((clampedSoc / 100) * capacityWh);
  const netPower = getNetBatteryPower(pvPower, onGridPower, offGridPower);
  const durations = computeEnergyDurations(clampedSoc, capacityWh, netPower);
  const modeVisuals = getModeVisuals(durations.mode);
  const tempVisuals = getTemperatureVisuals(batTemp);

  const hasTomorrow = tomorrowOutageSlots.length > 0;
  const resolvedDay = hasTomorrow ? activeDay : 'today';
  const isTomorrowView = resolvedDay === 'tomorrow';

  const outage = evaluateOutageSchedule(outageSlots, nowMinutes, tomorrowOutageSlots);
  const tomorrowBlocks = toDayBlocks(tomorrowOutageSlots);

  const enoughForOutage =
    durations.dischargeMinutesLeft !== null &&
    outage.targetOutageMinutes !== null &&
    durations.dischargeMinutesLeft >= outage.targetOutageMinutes;

  const dashFilled = (clampedSoc / 100) * CIRCUMFERENCE;

  const handleDayJump = (day: 'today' | 'tomorrow') => {
    setActiveDay(day);
    setJumpSeq((seq) => seq + 1);
  };

  return (
    <div className="space-y-4">
      {/* Device Meta Strip (unboxed typography) */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted font-mono-tabular">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-text-primary font-semibold truncate">
            {fullStatus?.deviceName || 'Marstek Venus'}
          </span>
          {fullStatus?.workMode && (
            <>
              <span className="text-text-separator" aria-hidden="true">
                ·
              </span>
              <span>{fullStatus.workMode}</span>
            </>
          )}
          <span className="text-text-separator" aria-hidden="true">
            ·
          </span>
          <span>
            {isUpdating
              ? 'Оновлення...'
              : isError
              ? `Кеш · ${lastUpdateTime}`
              : lastUpdateTime}
          </span>
        </div>
        <span className="text-text-secondary">
          {deviceIp}:{devicePort}
        </span>
      </div>

      {/* Primary Battery Status Card */}
      <section className="rounded-2xl bg-bg-card border border-border-default p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-none w-[96px] h-[96px]">
            <svg width="96" height="96" viewBox="0 0 112 112" aria-hidden="true">
              <circle
                cx="56"
                cy="56"
                r="44"
                fill="none"
                stroke="#242A32"
                strokeWidth="10"
              />
              <circle
                cx="56"
                cy="56"
                r="44"
                fill="none"
                stroke={modeVisuals.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dashFilled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
                transform="rotate(-90 56 56)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-2xl font-bold tabular-nums text-text-primary">
                {hasSoc ? `${clampedSoc}%` : '--%'}
              </span>
              <span
                className="mt-1 px-1.5 py-0.5 rounded-full text-[11px] font-mono-tabular font-semibold"
                style={{
                  color: tempVisuals.color,
                  backgroundColor: tempVisuals.bgColor,
                }}
              >
                {tempVisuals.label}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <ModeIcon mode={durations.mode} color={modeVisuals.color} size={13} />
              <span style={{ color: modeVisuals.color }}>{modeVisuals.label}</span>
              <span className="text-text-separator" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-text-primary">
                {hasSoc ? formatPowerUk(netPower) : '-- Вт'}
              </span>
            </div>

            <div className="text-2xl font-bold tracking-tight tabular-nums text-text-primary">
              {durations.primaryValueText}
            </div>

            <div className="text-xs text-text-secondary tabular-nums">
              {durations.leftLabel} · Залишок:{' '}
              <span className="text-text-primary font-medium">
                {availableWh.toLocaleString('uk-UA')}
              </span>{' '}
              / {capacityWh.toLocaleString('uk-UA')} Вт·год
            </div>

            {enoughForOutage && (
              <div className="text-xs font-medium text-accent-primary pt-0.5">
                Заряду вистачить на найближче відключення
              </div>
            )}
          </div>
        </div>

        {/* Live Power Flows */}
        <div className="pt-3.5 border-t border-border-default grid grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-text-muted">Мережа (Grid)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-text-primary">
              {hasSoc ? formatWatts(onGridPower) : '-- Вт'}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-text-muted">Сонце (PV)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-text-primary">
              {hasSoc ? formatWatts(pvPower) : '-- Вт'}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-text-muted">Вихід (EPS)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-text-primary">
              {hasSoc ? formatWatts(offGridPower) : '-- Вт'}
            </div>
          </div>
        </div>

        {/* Cumulative Energy Counters */}
        {fullStatus && (
          <div className="pt-3.5 border-t border-border-default grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[11px] text-text-muted">Всього з мережі</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-text-body">
                {formatEnergyWh(fullStatus.totalGridInputEnergy)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-text-muted">Всього в мережу</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-text-body">
                {formatEnergyWh(fullStatus.totalGridOutputEnergy)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-text-muted">Всього PV</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-text-body">
                {formatEnergyWh(fullStatus.totalPvEnergy)}
              </div>
            </div>

            {typeof fullStatus.totalLoadEnergy === 'number' && (
              <div>
                <div className="text-[11px] text-text-muted">Навантаження</div>
                <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-text-body">
                  {formatEnergyWh(fullStatus.totalLoadEnergy)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Outage Schedule & Timeline Card */}
      <section className="rounded-2xl bg-bg-card border border-border-default p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-text-muted tabular-nums">
              Графік відключень · Черга {outageGroupLabel}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-accent-outage tabular-nums">
              {isTomorrowView
                ? tomorrowOutageSlots[0]
                  ? `Завтра · перше ${tomorrowOutageSlots[0].start}–${tomorrowOutageSlots[0].end}`
                  : 'Завтра без відключень'
                : outage.countdownText}
            </div>
          </div>

          {hasTomorrow && (
            <div className="inline-flex rounded-lg bg-bg-inset p-0.5 border border-border-control shrink-0">
              <button
                type="button"
                onClick={() => handleDayJump('today')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  !isTomorrowView
                    ? 'bg-bg-button-secondary text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Сьогодні
              </button>
              <button
                type="button"
                onClick={() => handleDayJump('tomorrow')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  isTomorrowView
                    ? 'bg-accent-outage text-text-on-accent font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Завтра
              </button>
            </div>
          )}
        </div>

        <ScrollableOutageBar
          stepHours={1}
          todayBlocks={outage.blocks}
          tomorrowBlocks={tomorrowBlocks}
          nowPercent={outage.nowPercent}
          activeDay={resolvedDay}
          jumpSeq={jumpSeq}
          onActiveDayChange={setActiveDay}
        />

        {/* Today & Tomorrow Slot Summary */}
        <div className="pt-2 border-t border-border-default space-y-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-text-muted shrink-0">Сьогодні:</span>
            {outage.todaySlotChips.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular">
                {outage.todaySlotChips.map((chip) => (
                  <span
                    key={chip.id}
                    className={
                      chip.isHighlight
                        ? 'text-accent-outage font-semibold'
                        : 'text-text-body'
                    }
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-text-tertiary">без відключень</span>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-text-muted shrink-0">Завтра:</span>
            {hasTomorrow ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-accent-discharge">
                {tomorrowOutageSlots.map((slot) => (
                  <span key={slot.id}>
                    {slot.start}–{slot.end}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-text-tertiary">графік ще не опубліковано</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
