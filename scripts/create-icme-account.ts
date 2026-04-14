#!/usr/bin/env tsx
/**
 * Create an ICME Preflight account by paying 5 USDC on Base mainnet
 * via the x402 protocol (EIP-3009 transferWithAuthorization).
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env must have >= 5 USDC on Base mainnet
 *
 * Usage: npx tsx scripts/create-icme-account.ts [username]
 */
import "dotenv/config";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { randomBytes } from "crypto";

const ICME_CREATE_URL = "https://api.icme.io/v1/createUserX402";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USERNAME = process.argv[2] || "icme-circle-nanopay-demo";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  if (!privateKey || privateKey === "0x_your_evm_private_key") {
    console.error("Set PRIVATE_KEY in .env first");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Wallet: ${account.address}`);
  console.log(`Username: ${USERNAME}`);
  console.log();

  // Check USDC balance on Base via raw RPC
  const balanceData = `0x70a08231000000000000000000000000${account.address.slice(2).toLowerCase()}`;
  const rpcRes = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: USDC_BASE, data: balanceData }, "latest"],
    }),
  });
  const rpcResult = (await rpcRes.json()) as { result: string };
  const balance = parseInt(rpcResult.result, 16);

  console.log(`USDC balance on Base: ${balance / 1e6} USDC`);

  if (balance < 5_000_000) {
    console.error(`Need at least 5 USDC. Current balance: ${balance / 1e6}`);
    console.error(`Send USDC on Base mainnet to: ${account.address}`);
    process.exit(1);
  }

  // Step 1: Hit the endpoint to get 402 payment requirements
  console.log("\nStep 1: Getting payment requirements...");
  const initRes = await fetch(ICME_CREATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME }),
  });

  const requirements = await initRes.json() as {
    accepts: Array<{
      amount: string;
      asset: string;
      payTo: string;
      network: string;
      maxTimeoutSeconds: number;
      scheme: string;
      extra: { assetTransferMethod: string; name: string; version: string };
    }>;
    extensions: { bazaar: unknown };
    resource: { url: string; description: string };
    x402Version: number;
  };

  if (!requirements.accepts || requirements.accepts.length === 0) {
    console.error("Unexpected response:", JSON.stringify(requirements, null, 2));
    process.exit(1);
  }

  const payReq = requirements.accepts[0];
  console.log(`  Pay to: ${payReq.payTo}`);
  console.log(`  Amount: ${Number(payReq.amount) / 1e6} USDC`);
  console.log(`  Network: ${payReq.network}`);
  console.log(`  Method: ${payReq.extra.assetTransferMethod}`);

  // Step 2: Sign EIP-3009 transferWithAuthorization
  console.log("\nStep 2: Signing EIP-3009 authorization...");

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  const now = Math.floor(Date.now() / 1000);
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;

  const authorization = {
    from: account.address,
    to: payReq.payTo as `0x${string}`,
    value: BigInt(payReq.amount),
    validAfter: BigInt(now - 600),
    validBefore: BigInt(now + payReq.maxTimeoutSeconds),
    nonce,
  };

  // Standard USDC EIP-712 domain (not Circle batched)
  const domain = {
    name: payReq.extra.name,       // "USD Coin"
    version: payReq.extra.version, // "2"
    chainId: parseInt(payReq.network.split(":")[1]), // 8453
    verifyingContract: payReq.asset as `0x${string}`, // USDC contract
  };

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    } as const,
    primaryType: "TransferWithAuthorization" as const,
    message: authorization,
  });

  console.log(`  Signature: ${signature.slice(0, 20)}...`);

  // Step 3: Build Payment-Signature header and retry
  console.log("\nStep 3: Sending payment...");

  const paymentPayload = {
    x402Version: requirements.x402Version,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
    resource: requirements.resource,
    accepted: payReq,
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  const createRes = await fetch(ICME_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Payment-Signature": paymentHeader,
    },
    body: JSON.stringify({ username: USERNAME }),
  });

  const result = await createRes.json();

  if (createRes.ok) {
    console.log("\n=== ACCOUNT CREATED ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("\nSave these to .env:");
    console.log(`ICME_API_KEY=${(result as { api_key: string }).api_key}`);
    console.log(`\nCredits: ${(result as { credits: number }).credits}`);
  } else {
    console.error(`\nFailed (${createRes.status}):`);
    console.error(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
