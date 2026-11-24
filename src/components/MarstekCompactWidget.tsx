import {
  computeEnergyDurations,
  evaluateOutageSchedule,
  getModeVisuals,
  getNetBatteryPower,
  type BatteryLimits,
  type BatteryMode,
  type OutageSlot,
} from '../types/marstek';

interface MarstekCompactWidgetProps {
  soc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  limits: BatteryLimits;
  outageSlots: OutageSlot[];
  tomorrowOutageSlots?: OutageSlot[];
  nowMinutes: number;
  onRefresh: () => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 78;

function CompactModeIcon({ mode, color }: { mode: BatteryMode; color: string }) {
  if (mode === 'charging') {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
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
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
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
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

export function MarstekCompactWidget({
  soc,
  batCap,
  pvPower,
  onGridPower,
  offGridPower,
  limits,
  outageSlots,
  tomorrowOutageSlots = [],
  nowMinutes,
  onRefresh,
}: MarstekCompactWidgetProps) {
  const hasSoc = soc >= 0;
  const clampedSoc = hasSoc ? Math.max(0, Math.min(100, soc)) : 0;
  const netPower = getNetBatteryPower(pvPower, onGridPower, offGridPower);
  const durations = computeEnergyDurations(clampedSoc, batCap, netPower, limits);
  const visuals = getModeVisuals(durations.mode);
  const outage = evaluateOutageSchedule(outageSlots, nowMinutes, tomorrowOutageSlots);
  const dashFilled = (clampedSoc / 100) * CIRCUMFERENCE;

  return (
    <div
      onClick={onRefresh}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRefresh();
        }
      }}
      title="Натисніть, щоб оновити віджет"
      className="w-full max-w-[360px] min-h-[170px] p-4 flex gap-4 items-center bg-[#101316] text-[#F2F4F5] rounded-[28px] border border-[#22272E] shadow-2xl cursor-pointer hover:border-[#343B46] transition-colors select-none"
      aria-label={`Компактний віджет Marstek, заряд ${clampedSoc}%`}
    >
      {/* Left Circular Gauge */}
      <div className="relative w-[110px] h-[110px] flex-none">
        <svg
          width="110"
          height="110"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`Заряд ${clampedSoc} відсотків`}
        >
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke="#2A2F35"
            strokeWidth="18"
          />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={visuals.color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${dashFilled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
            transform="rotate(-90 100 100)"
            className="transition-[stroke-dasharray,stroke] duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[26px] font-bold tabular-nums">
          {hasSoc ? `${clampedSoc}%` : '--%'}
        </div>
      </div>

      {/* Right Status & Outage Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <div
            className="flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: visuals.color }}
          >
            <CompactModeIcon mode={durations.mode} color={visuals.color} />
            <span>{visuals.label}</span>
          </div>
          <div className="text-[20px] font-bold leading-tight tabular-nums">
            {durations.withLimitsText}
          </div>
          <div className="text-[12px] text-[#A8B0B8] truncate tabular-nums">
            {durations.compactSubText}
          </div>
        </div>

        <div className="h-px bg-[#2A2F35]" />

        <div className="flex flex-col gap-0.5">
          <div className="text-[12px] text-[#A8B0B8] truncate tabular-nums">
            {outage.compactCountdownText}
          </div>
          <div className="text-[15px] font-bold text-[#FFC24D] tabular-nums">
            {outage.rangeText}
          </div>
        </div>
      </div>
    </div>
  );
}
