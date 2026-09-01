'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Clock, Globe, LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { PORTAL_ALERTS } from '@/lib/mock-data'
import { useI18n } from '@/lib/i18n/use-i18n'

interface TopHeaderProps {
  onToggleMobileMenu?: () => void
}

/** Matches government-relations-portal / DVT-Committee-Main Navbar */
export function TopHeader({ onToggleMobileMenu }: TopHeaderProps) {
  const { logout, theme, toggleDarkMode, toggleLanguage, language, notifications, isRtl } = useApp()
  const { t } = useI18n()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleLogout = () => {
    logout()
  }

  const unreadCount = notifications

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 flex-row items-center justify-between border-b border-border bg-surface-elevated px-4">
      <div className="relative flex w-full items-center">
        <div className="flex flex-shrink-0 items-center gap-2">
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="z-40 rounded-lg p-2 transition-colors duration-200 hover:bg-gray-200 lg:hidden"
              aria-label="Toggle mobile menu"
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </button>
          )}
          <Link href="/" className="flex items-center no-underline">
            <img
              src="/logo.png"
              alt="logo"
              className="h-9 w-9 rounded-full object-cover object-center sm:h-10 sm:w-10"
            />
          </Link>
        </div>

        <div className={`flex flex-shrink-0 items-center gap-2 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="group relative flex cursor-pointer items-center justify-center rounded-lg p-2 transition-all duration-200 hover:bg-surface"
              aria-label={t('app.notifications')}
              aria-expanded={notifOpen}
            >
              <div className="relative">
                <Bell
                  className="h-5 w-5 text-text-muted transition-all duration-200 group-hover:scale-110 group-hover:text-brand"
                  strokeWidth={2}
                />
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-[20px] w-[20px] items-center justify-center rounded-full border-2 border-surface-elevated bg-red-500 text-center text-[10px] font-semibold leading-[20px] text-white shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            </button>
            {notifOpen && (
              <div className={`${isRtl ? 'accessibility-dropdown-rtl' : 'accessibility-dropdown'} w-80`}>
                <div className="border-b border-gray-200 px-4 py-2">
                  <h4 className="text-sm font-semibold text-gray-800">{t('app.notifications')}</h4>
                  <p className="text-xs text-gray-500">
                    {t('app.notificationsCount', { count: unreadCount })}
                  </p>
                </div>
                <div className="max-h-80 overflow-auto">
                  {PORTAL_ALERTS.map((n) => (
                    <div
                      key={n.id}
                      className="cursor-pointer border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-100"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">
                            {isRtl ? n.titleAr : n.titleEn}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {isRtl ? n.summaryAr : n.summaryEn}
                          </p>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {n.timestamp.slice(0, 16).replace('T', ' ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="group relative flex cursor-pointer items-center justify-center rounded-lg p-2 transition-all duration-200 hover:bg-surface"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun
                className="h-5 w-5 text-text-muted transition-all duration-200 group-hover:rotate-12 group-hover:scale-110 group-hover:text-brand"
                strokeWidth={2}
              />
            ) : (
              <Moon
                className="h-5 w-5 text-text-muted transition-all duration-200 group-hover:-rotate-12 group-hover:scale-110 group-hover:text-brand"
                strokeWidth={2}
              />
            )}
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            className="group hidden cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-all duration-200 hover:border-brand/30 hover:bg-surface lg:flex"
            aria-label={`Switch to ${language === 'en' ? 'Arabic' : 'English'}`}
          >
            <Globe
              className="h-5 w-5 text-brand transition-transform duration-200 group-hover:rotate-12"
              strokeWidth={2}
            />
            <span className="font-medium">{language === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 font-medium text-red-600 transition-all duration-200 hover:border-red-200/50 hover:bg-red-50 hover:text-red-700"
            aria-label={t('app.logout')}
          >
            <LogOut
              className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"
              strokeWidth={2}
            />
            <span className="hidden whitespace-nowrap text-sm sm:block">{t('app.logout')}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
