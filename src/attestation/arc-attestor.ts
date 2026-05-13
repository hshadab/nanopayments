/**
 * On-Arc attestation writer + reader.
 *
 * After the seller settles a Circle Nanopayment that was authorized by a
 * Preflight ZK proof, it calls `attestProof()` to write a small record on
 * Arc Testnet:
 *
 *     (proofId, policyHash, paymentTxHash, result, seller, timestamp)
 *
 * The record contains only hashes — no policy bodies, no PII — so anyone
 * can independently verify "this proofId was used to authorize this on-chain
 * payment by this seller" via Arc Explorer without needing access to ICME
 * or the buyer's wallet.
 *
 * Canonical deployment (Arc Testnet, chainId 5042002):
 *     0x76ce30319c561beaa6dcf936017fcbb1e84b18b1
 *     https://explorer.testnet.arc.network/address/0x76ce30319c561beaa6dcf936017fcbb1e84b18b1
 *
 * Override by setting ATTESTATION_CONTRACT_ADDRESS in .env to use your own
 * deployment.
 */
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { NANOPAYMENT_ATTESTATION_ABI } from "./abi.js";
import { arcTestnet } from "./arc-chain.js";

export type AttestationResult = "SAT" | "UNSAT";
export type AttestationMode = "onchain" | "simulated";

export interface AttestationRecord {
  proofId: Hex;
  policyHash: Hex;
  paymentTxHash: Hex;
  result: AttestationResult;
  seller: Address;
  timestamp: number; // unix seconds
}

export interface AttestWriteReceipt {
  mode: AttestationMode;
  attestationTxHash: Hex;
  attestationContract: Address;
  proofIdHash: Hex;
  blockNumber: bigint;
  chainId: number;
  explorerUrl: string;
}

/**
 * Demo contract address used when the real attestation contract isn't
 * deployed. Derived deterministically from a seed string so the demo
 * shows a consistent realistic-looking address across runs.
 */
const SIMULATED_CONTRACT_ADDRESS = ("0x" +
  keccak256(toHex("NanopaymentAttestation.demo.v1")).slice(2, 42)) as Address;

const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as Hex;

function getContractAddress(): Address | null {
  const raw = process.env.ATTESTATION_CONTRACT_ADDRESS;
  if (!raw || raw.length === 0) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

/** Normalize an ICME proof UUID (or any string id) to a 32-byte hash. */
export function hashProofId(proofId: string): Hex {
  if (proofId.startsWith("0x") && proofId.length === 66) {
    return proofId as Hex;
  }
  return keccak256(toHex(proofId));
}

/** Normalize a policy fingerprint string to a 32-byte hash. */
export function hashPolicy(policyHashOrId: string): Hex {
  if (policyHashOrId.startsWith("0x") && policyHashOrId.length === 66) {
    return policyHashOrId as Hex;
  }
  return keccak256(toHex(policyHashOrId));
}

/** Normalize a settlement tx hash (or empty for UNSAT) to bytes32. */
function normalizeTxHash(txHash: string | null | undefined): Hex {
  if (!txHash) return ZERO_BYTES32;
  if (txHash.startsWith("0x") && txHash.length === 66) return txHash as Hex;
  return keccak256(toHex(txHash));
}

function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() });
}

function walletClient() {
  const account = privateKeyToAccount(config.privateKey);
  return createWalletClient({ account, chain: arcTestnet, transport: http() });
}

function explorerTxUrl(txHash: Hex): string {
  const base = arcTestnet.blockExplorers?.default?.url || "";
  return base ? `${base}/tx/${txHash}` : "";
}

/**
 * Deterministic simulated attestation receipt. Used in demo mode when the
 * contract isn't deployed. The tx hash is `keccak256(proofIdHash ‖
 * paymentTxBytes32 ‖ policyHash ‖ resultCode)`, so the same inputs always
 * produce the same hash — making the demo reproducible and the lookup
 * endpoint cacheable.
 */
function simulateAttestation(
  proofIdHash: Hex,
  policyHashHex: Hex,
  paymentTxBytes32: Hex,
  resultCode: number
): AttestWriteReceipt {
  const txHash = keccak256(
    encodePacked(
      ["bytes32", "bytes32", "bytes32", "uint8"],
      [proofIdHash, policyHashHex, paymentTxBytes32, resultCode]
    )
  );
  // Deterministic pseudo-block-number derived from the tx hash high bytes.
  const blockNumber = BigInt("0x" + txHash.slice(2, 10));

  return {
    mode: "simulated",
    attestationTxHash: txHash,
    attestationContract: SIMULATED_CONTRACT_ADDRESS,
    proofIdHash,
    blockNumber,
    chainId: arcTestnet.id,
    explorerUrl: explorerTxUrl(txHash),
  };
}

/**
 * Write an attestation on Arc Testnet.
 *
 * If `ATTESTATION_CONTRACT_ADDRESS` is set, performs a real on-chain write
 * using the seller's key. Otherwise returns a deterministic simulated
 * receipt (clearly marked `mode: "simulated"` and using a placeholder
 * contract address) so the demo flow remains visible end-to-end.
 *
 * @param proofId        ICME Preflight proof UUID (will be keccak'd to bytes32)
 * @param policyHash     ICME policy fingerprint (will be keccak'd to bytes32)
 * @param paymentTxHash  Arc Gateway settlement tx hash (or null for UNSAT)
 * @param result         "SAT" | "UNSAT"
 */
export async function attestProof(
  proofId: string,
  policyHash: string,
  paymentTxHash: string | null,
  result: AttestationResult
): Promise<AttestWriteReceipt> {
  const proofIdHash = hashProofId(proofId);
  const policyHashHex = hashPolicy(policyHash);
  const paymentTxBytes32 = normalizeTxHash(paymentTxHash);
  const resultCode = result === "SAT" ? 1 : 0;

  const contractAddress = getContractAddress();
  if (!contractAddress) {
    return simulateAttestation(proofIdHash, policyHashHex, paymentTxBytes32, resultCode);
  }

  const wallet = walletClient();
  const pub = publicClient();

  const txHash = await wallet.writeContract({
    address: contractAddress,
    abi: NANOPAYMENT_ATTESTATION_ABI,
    functionName: "attest",
    args: [proofIdHash, policyHashHex, paymentTxBytes32, resultCode],
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  return {
    mode: "onchain",
    attestationTxHash: txHash,
    attestationContract: contractAddress,
    proofIdHash,
    blockNumber: receipt.blockNumber,
    chainId: arcTestnet.id,
    explorerUrl: explorerTxUrl(txHash),
  };
}

/**
 * Read an attestation back from Arc Testnet.
 *
 * @param proofId  ICME Preflight proof UUID (will be keccak'd to bytes32)
 * @returns        AttestationRecord, or null if no record exists.
 */
export async function getAttestation(
  proofId: string
): Promise<AttestationRecord | null> {
  const contractAddress = getContractAddress();
  if (!contractAddress) return null;

  const proofIdHash = hashProofId(proofId);
  const pub = publicClient();

  const raw = (await pub.readContract({
    address: contractAddress,
    abi: NANOPAYMENT_ATTESTATION_ABI,
    functionName: "getAttestation",
    args: [proofIdHash],
  })) as {
    proofId: Hex;
    policyHash: Hex;
    paymentTxHash: Hex;
    result: number;
    seller: Address;
    timestamp: bigint;
  };

  if (raw.timestamp === 0n) return null;

  return {
    proofId: raw.proofId,
    policyHash: raw.policyHash,
    paymentTxHash: raw.paymentTxHash,
    result: raw.result === 1 ? "SAT" : "UNSAT",
    seller: raw.seller,
    timestamp: Number(raw.timestamp),
  };
}

/** True if this proofId has already been attested on-chain. */
export async function isAttested(proofId: string): Promise<boolean> {
  const contractAddress = getContractAddress();
  if (!contractAddress) return false;
  const proofIdHash = hashProofId(proofId);
  const pub = publicClient();
  return (await pub.readContract({
    address: contractAddress,
    abi: NANOPAYMENT_ATTESTATION_ABI,
    functionName: "isAttested",
    args: [proofIdHash],
  })) as boolean;
}

/** True if a real attestation contract address is configured on Arc. */
export function isAttestationOnchain(): boolean {
  return getContractAddress() !== null;
}

/**
 * Attestation is always enabled — when no contract is deployed, the writer
 * returns deterministic simulated receipts so the demo flow stays visible.
 * Kept for backwards-compatible call sites.
 */
export function isAttestationEnabled(): boolean {
  return true;
}

/** Public Arc Explorer URL for an attestation tx (for the frontend). */
export function attestationExplorerUrl(txHash: Hex): string {
  return explorerTxUrl(txHash);
}
