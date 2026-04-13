# Verified Nanopayments

**Preflight ZK proofs on Base gating Circle Nanopayments on Arc**

ICME Labs × Circle

---

## What this demo shows

An AI agent autonomously pays for data APIs via Circle's [Nanopayments](https://developers.circle.com/gateway/nanopayments) (gas-free USDC on Arc). Every payment is formally verified by [ICME Preflight](https://docs.icme.io) before execution — natural language policies compiled to SMT-LIB, checked by dual solvers (Z3 + AWS ARc), with a ZK proof generated for every decision.

When a malicious API response contains an indirect prompt injection that tries to drain the agent's wallet, Preflight catches it:

- **SAT** → payment is mathematically proven to satisfy all policy constraints → Nanopayment executes on Arc
- **UNSAT** → payment violates policy → blocked with a ZK proof anyone can independently verify

Proof generation happens on Base. Payment execution happens on Arc. The proof is chain-agnostic.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  LangChain Agent (GPT-4o-mini)                          │
│  "Fetch weather, market data, risk scores..."           │
└──────────────┬──────────────────────────────────────────┘
               │ payment intent (natural language)
               ▼
┌─────────────────────────────────────────────────────────┐
│  Preflight Gate (middleware)                             │
│                                                         │
│  1. POST /v1/checkRelevance  → is this a payment?       │
│  2. POST /v1/checkIt         → SAT or UNSAT?            │
│     ├─ Z3 SMT solver (local)                            │
│     └─ AWS ARc (cloud)       → dual verification        │
│  3. ZK proof generated (JOLT-Atlas, 2-10s)              │
│                                                         │
│  Base network │ $0.01/check                             │
└──────┬────────┴─────────────────────────────────────────┘
       │ SAT + proof_id
       ▼
┌─────────────────────────────────────────────────────────┐
│  Circle Nanopayments (Arc Testnet)                      │
│                                                         │
│  GatewayClient.pay(url) → x402 flow:                    │
│    GET /api/data → 402 Payment Required                 │
│    Sign EIP-3009 (gasless) → retry with signature       │
│    Batched settlement via Circle Gateway                 │
└─────────────────────────────────────────────────────────┘
```

## Demo flow

The demo runs in three acts:

1. **Normal operations** — agent fetches weather, market, and risk data. All payments pass Preflight (SAT). ZK proofs confirm compliance.

2. **Indirect prompt injection** — agent fetches an analytics report containing a hidden payload (modeled on [Palo Alto Networks Unit 42 findings](https://unit42.paloaltonetworks.com/)). The poisoned data instructs the agent to transfer 0.5 USDC to an attacker address. Preflight catches it (UNSAT): amount exceeds limit, recipient not in allowlist, urgency tactic detected.

3. **Direct attack** — simulates a fully compromised agent context. Preflight blocks with a ZK proof of the policy violation. The proof is independently verified via `/v1/verifyProof`.

## Setup

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env
# Edit .env with your keys:
#   PRIVATE_KEY     — EVM wallet (fund with testnet USDC from Circle faucet)
#   ICME_API_KEY    — from docs.icme.io
#   OPENAI_API_KEY  — for GPT-4o-mini agent
#   SELLER_ADDRESS  — your wallet address

# Compile the payment policy (one-time, $3.00 in Preflight credits)
npm run policy:create
# Copy the output ICME_POLICY_ID to your .env

# Start the seller server (terminal 1)
npm run seller

# Run the demo (terminal 2)
npm run demo
```

## Project structure

```
src/
├── preflight/
│   ├── client.ts         # Preflight API client (checkIt, verifyProof, makeRules)
│   ├── middleware.ts      # PreflightGate — verify intent before payment
│   ├── policy.ts          # Payment policy in natural language
│   └── create-policy.ts   # One-time policy compiler script
├── seller/
│   └── server.ts          # x402 paywalled data APIs (+ malicious endpoint)
├── gateway/
│   └── client.ts          # Circle GatewayClient wrapper (Arc Testnet)
├── agent/
│   ├── index.ts           # LangChain agent with tool-calling
│   └── tools.ts           # Agent tools routed through PreflightGate
├── demo/
│   ├── run.ts             # Demo orchestrator (3 acts + proof verification)
│   ├── attacks.ts         # Prompt injection scenarios
│   └── dashboard.ts       # Terminal UI
└── config.ts              # Shared configuration
```

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
