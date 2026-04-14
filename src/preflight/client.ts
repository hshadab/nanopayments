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

    const contentType = res.headers.get("content-type") || "";

    // Handle plain JSON response
    if (contentType.includes("application/json")) {
      return res.json() as Promise<CheckResponse>;
    }

    // Handle SSE stream — read all events, return the "done" event
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneEvent: Record<string, unknown> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const data = line.startsWith("data: ") ? line.slice(6) : line.trim();
        if (!data || !data.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed.step === "done" || parsed.result) {
            doneEvent = parsed;
          }
        } catch {
          // skip
        }
      }
    }

    if (!doneEvent) {
      throw new Error("checkIt SSE stream ended without a result event");
    }

    // Normalize result: the API may return "AR uncertain" when Z3 says SAT
    // but AR solver is inconclusive. Use z3_result as fallback for SAT/UNSAT.
    const rawResult = doneEvent.result as string;
    const z3Result = doneEvent.z3_result as string | undefined;
    let normalizedResult: CheckResult;
    if (rawResult === "SAT" || rawResult === "UNSAT") {
      normalizedResult = rawResult;
    } else if (z3Result === "SAT" || z3Result === "UNSAT") {
      normalizedResult = z3Result as CheckResult;
    } else {
      normalizedResult = "UNSAT"; // fail-closed
    }

    return {
      result: normalizedResult,
      blocked: normalizedResult !== "SAT",
      reason: (doneEvent.detail as string) || "",
      proof_id: (doneEvent.zk_proof_id as string) || undefined,
      check_id: (doneEvent.check_id as string) || "",
    };
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
   * Wait for a ZK proof to be generated and available.
   * Polls getProofStatus until the proof exists or timeout.
   */
  async waitForProof(
    proofId: string,
    options?: { timeoutMs?: number; intervalMs?: number; onWaiting?: (elapsed: number) => void }
  ): Promise<ProofStatusResponse> {
    const timeout = options?.timeoutMs ?? 120_000;
    const interval = options?.intervalMs ?? 5_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        return await this.getProofStatus(proofId);
      } catch {
        // Proof not ready yet
        options?.onWaiting?.(Date.now() - start);
        await new Promise((r) => setTimeout(r, interval));
      }
    }
    throw new Error(`Proof ${proofId} not available after ${timeout / 1000}s`);
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

    const contentType = res.headers.get("content-type") || "";

    // Handle JSON response (non-streaming)
    if (contentType.includes("application/json")) {
      const data = await res.json() as Record<string, unknown>;
      if (data.policy_id) {
        onProgress?.({ type: "done", policy_id: data.policy_id as string, scenario_count: data.scenario_count as number | undefined });
        return data.policy_id as string;
      }
      throw new Error(`makeRules returned JSON without policy_id: ${JSON.stringify(data)}`);
    }

    // Handle SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let policyId = "";
    let buffer = "";
    let rawChunks = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawChunks += chunk;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        // Try SSE "data: " prefix
        if (line.startsWith("data: ")) {
          try {
            const raw = JSON.parse(line.slice(6)) as Record<string, unknown>;
            // Map API fields (msg/step) to our event type
            const event: PolicyCompileEvent = {
              type: raw.step === "error" ? "error"
                  : raw.policy_id ? "done"
                  : "progress",
              message: (raw.msg ?? raw.message ?? raw.error) as string | undefined,
              step: raw.step as string | undefined,
              policy_id: raw.policy_id as string | undefined,
              scenario_count: raw.scenario_count as number | undefined,
            };
            onProgress?.(event);
            if (event.policy_id) {
              policyId = event.policy_id;
            }
          } catch {
            // skip malformed SSE lines
          }
          continue;
        }

        // Try raw JSON line
        const trimmed = line.trim();
        if (trimmed.startsWith("{")) {
          try {
            const event = JSON.parse(trimmed) as PolicyCompileEvent & { policy_id?: string };
            onProgress?.(event);
            if (event.policy_id) {
              policyId = event.policy_id;
            }
          } catch {
            // skip
          }
        }
      }
    }

    // Last resort: try parsing the entire raw output as JSON
    if (!policyId && rawChunks.trim()) {
      try {
        const data = JSON.parse(rawChunks.trim()) as Record<string, unknown>;
        if (data.policy_id) {
          policyId = data.policy_id as string;
        }
      } catch {
        // Not valid JSON either
      }
    }

    if (!policyId) {
      throw new Error(`Policy compilation completed but no policy_id returned. Raw response (${rawChunks.length} bytes): ${rawChunks.slice(0, 500)}`);
    }

    return policyId;
  }
}
