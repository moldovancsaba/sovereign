/**
 * TypeScript definitions for the Sovereign DAG engine state.
 * These match the Pydantic models in apps/sovereign/scripts/sovereign_dag/models.py
 */

export type TaskType = 
  | "internal_summary"
  | "external_communication"
  | "decision_support"
  | "technical_artifact";

export type RiskTier = "R1" | "R2" | "R3" | "R4";

export type WorkflowStatus = 
  | "in_progress"
  | "awaiting_human"
  | "completed"
  | "failed";

export interface TaskProfile {
  intent_raw: string;
  task_type: TaskType;
  risk_tier: RiskTier;
}

export interface ExecutionState {
  current_node: string;
  retry_count: number;
  status: WorkflowStatus;
  callback_token?: string;
  human_approved: boolean;
}

export interface DraftPayload {
  content?: string;
  feedback_history: string[];
}

export interface ScoreVector {
  grounding: number;
  completeness: number;
  policy: number;
  weighted_sum?: number;
}

export interface SovereignStatePayload {
  workflow_id: string;
  task_profile: TaskProfile;
  execution_state: ExecutionState;
  context_array: string[];
  draft_payload?: DraftPayload;
  score_vector?: ScoreVector;
  node_results: Record<string, any>;
}

// Helper to determine if a task is in a terminal state
export function isTerminal(status: string): boolean {
  return ["DONE", "FAILED", "CANCELED", "DEAD_LETTER"].includes(status);
}

// Helper to determine if a task is awaiting human intervention
export function isAwaitingHuman(status: string): boolean {
  return status === "MANUAL_REQUIRED";
}
