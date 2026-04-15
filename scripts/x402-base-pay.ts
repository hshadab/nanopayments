// Shared x402 payment helper for ICME API endpoints on Base mainnet.
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { randomBytes } from "crypto";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export async function getUsdcBalance(address: string): Promise<number> {
  const balanceData = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
  const rpcRes = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: USDC_BASE, data: balanceData }, "latest"],
    }),
  });
  const rpcResult = (await rpcRes.json()) as { result: string };
  return parseInt(rpcResult.result, 16);
}

export interface X402Requirements {
  accepts: Array<{
    amount: string;
    asset: string;
    payTo: string;
    network: string;
    maxTimeoutSeconds: number;
    scheme: string;
    extra: { assetTransferMethod: string; name: string; version: string };
  }>;
  resource: { url: string; description: string };
  x402Version: number;
  [key: string]: unknown;
}

export async function signAndBuildPaymentHeader(
  privateKey: Hex,
  requirements: X402Requirements
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const payReq = requirements.accepts[0];

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

  return Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
}
