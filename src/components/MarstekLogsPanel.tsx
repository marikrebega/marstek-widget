import { useState } from 'react';
import type { MarstekLogEntry } from '../types/marstek';

interface MarstekLogsPanelProps {
  logs: MarstekLogEntry[];
  onClearLogs: () => void;
}

function formatPrettyJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted WebView contexts
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function MarstekLogsPanel({ logs, onClearLogs }: MarstekLogsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredLogs = logs.filter((entry) => {
    if (filter === 'ok') return entry.ok;
    if (filter === 'error') return !entry.ok;
    return true;
  });

  const handleCopy = async (entry: MarstekLogEntry) => {
    const ok = await copyTextToClipboard(entry.rawPayload);
    if (ok) {
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === entry.id ? null : cur)), 1500);
    }
  };

  const handleCopyAll = async () => {
    const targetLogs = filteredLogs.length > 0 ? filteredLogs : logs;
    if (targetLogs.length === 0) return;

    const combined = targetLogs
      .map(
        (entry) =>
          `[${entry.timestamp}] ${entry.ok ? 'OK' : 'ERR'} · ${entry.method} · ${entry.target} (${entry.durationMs} мс)\n${formatPrettyJson(entry.rawPayload)}`
      )
      .join('\n\n---\n\n');

    const ok = await copyTextToClipboard(combined);
    if (ok) {
      setCopiedId('__ALL__');
      window.setTimeout(() => setCopiedId((cur) => (cur === '__ALL__' ? null : cur)), 1800);
    }
  };

  return (
    <div id="marstek-logs" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#F2F4F5]">
            Журнал відповідей Marstek
          </h2>
          <p className="text-xs text-[#8FA3B8] tabular-nums">
            JSON-RPC пакети та діагностика віджета ({logs.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#15191E] p-0.5 border border-[#252B32]">
            {(
              [
                { id: 'all', label: 'Усі' },
                { id: 'ok', label: 'Успішні' },
                { id: 'error', label: 'Помилки' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-[#252B32] text-[#F2F4F5]'
                    : 'text-[#8FA3B8] hover:text-[#F2F4F5]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleCopyAll()}
            disabled={logs.length === 0}
            className={`rounded-lg bg-[#15191E] border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
              copiedId === '__ALL__'
                ? 'border-[#3DDC84] text-[#3DDC84]'
                : 'border-[#252B32] hover:border-[#3A414A] text-[#C9CFD5] hover:text-[#F2F4F5]'
            }`}
          >
            {copiedId === '__ALL__' ? 'Скопійовано!' : 'Копіювати всі'}
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="rounded-lg bg-[#15191E] border border-[#252B32] hover:border-[#3A414A] disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-[#A8B0B8] hover:text-[#F2F4F5] transition-colors cursor-pointer whitespace-nowrap"
          >
            Очистити
          </button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-2xl bg-[#14181D] border border-[#22272E] px-4 py-8 text-center text-xs text-[#8FA3B8]">
          {logs.length === 0
            ? 'Поки немає записів. Натисніть «Оновити» або «Перевірити з’єднання», щоб побачити відповідь від Marstek.'
            : 'Немає записів для вибраного фільтра.'}
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-0.5">
          {filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl bg-[#14181D] border border-[#22272E] p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`font-semibold shrink-0 ${
                      entry.ok ? 'text-[#3DDC84]' : 'text-[#F44336]'
                    }`}
                  >
                    {entry.ok ? 'OK' : 'ERR'}
                  </span>
                  <span className="text-[#47505A] shrink-0">·</span>
                  <span className="text-[#5AB0FF] font-medium truncate">
                    {entry.method}
                  </span>
                  <span className="text-[#47505A] shrink-0">·</span>
                  <span className="text-[#C9CFD5] shrink-0">{entry.timestamp}</span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11px] text-[#8FA3B8]">
                    {entry.durationMs} мс
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(entry)}
                    className={`rounded-md px-2 py-1 text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                      copiedId === entry.id
                        ? 'text-[#3DDC84] bg-[#15241D]'
                        : 'text-[#A8B0B8] hover:text-[#F2F4F5] hover:bg-[#1E2329]'
                    }`}
                  >
                    {copiedId === entry.id ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </div>
              </div>

              <div className="text-[11px] font-mono-tabular text-[#616973]">
                {entry.target}
              </div>

              <pre className="font-mono-tabular text-[11px] leading-relaxed text-[#C9CFD5] bg-[#0F1216] border border-[#1E2329] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {formatPrettyJson(entry.rawPayload)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
