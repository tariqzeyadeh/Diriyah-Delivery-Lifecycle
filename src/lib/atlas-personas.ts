/**
 * Shared persona data — NO 'use client' so this can be safely imported
 * by both client components (AuthProvider) and server utilities (server-guard).
 */

/** Roles aligned to Excel sheet 03_Roles Access */
export type AtlasRole =
  | 'Strategy & Governance'
  | 'Business Owner'
  | 'Commercial & Budgeting'
  | 'CTO Office'
  | 'PMO'

export type DemoPersona = {
  id: string
  name: string
  role: AtlasRole
  email: string
  initials: string
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'sarah.almansouri',
    name: 'Sarah Al Mansouri',
    role: 'Strategy & Governance',
    email: 'sarah.almansouri@diriyah.sa',
    initials: 'SM',
  },
  {
    id: 'ahmed.khalid',
    name: 'Ahmed Khalid',
    role: 'Business Owner',
    email: 'ahmed.khalid@diriyah.sa',
    initials: 'AK',
  },
  {
    id: 'rami.noor',
    name: 'Rami Noor',
    role: 'Commercial & Budgeting',
    email: 'rami.noor@diriyah.sa',
    initials: 'RN',
  },
  {
    id: 'mohammed.alnuaimi',
    name: 'Mohammed Al Nuaimi',
    role: 'CTO Office',
    email: 'mohammed.alnuaimi@diriyah.sa',
    initials: 'MN',
  },
  {
    id: 'pmo.admin',
    name: 'PMO Admin',
    role: 'PMO',
    email: 'pmo.admin@diriyah.sa',
    initials: 'PA',
  },
]
