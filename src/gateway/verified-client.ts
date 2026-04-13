/**
 * Verified Gateway Client — wraps Circle GatewayClient.pay() to inject
 * a Preflight ZK proof header alongside the x402 Payment-Signature.
 *
 * The X-Preflight-Proof header carries:
 *   { proof_id, policy_hash?, claimed_result: "SAT", timestamp }
 *
 * The seller's proof-guard middleware verifies this proof before
 * accepting the Nanopayment — closing the authentication/authorization gap.
 */
import { getGatewayClient } from "./client.js";
import type { PreflightProofHeader } from "../types.js";

interface VerifiedPayOptions {
  proofId: string;
  policyHash?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export interface VerifiedPayResult<T = unknown> {
  data: T;
  amount: bigint;
  formattedAmount: string;
  transaction: string;
  status: number;
  proofHeader: PreflightProofHeader;
}

/**
 * Pay for a resource with a Preflight proof attached.
 *
 * Constructs the X-Preflight-Proof JSON header and merges it into
 * the GatewayClient.pay() call. The Circle SDK will send this header
 * alongside Payment-Signature on the retry request after 402.
 */
export async function verifiedPay<T = unknown>(
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
