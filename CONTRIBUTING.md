# Contributing

Thanks for your interest. This repo is a reference integration of [ICME Preflight](https://docs.icme.io) with [Circle Nanopayments](https://developers.circle.com/gateway/nanopayments). Contributions that strengthen the integration, broaden seller-side examples, or improve developer experience are welcome.

## Ground rules

- Keep changes scoped. A bug fix should not also reorganize directories. A new feature should not also rewrite the README.
- Match the existing TypeScript style. The project uses ESM, native `tsx` for dev, and `tsc` for build.
- Do not commit `.env`, private keys, API keys, or any artifact derived from them.
- Do not introduce new dependencies without justification in the PR description.

## Local development

```bash
git clone <your-fork>
cd nanopayments
npm install
cp .env.example .env  # fill in PRIVATE_KEY, then follow README Steps 3–7
npm run build         # type-check
npm run seller        # terminal 1
npm run demo          # terminal 2
```

See the main README for the full setup walkthrough. Running the full demo requires real USDC on Base mainnet (for ICME account + policy compilation) and free Arc Testnet USDC (for Nanopayments).

## Pull request checklist

- [ ] `npm run build` passes with no TypeScript errors.
- [ ] No `.env`, secrets, or private keys in the diff.
- [ ] README updated if you added a script, env var, or top-level feature.
- [ ] If you touched `src/preflight/` or `src/gateway/`, you ran `npm run demo` end-to-end and the four scenes still pass.
- [ ] If you changed the `X-Preflight-Proof` header shape, you updated both `src/gateway/verified-client.ts` and `src/seller/proof-guard.ts`, plus the type in `src/types.ts`.

## Areas that need work

These are good first PR targets, listed in roughly increasing complexity:

1. **More seller framework examples.** Hono, Fastify, Cloudflare Workers, Bun.serve adapters of the proof-guard middleware.
2. **Per-session proof amortization.** Cache a proof_id and let it cover up to N payments under a stated budget, expiring on time or spend.
3. **Policy template library.** New policies for treasury management, FX, lending — see `src/preflight/policy.ts` for the shape.
4. **Frontend reference.** Wire `frontend/` to show live proof verification in a browser.
5. **CI.** A GitHub Actions workflow that lints, builds, and (optionally) runs a mocked demo against a recorded ICME response.

## Code of conduct

Be technically rigorous and personally kind. Disagreements about design should be resolved with code, benchmarks, or specs — not status. Reviews focus on the work, not the person.
