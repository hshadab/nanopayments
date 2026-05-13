#!/usr/bin/env tsx
/**
 * Sanity check: confirms the deployed NanopaymentAttestation contract is
 * callable from this repo's config. Reads `totalAttestations` from chain.
 */
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { arcTestnet } from "../src/attestation/arc-chain.js";
import { NANOPAYMENT_ATTESTATION_ABI } from "../src/attestation/abi.js";
import { isAttestationOnchain } from "../src/attestation/arc-attestor.js";

async function main() {
  const onchain = isAttestationOnchain();
  const address = process.env.ATTESTATION_CONTRACT_ADDRESS;
  console.log(`isAttestationOnchain(): ${onchain}`);
  console.log(`ATTESTATION_CONTRACT_ADDRESS: ${address}`);

  if (!onchain || !address) {
    console.log("Not in on-chain mode — exiting.");
    return;
  }

  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  const total = await pub.readContract({
    address: address as `0x${string}`,
    abi: NANOPAYMENT_ATTESTATION_ABI,
    functionName: "totalAttestations",
  });
  console.log(`On-chain totalAttestations: ${total}`);

  const code = await pub.getBytecode({ address: address as `0x${string}` });
  console.log(`Contract bytecode size: ${code ? (code.length - 2) / 2 : 0} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
