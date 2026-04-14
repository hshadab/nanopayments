# Verified Nanopayments

> **Built with [Preflight](https://docs.icme.io)** — formal verification and ZK proofs for autonomous agent spending decisions.

**Spending authorization for Circle Nanopayments**

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

Both `makeRules` and `checkIt` return **SSE streams**, not plain JSON. Each line is `data: {...}\n\n`. The final event has `"step":"done"` and contains the result. See the gotchas section below.

**checkIt final SSE event:**
```json
{
  "step": "done",
  "result": "SAT",
  "z3_result": "SAT",
  "ar_result": "SAT",
  "llm_result": "SAT",
  "check_id": "uuid",
  "zk_proof_id": "uuid",
  "detail": "Satisfiable",
  "verification_time_ms": 6000,
  "extracted": { "transferAmount": 0.001, "urgencyTacticDetected": false, "..." : "..." }
}
```

**verifyProof response (plain JSON):**
```json
{
  "valid": true,
  "result": "SAT",
  "policy_hash": "hex-string",
  "verify_ms": 400,
  "used": true,
  "proof_bytes_len": 93418,
  "trace_length": 1048576
}
```

New accounts get 500 credits ($5 USDC on Base). Top-ups are $5 for 500 credits.

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

## Setup (step by step)

### What you need before starting

- Node.js v20+
- An EVM private key with at least 10 USDC on **Base mainnet** (for ICME account + credits)
- Access to https://faucet.circle.com/ for free Arc Testnet USDC

You will spend real USDC on Base mainnet: 5 USDC for account creation, 5 USDC for a credit top-up, and 300 credits ($3) for policy compilation. After that, each check costs 1 credit ($0.01).

### Step 1. Install dependencies

```bash
npm install
```

### Step 2. Create your .env file

```bash
cp .env.example .env
```

Open `.env` and add your private key:

```
PRIVATE_KEY=0x_your_private_key_here
```

Leave everything else alone for now. The scripts below will give you the values to fill in.

### Step 3. Create an ICME Preflight account

This pays 5 USDC on Base mainnet and gives you an API key + 500 credits.

```bash
npx tsx scripts/create-icme-account.ts
```

Copy the API key it prints into your `.env`:

```
ICME_API_KEY=sk-smt-your-key-here
```

### Step 4. Top up credits

You need 300 credits to compile the policy. Account creation gave you 500, but if you've used some or want a buffer:

```bash
npx tsx scripts/topup-icme.ts
```

This pays 5 USDC on Base for 500 more credits.

### Step 5. Generate a seller address

The buyer and seller **cannot be the same wallet**. Circle Gateway rejects self-transfers. Generate a fresh address:

```bash
npx tsx -e "
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const pk = generatePrivateKey();
console.log('SELLER_ADDRESS=' + privateKeyToAccount(pk).address);
"
```

Paste the output into your `.env`. This address does not need funds.

### Step 6. Compile the payment policy

This converts the 9 natural language rules into formal SMT-LIB2 logic. Costs 300 credits. Takes 3-7 minutes.

```bash
npm run policy:create
```

It prints a policy ID when done. Copy it into your `.env`:

```
ICME_POLICY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

You only do this once. The policy ID is permanent.

### Step 7. Get Arc Testnet USDC

Go to https://faucet.circle.com/ and:

1. Select **Arc Testnet** from the network dropdown
2. Paste the wallet address derived from your `PRIVATE_KEY`
3. Complete the captcha and submit

You get 10-20 USDC. The demo needs about 1 USDC.

### Step 8. Run the demo

Open two terminals.

**Terminal 1** -- start the seller:

```bash
npm run seller
```

You should see it listening on port 3100 with a list of endpoints.

**Terminal 2** -- run the demo:

```bash
npm run demo
```

The demo runs 4 scenes and takes about 2 minutes total. Most of the wait is ZK proof generation (~30-60 seconds per proof).

### Your .env when everything is set up

```
PRIVATE_KEY=0x...
ICME_API_KEY=sk-smt-...
ICME_POLICY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SELLER_ADDRESS=0x...  (different from your wallet)
SELLER_PORT=3100
SELLER_REQUIRE_PROOF=true
DEMO_MODE=verified
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

scripts/
├── create-icme-account.ts   # Pay 5 USDC on Base to create ICME account
└── topup-icme.ts            # Pay 5 USDC on Base for 500 more credits
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

## Gotchas

Things we hit while getting this running end-to-end:

- **The ICME API streams SSE, not JSON.** Both `/v1/makeRules` and `/v1/checkIt` return `text/event-stream` responses. You cannot call `res.json()` on them. Parse each `data: {...}` line and look for the event where `step === "done"`. Progress events have `step: "1/6"`, `"2/6"`, etc.

- **ZK proofs take 30-60 seconds to generate.** The `checkIt` response gives you a `zk_proof_id` immediately, but the proof itself is not ready yet. You must poll `GET /v1/proof/:id` until it returns 200. Proof generation (`prove_ms`) is typically 30-35 seconds, plus queue time.

- **Proofs are single-use.** Once you call `POST /v1/verifyProof`, the proof is consumed and cannot be verified again. A second call returns 409 `"proof used"`. The seller's proof-guard consumes the proof during payment, so you cannot re-verify it in Scene 4.

- **Buyer and seller cannot be the same address.** Circle Gateway rejects self-transfers with `reason: "self_transfer"`. Use a separate generated address for `SELLER_ADDRESS`.

- **The checkIt result field can be "AR uncertain".** When the AR solver cannot translate the action but Z3 says SAT, the overall result is `"AR uncertain"` instead of `"SAT"` or `"UNSAT"`. Fall back to the `z3_result` field for the SAT/UNSAT determination.

- **Policy compilation costs credits even if it fails.** If the SSE stream drops or the parser misses the policy ID, you still lose 300 credits. Make sure your SSE parser handles the `step: "done"` event properly before running `policy:create`.

## Costs

| Item | Cost | When |
|---|---|---|
| ICME account creation | 5 USDC on Base mainnet | Once |
| Credit top-up | 5 USDC per 500 credits | As needed |
| Policy compilation | 300 credits ($3) | Once |
| Policy check (checkIt) | 1 credit ($0.01) | Per check |
| Arc Testnet USDC | Free via faucet | As needed |
| x402 Nanopayments | $0.001 - $0.005 per API call | Per API call |

---

*Nanopayments moves money at the speed of AI. Preflight proves it moved correctly.*
