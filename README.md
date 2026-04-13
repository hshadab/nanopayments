# Verified Nanopayments

**Preflight ZK proofs on Base gating Circle Nanopayments on Arc**

ICME Labs x Circle

---

## The problem in plain English

Circle's Nanopayments let AI agents pay for things instantly with USDC — no gas, no friction. Under the hood, a TEE (Trusted Execution Environment) checks that the agent's signature is *valid*. But "valid signature" and "should this payment happen" are two different questions.

A compromised agent can sign a perfectly valid EIP-3009 authorization to send 0.5 USDC to an attacker. The signature is real. The TEE will accept it. The money moves. Nothing in the x402 protocol asks *"does this payment comply with the agent's spending policy?"*

That's the gap. Authentication without authorization.

## How we close it

We attach a ZK proof of policy compliance to every payment. The proof travels WITH the x402 payment in a custom HTTP header (`X-Preflight-Proof`), and the seller verifies it before accepting.

Here's what happens step by step:

1. **Agent wants to pay** for weather data ($0.001 USDC).
2. **Preflight checks the intent** — "Transfer 0.001 USDC to WeatherNode for weather data" is sent to the ICME API, which runs it through a formal solver (Z3 + AWS Automated Reasoning) against a compiled policy. Result: SAT (all 9 rules satisfied). A ZK proof is generated. Cost: $0.01.
3. **Proof gets attached** — the proof ID is packed into an `X-Preflight-Proof` header.
4. **x402 payment fires** — Circle's GatewayClient sends the payment signature AND the proof header together.
5. **Seller checks the proof** — before accepting the Nanopayment, the seller calls ICME's public `verifyProof` endpoint. No API key needed. If the proof is valid and says SAT, the payment goes through. If not, it's rejected.

Now imagine a prompt injection tells the agent to send 0.5 USDC to an attacker wallet. Step 2 returns UNSAT — amount exceeds limit, recipient not in allowlist, urgency tactic detected. The payment is never signed. No EIP-3009 authorization ever exists.

## What the demo shows (4 scenes)

| Scene | What happens | Result |
|---|---|---|
| **1. The Gap** | Pay for weather data with no proof. Any valid signature is accepted. | Payment succeeds — no policy check. |
| **2. The Fix** | Same payment, but with a Preflight proof attached. Seller verifies before accepting. | Payment succeeds — proof confirms compliance. |
| **3. The Block** | Compromised agent tries 0.5 USDC to attacker wallet. Preflight says UNSAT. | Payment never signed. Attack stopped before it starts. |
| **4. Independent Verification** | Take the proof IDs from scenes 2 and 3. Anyone can verify them publicly. | Proofs check out — no policy access needed. |

## ICME Preflight API (what we're calling)

| Endpoint | What it does | Cost |
|---|---|---|
| `POST /v1/checkIt` | Check an action against a compiled policy. Returns SAT/UNSAT + proof_id. | 1 credit ($0.01) |
| `POST /v1/checkRelevance` | Quick check: is this action even relevant to the policy? | Free |
| `POST /v1/verifyProof` | Publicly verify a proof by ID. Single-use. No API key. | Free |
| `GET /v1/proof/{id}` | Get proof status (authenticated). | Free |
| `POST /v1/makeRules` | Compile a natural language policy into SMT-LIB2. One-time. | 300 credits ($3.00) |

**checkIt response shape:**
```json
{
  "check_id": "uuid",
  "result": "SAT",
  "blocked": false,
  "reason": "All policy constraints satisfied",
  "proof": "zk-proof-receipt-string",
  "proof_id": "uuid"
}
```

**verifyProof response shape:**
```json
{
  "valid": true,
  "policy_hash": "hex-string",
  "claimed_result": "SAT",
  "verify_ms": 42,
  "used": true
}
```

New accounts get 325 free credits (enough for 1 policy compile + 25 checks). Top-ups start at $5 for 500 credits.

## Architecture

```
Agent decides to pay
        |
        v
+---------------------------+
|  Preflight (Base)         |     POST /v1/checkIt
|  "Should this happen?"    |---> SAT + proof_id
|  ZK proof generated       |     or UNSAT + proof_id
+---------------------------+
        |
        | X-Preflight-Proof header
        v
+---------------------------+
|  Circle Nanopayments (Arc)|     x402 flow:
|  "Is this signature valid?"|     GET /resource -> 402
|  GatewayClient.pay()      |     Sign EIP-3009 -> retry
|  Payment-Signature header  |     with both headers
+---------------------------+
        |
        v
+---------------------------+
|  Seller server            |
|  1. proof-guard: verify   |     POST /v1/verifyProof
|     X-Preflight-Proof     |
|  2. gateway.require():    |     x402 settlement
|     accept payment        |
+---------------------------+
```

## Setup

```bash
npm install

cp .env.example .env
# Fill in:
#   PRIVATE_KEY        — EVM wallet (fund with testnet USDC from Circle faucet)
#   SELLER_ADDRESS     — your wallet address
#   ICME_API_KEY       — from docs.icme.io
#   ICME_POLICY_ID     — from policy compilation step below
#   OPENAI_API_KEY     — only needed for legacy demo (npm run demo:legacy)

# Compile the payment policy (one-time, ~3-7 min, $3.00)
npm run policy:create
# Copy the output ICME_POLICY_ID to your .env

# Start the seller server (terminal 1)
npm run seller

# Run the verified demo (terminal 2)
npm run demo
```

## Scripts

| Command | What it runs |
|---|---|
| `npm run demo` | Verified demo (4 scenes, no OpenAI needed) |
| `npm run demo:verified` | Same as above |
| `npm run demo:legacy` | Original LangChain agent demo (3 acts, needs OpenAI) |
| `npm run seller` | Start the seller server |
| `npm run policy:create` | Compile the Preflight policy |
| `npm run build` | TypeScript compile |

## Project structure

```
src/
├── preflight/
│   ├── client.ts           # Preflight API client (checkIt, verifyProof, makeRules)
│   ├── middleware.ts        # PreflightGate — verify intent before payment
│   ├── policy.ts            # 9-rule payment policy in natural language
│   └── create-policy.ts     # One-time policy compiler script
├── seller/
│   ├── server.ts            # x402 paywalled APIs (unprotected + verified endpoints)
│   └── proof-guard.ts       # Express middleware: verify X-Preflight-Proof header
├── gateway/
│   ├── client.ts            # Circle GatewayClient wrapper (Arc Testnet)
│   ├── verified-client.ts   # Wraps GatewayClient.pay() to inject proof header
│   └── verified-pay.ts      # Combined flow: Preflight check -> proof inject -> x402 pay
├── agent/
│   ├── index.ts             # LangChain agent (legacy demo only)
│   └── tools.ts             # Agent tools routed through PreflightGate
├── demo/
│   ├── verified-demo.ts     # 4-scene verified demo orchestrator
│   ├── verified-dashboard.ts # Terminal UI for verified demo
│   ├── run.ts               # Legacy 3-act demo orchestrator
│   ├── attacks.ts           # Prompt injection scenarios
│   └── dashboard.ts         # Terminal UI for legacy demo
├── types.ts                 # Shared types (PreflightProofHeader, ProofVerifiedRequest)
└── config.ts                # Environment-based configuration
```

## How the proof header works

Circle's `GatewayClient.pay(url, { headers })` merges custom headers into the retry request alongside `Payment-Signature`. We use this to send:

```
X-Preflight-Proof: {"proof_id":"abc-123","claimed_result":"SAT","timestamp":"..."}
```

On the seller side, `proof-guard` middleware reads this header BEFORE `gateway.require()` runs. It calls the public `verifyProof` endpoint to confirm the proof is real and says SAT. No SDK modification needed — this uses documented extension points on both sides.

## Key differentiator

Every competitor offers spending *controls* (if-statements). Preflight offers spending *proofs* (ZK):

| | Controls | Proofs |
|---|---|---|
| **Mechanism** | Check rules before paying | Mathematically prove all constraints satisfied |
| **Verifiability** | Trust the middleware ran | Anyone can verify the proof independently |
| **Privacy** | Auditor sees the policy | Auditor verifies without seeing the policy |
| **Auditability** | Log files | Cryptographic receipts (EU AI Act ready) |

---

*Nanopayments moves money at the speed of AI. Preflight proves it moved correctly.*
