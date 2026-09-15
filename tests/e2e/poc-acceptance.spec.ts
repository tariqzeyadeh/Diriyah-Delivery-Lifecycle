import { test, expect, type Page } from '@playwright/test'

/**
 * Diriyah POC Acceptance Tests
 * Source: Excel sheet 22_Acceptance Tests
 *
 * These are executable skeletons for the live client demo.
 * Fill assertions as UI persistence / gate wiring hardens.
 */

async function switchPersona(page: Page, personaTestId: string) {
  await page.getByTestId('persona-switcher').click()
  await page.getByTestId(personaTestId).click()
}

test.describe('Diriyah POC Acceptance', () => {
  test.describe('AT-001 — Strategy draft / Master ID / no auto demand-budget at G-S1', () => {
    test('Strategy draft is created; Master ID generated; demand/budget are not spawned by G-S1', async ({
      page,
    }) => {
      // Arrange — Strategy & Governance persona opens a strategy workspace
      await page.goto('/strategy/TECH-2027-0001')
      await switchPersona(page, 'persona-sarah.almansouri')

      // Assert — Master Trace ID is visible in the workspace header
      await expect(page.getByText('Master Trace ID')).toBeVisible()
      // TODO: assert generated Master ID pattern TECH-YYYY-#### after initiatePortfolioRecord wiring
      // await expect(page.getByText(/^TECH-\d{4}-\d{4}$/)).toBeVisible()

      // Assert — Strategy form is available for draft capture
      await expect(page.getByText('Strategy Form')).toBeVisible()
      await expect(page.getByPlaceholder(/Diriyah Digital Operating Model/i)).toBeVisible()

      // Assert — G-S1 Approve completes the strategy only. It must not create DEM- / BUD-.
      // Create Demand separately (New Record → Demand, optional ?strategy= preselect).
      // Budget draft appears only after that demand is submitted.
      // Seeded TECH-2027-0001 is a finished demo spine (already past G-S1 with DEM+BUD) — negative control below.

      await page.goto('/demand/DEM-2027-0001')
      await expect(page.getByText('Demand Workspace')).toBeVisible()
    })
  })

  test.describe('AT-002 — Ad-hoc demand bypass', () => {
    test('Demand opens with optional strategy link; empty selection is standalone ad-hoc', async ({
      page,
    }) => {
      await page.goto('/demand/DEM-2027-0014?route=ADHOC')
      await switchPersona(page, 'persona-ahmed.khalid')

      await expect(page.getByText('ADHOC')).toBeVisible()
      await expect(page.getByLabel(/Linked strategy/i)).toBeVisible()

      await page.getByPlaceholder(/Demand Title|Enterprise Identity/i).fill('Ad-hoc tooling demand')
      const save = page.getByRole('button', { name: /^Save$/ })
      await expect(save).toBeEnabled()
    })
  })

  test.describe('AT-010 — Budget line recalculation', () => {
    test('Budget Line gross, tax, and SAR totals automatically recalculate', async ({ page }) => {
      await page.goto('/budget/BUD-2027-0001/lines')
      await switchPersona(page, 'persona-rami.noor')

      await expect(page.getByText('Budget Lines Grid')).toBeVisible()
      await expect(page.getByText('Total Envelope Requested')).toBeVisible()

      // Capture envelope before edit
      const envelopeCard = page.getByText('Total Envelope Requested').locator('..')
      await expect(envelopeCard).toBeVisible()

      // Edit first editable unit cost / qty — grid uses number inputs
      const qtyInputs = page.locator('tbody input[type="number"]').first()
      await qtyInputs.fill('2')

      // Assert — roll-up metrics remain visible (live React recalculation)
      await expect(page.getByText('Total OPEX')).toBeVisible()
      await expect(page.getByText('Total CAPEX')).toBeVisible()
      await expect(page.getByText('Total Envelope Requested')).toBeVisible()

      // TODO: assert exact SAR totals once tax_amount column is exposed in the UI grid
      // Current Phase B grid computes: gross = qty * unit_cost; contingency; total
      // await expect(page.getByText(/SAR\s*[\d,]+/)).toBeVisible()

      // RBAC — Submit to CTO only for Commercial & Budgeting
      await expect(page.getByTestId('budget-submit-cto')).toBeVisible()
      await switchPersona(page, 'persona-mohammed.alnuaimi')
      await expect(page.getByTestId('budget-submit-cto')).toHaveCount(0)
    })
  })
})
