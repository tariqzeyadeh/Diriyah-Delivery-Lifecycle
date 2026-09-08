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
  test.describe('AT-001 — Strategy draft / Master ID / no premature demand-budget', () => {
    test('Strategy draft is created; Master ID generated; demand/budget do not open before approval', async ({
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

      // Assert — Before CTO approval, demand/budget workspaces for a NEW draft spine stay gated
      // TODO: after Gate 1 wiring, navigate to child demand/budget IDs and expect blocked/redirect
      // await page.goto('/demand/DEM-DRAFT-PENDING')
      // await expect(page.getByText(/awaiting strategy approval/i)).toBeVisible()
      // await page.goto('/budget/BUD-DRAFT-PENDING/lines')
      // await expect(page.getByText(/awaiting strategy approval/i)).toBeVisible()

      // Seeded approved spine remains reachable (negative control for post-approval path)
      await page.goto('/demand/DEM-2027-0001')
      await expect(page.getByText('Demand Workspace')).toBeVisible()
    })
  })

  test.describe('AT-002 — Ad-hoc demand bypass', () => {
    test('Demand opens directly (Ad-hoc route); strategy fields hidden; ad-hoc justification mandatory', async ({
      page,
    }) => {
      await page.goto('/demand/DEM-2027-0014?route=ADHOC')
      await switchPersona(page, 'persona-ahmed.khalid')

      // Assert — Ad-hoc entry route badge / justification section
      await expect(page.getByText('ADHOC')).toBeVisible()
      await expect(page.getByText(/Ad-Hoc Justification/i)).toBeVisible()

      // Assert — Strategic Alignment (Objectives/KPI mapping) is hidden for ADHOC (BR-005)
      await expect(page.getByText('Strategic Alignment')).toHaveCount(0)

      // Assert — Save blocked until justification is provided (Business Owner can edit)
      await page.getByPlaceholder(/business need/i).fill('Executive summary for ad-hoc tooling.')
      await page.getByPlaceholder(/current-state problem/i).fill('Urgent patch orchestration gap.')
      await page.getByPlaceholder(/Demand Title|Enterprise Identity/i).fill('Ad-hoc tooling demand')

      const save = page.getByRole('button', { name: /Save Demand Case/i })
      // Without justification (>=20 chars) save should stay disabled
      await expect(save).toBeDisabled()

      await page
        .getByPlaceholder(/bypasses strategic alignment/i)
        .fill(
          'Mandatory Group Risk control uplift required this quarter without strategy envelope.',
        )
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
