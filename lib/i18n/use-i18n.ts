'use client'

import { useApp } from '@/lib/app-context'
import { translate, type MessageKey, WORKFLOW_STATE_KEYS } from './messages'

export function useI18n() {
  const { language, isRtl } = useApp()

  const t = (key: MessageKey | string, vars?: Record<string, string | number>) =>
    translate(language, key, vars)

  const tf = (enLabel: string, fieldKey?: string) => {
    if (fieldKey) return t(`field.${fieldKey}` as MessageKey)
    const k = `field.${enLabel}` as MessageKey
    const translated = t(k)
    return translated === k ? enLabel : translated
  }

  const workflowState = (english: string) => {
    const key = WORKFLOW_STATE_KEYS[english]
    return key ? t(key) : english
  }

  const statusLabel = (status: string) => {
    const key = `status.${status}` as MessageKey
    const translated = t(key)
    return translated === key ? status : translated
  }

  const nodeStatusLabel = (status: string) => {
    const key = `nodeStatus.${status}` as MessageKey
    const translated = t(key)
    return translated === key ? status : translated
  }

  return { t, tf, language, isRtl, workflowState, statusLabel, nodeStatusLabel }
}
