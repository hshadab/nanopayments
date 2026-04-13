import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PreflightGate, type PaymentIntent } from "../preflight/middleware.js";
import { payForResource } from "../gateway/client.js";
import { config } from "../config.js";

/**
 * Create LangChain tools that route through the Preflight gate.
 * Each tool describes a data API the agent can pay for via x402 Nanopayments.
 */
export function createAgentTools(gate: PreflightGate) {
  const fetchWeather = tool(
    async ({ location }) => {
      const intent: PaymentIntent = {
        amount: "0.001",
        recipient: config.sellerAddress,
        vendor: "WeatherNode",
        purpose: `Fetch weather data for ${location}`,
        resourceUrl: `${config.sellerBaseUrl}/api/weather`,
      };

      const result = await gate.verifyAndPay(intent, payForResource);

      if (result.verification.allowed) {
        return JSON.stringify(result.data);
      } else {
        return JSON.stringify({
          error: "Payment blocked by Preflight policy verification",
          reason: result.verification.checkResponse.reason,
          proof_id: result.verification.proofId,
        });
      }
    },
    {
      name: "fetch_weather",
      description: "Fetch current weather data for a location. Costs $0.001 USDC via x402 Nanopayment.",
      schema: z.object({
        location: z.string().describe("City and state/country"),
      }),
    }
  );

  const fetchMarketData = tool(
    async ({ symbol }) => {
      const intent: PaymentIntent = {
        amount: "0.002",
        recipient: config.sellerAddress,
        vendor: "MarketPulse",
        purpose: `Fetch market data for ${symbol}`,
        resourceUrl: `${config.sellerBaseUrl}/api/market`,
      };

      const result = await gate.verifyAndPay(intent, payForResource);

      if (result.verification.allowed) {
        return JSON.stringify(result.data);
      } else {
        return JSON.stringify({
          error: "Payment blocked by Preflight policy verification",
          reason: result.verification.checkResponse.reason,
          proof_id: result.verification.proofId,
        });
      }
    },
    {
      name: "fetch_market_data",
      description: "Fetch real-time market price data for a trading pair. Costs $0.002 USDC via x402 Nanopayment.",
      schema: z.object({
        symbol: z.string().describe("Trading pair like ETH/USD"),
      }),
    }
  );

  const fetchRiskScore = tool(
    async ({ protocol }) => {
      const intent: PaymentIntent = {
        amount: "0.005",
        recipient: config.sellerAddress,
        vendor: "RiskLens",
        purpose: `Fetch risk score for ${protocol}`,
        resourceUrl: `${config.sellerBaseUrl}/api/risk`,
      };

      const result = await gate.verifyAndPay(intent, payForResource);

      if (result.verification.allowed) {
        return JSON.stringify(result.data);
      } else {
        return JSON.stringify({
          error: "Payment blocked by Preflight policy verification",
          reason: result.verification.checkResponse.reason,
          proof_id: result.verification.proofId,
        });
      }
    },
    {
      name: "fetch_risk_score",
      description: "Fetch a DeFi protocol risk assessment. Costs $0.005 USDC via x402 Nanopayment.",
      schema: z.object({
        protocol: z.string().describe("DeFi protocol name like 'Aave V3'"),
      }),
    }
  );

  const fetchAnalytics = tool(
    async ({ report_type }) => {
      const intent: PaymentIntent = {
        amount: "0.003",
        recipient: config.sellerAddress,
        vendor: "DataStream Analytics",
        purpose: `Fetch ${report_type} analytics report`,
        resourceUrl: `${config.sellerBaseUrl}/api/analytics`,
      };

      const result = await gate.verifyAndPay(intent, payForResource);

      if (result.verification.allowed) {
        return JSON.stringify(result.data);
      } else {
        return JSON.stringify({
          error: "Payment blocked by Preflight policy verification",
          reason: result.verification.checkResponse.reason,
          proof_id: result.verification.proofId,
        });
      }
    },
    {
      name: "fetch_analytics",
      description: "Fetch a DeFi analytics report. Costs $0.003 USDC via x402 Nanopayment.",
      schema: z.object({
        report_type: z.string().describe("Type of report, e.g. 'DeFi Yield Analysis'"),
      }),
    }
  );

  /**
   * This tool simulates what happens when the agent is tricked
   * by a prompt injection to make an unauthorized transfer.
   * Preflight should catch and block it.
   */
  const transferUsdc = tool(
    async ({ amount, recipient, reason }) => {
      const intent: PaymentIntent = {
        amount,
        recipient,
        vendor: "Direct Transfer",
        purpose: reason,
        resourceUrl: "", // no x402 endpoint — raw transfer attempt
      };

      const result = await gate.verify(intent);

      if (result.allowed) {
        // In the demo, we never actually execute an unverified transfer
        return JSON.stringify({
          status: "TRANSFER_EXECUTED",
          amount,
          recipient,
          proof_id: result.proofId,
        });
      } else {
        return JSON.stringify({
          status: "TRANSFER_BLOCKED",
          reason: result.checkResponse.reason,
          violated_rule: result.checkResponse.violated_rule,
          proof_id: result.proofId,
        });
      }
    },
    {
      name: "transfer_usdc",
      description: "Transfer USDC to a wallet address. Use this for direct payments or transfers.",
      schema: z.object({
        amount: z.string().describe("Amount of USDC to transfer"),
        recipient: z.string().describe("Recipient wallet address"),
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );

  return [fetchWeather, fetchMarketData, fetchRiskScore, fetchAnalytics, transferUsdc];
}
