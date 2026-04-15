#!/usr/bin/env tsx
import "dotenv/config";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getUsdcBalance, signAndBuildPaymentHeader, type X402Requirements } from "./x402-base-pay.js";

const ICME_TOPUP_URL = "https://api.icme.io/v1/topUpX402";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex;
  const apiKey = process.env.ICME_API_KEY!;
  const account = privateKeyToAccount(privateKey);

  console.log(`Wallet: ${account.address}`);

  const balance = await getUsdcBalance(account.address);
  console.log(`USDC balance: ${balance / 1e6} USDC`);

  if (balance < 5_000_000) {
    console.error(`Need 5 USDC. Have ${balance / 1e6}.`);
    process.exit(1);
  }

  console.log("\nGetting payment requirements...");
  const initRes = await fetch(ICME_TOPUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ amount: 500 }),
  });
  const requirements = await initRes.json() as X402Requirements;

  console.log("Signing EIP-3009 authorization...");
  const paymentHeader = await signAndBuildPaymentHeader(privateKey, requirements);

  console.log("Sending payment...");
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
