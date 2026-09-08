'use client'

import { useMemo, useState } from 'react'
import { Search, Shield, Wallet, GitBranch, Compass } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpCategory,
} from '@/lib/atlas/help-articles'
import { OfficialTag, PageIntro } from '@/components/atlas/records'
import { cn } from '@/lib/utils'

const CATEGORY_ICON: Record<HelpCategory, typeof Compass> = {
  'Strategy Formulation': Compass,
  'Demand Submission': GitBranch,
  'Budget Reconciliation': Wallet,
  'Approval Workflows': Shield,
}

function matchesQuery(article: HelpArticle, q: string): boolean {
  if (!q) return true
  const hay = [article.title, article.summary, article.body, article.category, ...article.tags]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

export function HelpCenter() {
  const t = useTranslations('helpPage')
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<HelpCategory | 'All'>('All')

  const filtered = useMemo(() => {
    return HELP_ARTICLES.filter((a) => {
      if (activeCategory !== 'All' && a.category !== activeCategory) return false
      return matchesQuery(a, query.trim())
    })
  }, [query, activeCategory])

  const byCategory = useMemo(() => {
    const map = new Map<HelpCategory, HelpArticle[]>()
    for (const cat of HELP_CATEGORIES) map.set(cat, [])
    for (const article of filtered) {
      map.get(article.category)?.push(article)
    }
    return map
  }, [filtered])

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={t('pageTitle')}
        title={t('pageTitle')}
        description={t('pageDesc')}
      />

      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="input-base h-12 border-diriyah-bg-secondary bg-white pl-10 text-sm"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={activeCategory === 'All'} onClick={() => setActiveCategory('All')}>
          All
        </FilterChip>
        {HELP_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat}
            active={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-diriyah-bg-alt px-4 py-10 text-center text-sm text-text-muted">
          {t('noResults')}
        </p>
      ) : (
        <div className="space-y-10">
          {HELP_CATEGORIES.map((category) => {
            const articles = byCategory.get(category) ?? []
            if (articles.length === 0) return null
            const Icon = CATEGORY_ICON[category]
            return (
              <section key={category} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-diriyah-accent" />
                  <h2 className="text-sm font-semibold text-text">{category}</h2>
                  <span className="text-xs text-text-muted">({articles.length})</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {articles.map((article) => (
                    <article
                      key={article.id}
                      className="space-y-2 rounded-md border border-border bg-white p-4"
                      id={article.id}
                    >
                      <h3 className="text-sm font-semibold text-diriyah-primary">
                        {article.title}
                      </h3>
                      <p className="text-xs font-medium text-text-muted">{article.summary}</p>
                      <p className="text-xs leading-relaxed text-text">{article.body}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {article.tags.map((tag) => (
                          <OfficialTag key={tag} variant="outlined">
                            {tag}
                          </OfficialTag>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-b-2 px-1 pb-1.5 text-xs font-semibold transition',
        active
          ? 'border-diriyah-primary text-diriyah-primary'
          : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
