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

export function MarstekLogsPanel({ logs, onClearLogs }: MarstekLogsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredLogs = logs.filter((entry) => {
    if (filter === 'ok') return entry.ok;
    if (filter === 'error') return !entry.ok;
    return true;
  });

  const handleCopy = async (entry: MarstekLogEntry) => {
    try {
      await navigator.clipboard.writeText(entry.rawPayload);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div
      id="marstek-logs"
      className="rounded-[20px] bg-[#1B2025] border border-[#2A2F35] p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#F2F4F5]">
            Журнал відповідей Marstek
          </h2>
          <p className="text-[11px] text-[#A8B0B8]">
            Сирі JSON-RPC пакети та помилки, отримані від пристрою ({logs.length})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#101316] p-0.5 border border-[#2A2F35]">
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
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-[#2A2F35] text-[#F2F4F5]'
                    : 'text-[#A8B0B8] hover:text-[#F2F4F5]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="rounded-lg bg-[#101316] border border-[#2A2F35] hover:border-[#3A414A] disabled:opacity-40 px-2.5 py-1 text-[11px] font-medium text-[#A8B0B8] hover:text-[#F2F4F5] transition-colors cursor-pointer whitespace-nowrap"
          >
            Очистити
          </button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-[12px] bg-[#101316] border border-[#2A2F35] px-4 py-6 text-center text-xs text-[#A8B0B8]">
          {logs.length === 0
            ? 'Поки немає записів. Натисніть «Оновити» або «Перевірити з’єднання», щоб побачити відповідь від Marstek.'
            : 'Немає записів для вибраного фільтра.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className="rounded-[12px] bg-[#101316] border border-[#2A2F35] p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      entry.ok
                        ? 'font-semibold text-[#3DDC84]'
                        : 'font-semibold text-[#F44336]'
                    }
                  >
                    {entry.ok ? 'OK' : 'ERR'}
                  </span>
                  <span className="text-[#A8B0B8]">·</span>
                  <span className="text-[#F2F4F5]">{entry.timestamp}</span>
                  <span className="text-[#A8B0B8]">·</span>
                  <span className="text-[#5AB0FF] truncate">{entry.method}</span>
                  <span className="text-[#A8B0B8]">·</span>
                  <span className="text-[#A8B0B8] truncate">
                    {entry.source === 'demo' ? 'Демо' : entry.target}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[#A8B0B8]">{entry.durationMs} мс</span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(entry)}
                    className="text-[#A8B0B8] hover:text-[#F2F4F5] transition-colors cursor-pointer"
                  >
                    {copiedId === entry.id ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </div>
              </div>

              <pre className="font-mono-tabular text-[11px] leading-relaxed text-[#C9CFD5] bg-[#14181D] rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                {formatPrettyJson(entry.rawPayload)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
