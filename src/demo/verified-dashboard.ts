/**
 * Terminal UI for the Verified Nanopayments demo.
 *
 * Focused on protocol-level display:
 *  - Header contents (Payment-Signature + X-Preflight-Proof)
 *  - Side-by-side unprotected vs protected flow
 *  - Proof metadata (proof_id, policy_hash, verify_ms, SAT/UNSAT)
 *  - Timing breakdown per step
 */
import chalk from "chalk";
import type { VerifiedPayFlowResult } from "../gateway/verified-pay.js";
import type { CheckResponse } from "../preflight/client.js";

const LINE = "═".repeat(62);
const THIN = "─".repeat(62);

export function printBanner(): void {
  console.log();
  console.log(chalk.cyan("╔" + LINE + "╗"));
  console.log(
    chalk.cyan("║") +
      chalk.bold.white(
        "  Verified Nanopayments — Cryptographic Verification Layer  "
      ) +
      chalk.cyan("║")
  );
  console.log(
    chalk.cyan("║") +
      chalk.gray(
        "  Preflight ZK Proofs + Circle x402 Nanopayments             "
      ) +
      chalk.cyan("║")
  );
  console.log(
    chalk.cyan("║") +
      chalk.gray(
        "  ICME Labs × Circle                                         "
      ) +
      chalk.cyan("║")
  );
  console.log(chalk.cyan("╚" + LINE + "╝"));
  console.log();
}

export function printSceneHeader(
  scene: number,
  title: string,
  description: string
): void {
  console.log();
  console.log(chalk.cyan(LINE));
  console.log(chalk.bold.cyan(`  Scene ${scene}: ${title}`));
  for (const line of description.split("\n")) {
    console.log(chalk.gray(`    ${line.trim()}`));
  }
  console.log(chalk.cyan(LINE));
  console.log();
}

export function printStepHeader(step: string): void {
  console.log(chalk.white.bold(`  > ${step}`));
}

/**
 * Display unprotected payment flow (no proof).
 */
export function printUnprotectedPayment(
  url: string,
  result: { data: unknown; status: number; formattedAmount?: string }
): void {
  console.log(chalk.yellow("  [Unprotected Flow]"));
  console.log(chalk.gray(`    URL: ${url}`));
  console.log(chalk.gray(`    Headers sent:`));
  console.log(chalk.gray(`      Payment-Signature: <EIP-3009 authorization>`));
  console.log(chalk.yellow(`      X-Preflight-Proof: (none)`));
  console.log();
  console.log(
    chalk.green(`    Status: ${result.status}`) +
      (result.formattedAmount
        ? chalk.gray(` — paid ${result.formattedAmount} USDC`)
        : "")
  );
  console.log(chalk.gray(`    Data received: ${typeof result.data === "object" ? "yes" : "no"}`));
  console.log(chalk.yellow(`    Policy check: NONE — any valid signature accepted`));
  console.log();
}

/**
 * Display verified payment flow (with proof).
 */
export function printVerifiedPayment(result: VerifiedPayFlowResult): void {
  console.log(chalk.green("  [Verified Flow]"));
  console.log(chalk.gray(`    Action: ${truncate(result.action, 70)}`));
  console.log();

  // Preflight check
  console.log(chalk.gray("    Preflight check:"));
  if (result.allowed) {
    console.log(chalk.green(`      Result: SAT (allowed)`));
  } else {
    console.log(chalk.red.bold(`      Result: ${result.check.result} (blocked)`));
  }
  if (result.proofId) {
    console.log(chalk.magenta(`      Proof ID: ${result.proofId}`));
  }
  console.log(chalk.gray(`      Time: ${result.preflightMs}ms`));

  if (result.check.reason) {
    console.log(chalk.gray(`      Reason: ${result.check.reason}`));
  }
  if (result.check.violated_rule !== undefined) {
    console.log(
      chalk.yellow(`      Violated Rule: #${result.check.violated_rule}`)
    );
  }
  console.log();

  // Payment execution (only if allowed)
  if (result.allowed && result.payment) {
    console.log(chalk.gray("    Payment execution:"));
    console.log(chalk.gray(`      Headers sent:`));
    console.log(
      chalk.gray(`        Payment-Signature: <EIP-3009 authorization>`)
    );
    console.log(
      chalk.green(
        `        X-Preflight-Proof: ${JSON.stringify({
          proof_id: result.payment.proofHeader.proof_id,
          claimed_result: result.payment.proofHeader.claimed_result,
        })}`
      )
    );
    console.log(
      chalk.green(`      Status: ${result.payment.status}`) +
        chalk.gray(` — paid ${result.payment.formattedAmount} USDC`)
    );
    if (result.paymentMs) {
      console.log(chalk.gray(`      Time: ${result.paymentMs}ms`));
    }
  } else if (!result.allowed) {
    console.log(chalk.red("    Payment execution: BLOCKED — no payment signed"));
  }
  console.log();
}

/**
 * Display a blocked malicious action.
 */
export function printBlockedAction(result: VerifiedPayFlowResult): void {
  console.log(chalk.red.bold("  [BLOCKED — Policy Violation]"));
  console.log(chalk.gray(`    Action: ${truncate(result.action, 70)}`));
  console.log(chalk.red(`    Result: ${result.check.result}`));

  if (result.check.reason) {
    console.log(chalk.red(`    Reason: ${result.check.reason}`));
  }
  if (result.check.violated_rule !== undefined) {
    console.log(
      chalk.yellow(`    Violated Rule: #${result.check.violated_rule}`)
    );
  }
  if (result.proofId) {
    console.log(chalk.magenta(`    ZK Proof: ${result.proofId}`));
  }
  console.log(chalk.gray(`    Preflight time: ${result.preflightMs}ms`));
  console.log(chalk.red(`    Payment signed: NO — UNSAT blocks before EIP-3009`));
  console.log();
}

/**
 * Display independent proof verification results.
 */
export function printProofVerification(
  label: string,
  proofId: string,
  verifyResult: { valid: boolean; claimed_result: string; verify_ms: number; policy_hash: string }
): void {
  const icon = verifyResult.valid ? chalk.green("V") : chalk.red("X");
  console.log(
    `  ${icon} ${label}`
  );
  console.log(chalk.gray(`    Proof ID:    ${proofId}`));
  console.log(chalk.gray(`    Valid:       ${verifyResult.valid}`));
  console.log(chalk.gray(`    Result:      ${verifyResult.claimed_result}`));
  console.log(chalk.gray(`    Policy hash: ${verifyResult.policy_hash}`));
  console.log(chalk.gray(`    Verify time: ${verifyResult.verify_ms}ms`));
  console.log();
}

/**
 * Display a Preflight check result (for Scene 3 where no payment is attempted).
 */
export function printPreflightCheck(
  action: string,
  check: CheckResponse,
  timeMs: number
): void {
  const allowed = check.result === "SAT" && !check.blocked;

  if (allowed) {
    console.log(chalk.green(`  SAT`) + chalk.gray(` — ${truncate(action, 60)}`));
  } else {
    console.log(
      chalk.red.bold(`  BLOCKED [${check.result}]`) +
        chalk.gray(` — ${truncate(action, 50)}`)
    );
  }

  if (check.reason) {
    console.log(chalk.gray(`    Reason: ${check.reason}`));
  }
  if (check.violated_rule !== undefined) {
    console.log(chalk.yellow(`    Violated Rule: #${check.violated_rule}`));
  }
  if (check.proof_id) {
    console.log(chalk.magenta(`    ZK Proof: ${check.proof_id}`));
  }
  console.log(chalk.gray(`    Time: ${timeMs}ms`));
  console.log();
}

/**
 * Print the final summary comparing protected and unprotected flows.
 */
export function printSummary(stats: {
  unprotectedPayments: number;
  verifiedPayments: number;
  blockedPayments: number;
  proofsGenerated: number;
  proofsVerified: number;
}): void {
  console.log();
  console.log(chalk.cyan(LINE));
  console.log(chalk.bold.white("  Summary — The Verification Gap"));
  console.log(chalk.cyan(LINE));
  console.log();
  console.log(
    chalk.yellow(
      `  Unprotected payments:  ${stats.unprotectedPayments}  (signature only — no policy check)`
    )
  );
  console.log(
    chalk.green(
      `  Verified payments:     ${stats.verifiedPayments}  (signature + ZK proof of compliance)`
    )
  );
  console.log(
    chalk.red(
      `  Blocked by Preflight:  ${stats.blockedPayments}  (UNSAT — never signed)`
    )
  );
  console.log(
    chalk.magenta(
      `  ZK proofs generated:   ${stats.proofsGenerated}`
    )
  );
  console.log(
    chalk.magenta(
      `  Proofs independently verified: ${stats.proofsVerified}`
    )
  );
  console.log();
  console.log(chalk.cyan(THIN));
  console.log(
    chalk.gray("  x402 authenticates:  is this signature valid?")
  );
  console.log(
    chalk.bold.white("  Preflight authorizes: should this payment happen?")
  );
  console.log(chalk.cyan(THIN));
  console.log();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}
