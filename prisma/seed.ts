import { PrismaClient, EntryRoute, DecisionEnum } from '@prisma/client'

const prisma = new PrismaClient()

const ACTOR = 'seed.atlas'
const FY = 2027

function shr(args: {
  master_trace_id: string
  entity_type: string
  entry_route: EntryRoute
  record_status?: string
  parent_record_id?: string
  is_locked?: boolean
}) {
  return {
    master_trace_id: args.master_trace_id,
    entity_type: args.entity_type,
    entry_route: args.entry_route,
    record_status: args.record_status ?? 'DRAFT',
    parent_record_id: args.parent_record_id ?? null,
    created_by: ACTOR,
    version_number: 1,
    is_active: true,
    is_locked: args.is_locked ?? false,
    fiscal_year: FY,
  }
}

async function wipeScenario() {
  const masterIds = ['TECH-2027-0001', 'TECH-2027-0014']
  const strategyIds = ['STR-2027-0001']
  const demandIds = ['DEM-2027-0001', 'DEM-2027-0014']
  const budgetIds = ['BUD-2027-0001']
  const planIds = ['PLN-2027-0001']
  const itemIds = ['PIT-2027-0001', 'PIT-2027-0002']
  const lineIds = ['BLN-2027-0001', 'BLN-2027-0002', 'BLN-2027-0003']
  const objectiveIds = ['OBJ-2027-0001', 'OBJ-2027-0002']
  const kpiIds = ['KPI-2027-0001', 'KPI-2027-0002', 'KPI-2027-0003']

  // Children first (Restrict FKs)
  await prisma.benefitRealization.deleteMany({
    where: {
      OR: [
        { project_id: { in: ['PRJ-2027-0001'] } },
        { objective_id: { in: objectiveIds } },
        { master_trace_id: { in: masterIds } },
      ],
    },
  })
  await prisma.procurementStatusUpdate.deleteMany({
    where: { procurement_item_id: { in: itemIds } },
  })
  await prisma.projectRegistration.deleteMany({
    where: {
      OR: [{ master_trace_id: { in: masterIds } }, { procurement_item_id: { in: itemIds } }],
    },
  })
  await prisma.procurementItem.deleteMany({
    where: {
      OR: [{ procurement_item_id: { in: itemIds } }, { master_trace_id: { in: masterIds } }],
    },
  })
  await prisma.procurementPlan.deleteMany({
    where: {
      OR: [{ procurement_plan_id: { in: planIds } }, { master_trace_id: { in: masterIds } }],
    },
  })
  await prisma.budgetConsolidation.deleteMany({
    where: { budget_submission_id: { in: budgetIds } },
  })
  await prisma.budgetLine.deleteMany({
    where: {
      OR: [{ budget_line_id: { in: lineIds } }, { budget_submission_id: { in: budgetIds } }],
    },
  })
  await prisma.demandOption.deleteMany({ where: { demand_id: { in: demandIds } } })
  await prisma.demandBenefit.deleteMany({ where: { demand_id: { in: demandIds } } })
  await prisma.demandRaidc.deleteMany({ where: { demand_id: { in: demandIds } } })
  await prisma.kpiPerformanceUpdate.deleteMany({ where: { kpi_id: { in: kpiIds } } })
  await prisma.kpiDefinition.deleteMany({
    where: { OR: [{ kpi_id: { in: kpiIds } }, { objective_id: { in: objectiveIds } }] },
  })
  await prisma.strategicObjective.deleteMany({
    where: { OR: [{ objective_id: { in: objectiveIds } }, { strategy_id: { in: strategyIds } }] },
  })
  await prisma.approvalTransaction.deleteMany({ where: { master_trace_id: { in: masterIds } } })
  await prisma.attachment.deleteMany({ where: { master_trace_id: { in: masterIds } } })
  await prisma.comment.deleteMany({ where: { master_trace_id: { in: masterIds } } })
  await prisma.demand.deleteMany({
    where: { OR: [{ demand_id: { in: demandIds } }, { master_trace_id: { in: masterIds } }] },
  })
  await prisma.budgetSubmission.deleteMany({
    where: {
      OR: [{ budget_submission_id: { in: budgetIds } }, { master_trace_id: { in: masterIds } }],
    },
  })
  await prisma.strategy.deleteMany({
    where: { OR: [{ strategy_id: { in: strategyIds } }, { master_trace_id: { in: masterIds } }] },
  })
  await prisma.masterTrace.deleteMany({ where: { master_trace_id: { in: masterIds } } })
}

async function seed() {
  console.log('Diriyah POC seed — wiping prior scenario IDs…')
  await wipeScenario()

  await prisma.$transaction(
    async (tx) => {
    // ── Master Traces ──────────────────────────────────────────────
    await tx.masterTrace.create({
      data: {
        master_trace_id: 'TECH-2027-0001',
        entry_route: EntryRoute.STRATEGIC,
        created_by: ACTOR,
        is_active: true,
      },
    })
    await tx.masterTrace.create({
      data: {
        master_trace_id: 'TECH-2027-0014',
        entry_route: EntryRoute.ADHOC,
        created_by: ACTOR,
        is_active: true,
      },
    })

    // ── Strategy (TECH-2027-0001) ──────────────────────────────────
    await tx.strategy.create({
      data: {
        strategy_id: 'STR-2027-0001',
        strategy_title: 'Technology Excellence & Digital Enablement Strategy',
        strategy_type: 'Corporate',
        baseline_fiscal_year: FY,
        funding_envelope: 128_500_000,
        currency_code: 'SAR',
        indicative_capex: 72_000_000,
        indicative_opex: 56_500_000,
        review_frequency: 'Quarterly',
        vision_statement:
          'Enable Diriyah with secure, scalable technology platforms that accelerate delivery excellence.',
        mission_statement:
          'Govern demand-to-delivery with transparent controls, measurable outcomes, and accountable ownership.',
        executive_summary:
          'A five-year technology excellence program covering governance platforms, digital services, and operating model uplift.',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'STRATEGY',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'APPROVED',
          is_locked: true,
        }),
        approval_status: 'APPROVED',
      },
    })

    await tx.strategicObjective.create({
      data: {
        objective_id: 'OBJ-2027-0001',
        strategy_id: 'STR-2027-0001',
        objective_name: 'Strengthen enterprise technology governance',
        bsc_perspective: 'INTERNAL',
        objective_priority: 'Critical',
        objective_weight_pct: 55,
        forecast_outcome_status: 'ON_TRACK',
        rag_status: 'GREEN',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'STRATEGIC_OBJECTIVE',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'APPROVED',
          parent_record_id: 'STR-2027-0001',
        }),
      },
    })

    await tx.strategicObjective.create({
      data: {
        objective_id: 'OBJ-2027-0002',
        strategy_id: 'STR-2027-0001',
        objective_name: 'Accelerate digital delivery cycle time',
        bsc_perspective: 'CUSTOMER',
        objective_priority: 'High',
        objective_weight_pct: 45,
        forecast_outcome_status: 'ACHIEVED',
        rag_status: 'GREEN',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'STRATEGIC_OBJECTIVE',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'APPROVED',
          parent_record_id: 'STR-2027-0001',
        }),
      },
    })

    await tx.kpiDefinition.createMany({
      data: [
        {
          kpi_id: 'KPI-2027-0001',
          objective_id: 'OBJ-2027-0001',
          kpi_name: '% of demands with complete governance pack',
          unit_of_measure: '%',
          kpi_weight_pct: 40,
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'KPI_DEFINITION',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'OBJ-2027-0001',
          }),
        },
        {
          kpi_id: 'KPI-2027-0002',
          objective_id: 'OBJ-2027-0001',
          kpi_name: 'Average CTO gate cycle time (days)',
          unit_of_measure: 'days',
          kpi_weight_pct: 30,
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'KPI_DEFINITION',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'OBJ-2027-0001',
          }),
        },
        {
          kpi_id: 'KPI-2027-0003',
          objective_id: 'OBJ-2027-0002',
          kpi_name: 'Median demand-to-commitment lead time',
          unit_of_measure: 'days',
          kpi_weight_pct: 30,
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'KPI_DEFINITION',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'OBJ-2027-0002',
          }),
        },
      ],
    })

    // ── Demand ─────────────────────────────────────────────────────
    await tx.demand.create({
      data: {
        demand_id: 'DEM-2027-0001',
        demand_title: 'Enterprise Technology Governance Platform',
        strategy_id: 'STR-2027-0001',
        urgency: 'High',
        business_impact: 'High',
        strategic_contribution_statement:
          'Delivers the Diriyah pre-initiation control tower for technology portfolio governance.',
        current_state_description:
          'Fragmented spreadsheets and email-based approvals create audit gaps and slow CTO decision cycles.',
        problem_opportunity_statement:
          'Stand up a governed demand-to-budget-to-procurement spine with immutable approval evidence.',
        objective_ids: ['OBJ-2027-0001', 'OBJ-2027-0002'],
        kpi_ids: ['KPI-2027-0001', 'KPI-2027-0002'],
        indicative_one_time_cost_sar: 5_200_000,
        indicative_recurring_cost_sar: 2_600_000,
        tco_sar: 7_800_000,
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'DEMAND',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'FUNDED',
          parent_record_id: 'STR-2027-0001',
        }),
      },
    })

    // Ad-hoc demand on TECH-2027-0014
    await tx.demand.create({
      data: {
        demand_id: 'DEM-2027-0014',
        demand_title: 'Urgent Security Patch Orchestration Tooling',
        ad_hoc_justification:
          'Mandatory cyber-control uplift required by Group Risk within the current quarter; no approved strategy envelope covers this discrete tooling buy.',
        urgency: 'Critical',
        ...shr({
          master_trace_id: 'TECH-2027-0014',
          entity_type: 'DEMAND',
          entry_route: EntryRoute.ADHOC,
          record_status: 'SUBMITTED',
        }),
      },
    })

    // ── Budget (7.8m across 3 lines) ───────────────────────────────
    await tx.budgetSubmission.create({
      data: {
        budget_submission_id: 'BUD-2027-0001',
        strategy_id: 'STR-2027-0001',
        budget_cycle: 'Annual Plan',
        budget_scenario: 'Approved',
        base_currency: 'SAR',
        funding_ceiling_sar: 10_000_000,
        total_requested_sar: 7_800_000,
        total_validated_sar: 7_800_000,
        total_recommended_sar: 7_800_000,
        total_approved_sar: 7_800_000,
        capex_total_sar: 4_600_000,
        opex_total_sar: 3_200_000,
        contingency_total_sar: 600_000,
        tax_total_sar: 0,
        funding_gap_sar: -2_200_000,
        strategic_total_sar: 7_800_000,
        adhoc_total_sar: 0,
        demand_reconciliation_status: 'Pass',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'BUDGET_SUBMISSION',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'APPROVED',
          parent_record_id: 'STR-2027-0001',
          is_locked: true,
        }),
        approval_status: 'APPROVED',
      },
    })

    // 3.2m License OPEX + 2.8m Services CAPEX + 1.8m Services CAPEX = 7.8m
    await tx.budgetLine.createMany({
      data: [
        {
          budget_line_id: 'BLN-2027-0001',
          budget_submission_id: 'BUD-2027-0001',
          demand_id: 'DEM-2027-0001',
          line_description: 'Diriyah platform enterprise licenses (3-year)',
          item_type: 'License',
          cost_classification: 'OPEX',
          cost_category: 'Software',
          quantity: 1,
          unit_cost: 3_200_000,
          gross_amount: 3_200_000,
          contingency_amount: 0,
          requested_total_sar: 3_200_000,
          contingency_basis: 'Included in vendor quote',
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'BUDGET_LINE',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'BUD-2027-0001',
          }),
        },
        {
          budget_line_id: 'BLN-2027-0002',
          budget_submission_id: 'BUD-2027-0001',
          demand_id: 'DEM-2027-0001',
          line_description: 'Implementation & integration services',
          item_type: 'Service',
          cost_classification: 'CAPEX',
          cost_category: 'Professional Services',
          quantity: 1,
          unit_cost: 2_800_000,
          gross_amount: 2_800_000,
          contingency_amount: 280_000,
          requested_total_sar: 2_800_000,
          contingency_basis: '10% delivery contingency',
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'BUDGET_LINE',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'BUD-2027-0001',
          }),
        },
        {
          budget_line_id: 'BLN-2027-0003',
          budget_submission_id: 'BUD-2027-0001',
          demand_id: 'DEM-2027-0001',
          line_description: 'Change, training & hypercare services',
          item_type: 'Service',
          cost_classification: 'CAPEX',
          cost_category: 'Professional Services',
          quantity: 1,
          unit_cost: 1_800_000,
          gross_amount: 1_800_000,
          contingency_amount: 180_000,
          requested_total_sar: 1_800_000,
          contingency_basis: '10% adoption contingency',
          ...shr({
            master_trace_id: 'TECH-2027-0001',
            entity_type: 'BUDGET_LINE',
            entry_route: EntryRoute.STRATEGIC,
            record_status: 'APPROVED',
            parent_record_id: 'BUD-2027-0001',
          }),
        },
      ],
    })

    await tx.budgetConsolidation.create({
      data: {
        consolidation_id: 'CON-2027-0001',
        budget_submission_id: 'BUD-2027-0001',
        included_business_units: ['CTO Office', 'Technology Delivery'],
        included_demand_count: 1,
        excluded_demand_count: 0,
        funding_ceiling_sar: 10_000_000,
        funding_gap_sar: -2_200_000,
        strategic_adhoc_mix: {
          strategic_total_sar: 7_800_000,
          adhoc_total_sar: 0,
          total_requested_sar: 7_800_000,
          total_validated_sar: 7_800_000,
        },
        capex_opex_mix: { capex_total_sar: 4_600_000, opex_total_sar: 3_200_000 },
        demand_line_reconciliation: 'Pass',
      },
    })

    // ── Procurement Plan + 2 Items (Awarded / Delivered) ───────────
    await tx.procurementPlan.create({
      data: {
        procurement_plan_id: 'PLN-2027-0001',
        procurement_plan_title: 'Diriyah Governance Platform Procurement Plan FY2027',
        strategy_id: 'STR-2027-0001',
        budget_submission_id: 'BUD-2027-0001',
        procurement_plan_status: 'ACTIVE',
        planned_procurement_value_sar: 7_800_000,
        approved_funding_available_sar: 7_800_000,
        procurement_item_count: 2,
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'PROCUREMENT_PLAN',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'APPROVED',
          parent_record_id: 'BUD-2027-0001',
        }),
      },
    })

    await tx.procurementItem.create({
      data: {
        procurement_item_id: 'PIT-2027-0001',
        procurement_plan_id: 'PLN-2027-0001',
        budget_line_id: 'BLN-2027-0001',
        demand_id: 'DEM-2027-0001',
        procurement_item_title: 'Diriyah Platform Licenses',
        procurement_item_type: 'License',
        approved_budget_sar: 3_200_000,
        planned_value_sar: 3_200_000,
        actual_commitment_sar: 3_050_000,
        procurement_stage: 'AWARDED',
        procurement_status: 'AWARDED',
        procurement_progress_pct: 70,
        vendor_id: 'VND-DIR-12',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'PROCUREMENT_ITEM',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'ACTIVE',
          parent_record_id: 'PLN-2027-0001',
        }),
      },
    })

    await tx.procurementItem.create({
      data: {
        procurement_item_id: 'PIT-2027-0002',
        procurement_plan_id: 'PLN-2027-0001',
        budget_line_id: 'BLN-2027-0002',
        demand_id: 'DEM-2027-0001',
        procurement_item_title: 'Implementation & Integration Services',
        procurement_item_type: 'Service',
        approved_budget_sar: 2_800_000,
        planned_value_sar: 2_800_000,
        actual_commitment_sar: 2_750_000,
        accepted_value_sar: 2_750_000,
        procurement_stage: 'DELIVERED',
        procurement_status: 'DELIVERED',
        procurement_progress_pct: 100,
        vendor_id: 'VND-DIR-08',
        project_registration_required: true,
        pmo_handoff_readiness: 'READY',
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'PROCUREMENT_ITEM',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'COMPLETE',
          parent_record_id: 'PLN-2027-0001',
        }),
      },
    })

    await tx.procurementStatusUpdate.createMany({
      data: [
        {
          update_id: 'UPD-2027-0001',
          procurement_item_id: 'PIT-2027-0001',
          previous_stage: 'IN_SOURCING',
          new_stage: 'AWARDED',
          progress_pct: 70,
          forecast_final_value_sar: 3_050_000,
          commitment_value_sar: 3_050_000,
          update_validation_status: 'ACCEPTED',
          planned_milestone_date: new Date('2027-02-01'),
          actual_milestone_date: new Date('2027-03-15'),
        },
        {
          update_id: 'UPD-2027-0002',
          procurement_item_id: 'PIT-2027-0002',
          previous_stage: 'AWARDED',
          new_stage: 'DELIVERED',
          progress_pct: 100,
          forecast_final_value_sar: 2_750_000,
          commitment_value_sar: 2_750_000,
          update_validation_status: 'ACCEPTED',
          planned_milestone_date: new Date('2027-05-01'),
          actual_milestone_date: new Date('2027-06-01'),
        },
      ],
    })

    await tx.projectRegistration.create({
      data: {
        project_id: 'PRJ-2027-0001',
        project_name: 'Diriyah Implementation Programme',
        procurement_item_id: 'PIT-2027-0002',
        demand_id: 'DEM-2027-0001',
        budget_line_id: 'BLN-2027-0002',
        strategy_id: 'STR-2027-0001',
        project_manager_user_id: 'pm.atlas',
        delivery_approach: 'Agile',
        planned_start_date: new Date('2027-06-15'),
        planned_end_date: new Date('2028-03-31'),
        approved_project_budget_sar: 2_800_000,
        check_approved_demand: true,
        check_approved_budget: true,
        check_procurement_complete: true,
        ...shr({
          master_trace_id: 'TECH-2027-0001',
          entity_type: 'PROJECT_REGISTRATION',
          entry_route: EntryRoute.STRATEGIC,
          record_status: 'REGISTERED',
          parent_record_id: 'PIT-2027-0002',
        }),
      },
    })

    await tx.benefitRealization.createMany({
      data: [
        {
          realization_id: 'BEN-2027-0001',
          project_id: 'PRJ-2027-0001',
          objective_id: 'OBJ-2027-0001',
          master_trace_id: 'TECH-2027-0001',
          benefit_name: 'Cycle-time reduction (approval days)',
          benefit_unit: 'days',
          baseline_value: 45,
          target_value: 18,
          realized_value: 22,
          measurement_date: new Date('2028-01-15'),
          horizon_months: 12,
          confidence_pct: 80,
          commentary: '12-month post go-live measurement',
          created_by: ACTOR,
        },
        {
          realization_id: 'BEN-2027-0002',
          project_id: 'PRJ-2027-0001',
          objective_id: 'OBJ-2027-0002',
          master_trace_id: 'TECH-2027-0001',
          benefit_name: 'Governance cost avoidance',
          benefit_unit: 'SAR',
          baseline_value: 0,
          target_value: 4_500_000,
          realized_value: 3_100_000,
          measurement_date: new Date('2028-06-30'),
          horizon_months: 24,
          confidence_pct: 70,
          commentary: 'Partial realization at 18 months',
          created_by: ACTOR,
        },
      ],
    })

    // Pending approval for SLA donut realism
    const now = new Date()
    await tx.approvalTransaction.create({
      data: {
        approval_id: 'APR-2027-0001',
        entity_type: 'DEMAND',
        entity_id: 'DEM-2027-0014',
        entity_version: 1,
        version_number: 1,
        version_hash: 'seed-pending-hash-adhoc-demand',
        gate_code: 'G-D1',
        approval_sequence: 1,
        approver_role: 'CTO',
        approver_user_id: 'mohammed.alnuaimi',
        authority_basis: 'CTO Ad-hoc Demand Gate',
        assigned_at: now,
        sla_due_at: new Date(now.getTime() + 36 * 60 * 60 * 1000),
        decision: DecisionEnum.PENDING,
        is_overdue: false,
        created_by: ACTOR,
        master_trace_id: 'TECH-2027-0014',
        is_locked: true,
      },
    })
    },
    {
      // Aiven (and other remote MySQL) is slower than local; default 5s times out mid-seed.
      maxWait: 15_000,
      timeout: 60_000,
    },
  )

  console.log('Diriyah POC seed complete.')
  console.log('  Master: TECH-2027-0001 (STRATEGIC), TECH-2027-0014 (ADHOC)')
  console.log(
    '  Strategy: STR-2027-0001 · Demand: DEM-2027-0001 · Budget: BUD-2027-0001 (SAR 7.8m)',
  )
  console.log('  Procurement: PIT-2027-0001 (AWARDED), PIT-2027-0002 (DELIVERED)')
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
