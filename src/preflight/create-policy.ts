#!/usr/bin/env tsx
/**
 * One-time script to compile the demo payment policy via Preflight.
 * Run: npm run policy:create
 *
 * Costs 300 credits ($3.00). Streams progress to stdout.
 * Outputs the policy_id to add to your .env file.
 */
import "dotenv/config";
import { PreflightClient } from "./client.js";
import { DEMO_PAYMENT_POLICY } from "./policy.js";

async function main() {
  const client = new PreflightClient();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Preflight Policy Compiler                              ║");
  console.log("║  Compiling natural language → SMT-LIB2 formal logic     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();
  console.log("Policy:");
  console.log(DEMO_PAYMENT_POLICY);
  console.log();
  console.log("Compiling... (this takes 2–7 minutes)\n");

  const policyId = await client.compilePolicy(DEMO_PAYMENT_POLICY, (event) => {
    if (event.type === "progress") {
      console.log(`  [${event.step}] ${event.message}`);
    } else if (event.type === "done") {
      console.log(`\n  ✔ Compiled. Scenarios generated: ${event.scenario_count}`);
    } else if (event.type === "error") {
      console.error(`  ✘ Error: ${event.message}`);
    }
  });

  console.log();
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ICME_POLICY_ID=${policyId}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log();
  console.log("Add this to your .env file, then run: npm run demo");
}

main().catch((err) => {
  console.error("Failed to compile policy:", err.message);
  process.exit(1);
});
