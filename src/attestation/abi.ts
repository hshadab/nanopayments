/**
 * ABI for NanopaymentAttestation.sol (see contracts/NanopaymentAttestation.sol).
 *
 * Single-purpose registry: a seller asserts that an Arc Gateway Nanopayment
 * it just settled was authorized by an ICME Preflight ZK proof. One write
 * per (proofId, seller) pair.
 */
export const NANOPAYMENT_ATTESTATION_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proofId", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
      { name: "paymentTxHash", type: "bytes32" },
      { name: "result", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAttestation",
    stateMutability: "view",
    inputs: [{ name: "proofId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "proofId", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "paymentTxHash", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "seller", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isAttested",
    stateMutability: "view",
    inputs: [{ name: "proofId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "sellerAttestationCount",
    stateMutability: "view",
    inputs: [{ name: "seller", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAttestations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "ProofAttested",
    inputs: [
      { name: "proofId", type: "bytes32", indexed: true },
      { name: "policyHash", type: "bytes32", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "result", type: "uint8", indexed: false },
      { name: "paymentTxHash", type: "bytes32", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "AlreadyAttested", inputs: [{ name: "proofId", type: "bytes32" }] },
  { type: "error", name: "InvalidResult", inputs: [{ name: "result", type: "uint8" }] },
  { type: "error", name: "ZeroProofId", inputs: [] },
] as const;
