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
          <h2 className="text-base font-semibold text-text-primary">
            Журнал відповідей Marstek
          </h2>
          <p className="text-xs text-text-muted tabular-nums">
            JSON-RPC пакети та діагностика віджета ({logs.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-bg-segment p-1 border border-border-control">
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
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-border-control text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
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
            className={`min-h-[36px] rounded-lg bg-bg-segment border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
              copiedId === '__ALL__'
                ? 'border-accent-primary text-accent-primary bg-status-success-bg'
                : 'border-border-control hover:border-border-hover text-text-body hover:text-text-primary'
            }`}
          >
            {copiedId === '__ALL__' ? 'Скопійовано!' : 'Копіювати всі'}
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="min-h-[36px] rounded-lg bg-bg-segment border border-border-control hover:border-border-hover disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            Очистити
          </button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-2xl bg-bg-card border border-border-default px-4 py-8 text-center text-xs text-text-muted">
          {logs.length === 0
            ? 'Поки немає записів. Натисніть «Оновити» або «Перевірити з’єднання», щоб побачити відповідь від Marstek.'
            : 'Немає записів для вибраного фільтра.'}
        </div>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl bg-bg-card border border-border-default p-4 space-y-2"
            >
              <div className="space-y-1 font-mono-tabular">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1 text-xs">
                    <span
                      className={`font-semibold shrink-0 ${
                        entry.ok ? 'text-accent-primary' : 'text-status-error'
                      }`}
                    >
                      {entry.ok ? 'OK' : 'ERR'}
                    </span>
                    <span className="text-text-separator shrink-0">·</span>
                    <span className="text-accent-discharge font-medium min-w-[12ch] break-all">
                      {entry.method}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopy(entry)}
                    className={`min-h-[32px] rounded-lg px-3 py-1 text-[11px] font-sans font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      copiedId === entry.id
                        ? 'text-accent-primary bg-status-success-bg'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover-subtle'
                    }`}
                  >
                    {copiedId === entry.id ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="text-text-body">{entry.timestamp}</span>
                  <span className="text-text-separator">·</span>
                  <span className="text-text-muted">{entry.durationMs} мс</span>
                  <span className="text-text-separator">·</span>
                  <span className="text-text-muted break-all">{entry.target}</span>
                </div>
              </div>

              <pre className="font-mono-tabular text-[11px] leading-relaxed text-text-body bg-bg-inset border border-border-subtle rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {formatPrettyJson(entry.rawPayload)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
