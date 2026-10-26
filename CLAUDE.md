# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LiveOps Investigator: a local hackathon prototype (Open Agent Hackathon 2026, "The Agent That Can Explain Why" track) that investigates a synthetic "more players, less revenue" game anomaly through three real local services: **Zetaris** (SQL), **Nightshift** (local LLM, OpenAI-compatible API), and **H-MEM** (vendored memory library). Output is an auditable HTML/JSON report. The project is deliberately honest about its limits (see README "Validation and limitations"); keep every doc and report claim traceable to code or fixture data, and do not add claims of causality, SQL planning, or performance gains.

## Commands

No build step and no tsconfig: `tsx` runs `.ts` directly (ESM, `.ts` import extensions). Node 22+.

```powershell
npm ci
npm test                      # node:test via tsx, all src/*.test.ts
npx tsx --test src/cases.test.ts            # single test file
npx tsx --test --test-name-pattern="reconcile" src/cases.test.ts   # single test by name
npm run verify -- --chat      # live connectivity: H-MEM, Zetaris SELECT, Nightshift models + chat; writes reports/connectivity.json
npm run demo                  # the real two-case workflow (src/workflow.ts); writes reports/demo.html
npm run demo:legacy           # older single-case flow (src/demo.ts + report.ts)
```

- `npm run verify` **without** `--chat` always exits 2, because Nightshift only reaches `models_reachable`, not `inference_passed`.
- `npm run demo` and `verify` need Zetaris and Nightshift running locally plus a configured `.env.local` (copy from `.env.example`; never overwrite an existing one). Unit tests need no services.
- `Run-Demo.cmd` is the Windows launcher: runs `npm run demo` and opens `reports/demo.html` only on success.
- `src/nightshift-local-setup.mjs` is a local admin helper that talks to the Nightshift control socket; it is not part of the workflow.

## Architecture (src/workflow.ts is the entry point)

Per case in `cases.ts`, the workflow runs this fixed pipeline; every step that can fail throws, which aborts the whole run with exit code 1 and leaves the previous `reports/demo.html` untouched:

1. **Zetaris `overview`** → `diagnose()` (`investigation.ts`) decides `drillDown` when revenue fell.
2. **Zetaris `cohorts`** (only when revenue dropped), then `reconcileCohorts()` checks cohort sums against overview totals.
3. **H-MEM recall** (`new HMEM({persistDir})`, fixed query string, threshold 0.1) → `plan(prior)` in `cases.ts` picks the query order: `['checkout','offer']` if any recalled memory carries the `payment-drop` tag, else `['offer','checkout']`. This is a deterministic rule, not model routing.
4. **Nightshift chat** is asked for a priority order; the reply must regex-match `["checkout","offer"]` or the reverse, otherwise the run fails. The suggestion is only recorded in the report; it never changes execution.
5. **Zetaris `checkout` + `offer`** in the planned order → `evaluate()` validates funnel/config rows against overview metrics and computes `paymentDrop` (success rate fell by more than 5 percentage points) and `configChanged`.
6. **H-MEM persist**: a `factual` record tagged `payment-drop` or `payment-healthy`, then a fresh HMEM instance reopens the store from disk to verify it is retrievable.
7. `renderWorkflow()` (`workflow-report.ts`) writes `reports/<run>.json`, `reports/latest.json`, `reports/demo.html`.

Key design facts that span files:

- **All "data" is SQL fixtures**: `sqlFor()` in `cases.ts` turns the in-code arrays into `WITH ... UNION ALL` CTEs that Zetaris evaluates. Fixtures assume one purchase attempt per player per period, so `successes` must equal overview `payers`; the row-count check in `workflow.ts` (`expected = kind==='cohorts' ? 4 : 2`) and `evaluate()` enforce these invariants. Changing a fixture means re-checking every invariant and the hardcoded narrative paragraph in `workflow-report.ts`.
- **Strict cell parsing**: Zetaris returns every cell as a string. `parseMetric()` in `investigation.ts` accepts only numbers or non-negative decimal strings, and `evaluate()` requires a non-blank config `version`; blank, boolean, or missing cells fail the run instead of becoming 0. Reconciliation lives in `reconcileCohorts()`, which skips when revenue did not drop.
- **Memory isolation**: each `npm run demo` creates `.state/replays/<timestamp>/`; case two reads the store case one wrote in the same replay. The legacy demo uses `.state/liveops-v1/` instead. `.state/` is gitignored.
- **Providers** (`providers.ts`): `loadConfig()` reads `.env` then `.env.local` without overriding already-set vars (so `.env` wins over `.env.local`). `zetarisQuery()` logs in with username/password on every call when both are set, else uses `ZETARIS_API_KEY` + `ZETARIS_ORG_ID`; base URL must be a bare origin. `nightshiftToken()` falls back to the Windows `%LOCALAPPDATA%\ai.meterless.runtime\proxy-token` file. `normalizeNightshift()` always yields `<origin>/v1`.
- **vendor/hmem/** is the upstream H-MEM reference (Apache-2.0, Meterless/Meterless commit `1742dec…`). Treat as external: do not modify; the workflow only uses `HMEM.add()`, `HMEM.query()`, and `ledger.history()`. Embeddings are a deterministic hash, so recall scores are reproducible.
- Report text is Chinese; README, docs, and the demo script are English. The explanatory paragraphs in `workflow-report.ts` are keyed on case id, not derived from the numbers.

## Known gaps (found in the 2026-10-26 review; not yet fixed)

- The Nightshift prompt carries no case numbers and its first example literal is `["checkout","offer"]`; `parsePriorities()` takes the first match, so an echoed prompt passes. Recorded raw replies (`model.attempts` in the report JSON) show the 1B model often echoes both options. The workflow retries up to 3 times before failing.
- In this environment Nightshift was installed from the Codex app, so its `proxy-token` lives under `%LOCALAPPDATA%\Packages\OpenAI.Codex_*\LocalCache\Local\ai.meterless.runtime\`, not the path `nightshiftToken()` checks. Pass it via `NIGHTSHIFT_TOKEN` (only with the user's approval to read it), or `npm run demo` fails with "unauthorized".
- `nightshiftChat()` falls back to `meterless/auto` when `NIGHTSHIFT_MODEL` is unset; README implies `meterless/local`. `ZETARIS_ENGINE_ID` in `.env.example` is never read.
- `sqlFor('cohorts')` gives any non-`payment-incident` case the offer-regression cohort rows, so a third case needs its own branch.
- `demo` and `demo:legacy` overwrite the same `reports/demo.html` and `reports/latest.json` with different JSON shapes.

## Repo hygiene

- Gitignored and must stay out of git: `.env*` except `.env.example`, `.state/`, `reports/`, `installers/` (proprietary Zetaris/Nightshift/Docker installers), `*.private.*` (e.g. `docs/LOCAL-NOTES.private.md`).
- `.gitattributes` forces CRLF for `*.cmd` and LF for `*.ts`/`*.md`.
- `docs/RELEASE-CHECKLIST.md` tracks what has not been done: nothing has been published or submitted. Do not create the GitHub repo, push, or submit on your own.
