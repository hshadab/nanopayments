/**
 * Express middleware that runs AFTER `gateway.require(...)` and BEFORE the
 * route handler. It writes an on-Arc attestation record binding the just-
 * settled Nanopayment to the Preflight proof that authorized it.
 *
 * Always runs. With `ATTESTATION_CONTRACT_ADDRESS` set (default in `.env`),
 * performs a real on-chain write to NanopaymentAttestation on Arc Testnet.
 * Without it, falls back to a deterministic simulated receipt so the demo
 * flow remains visible. Either way, the receipt is attached at
 * `req.attestation` and cached for `/demo/attestation/:proofId` lookups.
 */
import type { NextFunction, RequestHandler, Response } from "express";
import type { PaymentRequest } from "@circle-fin/x402-batching/server";
import type { ProofVerifiedRequest } from "../types.js";
import {
  attestProof,
  isAttestationEnabled,
  type AttestWriteReceipt,
} from "../attestation/arc-attestor.js";

export interface AttestedRequest extends ProofVerifiedRequest {
  attestation?: AttestWriteReceipt;
}

// In-memory cache so /demo/attestation/:proofId can resolve recent receipts
// without re-reading from chain on every poll.
const recentAttestations = new Map<string, AttestWriteReceipt>();
const MAX_CACHE = 256;

function rememberAttestation(proofId: string, receipt: AttestWriteReceipt) {
  if (recentAttestations.size >= MAX_CACHE) {
    const oldest = recentAttestations.keys().next().value;
    if (oldest) recentAttestations.delete(oldest);
  }
  recentAttestations.set(proofId, receipt);
}

export function getRecentAttestation(proofId: string): AttestWriteReceipt | undefined {
  return recentAttestations.get(proofId);
}

export function attestAfterPay(): RequestHandler {
  return async (req, _res: Response, next: NextFunction) => {
    if (!isAttestationEnabled()) return next();

    const proof = (req as ProofVerifiedRequest).preflightProof;
    const paymentTx = (req as unknown as PaymentRequest).payment?.transaction;

    if (!proof || !paymentTx) return next();

    try {
      const receipt = await attestProof(
        proof.proofId,
        proof.policyHash || "",
        paymentTx,
        "SAT"
      );
      (req as AttestedRequest).attestation = receipt;
      rememberAttestation(proof.proofId, receipt);
      console.log(
        `[attest] ${proof.proofId.slice(0, 8)}... -> ${receipt.attestationTxHash}`
      );
    } catch (err) {
      // Attestation must never block the response — log and continue.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[attest] failed for ${proof.proofId.slice(0, 8)}...: ${msg}`);
    }

    next();
  };
}
