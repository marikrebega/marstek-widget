import { useEffect, useRef, useState } from 'react';
import {
  computeEnergyDurations,
  evaluateOutageSchedule,
  getModeVisuals,
  getNetBatteryPower,
  getTemperatureVisuals,
  type BatteryMode,
  type OutageSlot,
} from '../types/marstek';

export type WidgetGridVariant =
  | '1x1'
  | '2x2'
  | '3x1'
  | '3x2'
  | '3x3'
  | '4x1'
  | '4x2'
  | '4x3'
  | '5x1'
  | '5x2'
  | '5x3';

export type WidgetFilterGroup = 'all' | '5col' | '4col' | '3col' | 'mini';
export type OutageStepHours = 1 | 2 | 3 | 4;
export type OutageStepSetting = 'auto' | OutageStepHours;

interface MarstekAdaptiveWidgetProps {
  variant: WidgetGridVariant;
  stepHours: OutageStepSetting;
  soc: number;
  batCap: number;
  pvPower: number;
  onGridPower: number;
  offGridPower: number;
  batTemp?: number;
  outageSlots: OutageSlot[];
  tomorrowOutageSlots?: OutageSlot[];
  outageGroupLabel?: string;
  lastUpdateTime: string;
  nowMinutes: number;
  isUpdating: boolean;
  isError: boolean;
  onRefresh: () => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 78;

function getColCount(variant: WidgetGridVariant): 1 | 2 | 3 | 4 | 5 {
  if (variant === '1x1') return 1;
  if (variant === '2x2') return 2;
  if (variant.startsWith('3x')) return 3;
  if (variant.startsWith('4x')) return 4;
  return 5;
}

function getRowCount(variant: WidgetGridVariant): 1 | 2 | 3 {
  if (variant === '1x1' || variant.endsWith('x1')) return 1;
  if (variant === '2x2' || variant.endsWith('x2')) return 2;
  return 3;
}

function getWidthClass(cols: 1 | 2 | 3 | 4 | 5): string {
  switch (cols) {
    case 1:
      return 'w-[96px] h-[96px]';
    case 2:
      return 'w-[174px]';
    case 3:
      return 'w-[242px] max-w-full';
    case 4:
      return 'w-[304px] max-w-full';
    case 5:
      return 'w-full max-w-[368px]';
  }
}

function formatAbsPowerUk(netBatteryPower: number): string {
  const absW = Math.abs(netBatteryPower);
  if (absW <= 25) return '0 Вт';
  if (absW >= 1000) {
    return `${(absW / 1000).toFixed(1).replace('.', ',')} кВт`;
  }
  return `${absW} Вт`;
}

function toDayBlocks(slots: OutageSlot[]): Array<{ id: string; leftPct: number; widthPct: number }> {
  return slots
    .map((s) => {
      const [sh, sm] = s.start.split(':').map((n) => Number.parseInt(n, 10));
      const [eh, em] = s.end.split(':').map((n) => Number.parseInt(n, 10));
      const startMin = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
      const endMin = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
      return {
        id: s.id,
        leftPct: (startMin / 1440) * 100,
        widthPct: Math.max(0, ((endMin - startMin) / 1440) * 100),
      };
    })
    .filter((b) => b.widthPct > 0);
}

function ReloadIconButton({
  isUpdating,
  onClick,
  size = 'sm',
}: {
  isUpdating: boolean;
  onClick: () => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isUpdating}
      title="Оновити дані"
      aria-label="Оновити дані віджета"
      className={`${
        size === 'xs' ? 'w-5 h-5 rounded-md' : 'w-6 h-6 rounded-lg'
      } inline-flex items-center justify-center bg-[#1B2025] hover:bg-[#252B32] active:bg-[#2E353E] border border-[#2A2F35] text-[#A8B0B8] hover:text-[#F2F4F5] disabled:opacity-60 transition-colors cursor-pointer shrink-0`}
    >
      <svg
        width={size === 'xs' ? 11 : 12}
        height={size === 'xs' ? 11 : 12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isUpdating ? 'animate-spin text-[#3DDC84]' : ''}
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}

function ModeIcon({
  mode,
  color,
  size = 11,
}: {
  mode: BatteryMode;
  color: string;
  size?: number;
}) {
  if (mode === 'charging') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
    );
  }
  if (mode === 'discharging') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M12 4v16M6 14l6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

function SocRing({
  soc,
  hasSoc,
  color,
  sizePx,
  strokeWidth,
  showPercent = true,
  subLabel,
  textSizeClass,
}: {
  soc: number;
  hasSoc: boolean;
  color: string;
  sizePx: number;
  strokeWidth: number;
  showPercent?: boolean;
  subLabel?: string;
  textSizeClass: string;
}) {
  const dashFilled = (soc / 100) * CIRCUMFERENCE;
  const centerLabel = hasSoc ? (showPercent ? `${soc}%` : `${soc}`) : showPercent ? '--%' : '--';
  return (
    <div
      className="relative flex-none"
      style={{ width: sizePx, height: sizePx }}
    >
      <svg
        width={sizePx}
        height={sizePx}
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="#2A2F35"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dashFilled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${textSizeClass} font-bold tabular-nums`}>
          {centerLabel}
        </span>
        {subLabel && (
          <span className="mt-0.5 text-[9.5px] text-[#A8B0B8] tabular-nums">
            {subLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function DayScaleTicks({ stepHours }: { stepHours: OutageStepHours }) {
  const hours: number[] = [];
  for (let h = 0; h <= 24; h += stepHours) {
    hours.push(h);
  }
  return (
    <div
      className={`relative h-[14px] mt-1 font-mono-tabular text-[#8FA3B8] select-none ${
        stepHours === 1 ? 'text-[8px] tracking-tighter' : 'text-[9.5px]'
      }`}
    >
      {hours.map((h) => {
        const label = String(h).padStart(2, '0');
        if (h === 0) {
          return (
            <span key={h} className="absolute left-0 top-0">
              {label}
            </span>
          );
        }
        if (h === 24) {
          return (
            <span key={h} className="absolute right-0 top-0">
              {label}
            </span>
          );
        }
        return (
          <span
            key={h}
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${((h / 24) * 100).toFixed(2)}%` }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function ScrollableOutageBar({
  stepHours,
  todayBlocks,
  tomorrowBlocks,
  nowPercent,
  activeDay,
  jumpSeq,
  onActiveDayChange,
}: {
  stepHours: OutageStepHours;
  todayBlocks: Array<{ id: string; leftPct: number; widthPct: number }>;
  tomorrowBlocks: Array<{ id: string; leftPct: number; widthPct: number }>;
  nowPercent: number;
  activeDay: 'today' | 'tomorrow';
  jumpSeq: number;
  onActiveDayChange: (day: 'today' | 'tomorrow') => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const hasTomorrow = tomorrowBlocks.length > 0;

  // Auto-position once on mount to show ~12h window anchored near current time
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewportW = el.clientWidth;
    if (viewportW <= 0) return;

    didInitialScrollRef.current = true;
    const todayW = viewportW * 2;
    const targetLeft = Math.max(
      0,
      Math.min(todayW - viewportW, (nowPercent / 100) * todayW - viewportW * 0.25)
    );
    el.scrollTo({ left: targetLeft, behavior: 'auto' });
  }, [nowPercent]);

  // Smooth jump only when user explicitly taps "Сьогодні" / "Завтра"
  useEffect(() => {
    if (jumpSeq === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewportW = el.clientWidth;
    if (viewportW <= 0) return;
    const todayW = viewportW * 2;
    const dividerW = hasTomorrow ? 26 : 0;

    if (activeDay === 'tomorrow' && hasTomorrow) {
      el.scrollTo({ left: todayW + dividerW, behavior: 'smooth' });
    } else {
      const targetLeft = Math.max(
        0,
        Math.min(todayW - viewportW, (nowPercent / 100) * todayW - viewportW * 0.25)
      );
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  }, [jumpSeq, activeDay, hasTomorrow, nowPercent]);

  const handleStepScroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const stepPx = el.clientWidth * 0.75;
    el.scrollBy({ left: dir * stepPx, behavior: 'smooth' });
  };

  const handleScrollSync = () => {
    if (!hasTomorrow) return;
    const el = scrollRef.current;
    if (!el) return;
    const threshold = el.clientWidth * 1.6;
    const inTomorrow = el.scrollLeft >= threshold;
    if (inTomorrow && activeDay !== 'tomorrow') {
      onActiveDayChange('tomorrow');
    } else if (!inTomorrow && activeDay !== 'today') {
      onActiveDayChange('today');
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStepScroll(-1)}
          aria-label="Попередні години"
          className="w-4 h-6 rounded flex items-center justify-center text-[11px] text-[#8FA3B8] hover:text-[#F2F4F5] hover:bg-[#242A32] cursor-pointer shrink-0 transition-colors"
        >
          ‹
        </button>

        <div
          ref={scrollRef}
          onScroll={handleScrollSync}
          className="flex-1 min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:thin] [scrollbar-color:#343B46_transparent]"
        >
          <div className="flex items-stretch w-full">
            {/* Today 00-24 (200% width = 12h visible window) */}
            <div className="w-[200%] shrink-0">
              <div
                className={`relative h-[13px] ${
                  hasTomorrow ? 'rounded-l-[6px]' : 'rounded-[6px]'
                } bg-[#242A32] overflow-hidden`}
              >
                {todayBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="absolute top-0 bottom-0 bg-[#FFC24D]"
                    style={{
                      left: `${block.leftPct.toFixed(2)}%`,
                      width: `${block.widthPct.toFixed(2)}%`,
                    }}
                  />
                ))}
                {Array.from({ length: 23 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-px bg-[#101316]/45 pointer-events-none"
                    style={{ left: `${(((idx + 1) / 24) * 100).toFixed(2)}%` }}
                  />
                ))}
                <div
                  className="absolute top-0 bottom-0 w-[2.5px] bg-white shadow"
                  style={{ left: `${nowPercent.toFixed(2)}%` }}
                />
              </div>
              <DayScaleTicks stepHours={stepHours} />
            </div>

            {/* Distinct Day Divider + Tomorrow 00-24 when schedule exists */}
            {hasTomorrow && (
              <>
                <div
                  className="w-[26px] shrink-0 flex flex-col items-center select-none"
                  aria-hidden="true"
                >
                  <div className="h-[13px] w-full flex items-center justify-center bg-[#151A20]">
                    <div className="w-[2px] h-full bg-[#5AB0FF]/80" />
                  </div>
                  <div className="mt-1 text-[8px] font-bold text-[#5AB0FF] leading-[14px] tracking-tight">
                    ЗВТ
                  </div>
                </div>

                <div className="w-[200%] shrink-0">
                  <div className="relative h-[13px] rounded-r-[6px] bg-[#1E2630] overflow-hidden">
                    {tomorrowBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="absolute top-0 bottom-0 bg-[#FFC24D]/85"
                        style={{
                          left: `${block.leftPct.toFixed(2)}%`,
                          width: `${block.widthPct.toFixed(2)}%`,
                        }}
                      />
                    ))}
                    {Array.from({ length: 23 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 w-px bg-[#101316]/45 pointer-events-none"
                        style={{ left: `${(((idx + 1) / 24) * 100).toFixed(2)}%` }}
                      />
                    ))}
                  </div>
                  <DayScaleTicks stepHours={stepHours} />
                </div>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleStepScroll(1)}
          aria-label="Наступні години"
          className="w-4 h-6 rounded flex items-center justify-center text-[11px] text-[#8FA3B8] hover:text-[#F2F4F5] hover:bg-[#242A32] cursor-pointer shrink-0 transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function MarstekAdaptiveWidget({
  variant,
  stepHours,
  soc,
  batCap,
  pvPower,
  onGridPower,
  offGridPower,
  batTemp,
  outageSlots,
  tomorrowOutageSlots = [],
  outageGroupLabel,
  lastUpdateTime,
  nowMinutes,
  isUpdating,
  isError,
  onRefresh,
}: MarstekAdaptiveWidgetProps) {
  const [activeDay, setActiveDay] = useState<'today' | 'tomorrow'>('today');
  const [jumpSeq, setJumpSeq] = useState(0);

  const handleDayJump = (day: 'today' | 'tomorrow') => {
    setActiveDay(day);
    setJumpSeq((seq) => seq + 1);
  };

  const cols = getColCount(variant);
  const rows = getRowCount(variant);
  const widthClass = getWidthClass(cols);
  const effectiveStepHours: OutageStepHours =
    stepHours === 'auto' ? (cols >= 4 ? 1 : 2) : stepHours;

  const hasSoc = soc >= 0;
  const clampedSoc = hasSoc ? Math.max(0, Math.min(100, soc)) : 0;
  const netPower = getNetBatteryPower(pvPower, onGridPower, offGridPower);
  const durations = computeEnergyDurations(clampedSoc, batCap, netPower);
  const visuals = getModeVisuals(durations.mode);
  const tempVisuals = getTemperatureVisuals(batTemp);

  const hasTomorrowSchedule = tomorrowOutageSlots.length > 0;
  const resolvedDay = hasTomorrowSchedule ? activeDay : 'today';
  const isTomorrowView = resolvedDay === 'tomorrow';

  const todayOutage = evaluateOutageSchedule(outageSlots, nowMinutes, tomorrowOutageSlots);
  const tomorrowBlocks = toDayBlocks(tomorrowOutageSlots);

  const activeHeadline = isTomorrowView
    ? tomorrowOutageSlots[0]
      ? `Завтра · перше ${tomorrowOutageSlots[0].start}–${tomorrowOutageSlots[0].end}`
      : 'Завтра без відключень'
    : cols <= 4
    ? todayOutage.compactCountdownText
    : todayOutage.countdownText;

  const activeChips = isTomorrowView
    ? tomorrowOutageSlots.map((s, idx) => ({
        id: s.id,
        label: `${s.start}–${s.end}`,
        isHighlight: idx === 0,
      }))
    : todayOutage.todaySlotChips;

  const enoughForOutage =
    durations.dischargeMinutesLeft !== null &&
    todayOutage.targetOutageMinutes !== null &&
    durations.dischargeMinutesLeft >= todayOutage.targetOutageMinutes;

  const durationHeadline =
    cols <= 3 ? durations.compactPrimaryValueText : durations.primaryValueText;

  // 1x1 Micro Square (~70x70 dp)
  if (variant === '1x1') {
    return (
      <button
        type="button"
        onClick={onRefresh}
        disabled={isUpdating}
        title="Натисніть, щоб оновити"
        className={`${widthClass} relative rounded-[18px] p-2 bg-[#101316]/95 border border-[#22272E] shadow-xl flex flex-col items-center justify-between cursor-pointer hover:border-[#343B46] transition-colors select-none`}
      >
        <svg
          width={9}
          height={9}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute top-1.5 right-1.5 text-[#616973] ${
            isUpdating ? 'animate-spin text-[#3DDC84]' : ''
          }`}
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <SocRing
          soc={clampedSoc}
          hasSoc={hasSoc}
          color={visuals.color}
          sizePx={52}
          strokeWidth={22}
          showPercent={false}
          textSizeClass="text-[15.5px]"
        />
        <div className="w-full flex items-center justify-center gap-1 text-[10px] font-mono-tabular leading-none truncate">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: todayOutage.isActiveNow ? '#FFC24D' : '#3DDC84',
            }}
          />
          <span className="text-[#FFC24D] font-semibold truncate">
            {todayOutage.microTimeText}
          </span>
        </div>
      </button>
    );
  }

  // 2x2 Mini Square (~145x145 dp) — Modular Tiles, zero overlaps
  if (variant === '2x2') {
    return (
      <div
        role="region"
        aria-label="Marstek 2x2 Віджет"
        className={`${widthClass} text-left rounded-[22px] p-2.5 bg-[#101316]/95 border border-[#22272E] shadow-xl flex flex-col gap-2 select-none`}
      >
        {/* Top Flex Header: Icon + Unsigned Watts + Reload */}
        <div className="flex items-center justify-between gap-1 px-0.5">
          <div
            className="flex items-center gap-1 text-[11px] font-semibold tabular-nums min-w-0 truncate"
            style={{ color: visuals.color }}
          >
            <ModeIcon mode={durations.mode} color={visuals.color} size={10} />
            <span className="truncate">{hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}</span>
          </div>
          <ReloadIconButton isUpdating={isUpdating} onClick={onRefresh} size="xs" />
        </div>

        {/* Battery Tile */}
        <div className="rounded-[13px] bg-[#1B2025] border border-[#2A2F35] p-2 flex items-center gap-2">
          <SocRing
            soc={clampedSoc}
            hasSoc={hasSoc}
            color={visuals.color}
            sizePx={44}
            strokeWidth={22}
            showPercent={false}
            textSizeClass="text-[14.5px]"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-[13.5px] font-bold leading-tight tabular-nums text-[#F2F4F5] truncate">
              {durations.compactPrimaryValueText}
            </div>
            <div
              className="text-[10.5px] font-mono-tabular font-semibold truncate"
              style={{ color: tempVisuals.color }}
            >
              {tempVisuals.label}
            </div>
          </div>
        </div>

        {/* Outage Tile */}
        <div className="rounded-[13px] bg-[#1B2025] border border-[#2A2F35] px-2.5 py-1.5 space-y-0.5">
          <div className="text-[11px] font-bold text-[#FFC24D] font-mono-tabular truncate">
            {todayOutage.rangeText}
          </div>
          <div className="text-[10px] text-[#C9CFD5] tabular-nums truncate">
            {todayOutage.compactCountdownText}
          </div>
        </div>
      </div>
    );
  }

  // 1-row Horizontal Strips: 3x1, 4x1, 5x1 — Clean proportional text
  if (rows === 1) {
    return (
      <div
        role="region"
        aria-label={`Marstek ${variant} Віджет`}
        className={`${widthClass} text-left rounded-[20px] p-2 bg-[#101316]/95 border border-[#22272E] shadow-xl flex items-center gap-2 select-none overflow-hidden`}
      >
        <div className="shrink-0">
          <SocRing
            soc={clampedSoc}
            hasSoc={hasSoc}
            color={visuals.color}
            sizePx={cols === 3 ? 38 : 42}
            strokeWidth={22}
            showPercent={false}
            textSizeClass={cols === 3 ? 'text-[12.5px]' : 'text-[13.5px]'}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold truncate">
            <span
              style={{ color: visuals.color }}
              className="inline-flex items-center gap-0.5 shrink-0"
            >
              <ModeIcon mode={durations.mode} color={visuals.color} size={9} />
              {cols === 5 ? visuals.label : hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}
            </span>
            {cols === 5 && (
              <>
                <span className="text-[#616973]">·</span>
                <span className="text-[#F2F4F5] tabular-nums shrink-0">
                  {hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}
                </span>
              </>
            )}
            <span className="text-[#616973]">·</span>
            <span
              className="font-mono-tabular shrink-0"
              style={{ color: tempVisuals.color }}
            >
              {tempVisuals.label}
            </span>
          </div>
          <div className="text-[11.5px] font-bold text-[#F2F4F5] tabular-nums truncate">
            {durationHeadline}
            {cols >= 4 && (
              <span className="font-normal text-[#A8B0B8]">
                {' '}
                · {durations.secondaryValueText}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 rounded-[10px] bg-[#1B2025] border border-[#2A2F35] px-2 py-1 text-right font-mono-tabular">
          <div className="text-[10px] font-bold text-[#FFC24D] whitespace-nowrap">
            {cols === 3 ? todayOutage.microTimeText : todayOutage.rangeText}
          </div>
          {cols >= 4 && (
            <div className="text-[9px] text-[#A8B0B8] whitespace-nowrap">
              {todayOutage.shortActionText}
            </div>
          )}
        </div>

        <ReloadIconButton isUpdating={isUpdating} onClick={onRefresh} size="xs" />
      </div>
    );
  }

  // 2-row Medium Cards: 3x2, 4x2, 5x2 — Unified Header + Modular Tiles + Scrollable 12h-window 00-24
  if (rows === 2) {
    const ringSize = cols === 3 ? 48 : cols === 4 ? 54 : 60;
    return (
      <div
        role="region"
        aria-label={`Marstek ${variant} Віджет`}
        className={`${widthClass} text-left rounded-[22px] p-2.5 bg-[#101316]/95 border border-[#22272E] shadow-xl flex flex-col gap-2 select-none overflow-hidden`}
      >
        {/* Slim Unified Header (mode icon + unsigned watts on left, temp + reload on right) */}
        <div className="flex items-center justify-between gap-2 px-0.5 text-[10.5px]">
          <span
            className="inline-flex items-center gap-1 font-semibold truncate"
            style={{ color: visuals.color }}
          >
            <ModeIcon mode={durations.mode} color={visuals.color} size={10} />
            {cols >= 4
              ? `${visuals.label} · ${hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}`
              : hasSoc
              ? formatAbsPowerUk(netPower)
              : '-- Вт'}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="font-mono-tabular font-semibold"
              style={{ color: tempVisuals.color }}
            >
              {tempVisuals.label}
            </span>
            <ReloadIconButton isUpdating={isUpdating} onClick={onRefresh} size="xs" />
          </div>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-stretch">
          <div className="rounded-[14px] bg-[#1B2025] border border-[#2A2F35] p-2 flex items-center justify-center">
            <SocRing
              soc={clampedSoc}
              hasSoc={hasSoc}
              color={visuals.color}
              sizePx={ringSize}
              strokeWidth={19}
              showPercent={ringSize >= 56}
              textSizeClass={
                cols === 3
                  ? 'text-[16px]'
                  : cols === 4
                  ? 'text-[17.5px]'
                  : 'text-[16.5px]'
              }
            />
          </div>

          <div className="min-w-0 rounded-[14px] bg-[#1B2025] border border-[#2A2F35] px-2.5 py-2 flex flex-col justify-center gap-0.5">
            <div
              className={`${
                cols === 3 ? 'text-[15px]' : 'text-[17.5px]'
              } font-bold leading-tight tabular-nums text-[#F2F4F5] truncate`}
            >
              {durationHeadline}
            </div>

            <div className="text-[10px] text-[#A8B0B8] tabular-nums truncate">
              {durations.leftLabel} · {durations.secondaryValueText}
            </div>
          </div>
        </div>

        <div className="rounded-[14px] bg-[#1B2025] border border-[#2A2F35] px-2.5 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-1.5 text-[10.5px]">
            <span className="font-semibold text-[#FFC24D] tabular-nums truncate">
              {activeHeadline}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasTomorrowSchedule ? (
                <button
                  type="button"
                  onClick={() =>
                    handleDayJump(resolvedDay === 'today' ? 'tomorrow' : 'today')
                  }
                  className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isTomorrowView
                      ? 'bg-[#FFC24D] text-[#101316]'
                      : 'bg-[#101316] text-[#A8B0B8] border border-[#2A2F35] hover:text-[#F2F4F5]'
                  }`}
                >
                  {isTomorrowView ? 'Сьогодні ◂' : 'Завтра ▸'}
                </button>
              ) : (
                cols >= 5 && (
                  <span className="text-[#A8B0B8] font-mono-tabular whitespace-nowrap">
                    {todayOutage.rangeText}
                  </span>
                )
              )}
            </div>
          </div>

          <ScrollableOutageBar
            stepHours={effectiveStepHours}
            todayBlocks={todayOutage.blocks}
            tomorrowBlocks={tomorrowBlocks}
            nowPercent={todayOutage.nowPercent}
            activeDay={resolvedDay}
            jumpSeq={jumpSeq}
            onActiveDayChange={setActiveDay}
          />
        </div>
      </div>
    );
  }

  // 3-row Full Dashboards: 3x3, 4x3, 5x3 — Modular Tiles + Scrollable 12h-window 00-24
  const heroRingSize = cols === 3 ? 54 : cols === 4 ? 66 : 74;
  const visibleChips = cols === 3 ? activeChips.slice(0, 3) : activeChips;

  return (
    <div
      className={`${widthClass} rounded-[24px] p-3 bg-[#101316]/95 text-[#F2F4F5] border border-[#22272E] shadow-2xl flex flex-col gap-2 select-none overflow-hidden`}
      role="region"
      aria-label={`Marstek ${variant} Віджет`}
    >
      {/* Slim Header (on 3x3: Mode Icon + unsigned watts on left, temp + reload on right) */}
      <div className="flex items-center justify-between gap-2 text-[10.5px] px-0.5">
        {cols === 3 ? (
          <span
            className="inline-flex items-center gap-1 font-semibold tabular-nums truncate"
            style={{ color: visuals.color }}
          >
            <ModeIcon mode={durations.mode} color={visuals.color} size={11} />
            {hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}
          </span>
        ) : (
          <span className="font-semibold text-[#A8B0B8] truncate">
            Marstek{isUpdating ? ' · Оновлення...' : isError ? ' · Кеш' : ` · ${lastUpdateTime}`}
          </span>
        )}

        <div className="flex items-center gap-1.5 shrink-0 font-medium">
          <span
            className="font-mono-tabular font-semibold"
            style={{ color: tempVisuals.color }}
          >
            {tempVisuals.label}
          </span>
          {cols >= 4 && (
            <>
              <span className="text-[#616973]">·</span>
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums"
                style={{ color: visuals.color }}
              >
                <ModeIcon mode={durations.mode} color={visuals.color} size={10} />
                {hasSoc ? formatAbsPowerUk(netPower) : '-- Вт'}
              </span>
            </>
          )}
          <ReloadIconButton isUpdating={isUpdating} onClick={onRefresh} size="xs" />
        </div>
      </div>

      {/* 2-Column Hero Modular Tiles */}
      <div className="flex items-stretch gap-2">
        <div className="rounded-[15px] bg-[#1B2025] border border-[#2A2F35] p-2 flex items-center justify-center shrink-0">
          <SocRing
            soc={clampedSoc}
            hasSoc={hasSoc}
            color={visuals.color}
            sizePx={heroRingSize}
            strokeWidth={17}
            showPercent={heroRingSize >= 56}
            textSizeClass={
              cols === 3
                ? 'text-[17.5px]'
                : cols === 4
                ? 'text-[18.5px]'
                : 'text-[20px]'
            }
          />
        </div>

        <div className="flex-1 min-w-0 rounded-[15px] bg-[#1B2025] border border-[#2A2F35] p-2.5 flex flex-col justify-center space-y-0.5">
          <div className="text-[10px] text-[#A8B0B8] truncate">
            {cols === 3 ? durations.leftLabel : `${durations.cardTitle} (${durations.leftLabel})`}
          </div>
          <div
            className={`${
              cols === 3 ? 'text-[15.5px]' : 'text-[18.5px]'
            } font-bold leading-tight tabular-nums text-[#F2F4F5] truncate`}
          >
            {durationHeadline}
          </div>
          <div className="text-[10.5px] text-[#C9CFD5] tabular-nums truncate">
            {cols === 3 ? '' : `${durations.rightLabel}: `}
            <strong className="text-[#F2F4F5]">{durations.secondaryValueText}</strong>
          </div>
          {enoughForOutage && (
            <div className="text-[10px] font-medium text-[#3DDC84] pt-0.5 truncate">
              ● Вистачить на відключення
            </div>
          )}
        </div>
      </div>

      {/* Outage Schedule Modular Tile with 12h-viewport Scrollable 00-24 (+Завтра) */}
      <div className="rounded-[15px] bg-[#1B2025] border border-[#2A2F35] p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] font-semibold text-[#FFC24D] truncate">
            {activeHeadline}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasTomorrowSchedule && (
              <div className="inline-flex rounded-md bg-[#101316] p-0.5 border border-[#2A2F35]">
                <button
                  type="button"
                  onClick={() => handleDayJump('today')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    !isTomorrowView
                      ? 'bg-[#2A2F35] text-[#F2F4F5]'
                      : 'text-[#8FA3B8] hover:text-[#F2F4F5]'
                  }`}
                >
                  Сьогодні
                </button>
                <button
                  type="button"
                  onClick={() => handleDayJump('tomorrow')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    isTomorrowView
                      ? 'bg-[#FFC24D] text-[#101316] font-bold'
                      : 'text-[#8FA3B8] hover:text-[#F2F4F5]'
                  }`}
                >
                  Завтра
                </button>
              </div>
            )}
            <span className="text-[10px] text-[#A8B0B8] tabular-nums whitespace-nowrap">
              {outageGroupLabel
                ? cols === 3
                  ? outageGroupLabel
                  : `Черга ${outageGroupLabel}`
                : 'Сьогодні'}
            </span>
          </div>
        </div>

        <ScrollableOutageBar
          stepHours={effectiveStepHours}
          todayBlocks={todayOutage.blocks}
          tomorrowBlocks={tomorrowBlocks}
          nowPercent={todayOutage.nowPercent}
          activeDay={resolvedDay}
          jumpSeq={jumpSeq}
          onActiveDayChange={setActiveDay}
        />

        {visibleChips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {visibleChips.map((chip) => (
              <span
                key={chip.id}
                className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-mono-tabular ${
                  chip.isHighlight
                    ? 'bg-[#FFC24D] text-[#101316] font-bold'
                    : 'bg-[#101316] text-[#C9CFD5] border border-[#2A2F35]'
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
