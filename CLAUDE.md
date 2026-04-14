# Verified Nanopayments Demo

## Project context

ICME Labs demo for Circle. Shows Preflight ZK proofs (on Base) gating Circle Nanopayments (on Arc) — a cross-chain trust bridge.

## Architecture

- **Preflight verification (Base):** Agent payment intents are described in natural language → sent to ICME Preflight API (`api.icme.io/v1/checkIt`) → dual solver (Z3 + AWS ARc) returns SAT/UNSAT + ZK proof via JOLT-Atlas. Costs $0.01/check in USDC on Base.
- **Payment execution (Arc):** If SAT, `GatewayClient.pay(url)` executes the Nanopayment on Arc Testnet via x402 (gasless EIP-3009). If UNSAT, blocked with proof_id.
- **Proof verification:** Anyone can call `POST api.icme.io/v1/verifyProof` with just the proof_id — no policy access needed.

## Key APIs

### ICME Preflight (docs.icme.io)
- `POST /v1/makeRules` — compile policy ($3, one-time, SSE stream)
- `POST /v1/checkIt` — verify action ($0.01/check, returns SAT/UNSAT + proof_id)
- `POST /v1/checkRelevance` — free relevance pre-check
- `POST /v1/verifyProof` — public single-use proof verification
- `GET /v1/proof/:id` — proof status (authenticated)
- Auth: `X-API-Key` header

### Circle Nanopayments (developers.circle.com/gateway/nanopayments)
- SDK: `@circle-fin/x402-batching` v2.1.0
- Client: `GatewayClient` from `@circle-fin/x402-batching/client`
- Server: `createGatewayMiddleware` from `@circle-fin/x402-batching/server`
- Chain: Arc Testnet (eip155:5042002)
- Seller middleware: `gateway.require("$0.01")` on Express routes
- Buyer: `client.pay(url)` handles full 402 → sign → retry flow

## How to run

```bash
# 1. Fill in .env (see .env.example)
# 2. Compile policy (one-time, ~3-7 min, $3)
npm run policy:create
# 3. Start seller (terminal 1)
npm run seller
# 4. Run demo (terminal 2)
npm run demo
```

## Demo flow (3 acts)

1. **Normal ops** — agent fetches weather/market/risk via Nanopayments. All pass Preflight (SAT).
2. **Indirect prompt injection** — analytics endpoint returns poisoned data with IDPI (modeled on Unit 42 findings). Agent tries unauthorized 0.5 USDC transfer. Preflight blocks (UNSAT) — amount, recipient, urgency violations.
3. **Direct attack** — fully compromised agent context. Blocked with ZK proof, independently verified.

## Current status

- Fully tested end-to-end, all 4 demo scenes working
- ICME account created, policy compiled (`fe91f282-246f-478b-b539-1873c3ad85bd`)
- Arc Testnet wallet funded via Circle faucet
- SSE parser fixed for both `makeRules` and `checkIt` endpoints
- Proof polling added (proofs take ~30-60s to generate)
- Separate seller address configured (Gateway rejects self-transfers)

## File structure

```
src/
├── preflight/
│   ├── client.ts         # Preflight API client
│   ├── middleware.ts      # PreflightGate (verify → pay pattern)
│   ├── policy.ts          # 9-rule payment policy
│   └── create-policy.ts   # Policy compiler script
├── seller/
│   └── server.ts          # x402 paywalled endpoints (3 legit + 1 IDPI)
├── gateway/
│   └── client.ts          # Circle GatewayClient wrapper
├── agent/
│   ├── index.ts           # LangChain agent (GPT-4o-mini, tool-calling)
│   └── tools.ts           # 5 tools routed through PreflightGate
├── demo/
│   ├── run.ts             # Demo orchestrator
│   ├── attacks.ts         # Prompt injection scenarios
│   └── dashboard.ts       # Terminal UI (chalk)
└── config.ts              # Env-based config
```
