import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { DecisionEnum } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `You are the Diriyah Strategic Governance Copilot, an expert in portfolio management and budget analysis for the Diriyah platform.

Guidelines:
- Answer in clear, executive-ready language suitable for a CTO briefing.
- Prefer real-time portfolio facts from tools over speculation.
- When asked about portfolio health, budgets, open records, or CTO approvals, call getPortfolioSummary.
- Summarize numbers in SAR with thousands separators; call out risks and next actions briefly.
- If tool data is empty, say so honestly and suggest what the user can check in Diriyah.
- Do not invent Master Trace IDs, demand IDs, or budget figures.`

function createModel() {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '')
  const azureKey = process.env.AZURE_OPENAI_API_KEY
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview'

  // Enterprise path: Azure OpenAI (data residency / private networking)
  if (azureEndpoint && azureKey) {
    const azure = createOpenAI({
      apiKey: azureKey,
      baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
      headers: { 'api-key': azureKey },
      fetch: async (url, init) => {
        const u = new URL(String(url))
        if (!u.searchParams.has('api-version')) {
          u.searchParams.set('api-version', azureApiVersion)
        }
        return fetch(u, init)
      },
    })
    return azure(azureDeployment)
  }

  // POC fallback: standard OpenAI
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  return openai(process.env.OPENAI_MODEL ?? 'gpt-4o')
}

async function getPortfolioSummaryExecute() {
  const [activeMasterTraces, approvedBudgetAgg, pendingCtoTxns, pendingDemands] =
    await Promise.all([
      prisma.masterTrace.count({ where: { is_active: true } }),
      prisma.procurementItem.aggregate({
        _sum: { approved_budget_sar: true },
        where: { is_active: true },
      }),
      prisma.approvalTransaction.findMany({
        where: {
          decision: DecisionEnum.PENDING,
          entity_type: 'DEMAND',
          OR: [
            { approver_role: { contains: 'CTO' } },
            { gate_code: { in: ['G-D1', 'G-1', 'CTO-DEMAND', 'G-DEMAND'] } },
          ],
        },
        select: {
          approval_id: true,
          entity_id: true,
          gate_code: true,
          approver_role: true,
          sla_due_at: true,
          is_overdue: true,
        },
        take: 25,
        orderBy: { created_at: 'desc' },
      }),
      prisma.demand.findMany({
        where: {
          is_active: true,
          OR: [
            { approval_status: DecisionEnum.PENDING },
            {
              record_status: {
                in: ['SUBMITTED', 'PENDING_APPROVAL', 'IN_REVIEW', 'AWAITING_CTO'],
              },
            },
          ],
        },
        select: {
          demand_id: true,
          demand_title: true,
          master_trace_id: true,
          record_status: true,
          approval_status: true,
          indicative_one_time_cost_sar: true,
          submitted_at: true,
        },
        take: 25,
        orderBy: { modified_at: 'desc' },
      }),
    ])

  const pendingIds = new Set(pendingCtoTxns.map((t) => t.entity_id))
  const demandsAwaitingCto = pendingDemands.filter(
    (d) =>
      pendingIds.size === 0 ||
      pendingIds.has(d.demand_id) ||
      d.approval_status === DecisionEnum.PENDING,
  )

  const approvedBudgetSar = Number(
    approvedBudgetAgg._sum.approved_budget_sar ?? 0,
  )

  return {
    activeMasterTraceCount: activeMasterTraces,
    approvedBudgetSar,
    approvedBudgetSarFormatted: new Intl.NumberFormat('en-SA', {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 0,
    }).format(approvedBudgetSar),
    demandsAwaitingCtoApproval: demandsAwaitingCto.map((d) => ({
      demandId: d.demand_id,
      title: d.demand_title,
      masterTraceId: d.master_trace_id,
      recordStatus: d.record_status,
      approvalStatus: d.approval_status,
      indicativeOneTimeCostSar: d.indicative_one_time_cost_sar
        ? Number(d.indicative_one_time_cost_sar)
        : null,
      submittedAt: d.submitted_at?.toISOString() ?? null,
    })),
    pendingCtoApprovalTransactions: pendingCtoTxns.map((t) => ({
      approvalId: t.approval_id,
      demandId: t.entity_id,
      gateCode: t.gate_code,
      approverRole: t.approver_role,
      slaDueAt: t.sla_due_at.toISOString(),
      isOverdue: t.is_overdue,
    })),
    generatedAt: new Date().toISOString(),
  }
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          'AI provider not configured. Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY (+ AZURE_OPENAI_ENDPOINT).',
      },
      { status: 503 },
    )
  }

  const body = await req.json()
  const messages = (body.messages ?? []) as UIMessage[]

  const result = streamText({
    model: createModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getPortfolioSummary: tool({
        description:
          'Fetch a real-time Diriyah portfolio summary from MySQL via Prisma: active MasterTrace count, sum of approved_budget_sar, and demands awaiting CTO approval.',
        inputSchema: z.object({}),
        execute: async () => getPortfolioSummaryExecute(),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
