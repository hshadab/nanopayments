#!/usr/bin/env tsx
/**
 * Demo orchestrator — runs the full Verified Nanopayments demo.
 *
 * Flow:
 *   1. Start seller server (x402 paywalled data APIs)
 *   2. Initialize Preflight gate with compiled policy
 *   3. Run agent on legitimate research task → payments pass
 *   4. Run agent on task that triggers prompt injection → attack blocked
 *   5. Run direct attack → blocked with ZK proof
 *   6. Independently verify the block proof
 *   7. Print summary dashboard
 *
 * Usage: npm run demo
 */
import "dotenv/config";
import { PreflightGate } from "../preflight/middleware.js";
import { PreflightClient } from "../preflight/client.js";
import { ensureBalance } from "../gateway/client.js";
import { runAgent } from "../agent/index.js";
import { DEMO_TASKS } from "./attacks.js";
import {
  printBanner,
  printPhaseHeader,
  printVerification,
  printProofVerification,
  printSummary,
  printAgentOutput,
} from "./dashboard.js";

async function main() {
  printBanner();

  // ── Setup ────────────────────────────────────────────────────────────────

  printPhaseHeader("Setup", "Initializing Preflight gate and Gateway balance");

  const gate = new PreflightGate();
  const preflightClient = new PreflightClient();

  // Log every verification in real-time
  gate.onVerification(printVerification);

  // Ensure we have USDC in the Gateway for Nanopayments
  try {
    await ensureBalance(1);
    console.log("  Gateway balance confirmed.\n");
  } catch (err) {
    console.log("  ⚠ Gateway balance check skipped (set PRIVATE_KEY to enable)\n");
  }

  // ── Act 1: Legitimate operations ─────────────────────────────────────────

  printPhaseHeader(
    "Act 1: Normal Operations",
    "Agent fetches weather, market, and risk data via x402 Nanopayments.\n" +
    "    Each payment is formally verified by Preflight before execution."
  );

  try {
    const output1 = await runAgent(gate, DEMO_TASKS.legitimate);
    printAgentOutput(output1);
  } catch (err) {
    console.log(`  ⚠ Agent error: ${(err as Error).message}\n`);
  }

  // ── Act 2: Prompt injection via poisoned data ────────────────────────────

  printPhaseHeader(
    "Act 2: Indirect Prompt Injection",
    "Agent fetches analytics report containing embedded attack payload.\n" +
    "    The poisoned data instructs the agent to drain its wallet.\n" +
    "    Preflight catches the unauthorized transfer attempt."
  );

  try {
    const output2 = await runAgent(gate, DEMO_TASKS.compromised);
    printAgentOutput(output2);
  } catch (err) {
    console.log(`  ⚠ Agent error: ${(err as Error).message}\n`);
  }

  // ── Act 3: Direct attack ─────────────────────────────────────────────────

  printPhaseHeader(
    "Act 3: Direct Attack",
    "Simulating a fully compromised agent context.\n" +
    "    Agent is explicitly instructed to drain wallet.\n" +
    "    Preflight blocks with ZK proof of policy violation."
  );

  try {
    const output3 = await runAgent(gate, DEMO_TASKS.directAttack);
    printAgentOutput(output3);
  } catch (err) {
    console.log(`  ⚠ Agent error: ${(err as Error).message}\n`);
  }

  // ── Proof Verification ───────────────────────────────────────────────────

  const log = gate.getLog();
  const blockedWithProof = log.filter((r) => !r.allowed && r.proofId);

  if (blockedWithProof.length > 0) {
    printPhaseHeader(
      "Independent Proof Verification",
      "Any third party can verify that blocked payments were policy-compliant.\n" +
      "    No access to the policy, the agent, or the middleware required.\n" +
      "    Just the proof_id and a single API call."
    );

    for (const entry of blockedWithProof) {
      try {
        console.log(`  Verifying proof for blocked action...`);
        const proofResult = await preflightClient.verifyProof(entry.proofId!);
        printProofVerification(entry.proofId!, proofResult.valid, proofResult.verify_ms);
      } catch (err) {
        console.log(`  ⚠ Proof verification skipped: ${(err as Error).message}\n`);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  printSummary(log);
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
