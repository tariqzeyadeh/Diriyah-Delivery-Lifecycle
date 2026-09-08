/**
 * Diriyah — Grafana k6 load test
 *
 * Scenario: ramp to 500 concurrent portfolio managers hitting
 * executive dashboard + budget lines APIs.
 *
 * Usage:
 *   k6 run load-testing/dashboards.js
 *   k6 run -e BASE_URL=https://atlas.example.com -e LOAD_TEST_TOKEN=secret load-testing/dashboards.js
 *
 * Requires: Grafana k6 installed (https://k6.io/docs/get-started/installation/)
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const TOKEN = __ENV.LOAD_TEST_TOKEN || 'atlas-load-test-token'
const BUDGET_ID = __ENV.BUDGET_SUBMISSION_ID || 'BUD-2027-0001'

const errorRate = new Rate('atlas_errors')
const onePagerDuration = new Trend('atlas_one_pager_ms', true)
const budgetLinesDuration = new Trend('atlas_budget_lines_ms', true)

export const options = {
  scenarios: {
    portfolio_managers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 }, // gradual ramp-up
        { duration: '3m', target: 500 }, // sustained load
        { duration: '1m', target: 0 }, // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate==0'],
    atlas_errors: ['rate==0'],
    checks: ['rate==1'],
  },
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
    'User-Agent': 'atlas-k6-load-test/1.0',
  }
}

export default function () {
  const headers = authHeaders()

  const onePager = http.get(`${BASE_URL}/api/reports/one-pager`, {
    headers,
    tags: { endpoint: 'one-pager' },
  })
  onePagerDuration.add(onePager.timings.duration)

  const onePagerOk = check(onePager, {
    'one-pager status 200': (r) => r.status === 200,
    'one-pager body ok': (r) => {
      try {
        const body = r.json()
        return body && body.ok === true
      } catch {
        return false
      }
    },
  })
  errorRate.add(!onePagerOk)

  const budget = http.get(
    `${BASE_URL}/api/budget/lines?id=${encodeURIComponent(BUDGET_ID)}`,
    {
      headers,
      tags: { endpoint: 'budget-lines' },
    },
  )
  budgetLinesDuration.add(budget.timings.duration)

  const budgetOk = check(budget, {
    'budget-lines status 200': (r) => r.status === 200,
    'budget-lines body ok': (r) => {
      try {
        const body = r.json()
        return body && body.ok === true
      } catch {
        return false
      }
    },
  })
  errorRate.add(!budgetOk)

  // Think time — portfolio managers review results briefly
  sleep(0.5)
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values['p(95)']
  const failed = data.metrics.http_req_failed?.values.rate
  return {
    stdout: [
      '',
      '═══════════════════════════════════════════',
      ' Diriyah — Load Test Summary',
      '═══════════════════════════════════════════',
      ` p95 http_req_duration: ${p95 != null ? p95.toFixed(1) + ' ms' : 'n/a'} (threshold < 800)`,
      ` http_req_failed rate:  ${failed != null ? (failed * 100).toFixed(3) + '%' : 'n/a'} (threshold == 0%)`,
      '═══════════════════════════════════════════',
      '',
    ].join('\n'),
  }
}
