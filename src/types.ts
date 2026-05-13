import type { Request } from "express";

export interface PaymentIntent {
  amount: string;       // e.g. "0.01"
  recipient: string;    // seller address
  vendor: string;       // vendor name
  purpose: string;      // what the payment is for
  resourceUrl: string;  // the x402 endpoint to pay
}


export type CheckResult = "SAT" | "UNSAT";

/** Fields the Preflight solver extracts from a natural-language action. */
export interface ExtractedFields {
  transferAmount?: number;
  recipientInRegistry?: boolean;
  urgencyTacticDetected?: boolean;
  emotionalAppealDetected?: boolean;
  falseAuthorityClaim?: boolean;
  overrideAttempt?: boolean;
  serviceCategory?: string;
  [key: string]: unknown;
}

export interface CheckResponse {
  result: CheckResult;
  blocked: boolean;
  reason: string;
  violated_rule?: number;
  proof_id?: string;
  proof?: string;
  check_id: string;
  /** Solver-extracted fields used to evaluate the policy. */
  extracted?: ExtractedFields;
  z3_result?: CheckResult | string;
  ar_result?: CheckResult | string;
  llm_result?: CheckResult | string;
}

export interface ProofStatusResponse {
  proof_id: string;
  policy_id: string;
  policy_hash: string;
  result: "SAT" | "UNSAT";
  valid: boolean;
  used: boolean;
  trace_length: number;
  created_at: string;
  verify_ms: number;
}

export interface VerifyProofResponse {
  valid: boolean;
  policy_hash: string;
  claimed_result: "SAT" | "UNSAT";
  verify_ms: number;
  used: boolean;
}

export interface PolicyCompileEvent {
  type: "progress" | "done" | "error";
  status?: string;
  step?: string;
  message?: string;
  policy_id?: string;
  scenario_count?: number;
}


export interface VerifiedPayOptions {
  proofId: string;
  policyHash?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface VerifiedPayResult<T = Record<string, unknown>> {
  data: T;
  amount: bigint;
  formattedAmount: string;
  transaction: string;
  status: number;
  proofHeader: PreflightProofHeader;
}

export interface VerifiedPayFlowResult {
  allowed: boolean;
  payment?: VerifiedPayResult;
  check: CheckResponse;
  proofId?: string;
  action: string;
  preflightMs: number;
  paymentMs?: number;
}


export interface PreflightProofHeader {
  proof_id: string;
  policy_hash?: string;
  claimed_result: "SAT" | "UNSAT";
  timestamp: string;
}


export interface ProofVerification {
  proofId: string;
  valid: boolean;
  policyHash: string;
  claimedResult: "SAT" | "UNSAT";
  verifyMs: number;
}

export interface ProofVerifiedRequest extends Request {
  preflightProof?: ProofVerification;
}

