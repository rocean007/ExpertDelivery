'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { FREE_AI_CHAT_LINKS } from '@/lib/free-ai-chat-links';
import { buildRunAnalysisPrompt } from '@/lib/run-analysis-prompt';
import type { RunRecord } from '@/types';

interface Props {
  run: RunRecord;
  /** Compact trigger for tight layouts (e.g. driver HUD). */
  compact?: boolean;
}

export function RunAiAnalysisPanel({ run, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeChatLabel, setActiveChatLabel] = useState(FREE_AI_CHAT_LINKS[0]?.label ?? '');
  const [frameLoading, setFrameLoading] = useState(false);
  const textareaId = useId();
  const promptText = buildRunAnalysisPrompt(run);
  const activeChat = FREE_AI_CHAT_LINKS.find((item) => item.label === activeChatLabel) ?? FREE_AI_CHAT_LINKS[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeChat) return;
    setFrameLoading(true);
  }, [open, activeChat]);

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

  const openWorkspace = useCallback(() => {
    setOpen(true);
  }, []);

  const modal = open ? (
    <div
      className="fixed inset-0 z-[5000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-labelledby={`${textareaId}-title`}
        aria-modal="true"
        className="w-full sm:max-w-6xl max-h-[92dvh] sm:max-h-[88dvh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl border"
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
              Route AI workspace
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              This keeps you inside your site and loads the official chat pages directly when the provider allows embedding. Copy the route prompt, paste it into the selected chat, and compare answers there.
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

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] h-full min-h-[32rem]">
            <section className="space-y-4 min-w-0">
              <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Official chat services
                </p>
                <div className="grid gap-2">
                  {FREE_AI_CHAT_LINKS.map((item) => {
                    const active = item.label === activeChat?.label;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setActiveChatLabel(item.label)}
                        className="w-full rounded-lg border px-3 py-2 text-left transition-colors"
                        style={{
                          background: active ? 'rgba(167,139,250,0.12)' : 'var(--bg-secondary)',
                          borderColor: active ? 'rgba(167,139,250,0.45)' : 'var(--border-default)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div className="text-xs font-mono uppercase tracking-wider" style={{ color: active ? '#c4b5fd' : 'var(--text-secondary)' }}>
                          {item.label}
                        </div>
                        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {item.note}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Route prompt
                </p>
                <textarea
                  id={textareaId}
                  readOnly
                  value={promptText}
                  rows={compact ? 10 : 14}
                  className="w-full rounded-xl px-3 py-2 text-xs font-mono leading-relaxed resize-y min-h-[12rem] border"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div className="grid gap-2 mt-3 sm:grid-cols-2">
                  <button type="button" onClick={() => void copy()} className="btn-primary w-full py-2.5 text-sm">
                    {copied ? '✓ Copied to clipboard' : 'Copy prompt'}
                  </button>
                  {activeChat ? (
                    <a
                      href={activeChat.href}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary w-full py-2.5 text-sm text-center"
                    >
                      Open {activeChat.label} in new tab
                    </a>
                  ) : null}
                </div>
                <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Some providers block iframe embedding with browser security headers. When that happens, use the new-tab button for that provider.
                </p>
              </div>
            </section>

            <section className="min-w-0 rounded-xl border overflow-hidden flex flex-col" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Embedded chat
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                    {activeChat?.label ?? 'No provider selected'}
                  </p>
                </div>
                {frameLoading ? (
                  <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#c4b5fd' }}>
                    Loading...
                  </p>
                ) : null}
              </div>

              {activeChat ? (
                <iframe
                  key={activeChat.href}
                  src={activeChat.href}
                  title={`${activeChat.label} chat`}
                  className="flex-1 min-h-[24rem] w-full"
                  referrerPolicy="no-referrer"
                  allow="clipboard-read; clipboard-write"
                  onLoad={() => setFrameLoading(false)}
                />
              ) : (
                <div className="flex-1 grid place-items-center px-6 text-center">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Select a provider to load its official chat page here.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openWorkspace}
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
        {compact ? '🤖 AI' : '🤖 Open AI Workspace'}
      </button>
      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
