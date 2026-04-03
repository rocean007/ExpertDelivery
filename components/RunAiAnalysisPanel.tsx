'use client';

import React, { useCallback, useId, useState } from 'react';
import { buildRunAnalysisPrompt } from '@/lib/run-analysis-prompt';
import { FREE_AI_CHAT_LINKS } from '@/lib/free-ai-chat-links';
import type { RunRecord } from '@/types';

interface Props {
  run: RunRecord;
  /** Compact trigger for tight layouts (e.g. driver HUD). */
  compact?: boolean;
}

export function RunAiAnalysisPanel({ run, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaId = useId();
  const promptText = buildRunAnalysisPrompt(run);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        const el = document.getElementById(textareaId) as HTMLTextAreaElement | null;
        el?.select();
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        /* noop */
      }
    }
  }, [promptText, textareaId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors'
            : 'btn-secondary w-full py-2.5 text-xs font-mono uppercase tracking-wider'
        }
        style={
          compact
            ? {
                background: 'rgba(167,139,250,0.12)',
                borderColor: 'rgba(167,139,250,0.35)',
                color: '#c4b5fd',
              }
            : undefined
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {compact ? '🤖 Insight' : '🤖 Route insight (free AI, no API key)'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby={`${textareaId}-title`}
            aria-modal="true"
            className="w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl border"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-start justify-between gap-3 p-4 border-b"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <h2 id={`${textareaId}-title`} className="font-mono text-sm font-bold uppercase tracking-wider" style={{ color: '#c4b5fd' }}>
                  Route analysis prompt
                </h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Copy the block below, open any linked chat in a new tab, and paste. This app does not call AI APIs or
                  send your data to models — you stay in control. Providers change their free tiers often.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 px-2 py-1 rounded text-xs font-mono"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <textarea
                id={textareaId}
                readOnly
                value={promptText}
                rows={compact ? 10 : 14}
                className="w-full rounded-xl px-3 py-2 text-xs font-mono leading-relaxed resize-y min-h-[10rem] border"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <button type="button" onClick={() => void copy()} className="btn-primary w-full py-2.5 text-sm">
                {copied ? '✓ Copied to clipboard' : 'Copy prompt'}
              </button>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Open a chat (alphabetical — no endorsement)
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FREE_AI_CHAT_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg px-3 py-2 text-xs border no-underline transition-colors hover:opacity-95"
                        style={{
                          background: 'var(--bg-card)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--accent-green)',
                        }}
                      >
                        <span className="font-medium block truncate">{link.label}</span>
                        <span className="text-[10px] block mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {link.note}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
