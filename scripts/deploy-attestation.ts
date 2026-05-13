#!/usr/bin/env tsx
/**
 * Deploy NanopaymentAttestation.sol to Arc Testnet.
 *
 * Compiles contracts/NanopaymentAttestation.sol with solcjs (in-process),
 * then deploys via viem using PRIVATE_KEY from .env. Prints the deployed
 * address and the env line to copy into .env.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
// solcjs is published as CJS; load via dynamic import.
import solc from "solc";
import { arcTestnet } from "../src/attestation/arc-chain.js";

const CONTRACT_PATH = path.resolve(
  process.cwd(),
  "contracts/NanopaymentAttestation.sol"
);
const CONTRACT_NAME = "NanopaymentAttestation";

function compile(): { abi: unknown[]; bytecode: Hex } {
  const source = readFileSync(CONTRACT_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "NanopaymentAttestation.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts: Record<
      string,
      Record<
        string,
        { abi: unknown[]; evm: { bytecode: { object: string } } }
      >
    >;
  };

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    if (fatal.length > 0) {
      for (const e of fatal) console.error(e.formattedMessage);
      throw new Error("Solidity compilation failed");
    }
    for (const e of output.errors) {
      console.warn(e.formattedMessage);
    }
  }

  const artifact =
    output.contracts["NanopaymentAttestation.sol"]?.[CONTRACT_NAME];
  if (!artifact) {
    throw new Error(`Compiler did not return artifact for ${CONTRACT_NAME}`);
  }

  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}` as Hex,
  };
}

async function main() {
  const pk = process.env.PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("PRIVATE_KEY missing from .env");

  const account = privateKeyToAccount(pk);
  console.log(`Deployer: ${account.address}`);
  console.log(`Chain:    Arc Testnet (id ${arcTestnet.id})`);
  console.log(`RPC:      ${arcTestnet.rpcUrls.default.http[0]}`);

  console.log("\nCompiling NanopaymentAttestation.sol...");
  const { abi, bytecode } = compile();
  console.log(`  bytecode size: ${(bytecode.length - 2) / 2} bytes`);

  // Persist the artifact for reference.
  const artifactPath = path.resolve(
    process.cwd(),
    "contracts/NanopaymentAttestation.artifact.json"
  );
  writeFileSync(
    artifactPath,
    JSON.stringify({ abi, bytecode }, null, 2)
  );
  console.log(`  artifact written: ${artifactPath}`);

  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(),
  });

  const balance = await pub.getBalance({ address: account.address });
  console.log(`\nDeployer balance: ${balance}`);
  if (balance === 0n) {
    throw new Error(
      "Deployer has zero balance on Arc Testnet — fund it via the Circle faucet first."
    );
  }

  console.log("\nDeploying...");
  const txHash = await wallet.deployContract({
    abi: abi as never,
    bytecode,
  });
  console.log(`  deploy tx: ${txHash}`);

  console.log("  waiting for receipt...");
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new Error(`Deploy reverted (status=${receipt.status})`);
  }
  if (!receipt.contractAddress) {
    throw new Error("Receipt missing contractAddress");
  }

  const explorer = arcTestnet.blockExplorers?.default?.url || "";
  console.log("\n✓ Deployed");
  console.log(`  address:  ${receipt.contractAddress}`);
  console.log(`  block:    ${receipt.blockNumber}`);
  console.log(`  gasUsed:  ${receipt.gasUsed}`);
  if (explorer) {
    console.log(`  tx:       ${explorer}/tx/${txHash}`);
    console.log(`  contract: ${explorer}/address/${receipt.contractAddress}`);
  }

  console.log("\nAdd this line to .env and restart the seller:");
  console.log(`  ATTESTATION_CONTRACT_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
