# ICME Preflight API — Integration Feedback

**From:** ICME Labs (Verified Nanopayments demo)
**Date:** April 2026
**Integration:** Preflight ZK proofs gating Circle x402 Nanopayments

We built an end-to-end demo that uses Preflight to formally verify every AI agent payment before execution. We hit several issues during integration that are worth flagging. Everything is working now, but the workarounds are non-obvious.

---

## 1. SSE vs JSON — undocumented response format

**Endpoints affected:** `/v1/makeRules`, `/v1/checkIt`

Both endpoints return `text/event-stream` (SSE) instead of `application/json`. This is not obvious from the docs. Calling `res.json()` fails silently or throws.

**What we expected:** JSON response with `{ result, proof_id, ... }`
**What we got:** SSE stream with `data: {"step":"1/6","msg":"Translating..."}` lines

**Workaround we built:**
- Content-Type sniffing (`application/json` vs SSE)
- Line-by-line SSE parser looking for `data: ` prefix
- Fallback raw JSON line parser (some lines lack the `data: ` prefix)
- Last-resort: parse the entire response body as one JSON blob
- 4 separate parsing strategies to handle the variation

**Suggestion:** Either document the SSE format clearly, or offer an `Accept: application/json` mode that buffers the full result and returns it as a single JSON response. Most integrators will not expect SSE from a REST-style POST.

---

## 2. `checkIt` result field returns "AR uncertain" instead of SAT/UNSAT

**Endpoint:** `/v1/checkIt`

When the Z3 solver returns SAT but the AWS Automated Reasoning solver cannot translate the action, the top-level `result` field is `"AR uncertain"` instead of `"SAT"` or `"UNSAT"`.

**What we expected:** `result` is always `"SAT"` or `"UNSAT"`
**What we got:** `result: "AR uncertain"` — not a value we can branch on

**Workaround:** Fall back to the `z3_result` field:

```ts
if (rawResult === "SAT" || rawResult === "UNSAT") {
  normalizedResult = rawResult;
} else if (z3Result === "SAT" || z3Result === "UNSAT") {
  normalizedResult = z3Result;
} else {
  normalizedResult = "UNSAT"; // fail-closed
}
```

**Suggestion:** The `result` field should always be `SAT` or `UNSAT`. If you want to expose solver disagreement, use a separate field like `solver_notes` or `ar_status`. Consumers need a single boolean-ish field to branch on.

---

## 3. Proof ID field name inconsistency

**Endpoint:** `/v1/checkIt` (SSE done event)

The proof ID comes back as `zk_proof_id` in the SSE stream, but the proof status endpoint is `GET /v1/proof/:id` and `verifyProof` expects `proof_id`.

**What we expected:** Consistent field name across endpoints
**What we got:** `zk_proof_id` from checkIt, `proof_id` everywhere else

**Workaround:** Manual mapping: `proof_id: doneEvent.zk_proof_id`

**Suggestion:** Use `proof_id` consistently across all endpoints and response events.

---

## 4. Policy compilation costs credits even on failure

**Endpoint:** `/v1/makeRules`

Compiling a policy costs 300 credits ($3.00). If the SSE stream drops mid-compile, or the client fails to parse the `policy_id` from the final event, the credits are still consumed. There is no way to recover.

**Impact:** During development we lost credits debugging the SSE parser. At $3 per attempt this adds up.

**Suggestion:**
- Return the `policy_id` in a response header as well as the SSE stream body, so even if the stream parser fails, the ID is recoverable
- Or provide a `GET /v1/policies` endpoint that lists compiled policies for the account, so a lost ID can be retrieved

---

## 5. ZK proofs take 30-60s with no status endpoint during generation

**Endpoints:** `/v1/checkIt` then `GET /v1/proof/:id`

After `checkIt` returns a `zk_proof_id`, the proof is not immediately available. `GET /v1/proof/:id` returns 404 until generation completes (typically 30-60s). There is no progress indication.

**Workaround:** Poll every 5 seconds with a timeout:

```ts
async waitForProof(proofId, { timeoutMs = 120_000, intervalMs = 5_000 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return await this.getProofStatus(proofId);
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`Proof not available after ${timeoutMs / 1000}s`);
}
```

**Suggestion:**
- Return 202 with `{ status: "generating", estimated_ms: ... }` instead of 404 during generation
- Or support a webhook/callback URL on the `checkIt` request
- Or stream proof status updates on the same SSE connection that checkIt uses

---

## 6. Single-use proof verification returns 409 with no context

**Endpoint:** `/v1/verifyProof`

After a proof is consumed by `verifyProof`, subsequent calls return HTTP 409. The response body doesn't include the original verification result.

**What we expected:** 409 with `{ already_verified: true, original_result: "SAT", verified_at: "..." }`
**What we got:** 409 with minimal info

**Impact:** In our demo, the seller's proof-guard consumes the SAT proof during payment. When we try to re-verify in the audit scene, we get a bare 409 and have to handle it as a special case.

**Suggestion:** Include the original claim and verification metadata in the 409 response so consumers can distinguish "valid but already used" from actual errors.

---

## 7. SSE event field naming varies between endpoints

**Endpoints:** `/v1/makeRules` vs `/v1/checkIt`

| Field | makeRules | checkIt |
|-------|-----------|---------|
| Message | `msg` | `detail` |
| Proof ID | N/A | `zk_proof_id` |
| Progress | `step: "1/6"` | `step: "checking"` |
| Completion | `policy_id` present | `result` present |

We had to write separate parsing logic for each endpoint because the event shapes differ.

**Suggestion:** Standardize SSE event shape across endpoints. A consistent envelope like `{ type, status, data, error }` would simplify client implementations.

---

## Summary

The core product is solid — the SAT/UNSAT + ZK proof model is exactly what AI agent payments need. The issues above are all integration ergonomics that made the first 48 hours harder than necessary. The biggest wins would be:

1. **JSON response option** (or at minimum, document SSE clearly)
2. **Consistent field names** across endpoints
3. **Recoverable policy IDs** after compilation
4. **202 instead of 404** for in-progress proofs

Happy to jump on a call to walk through any of these. Our full integration code is in the repo.
