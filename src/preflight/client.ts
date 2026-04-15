import { config } from "../config.js";
import type {
  CheckResult,
  CheckResponse,
  ProofStatusResponse,
  VerifyProofResponse,
  PolicyCompileEvent,
} from "../types.js";

interface CheckItSseEvent {
  step?: string;
  result?: string;
  z3_result?: string;
  detail?: string;
  zk_proof_id?: string;
  check_id?: string;
}

interface MakeRulesJsonResponse {
  policy_id?: string;
  scenario_count?: number;
}

interface MakeRulesSseEvent {
  step?: string;
  msg?: string;
  message?: string;
  error?: string;
  policy_id?: string;
  scenario_count?: number;
}

export class PreflightClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || config.icmeApiKey;
    this.baseUrl = baseUrl || config.icmeBaseUrl;
  }

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

    if (contentType.includes("application/json")) {
      return res.json() as Promise<CheckResponse>;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneEvent: CheckItSseEvent | null = null;

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
          const parsed = JSON.parse(data) as CheckItSseEvent;
          if (parsed.step === "done" || parsed.result) {
            doneEvent = parsed;
          }
        } catch {}
      }
    }

    if (!doneEvent) {
      throw new Error("checkIt SSE stream ended without a result event");
    }

    // API may return "AR uncertain" when Z3 says SAT but AR solver is
    // inconclusive -- fall back to z3_result, then fail-closed to UNSAT.
    const rawResult = doneEvent.result;
    const z3Result = doneEvent.z3_result;
    let normalizedResult: CheckResult;
    if (rawResult === "SAT" || rawResult === "UNSAT") {
      normalizedResult = rawResult;
    } else if (z3Result === "SAT" || z3Result === "UNSAT") {
      normalizedResult = z3Result;
    } else {
      normalizedResult = "UNSAT"; // fail-closed
    }

    return {
      result: normalizedResult,
      blocked: normalizedResult !== "SAT",
      reason: doneEvent.detail || "",
      proof_id: doneEvent.zk_proof_id || undefined,
      check_id: doneEvent.check_id || "",
    };
  }

  async getProofStatus(proofId: string): Promise<ProofStatusResponse> {
    const res = await fetch(`${this.baseUrl}/proof/${proofId}`, {
      headers: { "X-API-Key": this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Preflight proof status failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<ProofStatusResponse>;
  }

  /** Polls getProofStatus until the proof exists or timeout. */
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
      } catch (err) {
        // Only retry on 404 (proof not generated yet); propagate real errors
        if (!(err instanceof Error) || !err.message.includes("404")) {
          throw err;
        }
        options?.onWaiting?.(Date.now() - start);
        await new Promise((r) => setTimeout(r, interval));
      }
    }
    throw new Error(`Proof ${proofId} not available after ${timeout / 1000}s`);
  }

  /** Single-use public proof verification. Consumed after call. */
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

  /** Compile a natural-language policy. Streams SSE progress. $3, one-time. */
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

    if (contentType.includes("application/json")) {
      const data = await res.json() as MakeRulesJsonResponse;
      if (data.policy_id) {
        onProgress?.({ type: "done", policy_id: data.policy_id, scenario_count: data.scenario_count });
        return data.policy_id;
      }
      throw new Error(`makeRules returned JSON without policy_id: ${JSON.stringify(data)}`);
    }

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
        if (line.startsWith("data: ")) {
          try {
            const raw = JSON.parse(line.slice(6)) as MakeRulesSseEvent;
            const event: PolicyCompileEvent = {
              type: raw.step === "error" ? "error"
                  : raw.policy_id ? "done"
                  : "progress",
              message: raw.msg ?? raw.message ?? raw.error,
              step: raw.step,
              policy_id: raw.policy_id,
              scenario_count: raw.scenario_count,
            };
            onProgress?.(event);
            if (event.policy_id) {
              policyId = event.policy_id;
            }
          } catch {}
          continue;
        }

        const trimmed = line.trim();
        if (trimmed.startsWith("{")) {
          try {
            const event = JSON.parse(trimmed) as PolicyCompileEvent & { policy_id?: string };
            onProgress?.(event);
            if (event.policy_id) {
              policyId = event.policy_id;
            }
          } catch {}
        }
      }
    }

    if (!policyId) {
      throw new Error("Policy compilation completed but no policy_id returned in SSE stream");
    }

    return policyId;
  }
}
