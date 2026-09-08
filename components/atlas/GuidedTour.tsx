'use client'

import { useCallback, useEffect, useState } from 'react'
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride'

const STORAGE_KEY = 'atlas_has_completed_onboarding'

const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="tour-new-record"]',
    title: 'Start a governed spine',
    content:
      'Click + New Record to open a Master Trace and Strategy draft. Every downstream Demand, Budget, and Project inherits that ID.',
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '[data-tour="tour-master-records"]',
    title: 'Active Master Records',
    content:
      'This KPI counts open Master Trace spines in the portfolio — your live measure of how many investments are in pre-initiation.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="tour-sla-workload"]',
    title: 'SLA Workload',
    content:
      'Pending approvals by SLA posture: Within SLA, Due soon, and Overdue. Use this to keep CTO and PMO gates from becoming the bottleneck.',
    placement: 'left',
  },
  {
    target: '[data-tour="tour-uat-feedback"]',
    title: 'UAT Feedback',
    content:
      'Pilot users can report bugs, UI issues, or feature requests here. Diriyah captures your page path and Master Trace ID automatically.',
    placement: 'left',
  },
]

/**
 * First-time guided tour for the Pre-Initiation Cockpit.
 * Conditionally runs while `has_completed_onboarding` is false (localStorage).
 */
export function GuidedTour() {
  const [run, setRun] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const done = localStorage.getItem(STORAGE_KEY)
      if (done !== 'true') {
        const t = window.setTimeout(() => setRun(true), 400)
        return () => window.clearTimeout(t)
      }
    } catch {
      setRun(true)
    }
  }, [])

  const completeOnboarding = useCallback(() => {
    setRun(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // ignore private mode / quota
    }
  }, [])

  const handleEvent = useCallback(
    (data: EventData) => {
      if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        completeOnboarding()
      }
    },
    [completeOnboarding],
  )

  if (!mounted) return null

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip tour',
      }}
      options={{
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        primaryColor: '#5c4033',
        backgroundColor: '#ffffff',
        textColor: '#1c1613',
        overlayColor: 'rgba(28, 22, 19, 0.55)',
        zIndex: 10000,
        spotlightRadius: 8,
      }}
    />
  )
}

/** Reset onboarding so the tour runs again (Help / support). */
export function resetOnboardingTour() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export default GuidedTour
