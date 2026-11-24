import {
  computeEnergyDurations,
  evaluateOutageSchedule,
  formatPowerUk,
  getModeVisuals,
  type BatteryLimits,
  type BatteryMode,
  type OutageSlot,
} from '../types/marstek';

interface MarstekFullWidgetProps {
  soc: number;
  batCap: number;
  onGridPower: number;
  limits: BatteryLimits;
  outageSlots: OutageSlot[];
  tomorrowOutageSlots?: OutageSlot[];
  outageGroupLabel?: string;
  nowMinutes: number;
  isUpdating: boolean;
  isError: boolean;
  onRefresh: () => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 78; // ~490.088

function ModeIcon({ mode, color }: { mode: BatteryMode; color: string }) {
  if (mode === 'charging') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
    );
  }
  if (mode === 'discharging') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4v16M6 14l6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

export function MarstekFullWidget({
  soc,
  batCap,
  onGridPower,
  limits,
  outageSlots,
  tomorrowOutageSlots = [],
  outageGroupLabel,
  nowMinutes,
  isUpdating,
  isError,
  onRefresh,
}: MarstekFullWidgetProps) {
  const hasSoc = soc >= 0;
  const clampedSoc = hasSoc ? Math.max(0, Math.min(100, soc)) : 0;
  const durations = computeEnergyDurations(clampedSoc, batCap, onGridPower, limits);
  const visuals = getModeVisuals(durations.mode);
  const outage = evaluateOutageSchedule(outageSlots, nowMinutes, tomorrowOutageSlots);

  const dashFilled = (clampedSoc / 100) * CIRCUMFERENCE;
  const chargeMarkerDeg = (limits.chargeLimit / 100) * 360;
  const dischargeMarkerDeg = (limits.dischargeLimit / 100) * 360;

  return (
    <div
      className="w-full max-w-[390px] rounded-[28px] p-6 flex flex-col gap-4 bg-[#101316] text-[#F2F4F5] border border-[#22272E] shadow-2xl select-none"
      role="region"
      aria-label="Marstek Віджет"
    >
      {/* Top Row: Brand + Mode Badge */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isUpdating}
          title="Натисніть, щоб оновити"
          className="text-[15px] font-semibold tracking-[0.02em] text-[#A8B0B8] hover:text-[#F2F4F5] transition-colors cursor-pointer whitespace-nowrap"
        >
          Marstek{isUpdating ? ' · Оновлення...' : isError ? ' · Офлайн' : ''}
        </button>

        <div
          className="flex items-center gap-2 px-3.5 py-2 rounded-full border text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors"
          style={{
            borderColor: visuals.color,
            color: visuals.color,
          }}
        >
          <ModeIcon mode={durations.mode} color={visuals.color} />
          <span>{visuals.label}</span>
        </div>
      </div>

      {/* Circular SOC Gauge */}
      <div className="relative w-[200px] h-[200px] mx-auto my-1">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`Заряд ${clampedSoc} відсотків, ліміти ${limits.dischargeLimit} і ${limits.chargeLimit} відсотків`}
        >
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke="#2A2F35"
            strokeWidth="14"
          />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={visuals.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${dashFilled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
            transform="rotate(-90 100 100)"
            className="transition-[stroke-dasharray,stroke] duration-300"
          />
          <line
            x1="100"
            y1="8"
            x2="100"
            y2="32"
            stroke="#F2F4F5"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${chargeMarkerDeg} 100 100)`}
          />
          <line
            x1="100"
            y1="8"
            x2="100"
            y2="32"
            stroke="#F2F4F5"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${dischargeMarkerDeg} 100 100)`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[52px] font-bold leading-none tabular-nums">
            {hasSoc ? `${clampedSoc}%` : '--%'}
          </div>
          <div className="mt-1.5 text-[13px] text-[#A8B0B8] tabular-nums">
            {hasSoc ? formatPowerUk(onGridPower) : '-- Вт'}
          </div>
        </div>
      </div>

      {/* Limits Legend */}
      <div className="flex justify-center gap-5 text-[12px] text-[#A8B0B8] tabular-nums">
        <span>Ліміт розряду: {limits.dischargeLimit}%</span>
        <span>Ліміт заряду: {limits.chargeLimit}%</span>
      </div>

      {/* Charge / Discharge / Idle Estimate Card */}
      <div className="bg-[#1B2025] rounded-[20px] p-4 flex flex-col gap-3">
        <div className="text-[13px] font-semibold text-[#A8B0B8]">
          {durations.cardTitle}
        </div>
        <div className="flex gap-4">
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <div className="text-[12px] text-[#A8B0B8] truncate">
              {durations.leftLabel}
            </div>
            <div className="text-[22px] sm:text-[24px] font-bold leading-tight tabular-nums">
              {durations.withLimitsText}
            </div>
          </div>

          <div className="w-px bg-[#2A2F35] shrink-0" />

          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <div className="text-[12px] text-[#A8B0B8] truncate">
              {durations.rightLabel}
            </div>
            <div className="text-[22px] sm:text-[24px] font-bold leading-tight text-[#C9CFD5] tabular-nums">
              {durations.withoutLimitsText}
            </div>
          </div>
        </div>
      </div>

      {/* Power Outage Schedule Card */}
      <div className="bg-[#1B2025] rounded-[20px] p-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-semibold text-[#A8B0B8]">
            Графік відключень світла
          </div>
          <div className="text-[12px] text-[#A8B0B8] tabular-nums">
            {outageGroupLabel ? `Черга ${outageGroupLabel} · Сьогодні` : 'Сьогодні'}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="text-[20px] font-bold text-[#FFC24D] tabular-nums">
            {outage.rangeText}
          </div>
          <div className="text-[13px] text-[#C9CFD5] tabular-nums">
            {outage.countdownText}
          </div>
        </div>

        {/* 24h Bar */}
        <div className="relative h-[18px] rounded-[9px] bg-[#2A2F35] overflow-hidden">
          {outage.blocks.map((block) => (
            <div
              key={block.id}
              className="absolute top-0 bottom-0 bg-[#FFC24D]"
              style={{
                left: `${block.leftPct.toFixed(2)}%`,
                width: `${block.widthPct.toFixed(2)}%`,
              }}
            />
          ))}
          <div
            className="absolute top-0 bottom-0 w-[3px] bg-white"
            style={{ left: `${outage.nowPercent.toFixed(2)}%` }}
            title="Поточний час"
          />
        </div>

        <div className="flex justify-between text-[11px] text-[#A8B0B8] tabular-nums">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  );
}
