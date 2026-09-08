'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Loader2, Sparkles, X, SendHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Diriyah Copilot — collapsing right-side drawer with streaming chat + Prisma tools.
 * Toggle sits above the UAT Feedback FAB (bottom-right).
 */
export function CopilotChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, status, open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void sendMessage({ text })
  }

  return (
    <>
      {/* Floating toggle — stacked above UAT (bottom-5) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-28 end-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition md:bottom-24',
          'hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
        style={{
          backgroundColor: 'var(--diriyah-primary)',
          outlineColor: 'var(--diriyah-accent)',
        }}
        aria-expanded={open}
        aria-controls="atlas-copilot-drawer"
        aria-label={open ? 'Close Diriyah Copilot' : 'Open Diriyah Copilot'}
        data-testid="copilot-toggle"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {/* Right-anchored collapsing drawer */}
      <div
        id="atlas-copilot-drawer"
        role="dialog"
        aria-modal="false"
        aria-label="Diriyah Copilot"
        className={cn(
          'fixed inset-y-0 right-0 z-[65] flex w-full max-w-md flex-col border-s border-border bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <header
          className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 text-white"
          style={{ backgroundColor: 'var(--diriyah-primary)' }}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide">
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--diriyah-amber)]" />
              Diriyah Copilot
            </p>
            <p className="mt-0.5 text-xs text-white/70">
              Portfolio Q&amp;A · live Prisma data
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close copilot"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-diriyah-bg-alt/60 px-4 py-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white px-4 py-6 text-sm text-text-muted">
              <p className="font-medium text-text">Ask about the portfolio</p>
              <p className="mt-2">
                Try: “How healthy is the portfolio?” or “Which demands are waiting on the CTO?”
              </p>
            </div>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === 'user'
            return (
              <div
                key={message.id}
                className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                    isUser
                      ? 'rounded-br-md text-white'
                      : 'rounded-bl-md border border-border bg-white text-text',
                  )}
                  style={
                    isUser
                      ? { backgroundColor: 'var(--diriyah-primary)' }
                      : undefined
                  }
                >
                  {message.parts.map((part, index) => {
                    if (part.type === 'text') {
                      return (
                        <p key={index} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      )
                    }
                    if (
                      part.type === 'tool-getPortfolioSummary' ||
                      (typeof part.type === 'string' &&
                        part.type.startsWith('tool-') &&
                        part.type.includes('Portfolio'))
                    ) {
                      const state = 'state' in part ? String(part.state) : 'unknown'
                      return (
                        <p
                          key={index}
                          className="mt-1 text-[11px] font-medium uppercase tracking-wide opacity-80"
                        >
                          {state === 'output-available' || state === 'result'
                            ? 'Fetched portfolio summary'
                            : 'Querying portfolio…'}
                        </p>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            )
          })}

          {busy ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Copilot is thinking…
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error.message || 'Copilot request failed. Check AI provider env vars.'}
            </p>
          ) : null}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-border bg-white px-4 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Ask about budgets, traces, CTO approvals…"
              className="input-base min-h-[2.75rem] flex-1 resize-none py-2.5 text-sm disabled:opacity-60"
              aria-label="Copilot message"
              data-testid="copilot-input"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn btn-primary flex h-11 w-11 shrink-0 items-center justify-center px-0 disabled:opacity-50"
              aria-label="Send message"
              data-testid="copilot-send"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Scrim when open on small screens */}
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[64] bg-black/25 md:hidden"
          aria-label="Dismiss copilot backdrop"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
