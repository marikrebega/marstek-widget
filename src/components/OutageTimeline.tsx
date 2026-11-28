import { useEffect, useRef, useState } from 'react';
import type { BatteryMode } from '../types/marstek';

export type OutageStepHours = 1 | 2 | 3 | 4;

export function ModeIcon({
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
        <path d="M12 19V5M6 11l6-6 6 6" />
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
        <path d="M12 5v14M6 13l6 6 6-6" />
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

function DayScaleTicks({ stepHours }: { stepHours: OutageStepHours }) {
  const hours: number[] = [];
  for (let h = 0; h <= 24; h += stepHours) {
    hours.push(h);
  }
  return (
    <div
      className={`relative h-[14px] mt-1 font-mono-tabular text-text-muted select-none ${
        stepHours === 1 ? 'text-[9px] tracking-tighter' : 'text-[10px]'
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

export function ScrollableOutageBar({
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
  const todayTouchesMidnight = todayBlocks.some((b) => b.leftPct + b.widthPct >= 99.9);
  const tomorrowStartsAtMidnight = tomorrowBlocks.some((b) => b.leftPct <= 0.1);
  const hasMidnightBridge = hasTomorrow && todayTouchesMidnight && tomorrowStartsAtMidnight;
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [isNarrowBar, setIsNarrowBar] = useState(false);

  const syncBounds = (el: HTMLDivElement) => {
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const nextCanPrev = el.scrollLeft > 2;
    const nextCanNext = el.scrollLeft < maxScroll - 2;
    setCanPrev(nextCanPrev);
    setCanNext(nextCanNext);
    setIsNarrowBar(el.clientWidth > 0 && el.clientWidth < 280);
  };

  // Auto-position once on mount to show ~12h window anchored near current time
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewportW = el.clientWidth;
    if (viewportW <= 0) return;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      const todayW = viewportW * 1.9;
      const targetLeft = Math.max(
        0,
        Math.min(todayW - viewportW, (nowPercent / 100) * todayW - viewportW * 0.25)
      );
      el.scrollTo({ left: targetLeft, behavior: 'auto' });
    }
    const raf = window.requestAnimationFrame(() => syncBounds(el));
    return () => window.cancelAnimationFrame(raf);
  }, [nowPercent, hasTomorrow]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncBounds(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTomorrow, stepHours]);

  // Smooth jump only when user explicitly taps "Сьогодні" / "Завтра"
  useEffect(() => {
    if (jumpSeq === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewportW = el.clientWidth;
    if (viewportW <= 0) return;
    const todayW = viewportW * 1.9;
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
    if ((dir === -1 && !canPrev) || (dir === 1 && !canNext)) return;
    const el = scrollRef.current;
    if (!el) return;
    const stepPx = el.clientWidth * 0.72;
    el.scrollBy({ left: dir * stepPx, behavior: 'smooth' });
  };

  const handleScrollSync = () => {
    const el = scrollRef.current;
    if (!el) return;
    syncBounds(el);
    if (!hasTomorrow) return;
    const threshold = el.clientWidth * 1.5;
    const inTomorrow = el.scrollLeft >= threshold;
    if (inTomorrow && activeDay !== 'tomorrow') {
      onActiveDayChange('tomorrow');
    } else if (!inTomorrow && activeDay !== 'today') {
      onActiveDayChange('today');
    }
  };

  const effectiveTickStep: OutageStepHours =
    isNarrowBar && stepHours === 1 ? 2 : stepHours;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleStepScroll(-1)}
          disabled={!canPrev}
          aria-label="Попередні години"
          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 transition-colors ${
            canPrev
              ? 'text-text-body hover:text-text-primary hover:bg-bg-gauge-track cursor-pointer'
              : 'text-text-tertiary opacity-50 cursor-default pointer-events-none'
          }`}
        >
          ‹
        </button>

        <div
          ref={scrollRef}
          onScroll={handleScrollSync}
          className="flex-1 min-w-0 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:#8FA3B8_#242A32]"
        >
          <div className="flex items-stretch w-full">
            {/* Today 00-24 (190% width + px-2 so edge hour ticks like 12 and 24 never clip) */}
            <div className="w-[190%] shrink-0 px-2">
              <div
                className={`relative h-[13px] ${
                  hasTomorrow ? 'rounded-l-[6px]' : 'rounded-[6px]'
                } bg-bg-gauge-track overflow-hidden`}
              >
                {todayBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="absolute top-0 bottom-0 bg-accent-outage"
                    style={{
                      left: `${block.leftPct.toFixed(2)}%`,
                      width: `${block.widthPct.toFixed(2)}%`,
                    }}
                  />
                ))}
                {Array.from({ length: 23 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-px bg-bg-surface/45 pointer-events-none"
                    style={{ left: `${(((idx + 1) / 24) * 100).toFixed(2)}%` }}
                  />
                ))}
                <div
                  className="absolute top-0 bottom-0 w-[2.5px] bg-text-primary shadow"
                  style={{ left: `${nowPercent.toFixed(2)}%` }}
                />
              </div>
              <DayScaleTicks stepHours={effectiveTickStep} />
            </div>

            {/* Distinct Day Divider + Tomorrow 00-24 (contiguous midnight block stays amber, others blue #5AB0FF) */}
            {hasTomorrow && (
              <>
                <div
                  className="w-[26px] shrink-0 flex flex-col items-center select-none"
                  aria-hidden="true"
                >
                  <div
                    className={`h-[13px] w-full flex items-center justify-center ${
                      hasMidnightBridge ? 'bg-accent-outage' : 'bg-bg-outage-bar-empty'
                    }`}
                  >
                    <div
                      className={
                        hasMidnightBridge
                          ? 'w-px h-full bg-bg-surface/45'
                          : 'w-[2px] h-full bg-accent-discharge/85'
                      }
                    />
                  </div>
                  <div className="mt-1 text-[9px] font-bold text-accent-discharge leading-[14px] tracking-tight">
                    ЗВТ
                  </div>
                </div>

                <div className="w-[190%] shrink-0 px-2">
                  <div className="relative h-[13px] rounded-r-[6px] bg-bg-outage-bar-track overflow-hidden">
                    {tomorrowBlocks.map((block) => {
                      const isContiguousWithToday = todayTouchesMidnight && block.leftPct <= 0.1;
                      return (
                        <div
                          key={block.id}
                          className={`absolute top-0 bottom-0 ${
                            isContiguousWithToday ? 'bg-accent-outage' : 'bg-accent-discharge'
                          }`}
                          style={{
                            left: `${block.leftPct.toFixed(2)}%`,
                            width: `${block.widthPct.toFixed(2)}%`,
                          }}
                        />
                      );
                    })}
                    {Array.from({ length: 23 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 w-px bg-bg-surface/45 pointer-events-none"
                        style={{ left: `${(((idx + 1) / 24) * 100).toFixed(2)}%` }}
                      />
                    ))}
                  </div>
                  <DayScaleTicks stepHours={effectiveTickStep} />
                </div>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleStepScroll(1)}
          disabled={!canNext}
          aria-label="Наступні години"
          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0 transition-colors ${
            canNext
              ? 'text-text-body hover:text-text-primary hover:bg-bg-gauge-track cursor-pointer'
              : 'text-text-tertiary opacity-50 cursor-default pointer-events-none'
          }`}
        >
          ›
        </button>
      </div>
    </div>
  );
}
