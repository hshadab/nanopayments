import { PreflightClient, type CheckResponse } from "./client.js";
import { describePaymentAction } from "./policy.js";
import { config } from "../config.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaymentIntent {
  amount: string;       // e.g. "0.01"
  recipient: string;    // seller address
  vendor: string;       // vendor name
  purpose: string;      // what the payment is for
  resourceUrl: string;  // the x402 endpoint to pay
}

export interface VerificationResult {
  allowed: boolean;
  action: string;
  checkResponse: CheckResponse;
  proofId?: string;
  timestamp: string;
}

export type VerificationListener = (result: VerificationResult) => void;

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * PreflightGate sits between the agent's payment intent and the
 * actual Nanopayment execution on Arc.
 *
 * Flow:
 *   1. Agent decides to pay for a resource
 *   2. Payment intent is described in natural language
 *   3. Preflight verifies against compiled policy (ZK proof on Base)
 *   4. If SAT → proceed with Nanopayment on Arc
 *   5. If UNSAT → block payment, return proof of policy violation
 */
export class PreflightGate {
  private client: PreflightClient;
  private policyId: string;
  private listeners: VerificationListener[] = [];
  private dailySpend = 0;
  private verificationLog: VerificationResult[] = [];

  constructor(policyId?: string) {
    this.client = new PreflightClient();
    this.policyId = policyId || config.icmePolicyId;
  }

  onVerification(listener: VerificationListener): void {
    this.listeners.push(listener);
  }

  getLog(): VerificationResult[] {
    return [...this.verificationLog];
  }

  getDailySpend(): number {
    return this.dailySpend;
  }

  /**
   * Verify a payment intent against the Preflight policy.
   * Returns the verification result — caller decides whether to proceed.
   */
  async verify(intent: PaymentIntent): Promise<VerificationResult> {
    const action = describePaymentAction({
      amount: intent.amount,
      recipient: intent.recipient,
      vendor: intent.vendor,
      purpose: intent.purpose,
    });

    // First, check relevance (free) to avoid wasting credits on
    // actions that have nothing to do with the payment policy
    const relevance = await this.client.checkRelevance(this.policyId, action);

    let checkResponse: CheckResponse;

    if (!relevance.should_check) {
      // Action is outside policy scope — default deny for payments
      checkResponse = {
        result: "NO_TRANSLATION",
        blocked: true,
        reason: "Action is not relevant to the payment policy. Denied by default.",
        check_id: `relevance-skip-${Date.now()}`,
      };
    } else {
      // Full formal verification with ZK proof generation
      checkResponse = await this.client.checkAction(this.policyId, action);
    }

    const result: VerificationResult = {
      allowed: checkResponse.result === "SAT" && !checkResponse.blocked,
      action,
      checkResponse,
      proofId: checkResponse.proof_id,
      timestamp: new Date().toISOString(),
    };

    // Track cumulative spend for allowed payments
    if (result.allowed) {
      this.dailySpend += parseFloat(intent.amount);
    }

    this.verificationLog.push(result);
    this.listeners.forEach((l) => l(result));

    return result;
  }

  /**
   * Verify a payment intent for the verified-pay flow where
   * the proof_id will be attached to the x402 payment header.
   * Same verification as verify() — explicitly named for clarity.
   */
  async verifyForPayment(intent: PaymentIntent): Promise<VerificationResult> {
    return this.verify(intent);
  }

  /**
   * Verify a payment and execute the Nanopayment if allowed.
   * This is the main entry point for the agent.
   */
  async verifyAndPay(
    intent: PaymentIntent,
    executePayment: (url: string) => Promise<{ data: unknown; status: number }>
  ): Promise<{ data: unknown; status: number; verification: VerificationResult }> {
    const verification = await this.verify(intent);

    if (!verification.allowed) {
      return {
        data: {
          error: "PAYMENT_BLOCKED",
          reason: verification.checkResponse.reason,
          violated_rule: verification.checkResponse.violated_rule,
          proof_id: verification.proofId,
        },
        status: 403,
        verification,
      };
    }

    // Payment passed formal verification — execute on Arc
    const { data, status } = await executePayment(intent.resourceUrl);

    return { data, status, verification };
  }
}
