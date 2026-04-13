import chalk from "chalk";
import type { VerificationResult } from "../preflight/middleware.js";

const LINE = "═".repeat(62);
const THIN = "─".repeat(62);

export function printBanner(): void {
  console.log();
  console.log(chalk.cyan("╔" + LINE + "╗"));
  console.log(chalk.cyan("║") + chalk.bold.white("  Verified Nanopayments Demo                                  ") + chalk.cyan("║"));
  console.log(chalk.cyan("║") + chalk.gray("  Preflight ZK Proofs on Base → Circle Nanopayments on Arc    ") + chalk.cyan("║"));
  console.log(chalk.cyan("║") + chalk.gray("  ICME Labs × Circle                                         ") + chalk.cyan("║"));
  console.log(chalk.cyan("╚" + LINE + "╝"));
  console.log();
}

export function printPhaseHeader(phase: string, description: string): void {
  console.log();
  console.log(chalk.cyan(THIN));
  console.log(chalk.bold.cyan(`  ▸ ${phase}`));
  console.log(chalk.gray(`    ${description}`));
  console.log(chalk.cyan(THIN));
  console.log();
}

export function printVerification(result: VerificationResult): void {
  const { allowed, action, checkResponse, proofId } = result;

  if (allowed) {
    console.log(chalk.green("  ✔ ALLOWED") + chalk.gray(` [${checkResponse.result}]`));
  } else {
    console.log(chalk.red.bold("  ✘ BLOCKED") + chalk.gray(` [${checkResponse.result}]`));
  }

  // Truncate action to fit terminal
  const truncated = action.length > 80 ? action.slice(0, 77) + "..." : action;
  console.log(chalk.gray(`    Action: ${truncated}`));

  if (checkResponse.reason) {
    console.log(chalk.gray(`    Reason: ${checkResponse.reason}`));
  }

  if (checkResponse.violated_rule !== undefined) {
    console.log(chalk.yellow(`    Violated Rule: #${checkResponse.violated_rule}`));
  }

  if (proofId) {
    console.log(chalk.magenta(`    ZK Proof: ${proofId}`));
  }

  console.log();
}

export function printProofVerification(proofId: string, valid: boolean, verifyMs: number): void {
  if (valid) {
    console.log(chalk.green.bold(`  ✔ Proof verified independently`));
  } else {
    console.log(chalk.red.bold(`  ✘ Proof verification failed`));
  }
  console.log(chalk.gray(`    Proof ID: ${proofId}`));
  console.log(chalk.gray(`    Verified in: ${verifyMs}ms`));
  console.log();
}

export function printSummary(results: VerificationResult[]): void {
  const allowed = results.filter((r) => r.allowed);
  const blocked = results.filter((r) => !r.allowed);

  console.log();
  console.log(chalk.cyan(LINE));
  console.log(chalk.bold.white("  Summary"));
  console.log(chalk.cyan(LINE));
  console.log();
  console.log(chalk.white(`  Total checks:    ${results.length}`));
  console.log(chalk.green(`  Allowed (SAT):   ${allowed.length}`));
  console.log(chalk.red(`  Blocked (UNSAT): ${blocked.length}`));

  const proofCount = results.filter((r) => r.proofId).length;
  console.log(chalk.magenta(`  ZK proofs:       ${proofCount}`));

  if (blocked.length > 0) {
    console.log();
    console.log(chalk.bold.red("  Blocked actions:"));
    for (const r of blocked) {
      const truncated = r.action.length > 70 ? r.action.slice(0, 67) + "..." : r.action;
      console.log(chalk.red(`    ✘ ${truncated}`));
      if (r.checkResponse.violated_rule !== undefined) {
        console.log(chalk.yellow(`      Rule #${r.checkResponse.violated_rule}: ${r.checkResponse.reason}`));
      }
    }
  }

  console.log();
  console.log(chalk.cyan(LINE));
  console.log(chalk.gray("  Nanopayments moves money at the speed of AI."));
  console.log(chalk.bold.white("  Preflight proves it moved correctly."));
  console.log(chalk.cyan(LINE));
  console.log();
}

export function printAgentOutput(output: string): void {
  console.log(chalk.gray("  ┌─ Agent Output ────────────────────────────────────────"));
  for (const line of output.split("\n")) {
    console.log(chalk.gray("  │ ") + line);
  }
  console.log(chalk.gray("  └───────────────────────────────────────────────────────"));
  console.log();
}
