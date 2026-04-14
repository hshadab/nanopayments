#!/usr/bin/env tsx
/**
 * Top up ICME Preflight credits by paying 5 USDC on Base mainnet.
 * Usage: npx tsx scripts/topup-icme.ts
 */
import "dotenv/config";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { randomBytes } from "crypto";

const ICME_TOPUP_URL = "https://api.icme.io/v1/topUpX402";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  const apiKey = process.env.ICME_API_KEY!;
  const account = privateKeyToAccount(privateKey);

  console.log(`Wallet: ${account.address}`);

  // Check balance
  const balanceData = `0x70a08231000000000000000000000000${account.address.slice(2).toLowerCase()}`;
  const rpcRes = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data: balanceData }, "latest"] }),
  });
  const rpcResult = (await rpcRes.json()) as { result: string };
  const balance = parseInt(rpcResult.result, 16);
  console.log(`USDC balance: ${balance / 1e6} USDC`);

  if (balance < 5_000_000) {
    console.error(`Need 5 USDC. Have ${balance / 1e6}.`);
    process.exit(1);
  }

  // Get 402 requirements
  console.log("\nGetting payment requirements...");
  const initRes = await fetch(ICME_TOPUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ amount: 500 }),
  });
  const requirements = await initRes.json() as any;
  const payReq = requirements.accepts[0];

  // Sign EIP-3009
  console.log("Signing EIP-3009 authorization...");
  const walletClient = createWalletClient({ account, chain: base, transport: http() });
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

  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: payReq.extra.name,
      version: payReq.extra.version,
      chainId: parseInt(payReq.network.split(":")[1]),
      verifyingContract: payReq.asset as `0x${string}`,
    },
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

  // Send payment
  console.log("Sending payment...");
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
  const topupRes = await fetch(ICME_TOPUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "Payment-Signature": paymentHeader,
    },
    body: JSON.stringify({ amount: 500 }),
  });

  const result = await topupRes.json();
  console.log("\n" + JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
