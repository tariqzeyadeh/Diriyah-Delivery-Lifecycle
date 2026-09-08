'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, Search, UserRound, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth, type DemoPersona } from '@/src/providers/AuthProvider'
import { LanguageSwitcher } from '@/components/atlas/LanguageSwitcher'
import { NewRecordButton } from '@/components/atlas/home/NewRecordButton'
import { cn } from '@/lib/utils'

export function AtlasHeader() {
  const t = useTranslations('common')
  const { currentUser, personas, setPersona } = useAuth()
  const [personaOpen, setPersonaOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const personaRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!personaRef.current?.contains(e.target as Node)) setPersonaOpen(false)
      if (!mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function selectPersona(p: DemoPersona) {
    setPersona(p.id)
    setPersonaOpen(false)
    setMobileMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#1e3a5f]/20 bg-gradient-to-r from-[#f4efe7] via-white to-[#eef4fb] shadow-sm backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 px-4 md:gap-4 md:px-6">
        {/* Mobile hamburger — Role + Language */}
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-diriyah-bg-secondary bg-diriyah-bg-alt text-diriyah-primary"
            aria-expanded={mobileMenuOpen}
            aria-controls="atlas-mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {mobileMenuOpen ? (
            <div
              id="atlas-mobile-menu"
              className="absolute start-0 z-50 mt-2 w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-border bg-white shadow-lg"
            >
              <div className="border-b border-border bg-diriyah-bg-alt px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {t('language')}
                </p>
                <div className="mt-2">
                  <LanguageSwitcher />
                </div>
              </div>

              <div className="border-b border-border bg-diriyah-bg-alt/60 px-3 py-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <UserRound className="h-3.5 w-3.5" />
                  {t('demoPersonaSwitcher')}
                </p>
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {personas.map((p) => {
                  const active = p.id === currentUser.id
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectPersona(p)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-diriyah-bg-alt',
                          active && 'bg-diriyah-primary/5',
                        )}
                        data-testid={`mobile-persona-${p.id}`}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                            active
                              ? 'bg-diriyah-primary text-white'
                              : 'bg-diriyah-bg-secondary text-diriyah-primary',
                          )}
                        >
                          {p.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-text">
                            {p.name}
                          </span>
                          <span className="block truncate text-[11px] text-text-muted">
                            {p.role}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="relative min-w-0 max-w-xl flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            className="input-base h-11 border-diriyah-bg-secondary bg-diriyah-bg-alt ps-10 text-sm placeholder:text-text-muted/70"
            aria-label="Search"
          />
        </div>

        {/* Desktop: Language + Role switchers */}
        <div className="ms-auto hidden shrink-0 items-center gap-3 md:flex">
          <LanguageSwitcher />

          <div className="relative" ref={personaRef}>
            <button
              type="button"
              onClick={() => setPersonaOpen((v) => !v)}
              className="flex items-center gap-3 rounded-xl border border-diriyah-bg-secondary bg-diriyah-bg-alt px-3 py-1.5 text-start transition hover:border-diriyah-accent"
              aria-haspopup="listbox"
              aria-expanded={personaOpen}
              data-testid="persona-switcher"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-diriyah-primary text-xs font-bold text-white"
                aria-hidden
              >
                {currentUser.initials}
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold text-text">{currentUser.name}</p>
                <p className="truncate text-[11px] text-text-muted">{currentUser.role}</p>
              </div>
              <ChevronDown
                className={cn('h-4 w-4 text-text-muted transition', personaOpen && 'rotate-180')}
              />
            </button>

            {personaOpen ? (
              <div
                role="listbox"
                className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
              >
                <div className="border-b border-border bg-diriyah-bg-alt px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    <UserRound className="h-3.5 w-3.5" />
                    {t('demoPersonaSwitcher')}
                  </p>
                </div>
                <ul className="max-h-80 overflow-y-auto py-1">
                  {personas.map((p) => {
                    const active = p.id === currentUser.id
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => selectPersona(p)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-diriyah-bg-alt',
                            active && 'bg-diriyah-primary/5',
                          )}
                          data-testid={`persona-${p.id}`}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold',
                              active
                                ? 'bg-diriyah-primary text-white'
                                : 'bg-diriyah-bg-secondary text-diriyah-primary',
                            )}
                          >
                            {p.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-text">
                              {p.name}
                            </span>
                            <span className="block truncate text-[11px] text-text-muted">
                              {p.role}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          <NewRecordButton />
        </div>

        {/* Compact persona + new record on mobile */}
        <div className="ms-auto flex shrink-0 items-center gap-2 md:hidden">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-diriyah-primary text-xs font-bold text-white"
            aria-hidden
          >
            {currentUser.initials}
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-2 md:hidden">
        <NewRecordButton />
      </div>
    </header>
  )
}
