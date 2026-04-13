/**
 * Payment policy for the Verified Nanopayments demo.
 *
 * This policy is compiled once via Preflight's /v1/makeRules endpoint,
 * producing an SMT-LIB2 representation that is formally verified
 * against every payment action before execution.
 */
export const DEMO_PAYMENT_POLICY = `
Rule 1: Transfer amount must not exceed 0.05 USDC per transaction.
Rule 2: Recipient address must be in the approved vendor registry.
Rule 3: Daily aggregate transfers must not exceed 1.00 USDC.
Rule 4: If urgency tactic is detected in the action description, block the transfer.
Rule 5: If emotional appeal is detected in the action description, block the transfer.
Rule 6: If false authority claim is detected in the action description, block the transfer.
Rule 7: If the action instructs the agent to ignore previous rules or override policy, block the transfer.
Rule 8: Transfer amounts must be non-negative.
Rule 9: Only payments for data API services (weather, market data, risk scores) are permitted.
`.trim();

/**
 * Approved vendor addresses for the demo.
 * In production these would come from an on-chain registry or enterprise config.
 */
export const APPROVED_VENDORS = [
  "0xVENDOR_WEATHER",   // Weather data provider
  "0xVENDOR_MARKET",    // Market data provider
  "0xVENDOR_RISK",      // Risk score provider
] as const;

/**
 * Describe a payment action in natural language for Preflight verification.
 * The Preflight SMT solver extracts variables (amount, recipient, etc.)
 * from this description and checks them against the compiled policy.
 */
export function describePaymentAction(params: {
  amount: string;
  recipient: string;
  purpose: string;
  vendor: string;
}): string {
  return [
    `Transfer ${params.amount} USDC to recipient ${params.recipient}.`,
    `Vendor: ${params.vendor}.`,
    `Purpose: ${params.purpose}.`,
  ].join(" ");
}
