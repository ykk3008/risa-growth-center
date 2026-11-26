// Source tables mirror the provided Sponsor Dataset sheets (snake_case, verbatim fields).
// Operational tables (campaign_plan, payments, tasks, audit_log) are app-owned; simulated rows are flagged.

export type Stage =
  | "prospecting" | "contacted" | "proposal_sent" | "negotiating"
  | "partner_confirmed" | "lost" | "withdrawn";

export const OPEN_STAGES: Stage[] = ["prospecting", "contacted", "proposal_sent", "negotiating"];
export const STAGE_ORDER: Stage[] = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed"];
export const QUAL_STATUSES = ["unreviewed", "engaged", "qualified", "unqualified", "dormant"] as const;
export type QualStatus = (typeof QUAL_STATUSES)[number];

export interface EventRow { event_name: string; history_start: string; history_end: string; event_starts_at: string; event_ends_at: string; timezone: string; currency: string; fictional: boolean }
export interface TargetRow { effective_at: string; qualified_brands_goal: number; confirmed_partnerships_goal: number; target_version: string }
export interface Brand { brand_name: string; industry: string; owner_name: string; created_at: string; brand_id: string; owner_id: string }
export interface Contact { contact_name: string; job_title: string; brand_name: string; created_at: string; contact_id: string; brand_id: string }
export interface Campaign { campaign_name: string; channel: string; objective: string; audience: string; owner_name: string; planned_start_at: string; planned_end_at: string; created_at: string; sponsor_campaign_id: string; owner_id: string }
export interface Interaction { brand_name: string; contact_name: string; campaign_name: string; channel: string; event_type: string; outcome: string; summary: string; occurred_at: string; interaction_id: string; attempt_id: string; origin_interaction_id: string | null; brand_id: string; contact_id: string; sponsor_campaign_id: string; owner_id: string }
export interface Qualification { brand_name: string; qualification_status: QualStatus; reason: string; source_campaign_name: string; effective_at: string; history_id: string; brand_id: string; sponsor_campaign_id: string; source?: string }
export interface Opportunity { opportunity_name: string; brand_name: string; primary_contact_name: string; originating_campaign_name: string; support_type: "cash" | "in_kind"; created_at: string; opportunity_id: string; brand_id: string; primary_contact_id: string; sponsor_campaign_id: string }
export interface OppHistory { opportunity_name: string; brand_name: string; stage: Stage; proposed_value_inr: number; confirmed_value_inr: number; owner_name: string; effective_at: string; history_id: string; opportunity_id: string; brand_id: string; owner_id: string; source?: string; note?: string | null }
export interface Activation { brand_name: string; opportunity_name: string; attendee_campaign_name: string; activation_note: string; linked_at: string; activation_id: string; brand_id: string; opportunity_id: string; attendee_campaign_id: string }
export interface CampaignPlan { sponsor_campaign_id: string; budget_inr: number; planned_hours: number; notes: string; is_simulated: boolean; updated_at: string }
export interface Payment { payment_id: string; opportunity_id: string; brand_id: string; installment: string; amount_inr: number; tds_inr: number; invoiced_at: string; due_at: string; received_at: string | null; net_received_inr: number; utr: string; is_simulated: boolean; voided_at?: string | null }
export interface Task { task_id: string; title: string; description: string; owner_id: string | null; due_date: string | null; status: "todo" | "in_progress" | "blocked" | "done"; priority: "low" | "medium" | "high"; brand_id: string | null; opportunity_id: string | null; sponsor_campaign_id: string | null; source: "manual" | "copilot"; created_at: string; updated_at: string }
export interface AuditRow { audit_id: string; at: string; actor: string; action: string; entity: string; entity_id: string; detail: string }

export interface DB {
  readme: { topic: string; description: string }[];
  field_guide: { source_table: string; field: string; data_type: string; meaning: string }[];
  event: EventRow[];
  targets: TargetRow[];
  brands: Brand[];
  contacts: Contact[];
  campaigns: Campaign[];
  interactions: Interaction[];
  qualification: Qualification[];
  opportunities: Opportunity[];
  opp_history: OppHistory[];
  activations: Activation[];
  campaign_plan: CampaignPlan[];
  payments: Payment[];
  tasks: Task[];
  audit_log: AuditRow[];
}

export type TableName = keyof DB;
