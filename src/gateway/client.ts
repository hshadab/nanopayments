import { GatewayClient } from "@circle-fin/x402-batching/client";
import { config } from "../config.js";

let gatewayClient: GatewayClient | null = null;

/**
 * Get or create the Circle Gateway client for Arc Testnet.
 * Uses a singleton so the agent and demo share the same session.
 */
export function getGatewayClient(): GatewayClient {
  if (!gatewayClient) {
    gatewayClient = new GatewayClient({
      chain: config.chain,
      privateKey: config.privateKey,
    });
  }
  return gatewayClient;
}

/**
 * Check balances and deposit USDC if needed.
 */
export async function ensureBalance(minUsdc = 1): Promise<void> {
  const client = getGatewayClient();
  const balances = await client.getBalances();
  const available = balances.gateway.available;
  const minUnits = BigInt(minUsdc * 1_000_000);

  console.log(`  Gateway balance: ${balances.gateway.formattedAvailable} USDC`);

  if (available < minUnits) {
    console.log(`  Depositing ${minUsdc} USDC to Gateway...`);
    const deposit = await client.deposit(String(minUsdc));
    console.log(`  Deposit tx: ${deposit.depositTxHash}`);
  }
}

/**
 * Pay for a resource via x402 Nanopayment.
 * The GatewayClient handles the full 402 → sign → retry flow.
 */
export async function payForResource(
  url: string
): Promise<{ data: unknown; status: number }> {
  const client = getGatewayClient();
  const { data, status } = await client.pay(url);
  return { data, status };
}
