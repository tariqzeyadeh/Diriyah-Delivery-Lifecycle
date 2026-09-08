import { notFound } from 'next/navigation'
import { getDemandReviewDetail } from '@/src/actions/demand-reviews'
import { DemandReviewWorkspace } from '@/components/atlas/demand/DemandReviewWorkspace'
import { parseReviewType } from '@/lib/atlas/demand-reviews'

type ReviewPageProps = {
  params: Promise<{ id: string; type: string }>
}

export default async function DemandReviewPage({ params }: ReviewPageProps) {
  const { id, type } = await params
  const demandId = decodeURIComponent(id)
  const reviewType = parseReviewType(type)
  if (!demandId || !reviewType) notFound()

  const detail = await getDemandReviewDetail(demandId, reviewType)
  if (!detail) notFound()

  const existingAssessment =
    reviewType === 'architecture'
      ? (detail.architecture_assessment_summary ?? '')
      : reviewType === 'security'
        ? (detail.security_requirements ?? '')
        : (detail.latest_comments ?? '')

  return (
    <DemandReviewWorkspace
      demandId={detail.demand_id}
      demandTitle={detail.demand_title}
      masterTraceId={detail.master_trace_id}
      entryRoute={detail.entry_route}
      recordStatus={detail.record_status}
      submittedBy={detail.submitted_by}
      submittedAt={detail.submitted_at?.toISOString() ?? null}
      problem={detail.problem_opportunity_statement}
      currentState={detail.current_state_description}
      scopeIn={detail.scope_in}
      scopeOut={detail.scope_out}
      architectureImpact={detail.architecture_impact}
      securityImpact={detail.security_privacy_impact}
      dataImpact={detail.data_governance_impact}
      reviewType={detail.review_type}
      gateCode={detail.gate_code}
      latestDecision={detail.latest_decision}
      latestComments={detail.latest_comments}
      options={detail.options}
      existingAssessment={existingAssessment}
    />
  )
}
