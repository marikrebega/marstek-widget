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
import { ScrollableOutageBar } from './MarstekAdaptiveWidget';

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8FA3B8] font-mono-tabular">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[#F2F4F5] font-semibold truncate">
            {fullStatus?.deviceName || 'Marstek Venus'}
          </span>
          {fullStatus?.workMode && (
            <>
              <span aria-hidden="true">·</span>
              <span>{fullStatus.workMode}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            {isUpdating
              ? 'Оновлення...'
              : isError
              ? `Кеш · ${lastUpdateTime}`
              : lastUpdateTime}
          </span>
        </div>
        <span>
          {deviceIp}:{devicePort}
        </span>
      </div>

      {/* Primary Battery Status Card */}
      <section className="rounded-2xl bg-[#14181D] border border-[#22272E] p-4 sm:p-5 space-y-4">
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
              <span className="text-2xl font-bold tabular-nums text-[#F2F4F5]">
                {hasSoc ? `${clampedSoc}%` : '--%'}
              </span>
              <span
                className="mt-1 text-xs font-mono-tabular font-semibold"
                style={{ color: tempVisuals.color }}
              >
                {tempVisuals.label}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span style={{ color: modeVisuals.color }}>{modeVisuals.label}</span>
              <span className="text-[#47505A]" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-[#F2F4F5]">
                {hasSoc ? formatPowerUk(netPower) : '-- Вт'}
              </span>
            </div>

            <div className="text-2xl font-bold tracking-tight tabular-nums text-[#F2F4F5]">
              {durations.primaryValueText}
            </div>

            <div className="text-xs text-[#A8B0B8] tabular-nums">
              {durations.leftLabel} · Залишок:{' '}
              <span className="text-[#F2F4F5] font-medium">
                {availableWh.toLocaleString('uk-UA')}
              </span>{' '}
              / {capacityWh.toLocaleString('uk-UA')} Вт·год
            </div>

            {enoughForOutage && (
              <div className="text-xs font-medium text-[#3DDC84] pt-0.5">
                Заряду вистачить на найближче відключення
              </div>
            )}
          </div>
        </div>

        {/* Live Power Flows */}
        <div className="pt-3.5 border-t border-[#22272E] grid grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] text-[#8FA3B8]">Мережа (Grid)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-[#F2F4F5]">
              {hasSoc ? formatWatts(onGridPower) : '-- Вт'}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-[#8FA3B8]">Сонце (PV)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-[#F2F4F5]">
              {hasSoc ? formatWatts(pvPower) : '-- Вт'}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-[#8FA3B8]">Вихід (EPS)</div>
            <div className="mt-0.5 text-sm font-semibold font-mono-tabular text-[#F2F4F5]">
              {hasSoc ? formatWatts(offGridPower) : '-- Вт'}
            </div>
          </div>
        </div>

        {/* Cumulative Energy Counters */}
        {fullStatus && (
          <div className="pt-3.5 border-t border-[#22272E] grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[11px] text-[#8FA3B8]">Всього з мережі</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-[#C9CFD5]">
                {formatEnergyWh(fullStatus.totalGridInputEnergy)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#8FA3B8]">Всього в мережу</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-[#C9CFD5]">
                {formatEnergyWh(fullStatus.totalGridOutputEnergy)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#8FA3B8]">Всього PV</div>
              <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-[#C9CFD5]">
                {formatEnergyWh(fullStatus.totalPvEnergy)}
              </div>
            </div>

            {typeof fullStatus.totalLoadEnergy === 'number' && (
              <div>
                <div className="text-[11px] text-[#8FA3B8]">Навантаження</div>
                <div className="mt-0.5 text-xs font-semibold font-mono-tabular text-[#C9CFD5]">
                  {formatEnergyWh(fullStatus.totalLoadEnergy)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Outage Schedule & Timeline Card */}
      <section className="rounded-2xl bg-[#14181D] border border-[#22272E] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-[#8FA3B8] tabular-nums">
              Графік відключень · Черга {outageGroupLabel}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-[#FFC24D] tabular-nums">
              {isTomorrowView
                ? tomorrowOutageSlots[0]
                  ? `Завтра · перше ${tomorrowOutageSlots[0].start}–${tomorrowOutageSlots[0].end}`
                  : 'Завтра без відключень'
                : outage.countdownText}
            </div>
          </div>

          {hasTomorrow && (
            <div className="inline-flex rounded-lg bg-[#0F1216] p-0.5 border border-[#22272E] shrink-0">
              <button
                type="button"
                onClick={() => handleDayJump('today')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  !isTomorrowView
                    ? 'bg-[#252B32] text-[#F2F4F5]'
                    : 'text-[#8FA3B8] hover:text-[#F2F4F5]'
                }`}
              >
                Сьогодні
              </button>
              <button
                type="button"
                onClick={() => handleDayJump('tomorrow')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  isTomorrowView
                    ? 'bg-[#FFC24D] text-[#101316] font-semibold'
                    : 'text-[#8FA3B8] hover:text-[#F2F4F5]'
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
        <div className="pt-2 border-t border-[#22272E] space-y-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[#8FA3B8] shrink-0">Сьогодні:</span>
            {outage.todaySlotChips.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular">
                {outage.todaySlotChips.map((chip) => (
                  <span
                    key={chip.id}
                    className={
                      chip.isHighlight
                        ? 'text-[#FFC24D] font-semibold'
                        : 'text-[#C9CFD5]'
                    }
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[#616973]">без відключень</span>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[#8FA3B8] shrink-0">Завтра:</span>
            {hasTomorrow ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-[#5AB0FF]">
                {tomorrowOutageSlots.map((slot) => (
                  <span key={slot.id}>
                    {slot.start}–{slot.end}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[#616973]">графік ще не опубліковано</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
