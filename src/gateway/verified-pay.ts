/**
 * Verified Pay — combines Preflight policy check with proof-injected
 * x402 Nanopayment in a single function call.
 *
 * Flow:
 *   1. Describe payment intent in natural language
 *   2. Preflight checkAction() → SAT/UNSAT + proof_id
 *   3. If SAT → verifiedPay() with X-Preflight-Proof header
 *   4. If UNSAT → return block info with proof_id
 */
import { PreflightClient, type CheckResponse } from "../preflight/client.js";
import { describePaymentAction } from "../preflight/policy.js";
import { verifiedPay, type VerifiedPayResult } from "./verified-client.js";
import { config } from "../config.js";

export interface PaymentIntent {
  amount: string;
  recipient: string;
  vendor: string;
  purpose: string;
  resourceUrl: string;
}

export interface VerifiedPayFlowResult {
  /** Whether the payment was allowed and executed */
  allowed: boolean;
  /** Payment result (only present if allowed) */
  payment?: VerifiedPayResult;
  /** Preflight check response */
  check: CheckResponse;
  /** Proof ID for independent verification */
  proofId?: string;
  /** The natural language action that was verified */
  action: string;
  /** Time spent on Preflight verification */
  preflightMs: number;
  /** Time spent on x402 payment (only present if allowed) */
  paymentMs?: number;
}

/**
 * Verify a payment intent with Preflight and, if approved, execute
 * the x402 Nanopayment with the proof attached.
 */
export async function verifyAndPay(
  intent: PaymentIntent,
  policyId?: string
): Promise<VerifiedPayFlowResult> {
  const client = new PreflightClient();
  const policy = policyId || config.icmePolicyId;

  // Describe the payment in natural language for Preflight
  const action = describePaymentAction({
    amount: intent.amount,
    recipient: intent.recipient,
    vendor: intent.vendor,
    purpose: intent.purpose,
  });

  // Preflight formal verification
  const preflightStart = Date.now();
  const check = await client.checkAction(policy, action);
  const preflightMs = Date.now() - preflightStart;

  const allowed = check.result === "SAT" && !check.blocked;

  if (!allowed) {
    return {
      allowed: false,
      check,
      proofId: check.proof_id,
      action,
      preflightMs,
    };
  }

  // SAT — execute payment with proof attached
  const paymentStart = Date.now();

  // Get proof status to retrieve policy_hash for the header
  let policyHash: string | undefined;
  if (check.proof_id) {
    try {
      const proofStatus = await client.getProofStatus(check.proof_id);
      policyHash = proofStatus.policy_hash;
    } catch {
      // Non-critical — proceed without policy_hash in header
    }
  }

  const payment = await verifiedPay(intent.resourceUrl, {
    proofId: check.proof_id!,
    policyHash,
  });
  const paymentMs = Date.now() - paymentStart;

  return {
    allowed: true,
    payment,
    check,
    proofId: check.proof_id,
    action,
    preflightMs,
    paymentMs,
  };
}
