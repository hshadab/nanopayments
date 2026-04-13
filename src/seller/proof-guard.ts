/**
 * Proof Guard — Express middleware that verifies Preflight ZK proofs
 * before allowing x402 Nanopayments through.
 *
 * Sits BEFORE gateway.require() in the middleware chain:
 *   proofGuard → gateway.require("$0.001") → handler
 *
 * On the initial request (no Payment-Signature), the guard skips
 * verification so the x402 402 challenge can proceed normally.
 * On the retry (with Payment-Signature + X-Preflight-Proof), the
 * guard verifies the proof before the payment is accepted.
 */
import type { Request, Response, NextFunction } from "express";
import type { PreflightProofHeader, ProofVerifiedRequest } from "../types.js";
import { config } from "../config.js";

interface ProofGuardOptions {
  /** If true, reject payments that lack a proof header. Default: true */
  required?: boolean;
}

/**
 * Create a proof guard middleware instance.
 */
export function createProofGuard(options: ProofGuardOptions = {}) {
  const { required = true } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip verification on the initial request — no payment signature means
    // this is the first call that will get a 402 response from gateway.require().
    // The proof only matters on the retry where Payment-Signature is present.
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) {
      return next();
    }

    // Extract the proof header
    const proofHeaderRaw = req.headers["x-preflight-proof"] as string | undefined;

    if (!proofHeaderRaw) {
      if (required) {
        res.status(403).json({
          error: "PROOF_REQUIRED",
          message: "X-Preflight-Proof header is required for verified endpoints.",
        });
        return;
      }
      // Not required — let payment through without proof
      return next();
    }

    // Parse the proof header
    let proofHeader: PreflightProofHeader;
    try {
      proofHeader = JSON.parse(proofHeaderRaw);
    } catch {
      res.status(400).json({
        error: "INVALID_PROOF_HEADER",
        message: "X-Preflight-Proof header contains invalid JSON.",
      });
      return;
    }

    if (!proofHeader.proof_id || !proofHeader.claimed_result) {
      res.status(400).json({
        error: "INVALID_PROOF_HEADER",
        message: "X-Preflight-Proof header missing proof_id or claimed_result.",
      });
      return;
    }

    // Reject if the proof claims UNSAT (policy violation)
    if (proofHeader.claimed_result === "UNSAT") {
      res.status(403).json({
        error: "PROOF_UNSAT",
        message: "Preflight proof indicates policy violation (UNSAT).",
        proof_id: proofHeader.proof_id,
      });
      return;
    }

    // Verify the proof via ICME public endpoint
    try {
      const verifyStart = Date.now();
      const verifyRes = await fetch(`${config.icmeBaseUrl}/verifyProof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof_id: proofHeader.proof_id }),
      });

      if (!verifyRes.ok) {
        res.status(502).json({
          error: "PROOF_VERIFICATION_FAILED",
          message: `Proof verification service returned ${verifyRes.status}.`,
          proof_id: proofHeader.proof_id,
        });
        return;
      }

      const verifyData = (await verifyRes.json()) as {
        valid: boolean;
        policy_hash: string;
        claimed_result: "SAT" | "UNSAT";
        verify_ms: number;
      };
      const verifyMs = Date.now() - verifyStart;

      if (!verifyData.valid) {
        res.status(403).json({
          error: "PROOF_INVALID",
          message: "Preflight ZK proof failed verification.",
          proof_id: proofHeader.proof_id,
          verify_ms: verifyMs,
        });
        return;
      }

      // Proof is valid — attach metadata and continue
      (req as ProofVerifiedRequest).preflightProof = {
        proofId: proofHeader.proof_id,
        valid: true,
        policyHash: verifyData.policy_hash,
        claimedResult: verifyData.claimed_result,
        verifyMs,
      };

      next();
    } catch (err) {
      res.status(502).json({
        error: "PROOF_VERIFICATION_ERROR",
        message: `Proof verification failed: ${(err as Error).message}`,
        proof_id: proofHeader.proof_id,
      });
    }
  };
}
