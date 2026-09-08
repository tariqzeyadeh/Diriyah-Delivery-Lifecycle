/**
 * Diriyah — Legacy spreadsheet → Prisma migration
 *
 * Usage:
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/migrate-legacy-data.ts [path/to/legacy_demands.csv]
 *
 * Default CSV: scripts/fixtures/legacy_demands.csv
 *
 * On validation / write failure: rolls back the transaction and writes migration-errors.json
 */

import { createReadStream, writeFileSync } from 'fs'
import { resolve } from 'path'
import { randomInt } from 'crypto'
import { parse } from 'csv-parse'
import { EntryRoute, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ALLOWED_DEMAND_STATUSES = new Set([
  'DRAFT',
  'SUBMITTED',
  'UNDER_VALIDATION',
  'VALIDATED',
  'CONDITIONAL',
  'RETURNED',
  'INCLUDED',
  'FUNDED',
  'DEFERRED',
  'NOT_FUNDABLE',
  'CANCELLED',
])

type LegacyDemandRow = {
  legacy_id?: string
  demand_title?: string
  entry_route?: string
  record_status?: string
  executive_summary?: string
  current_state_problem?: string
  requesting_department?: string
  business_owner?: string
  funding_requested_sar?: string
  capex_sar?: string
  opex_sar?: string
  fiscal_year?: string
  created_by?: string
}

type MigrationError = {
  row_number: number
  legacy_id?: string
  field?: string
  message: string
  raw?: Record<string, string | undefined>
}

type ValidatedRow = {
  rowNumber: number
  legacyId: string
  demandTitle: string
  entryRoute: EntryRoute
  recordStatus: string
  executiveSummary: string
  currentStateProblem: string
  requestingDepartment?: string
  businessOwner?: string
  fundingRequestedSar: number | null
  capexSar: number | null
  opexSar: number | null
  fiscalYear: number | null
  createdBy: string
  hasFunding: boolean
}

function yearToken(d = new Date()): number {
  return d.getFullYear()
}

function generateId(prefix: string): string {
  return `${prefix}-${yearToken()}-${String(randomInt(1000, 10000))}`
}

function parseOptionalNumber(
  value: string | undefined,
  rowNumber: number,
  field: string,
): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(String(value).replace(/,/g, '').trim())
  if (Number.isNaN(n)) {
    throw Object.assign(new Error(`Invalid number for ${field}`), { rowNumber, field })
  }
  return n
}

function requireText(value: string | undefined, field: string, rowNumber: number, min = 1): string {
  const v = (value ?? '').trim()
  if (v.length < min) {
    throw Object.assign(new Error(`Missing or too short mandatory text: ${field}`), {
      rowNumber,
      field,
    })
  }
  return v
}

function validateRow(raw: LegacyDemandRow, rowNumber: number): ValidatedRow {
  const demandTitle = requireText(raw.demand_title, 'demand_title', rowNumber, 3)
  const executiveSummary = requireText(raw.executive_summary, 'executive_summary', rowNumber, 10)
  const currentStateProblem = requireText(
    raw.current_state_problem,
    'current_state_problem',
    rowNumber,
    10,
  )
  const legacyId = requireText(raw.legacy_id, 'legacy_id', rowNumber, 1)
  const createdBy = (raw.created_by?.trim() || 'legacy.migration').slice(0, 128)

  const routeRaw = (raw.entry_route ?? '').trim().toUpperCase()
  if (routeRaw !== 'STRATEGIC' && routeRaw !== 'ADHOC') {
    throw Object.assign(new Error(`Invalid entry_route (expected STRATEGIC|ADHOC)`), {
      rowNumber,
      field: 'entry_route',
    })
  }
  const entryRoute = routeRaw === 'ADHOC' ? EntryRoute.ADHOC : EntryRoute.STRATEGIC

  const recordStatus = (raw.record_status ?? 'DRAFT').trim().toUpperCase()
  if (!ALLOWED_DEMAND_STATUSES.has(recordStatus)) {
    throw Object.assign(new Error(`Invalid record_status enum value: ${recordStatus}`), {
      rowNumber,
      field: 'record_status',
    })
  }

  if (entryRoute === EntryRoute.ADHOC && executiveSummary.length < 20) {
    // Ad-hoc rows reuse executive_summary as justification proxy when migrating
    throw Object.assign(
      new Error('ADHOC rows require executive_summary (>=20 chars) as justification'),
      {
        rowNumber,
        field: 'executive_summary',
      },
    )
  }

  const fundingRequestedSar = parseOptionalNumber(
    raw.funding_requested_sar,
    rowNumber,
    'funding_requested_sar',
  )
  const capexSar = parseOptionalNumber(raw.capex_sar, rowNumber, 'capex_sar')
  const opexSar = parseOptionalNumber(raw.opex_sar, rowNumber, 'opex_sar')
  const fiscalYear = parseOptionalNumber(raw.fiscal_year, rowNumber, 'fiscal_year')

  const hasFunding = fundingRequestedSar !== null || capexSar !== null || opexSar !== null

  return {
    rowNumber,
    legacyId,
    demandTitle: demandTitle.slice(0, 255),
    entryRoute,
    recordStatus,
    executiveSummary,
    currentStateProblem,
    requestingDepartment: raw.requesting_department?.trim() || undefined,
    businessOwner: raw.business_owner?.trim() || undefined,
    fundingRequestedSar,
    capexSar,
    opexSar,
    fiscalYear: fiscalYear !== null ? Math.trunc(fiscalYear) : null,
    createdBy,
    hasFunding,
  }
}

async function readCsv(filePath: string): Promise<LegacyDemandRow[]> {
  const rows: LegacyDemandRow[] = []
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }),
  )

  for await (const record of parser) {
    rows.push(record as LegacyDemandRow)
  }
  return rows
}

function writeErrors(errors: MigrationError[], outPath: string) {
  writeFileSync(
    outPath,
    JSON.stringify({ generated_at: new Date().toISOString(), errors }, null, 2),
  )
  console.error(`Wrote ${errors.length} error(s) → ${outPath}`)
}

async function main() {
  const csvPath = resolve(process.cwd(), process.argv[2] || 'scripts/fixtures/legacy_demands.csv')
  const errorsPath = resolve(process.cwd(), 'migration-errors.json')

  console.log(`Reading legacy CSV: ${csvPath}`)
  const rawRows = await readCsv(csvPath)
  if (rawRows.length === 0) {
    writeErrors([{ row_number: 0, message: 'CSV contained no data rows' }], errorsPath)
    process.exitCode = 1
    return
  }

  const errors: MigrationError[] = []
  const validated: ValidatedRow[] = []

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2 // header is row 1
    try {
      validated.push(validateRow(raw, rowNumber))
    } catch (err) {
      const e = err as Error & { rowNumber?: number; field?: string }
      errors.push({
        row_number: e.rowNumber ?? rowNumber,
        legacy_id: raw.legacy_id,
        field: e.field,
        message: e.message,
        raw: raw as Record<string, string | undefined>,
      })
    }
  })

  if (errors.length > 0) {
    writeErrors(errors, errorsPath)
    console.error('Validation failed — no database changes were applied (pre-transaction guard).')
    process.exitCode = 1
    return
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{
        row_number: number
        legacy_id: string
        master_trace_id: string
        demand_id: string
        budget_submission_id?: string
      }> = []

      for (const row of validated) {
        const master_trace_id = generateId('TECH')
        const demand_id = generateId('DEM')

        await tx.masterTrace.create({
          data: {
            master_trace_id,
            entry_route: row.entryRoute,
            created_by: row.createdBy,
            is_active: true,
          },
        })

        await tx.demand.create({
          data: {
            demand_id,
            demand_title: row.demandTitle,
            master_trace_id,
            entity_type: 'DEMAND',
            entry_route: row.entryRoute,
            record_status: row.recordStatus,
            problem_opportunity_statement: row.executiveSummary,
            current_state_description: row.currentStateProblem,
            ad_hoc_justification: row.entryRoute === EntryRoute.ADHOC ? row.executiveSummary : null,
            requesting_department_id: row.requestingDepartment?.slice(0, 255),
            business_owner_user_id: row.businessOwner?.slice(0, 128),
            indicative_one_time_cost_sar: row.capexSar,
            indicative_recurring_cost_sar: row.opexSar,
            tco_sar: row.fundingRequestedSar,
            fiscal_year: row.fiscalYear ?? undefined,
            source_system: 'LEGACY_CSV',
            external_system_key: row.legacyId.slice(0, 255),
            created_by: row.createdBy,
            version_number: 1,
            is_active: true,
            is_locked: false,
          },
        })

        let budget_submission_id: string | undefined
        if (row.hasFunding) {
          budget_submission_id = generateId('BUD')
          const total = row.fundingRequestedSar ?? (row.capexSar ?? 0) + (row.opexSar ?? 0)

          await tx.budgetSubmission.create({
            data: {
              budget_submission_id,
              master_trace_id,
              entity_type: 'BUDGET_SUBMISSION',
              entry_route: row.entryRoute,
              record_status: 'DRAFT',
              parent_record_id: demand_id,
              budget_cycle: 'Legacy Import',
              budget_scenario: 'Requested',
              base_currency: 'SAR',
              total_requested_sar: total,
              capex_total_sar: row.capexSar,
              opex_total_sar: row.opexSar,
              fiscal_year: row.fiscalYear ?? undefined,
              source_system: 'LEGACY_CSV',
              external_system_key: row.legacyId.slice(0, 255),
              created_by: row.createdBy,
              version_number: 1,
              is_active: true,
              is_locked: false,
            },
          })
        }

        results.push({
          row_number: row.rowNumber,
          legacy_id: row.legacyId,
          master_trace_id,
          demand_id,
          budget_submission_id,
        })
      }

      return results
    })

    console.log(`Migrated ${created.length} legacy demand(s) successfully.`)
    console.log(JSON.stringify(created, null, 2))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeErrors(
      [
        {
          row_number: -1,
          message: `Transaction rolled back: ${message}`,
        },
      ],
      errorsPath,
    )
    console.error('Migration transaction failed and was rolled back.')
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
