// Sits BEFORE gateway.require(): the initial 402 challenge (no Payment-Signature)
// passes through; on retry this guard verifies the proof before payment proceeds.
import type { Request, Response, NextFunction } from "express";
import type { PreflightProofHeader, ProofVerifiedRequest, VerifyProofResponse } from "../types.js";
import { config } from "../config.js";

interface ProofGuardOptions {
  required?: boolean;
}

export function createProofGuard(options: ProofGuardOptions = {}) {
  const { required = true } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // No payment signature = initial 402 challenge, let it through
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) {
      return next();
    }

    const rawHeader = req.headers["x-preflight-proof"];
    const proofHeaderRaw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!proofHeaderRaw) {
      if (required) {
        res.status(403).json({
          error: "PROOF_REQUIRED",
          message: "X-Preflight-Proof header is required for verified endpoints.",
        });
        return;
      }
      return next();
    }

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

    if (proofHeader.claimed_result === "UNSAT") {
      res.status(403).json({
        error: "PROOF_UNSAT",
        message: "Preflight proof indicates policy violation (UNSAT).",
        proof_id: proofHeader.proof_id,
      });
      return;
    }

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

      const verifyData = (await verifyRes.json()) as VerifyProofResponse;
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
        message: `Proof verification failed: ${err instanceof Error ? err.message : String(err)}`,
        proof_id: proofHeader.proof_id,
      });
    }
  };
}
