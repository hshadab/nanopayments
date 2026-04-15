import { PreflightClient } from "../preflight/client.js";
import { describePaymentAction } from "../preflight/policy.js";
import { verifiedPay } from "./verified-client.js";
import { config } from "../config.js";
import type { PaymentIntent, VerifiedPayFlowResult } from "../types.js";

export async function verifyAndPay(
  intent: PaymentIntent,
  policyId?: string
): Promise<VerifiedPayFlowResult> {
  const client = new PreflightClient();
  const policy = policyId || config.icmePolicyId;

  const action = describePaymentAction({
    amount: intent.amount,
    recipient: intent.recipient,
    vendor: intent.vendor,
    purpose: intent.purpose,
  });

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

  const paymentStart = Date.now();

  // Proof generation takes ~30-60s
  let policyHash: string | undefined;
  if (check.proof_id) {
    const proofStatus = await client.waitForProof(check.proof_id, {
      timeoutMs: 120_000,
      intervalMs: 5_000,
      onWaiting: (elapsed) => {
        process.stdout.write(`\r  Waiting for ZK proof generation... ${Math.round(elapsed / 1000)}s`);
      },
    });
    process.stdout.write("\n");
    policyHash = proofStatus.policy_hash;
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
