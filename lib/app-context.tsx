'use client'

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { PROFILE } from '@/lib/mock-data'

export type Language = 'en' | 'ar'
export type ThemeMode = 'light' | 'dark'

export interface AppUser {
  name: string
  nameAr: string
  role: string
  roleAr: string
  email: string
  avatar: string
  ministry: string
  ministryAr: string
  mobile?: string
  altEmail?: string
}

interface AppContextType {
  isLoggedIn: boolean
  user: AppUser | null
  darkMode: boolean
  theme: ThemeMode
  language: Language
  notifications: number
  sidebarCollapsed: boolean
  toast: string | null
  toggleSidebar: () => void
  login: () => void
  logout: () => void
  toggleDarkMode: () => void
  toggleLanguage: () => void
  setLanguage: (lang: Language) => void
  showToast: (msg: string, _kind?: 'success' | 'error' | 'info') => void
  clearToast: () => void
  updateUser: (patch: Partial<AppUser>) => void
  isRtl: boolean
}

const DEFAULT_USER: AppUser = {
  name: PROFILE.nameEn,
  nameAr: PROFILE.nameAr,
  role: PROFILE.roleEn ?? PROFILE.titleEn,
  roleAr: PROFILE.roleAr ?? PROFILE.titleAr,
  email: PROFILE.email,
  avatar: PROFILE.avatar,
  ministry: PROFILE.ministryEn ?? PROFILE.departmentEn,
  ministryAr: PROFILE.ministryAr ?? PROFILE.departmentAr,
  mobile: PROFILE.mobile,
  altEmail: PROFILE.altEmail,
}

const AppContext = createContext<AppContextType | null>(null)

const AUTH_KEY = 'diriyah_auth'
const THEME_KEY = 'theme'
const LANG_KEY = 'language'

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const saved = localStorage.getItem(LANG_KEY)
  return saved === 'ar' ? 'ar' : 'en'
}

function applyDomLanguage(next: Language) {
  document.documentElement.setAttribute('lang', next)
  document.documentElement.setAttribute('dir', next === 'ar' ? 'rtl' : 'ltr')
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(true)
  const [user, setUser] = useState<AppUser | null>(DEFAULT_USER)
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [language, setLanguageState] = useState<Language>('en')
  const [notifications] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem(AUTH_KEY)
    if (auth === '0') {
      setIsLoggedIn(false)
      setUser(null)
    } else {
      setIsLoggedIn(true)
      setUser(DEFAULT_USER)
      localStorage.setItem(AUTH_KEY, '1')
    }

    const nextTheme = readStoredTheme()
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)

    const nextLang = readStoredLanguage()
    setLanguageState(nextLang)
    applyDomLanguage(nextLang)

    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme, hydrated])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(LANG_KEY, language)
    applyDomLanguage(language)
  }, [language, hydrated])

  const toggleSidebar = () => setSidebarCollapsed((p) => !p)

  const login = () => {
    setUser(DEFAULT_USER)
    setIsLoggedIn(true)
    localStorage.setItem(AUTH_KEY, '1')
  }

  const logout = () => {
    setUser(null)
    setIsLoggedIn(false)
    localStorage.setItem(AUTH_KEY, '0')
  }

  const toggleDarkMode = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const applyLanguage = (next: Language) => {
    setLanguageState(next)
  }

  const toggleLanguage = () => applyLanguage(language === 'en' ? 'ar' : 'en')

  const showToast = (msg: string, _kind?: 'success' | 'error' | 'info') => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }

  const clearToast = () => setToast(null)

  const updateUser = (patch: Partial<AppUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u))
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-brand">
        Loading…
      </div>
    )
  }

  return (
    <AppContext.Provider
      value={{
        isLoggedIn,
        user,
        darkMode: theme === 'dark',
        theme,
        language,
        notifications,
        sidebarCollapsed,
        toast,
        toggleSidebar,
        login,
        logout,
        toggleDarkMode,
        toggleLanguage,
        setLanguage: applyLanguage,
        showToast,
        clearToast,
        updateUser,
        isRtl: language === 'ar',
      }}
    >
      {children}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-brand px-4 py-2.5 text-sm text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
