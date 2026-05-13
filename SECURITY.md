# Security Policy

## Scope

This repository is a reference integration showing how to add ICME Preflight ZK-proof authorization to Circle Nanopayments. It is not production code. The security model below describes the design; production deployments should re-derive guarantees against their own threat model.

## Threat model

The system is designed to defend the **buyer's principal** (the human or organization on whose behalf the agent acts) and the **seller** against:

1. **Compromised agent context.** Prompt injection, malicious tool output, or poisoned context attempting to coerce the agent into authorizing a payment that violates the principal's spending policy.
2. **Compromised agent runtime.** A fully malicious agent with valid wallet credentials attempting to drain funds within the limits of those credentials.
3. **Untrusted seller.** A seller attempting to claim a payment was authorized when it was not.
4. **Replay.** Re-use of an authorization proof for a payment other than the one it was generated for.

Out of scope:
- Private-key compromise of the buyer wallet. Preflight is an authorization layer; it does not replace key custody. Use Circle Agent Wallet policies as a complementary defense in depth.
- Compromise of the ICME Preflight service itself. Trust in the policy hash and the JOLT-Atlas proof system is assumed; this should be re-evaluated for production use.
- Network-level attacks on Arc Testnet, Base, or x402.

## Security primitives

- **Policy compilation.** Natural-language policies are compiled once via `POST /v1/makeRules` into SMT-LIB2 and content-addressed by `policy_hash`. The hash is included in every proof, binding the proof to a specific policy version.
- **Dual-solver verification.** Each `checkIt` runs Z3 and AWS Automated Reasoning in parallel; results must agree. An LLM result is reported but does not gate SAT/UNSAT.
- **ZK proof.** JOLT-Atlas generates a proof of policy satisfaction for the extracted action. The proof can be verified publicly by `proof_id` without policy access.
- **Single-use proofs.** Each proof_id is consumable once via `verifyProof`. Re-use returns `used: true` and is rejected by the seller middleware in this repo.
- **Header binding.** The `X-Preflight-Proof` header carries `proof_id` and `claimed_result` alongside the x402 `Payment-Signature`. The seller verifies both before responding.

## Known limitations

- The action description sent to `checkIt` is constructed by `describePaymentAction()` in `src/preflight/policy.ts`. A buggy or malicious buyer client could lie in this description. Production sellers should treat the proof as evidence that *some* well-formed action satisfied the policy; high-value flows should additionally compare extracted fields (`transferAmount`, recipient) against the actual x402 payment.
- Proof generation latency (~30–60 s) is high for sub-cent Nanopayments. The default profile gates per-payment; session-amortized proofs are roadmap.
- The seller verifier endpoint is reachable over plain HTTPS. Network-level integrity is delegated to TLS.

## Reporting a vulnerability

This is a personal research repo. For sensitive issues, please open a private security advisory on GitHub or email the maintainer directly via the contact listed on the GitHub profile. Do not file public issues for actively exploitable vulnerabilities.

For vulnerabilities specific to the ICME Preflight service, please follow the disclosure process at https://docs.icme.io. For vulnerabilities in Circle Nanopayments or x402, please follow Circle's responsible disclosure process at https://www.circle.com/legal/security.
