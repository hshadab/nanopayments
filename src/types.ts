import type { Request } from "express";

// ── Preflight Proof Header ──────────────────────────────────────────────────

/**
 * JSON payload carried in the X-Preflight-Proof HTTP header.
 * Attached by the buyer alongside Payment-Signature so the seller
 * can verify policy compliance before accepting the Nanopayment.
 */
export interface PreflightProofHeader {
  proof_id: string;
  policy_hash?: string;
  claimed_result: "SAT" | "UNSAT";
  timestamp: string;
}

// ── Extended Express Request ────────────────────────────────────────────────

/**
 * Proof verification metadata attached to the request by proof-guard middleware.
 */
export interface ProofVerification {
  proofId: string;
  valid: boolean;
  policyHash: string;
  claimedResult: "SAT" | "UNSAT";
  verifyMs: number;
}

/**
 * Express Request extended with proof verification data.
 * Available after proof-guard middleware runs.
 */
export interface ProofVerifiedRequest extends Request {
  preflightProof?: ProofVerification;
}

