import { getGatewayClient } from "./client.js";
import type {
  PreflightProofHeader,
  VerifiedPayOptions,
  VerifiedPayResult,
} from "../types.js";

/** Pay for a resource with a Preflight proof in the X-Preflight-Proof header. */
export async function verifiedPay<T = Record<string, unknown>>(
  url: string,
  options: VerifiedPayOptions
): Promise<VerifiedPayResult<T>> {
  const client = getGatewayClient();

  const proofHeader: PreflightProofHeader = {
    proof_id: options.proofId,
    policy_hash: options.policyHash,
    claimed_result: "SAT",
    timestamp: new Date().toISOString(),
  };

  const result = await client.pay<T>(url, {
    method: options.method,
    body: options.body,
    headers: {
      ...options.headers,
      "X-Preflight-Proof": JSON.stringify(proofHeader),
    },
  });

  return {
    ...result,
    proofHeader,
  };
}
