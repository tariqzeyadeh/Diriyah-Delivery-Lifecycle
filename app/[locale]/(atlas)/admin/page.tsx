'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { OfficialTag, PageIntro, RegisterTable } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

const GATE_IDS = [
  { id: 'G-S1', nameKey: 'gateStrategy', ownerKey: 'ownerCto', slaHours: 48 },
  { id: 'G-D1', nameKey: 'gateDemand', ownerKey: 'ownerCommercial', slaHours: 72 },
  { id: 'G-B1', nameKey: 'gateBudget', ownerKey: 'ownerCto', slaHours: 48 },
  { id: 'G-PMO1', nameKey: 'gatePmo', ownerKey: 'ownerPmo', slaHours: 24 },
] as const

type RuleKey =
  | 'requireReturnComments'
  | 'blockIncomplete'
  | 'preserveApprovalHistory'
  | 'autoCreateProject'

const DEFAULT_RULES: Record<RuleKey, boolean> = {
  requireReturnComments: true,
  blockIncomplete: true,
  preserveApprovalHistory: true,
  autoCreateProject: false,
}

export default function AdminConfigurationPage() {
  const t = useTranslations('admin')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const [prefix, setPrefix] = useState('TECH')
  const [yearToken, setYearToken] = useState('YYYY')
  const [sequence, setSequence] = useState('0000')
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = useMemo(() => {
    const year = yearToken === 'YYYY' ? '2027' : yearToken
    const width = Math.max(sequence.length || 4, 4)
    const exampleSeq = '1'.padStart(width, '0')
    return `${(prefix || 'TECH').toUpperCase()}-${year}-${exampleSeq}`
  }, [prefix, yearToken, sequence])

  function toggle(key: RuleKey) {
    setRules((r) => ({ ...r, [key]: !r[key] }))
  }

  function saveConfig() {
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 600))
            setMessage(t('savedSuccess'))
    })
  }

  return (
    <div className="space-y-8">
      <PageIntro eyebrow={tn('admin')} title={t('pageTitle')} description={t('desc')} />

      <div className="grid gap-6 2xl:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-md border border-border bg-white">
            <div className="border-b border-border px-4 py-3">
              <div className="inline-flex gap-4 border-b-0 text-xs">
                <span className="border-b-2 border-diriyah-primary pb-1 font-semibold text-diriyah-primary">
                  {t('workflowRules')}
                </span>
                <span className="pb-1 text-text-muted">{t('statusLookups')}</span>
              </div>
              <p className="mt-2 text-xs text-text-muted">{t('gatesDesc')}</p>
            </div>
            <RegisterTable caption={t('workflowRules')} count={GATE_IDS.length}>
              <thead>
                <tr className="border-b border-border text-start text-xs text-text-muted">
                  <th className="px-4 py-2.5 font-semibold">{t('gateCode')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('gateName')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('owner')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('slaHours')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {GATE_IDS.map((g, idx) => (
                  <tr
                    key={g.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-diriyah-bg-alt/20'}
                  >
                    <th scope="row" className="px-4 py-2.5 text-start font-mono font-normal text-diriyah-accent">
                      {g.id}
                    </th>
                    <td className="px-4 py-2.5 font-medium text-text">{t(g.nameKey)}</td>
                    <td className="px-4 py-2.5 text-text-muted">{t(g.ownerKey)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{g.slaHours}</td>
                    <td className="px-4 py-2.5">
                      <OfficialTag tone="success">{t('active')}</OfficialTag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </RegisterTable>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-white">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">{t('masterIdRule')}</h2>
              <p className="text-xs text-text-muted">{t('masterIdDesc')}</p>
            </div>
            <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-text">{t('prefix')}</span>
                <input
                  className="input-base uppercase"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="TECH"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-text">{t('yearToken')}</span>
                <input
                  className="input-base"
                  value={yearToken}
                  onChange={(e) => setYearToken(e.target.value.slice(0, 8))}
                  placeholder="YYYY"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-text">{t('sequenceFormat')}</span>
                <input
                  className="input-base font-mono"
                  value={sequence}
                  onChange={(e) =>
                    setSequence(e.target.value.replace(/[^0-9]/g, '').slice(0, 6) || '0000')
                  }
                  placeholder="0000"
                />
              </label>
              <div className="md:col-span-3 rounded-md border border-border bg-diriyah-bg-alt px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {t('generatedExample')}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold text-diriyah-primary">
                  {preview}
                </p>
              </div>
            </div>
            <div className="flex justify-end border-t border-border px-6 py-4">
              <button
                type="button"
                className="btn btn-primary h-11 px-5 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={saveConfig}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? tc('working') : t('saveRules')}
              </button>
            </div>
            {message ? <p className="px-6 pb-4 text-sm text-diriyah-green">{message}</p> : null}
          </section>
        </div>

        <aside className="overflow-hidden rounded-md border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">{t('systemRules')}</h2>
            <p className="mt-0.5 text-xs text-text-muted">{t('systemRulesDesc')}</p>
          </div>
          {/* Grid 1-col on sidebar layout, 2-col when full-width */}
          <ul className="grid divide-border/60 sm:grid-cols-2 2xl:grid-cols-1 [&>li]:border-b [&>li:last-child]:border-0 [&>li:nth-last-child(2)]:sm:border-0 2xl:[&>li:nth-last-child(2)]:border-b">
            {(
              [
                ['requireReturnComments', 'ruleReturnComments'],
                ['blockIncomplete', 'ruleBlockIncomplete'],
                ['preserveApprovalHistory', 'rulePreserveHistory'],
                ['autoCreateProject', 'ruleAutoCreate'],
              ] as const
            ).map(([key, labelKey]) => (
              <li key={key} className="flex items-center justify-between gap-3 px-5 py-4">
                <span className="text-sm leading-snug text-text">{t(labelKey)}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rules[key]}
                  onClick={() => toggle(key)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    rules[key] ? 'bg-diriyah-green' : 'bg-diriyah-bg-secondary',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start]',
                      rules[key] ? 'start-5' : 'start-0.5',
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
