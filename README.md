# Verified Nanopayments

> **Built with [Preflight](https://docs.icme.io)** — formal verification and ZK proofs for autonomous agent spending decisions.

**Spending authorization for Circle Nanopayments**

ICME Labs x Circle

---

## Why this matters for Nanopayments

Nanopayments solves authentication — the agent's EIP-3009 signature proves it controls the wallet. But authentication is not authorization. A compromised agent can sign a perfectly valid payment to drain its own wallet.

Preflight adds the missing authorization layer. Every payment intent is formally verified against a spending policy before the signature is created. The buyer's principal gets enforceable spending rules. The seller gets a cryptographic proof that the payment was policy-compliant before accepting it. Both sides benefit, no SDK changes required.

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

| Scene | What happens | Buyer side | Seller side |
|---|---|---|---|
| **1. Authentication** | Pay for weather data, no proof attached. | Signature created, payment sent. No policy check. | Accepts any valid signature. No way to know if payment was authorized. |
| **2. Authorization** | Same payment, with Preflight proof. | Intent verified (SAT), proof attached to payment header. | Calls `verifyProof` — proof valid, payment accepted. |
| **3. The Block** | Compromised agent tries 0.5 USDC drain. | Preflight returns UNSAT. Signature never created. $0 at risk. | Payment never arrives. Nothing to reject. |
| **4. Verify** | Verify proof IDs from scenes 2 and 3. | Principal can audit every spending decision. | Can re-confirm any proof was valid at time of payment. |

## ICME Preflight API (what we're calling)

| Endpoint | What it does | Cost |
|---|---|---|
| `POST /v1/checkIt` | Check an action against a compiled policy. Returns SAT/UNSAT + proof_id. | 1 credit ($0.01) |
| `POST /v1/checkRelevance` | Quick check: is this action even relevant to the policy? | Free |
| `POST /v1/verifyProof` | Publicly verify a proof by ID. Single-use. No API key. | Free |
| `GET /v1/proof/{id}` | Get proof status (authenticated). | Free |
| `POST /v1/makeRules` | Compile a natural language policy into SMT-LIB2. One-time. | 300 credits ($3.00) |

Both `makeRules` and `checkIt` return **SSE streams**, not plain JSON. Each line is `data: {...}\n\n`. The final event has `"step":"done"` and contains the result.

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

## Request flow

```
 Buyer (agent)                    Preflight                   Seller
      |                               |                         |
      |  POST /v1/checkIt             |                         |
      |  "pay 0.001 USDC to           |                         |
      |   WeatherNode for weather"    |                         |
      |------------------------------>|                         |
      |                               |                         |
      |  result: SAT                  |                         |
      |  proof_id: abc-123            |                         |
      |<------------------------------|                         |
      |                                                         |
      |  GET /api/weather/verified                              |
      |  Headers:                                               |
      |    Payment-Signature: <EIP-3009>                        |
      |    X-Preflight-Proof: {"proof_id":"abc-123",            |
      |                        "claimed_result":"SAT"}          |
      |-------------------------------------------------------->|
      |                                                         |
      |                               |  POST /v1/verifyProof   |
      |                               |  {"proof_id":"abc-123"} |
      |                               |<------------------------|
      |                               |  { valid: true }        |
      |                               |------------------------>|
      |                                                         |
      |                                  proof valid + payment  |
      |                                  accepted = 200 OK      |
      |<--------------------------------------------------------|
```

**Two headers, one request.** `Payment-Signature` authenticates the payment (Nanopayments). `X-Preflight-Proof` authorizes it (Preflight). The seller verifies the proof before accepting the Nanopayment.

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

## Seller integration

Adding proof verification to an existing Nanopayments seller takes ~10 lines. The middleware sits before `gateway.require()` and verifies the proof before the payment is accepted:

```ts
// proof-guard.ts — verify X-Preflight-Proof before accepting payment
const proofHeader = JSON.parse(req.headers["x-preflight-proof"]);

const res = await fetch("https://api.icme.io/v1/verifyProof", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ proof_id: proofHeader.proof_id }),
});

const { valid } = await res.json();
if (!valid) return res.status(403).json({ error: "PROOF_INVALID" });

next(); // proof checks out — let gateway.require() handle the payment
```

Wire it up in Express:

```ts
app.get("/api/weather/verified",
  proofGuard,              // 1. verify proof (Preflight)
  gateway.require("$0.001"), // 2. accept payment (Nanopayments)
  handler                    // 3. serve data
);
```

### No SDK changes required

**Buyer side:** `GatewayClient.pay(url, { headers })` already supports custom headers. The proof ID is injected into `X-Preflight-Proof` alongside `Payment-Signature`. This is a documented extension point.

**Seller side:** Express middleware runs before `gateway.require()`. No Circle SDK modification needed. The proof is verified via ICME's public endpoint — no API key, no account required.

## Key differentiator

Every competitor offers spending *controls* (if-statements). Preflight offers spending *proofs* (ZK):

| | Controls | Proofs |
|---|---|---|
| **Mechanism** | Check rules before paying | Mathematically prove all constraints satisfied |
| **Verifiability** | Trust the middleware ran | Anyone can verify the proof independently |
| **Privacy** | Auditor sees the policy | Auditor verifies without seeing the policy |
| **Auditability** | Log files | Cryptographic receipts (EU AI Act ready) |

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
