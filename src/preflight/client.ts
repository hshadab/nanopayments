import { config } from "../config.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type CheckResult = "SAT" | "UNSAT" | "SATISFIABLE" | "IMPOSSIBLE" | "NO_TRANSLATION";

export interface CheckResponse {
  result: CheckResult;
  blocked: boolean;
  reason: string;
  violated_rule?: number;
  proof_id?: string;
  proof?: string;
  check_id: string;
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

export interface RelevanceResponse {
  relevance: number;
  matched_variables: number;
  total_variables: number;
  matched: string[];
  should_check: boolean;
  threshold: number;
  time_ms: number;
}

export interface PolicyCompileEvent {
  type: "progress" | "done" | "error";
  status?: string;
  step?: string;
  message?: string;
  policy_id?: string;
  scenario_count?: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

export class PreflightClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || config.icmeApiKey;
    this.baseUrl = baseUrl || config.icmeBaseUrl;
  }

  /**
   * Check an action against a compiled policy.
   * Returns SAT (allowed) or UNSAT (blocked) with a ZK proof.
   */
  async checkAction(policyId: string, action: string): Promise<CheckResponse> {
    const res = await fetch(`${this.baseUrl}/checkIt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({ policy_id: policyId, action }),
    });

    if (!res.ok) {
      throw new Error(`Preflight checkIt failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<CheckResponse>;
  }

  /**
   * Check whether an action is relevant to a policy before spending credits.
   * Free endpoint — no credit deduction.
   */
  async checkRelevance(
    policyId: string,
    action: string,
    threshold = 0.0
  ): Promise<RelevanceResponse> {
    const res = await fetch(`${this.baseUrl}/checkRelevance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({ policy_id: policyId, action, threshold }),
    });

    if (!res.ok) {
      throw new Error(`Preflight checkRelevance failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<RelevanceResponse>;
  }

  /**
   * Get the status of a ZK proof (authenticated).
   */
  async getProofStatus(proofId: string): Promise<ProofStatusResponse> {
    const res = await fetch(`${this.baseUrl}/proof/${proofId}`, {
      headers: { "X-API-Key": this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Preflight proof status failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<ProofStatusResponse>;
  }

  /**
   * Publicly verify a ZK proof. Single-use — consumed after verification.
   */
  async verifyProof(proofId: string): Promise<VerifyProofResponse> {
    const res = await fetch(`${this.baseUrl}/verifyProof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof_id: proofId }),
    });

    if (!res.ok) {
      throw new Error(`Preflight verifyProof failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<VerifyProofResponse>;
  }

  /**
   * Compile a natural language policy into SMT-LIB2.
   * Streams progress events via SSE. Returns the final policy_id.
   * Cost: 300 credits ($3.00), one-time.
   */
  async compilePolicy(
    policy: string,
    onProgress?: (event: PolicyCompileEvent) => void
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/makeRules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({ policy }),
    });

    if (!res.ok) {
      throw new Error(`Preflight makeRules failed: ${res.status} ${await res.text()}`);
    }

    // Parse SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let policyId = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as PolicyCompileEvent;
          onProgress?.(event);
          if (event.type === "done" && event.policy_id) {
            policyId = event.policy_id;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    if (!policyId) {
      throw new Error("Policy compilation completed but no policy_id returned");
    }

    return policyId;
  }
}
