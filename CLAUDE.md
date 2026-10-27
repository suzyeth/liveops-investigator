# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LiveOps Investigator: a local hackathon prototype (Open Agent Hackathon 2026, "The Agent That Can Explain Why" track). An agent explains why a Pokémon GO-style Community Day drew more players but earned less, by running SQL checks that Zetaris federates across three Postgres sources (game telemetry, payment gateway, live-ops config). **Nightshift** (local LLM) and **H-MEM** (vendored memory library) choose the order of checks. A local web app shows every step and lets reviewers challenge it. All data is synthetic and generated with a fixed seed; the event format and list prices follow Pokémon GO's public pages. The project is deliberately honest about its limits (README "Validation and limitations"): keep every claim traceable to code or generated data, and add no claims of causality, SQL planning, real-game figures or performance gains.

## Commands

No build step and no tsconfig: `tsx` runs `.ts` directly (ESM, `.ts` import extensions). Node 22+.

```powershell
npm ci
npm test                      # node:test via tsx, all src/**/*.test.ts (no services needed)
npx tsx --test src/agent/agent.test.ts                               # single test file
npx tsx --test --test-name-pattern="memory lesson" src/agent/agent.test.ts   # single test by name
docker compose --env-file .env.local -f docker/gamedata.compose.yml up -d     # game-data Postgres on the Zetaris network
npm run data:setup            # generate data, load the three DBs, register datasources in Zetaris (idempotent)
npm run verify -- --chat      # live connectivity: H-MEM, Zetaris SELECT, Nightshift models + chat
npm run app                   # web app on 127.0.0.1:4317 (src/app.ts + web/); Run-App.cmd opens the browser
npm run demo                  # the same investigation in the terminal (src/workflow.ts); writes reports/<run>.json
```

- `npm run verify` **without** `--chat` always exits 2, because Nightshift only reaches `models_reachable`, not `inference_passed`.
- Live commands need Zetaris (Docker containers `liveops-zetaris_*`), the `liveops-gamedata` container, Nightshift, and a configured `.env.local` (copy from `.env.example`; never overwrite an existing one). `GAMEDATA_PG_PASSWORD` is used for the Postgres container and for the read-only `zetaris_reader` role Zetaris connects with.
- `src/nightshift-local-setup.mjs` is a local admin helper for the Nightshift control socket; it is not part of the workflow.

## Architecture

- **Data** (`src/data/`): `catalog.ts` holds events, offers and releases; `generate.ts` generates players, participation, orders and payment attempts from a written-out behaviour model, including the two planted causes (Android build 0.393.1 breaks Google Play billing before `cd_02`; ticket price rise and box change at `cd_04`). `setup-data.ts` loads three databases (`game`, `billing`, `liveops`) via `docker exec psql` COPY and registers them in Zetaris as datasources `game_telemetry`, `payments`, `liveops` (tables are queried as `<datasource>.<table>`).
- **Probes** (`src/agent/probes.ts`): fixed SQL templates plus pure `analyze()` functions. Parameters go through `lit()`, which only accepts `[A-Za-z0-9_.:-]`; they come from the case definition or earlier validated results, never from model text. `analyze()` returns metrics, consistency checks (a failed check aborts the run), and the follow-up probes it justifies.
- **Agent loop** (`src/agent/investigate.ts`): starts at `overview`, keeps a frontier of open checks, and picks one per step: a recalled lesson's `lead:` probe first, then Nightshift's pick (`choose()` in `pipeline.ts` accepts only a candidate id found in the reply), then the first candidate. Every open check runs; at `MAX_STEPS` with checks still open it throws. A probe that runs twice keeps all results in `runs`; `trail()` picks the failing store's own drill-down. `assess()` gives each hypothesis (payment, offer, mix) a status; `finding()` writes the sentence from metrics. `defaultPath()` replays the recorded results with first-candidate choices to report where the lead would have appeared without memory or model.
- **Pipeline** (`src/pipeline.ts`): per case, recall lessons from H-MEM (`.state/replays/<run>/`, fresh per run), run the loop, store a lesson tagged `lesson`, `lead:<probe>`, `case:<id>`, reopen the store to verify it. Writes `reports/<run>.json` and `reports/latest.json` (`version: 2`).
- **Web app** (`src/app.ts`, `web/`): plain `node:http` on 127.0.0.1. It rejects any Host other than `127.0.0.1:<port>` or `localhost:<port>`, and any POST whose Origin is not that host. It also sends no-framing headers. One run at a time; progress events are buffered and replayed over SSE (`/api/events`, `passive=1` on page load). The front end is vanilla JS building HTML strings, so every interpolated value must go through `esc()`.
- **Reviews** (`review.ts` pure, `review-actions.ts` side effects, stored in `reports/<run>.reviews.json`): `data` re-runs a step's SQL and compares rows; `missing` with `compare` runs a probe from `comparisons()` (unrun `ON_REQUEST` probes, or `payment_by_version` for other stores); `distrust` calls H-MEM `feedback(id,'wrong')` on the case's lesson only when the target is the finding or the lead's evidence. `assess()` maps open reviews onto targets through `dependsOn()`.

Key facts that span files:

- **Strict cell parsing**: Zetaris returns cells as strings (decimals like `"99.990000000000000000"`, timestamps like `"2026-02-12 18:00:00.0"` in UTC). `parseMetric()` (`src/agent/parse.ts`) accepts only numbers or non-negative decimal strings.
- **Changing the generator or catalog** changes the numbers quoted in README, docs/DEMO-SCRIPT.md, the deck and the video narration. Re-run `npm run data:setup`, check `src/data/generate.test.ts`, and re-check every quoted number.
- **Providers** (`providers.ts`): `zetarisQuery()` uses `/api/proxy/query/sql/start` (SELECT only, `pageLimit` 1000). `zetarisCommand()` uses the SQL-editor route `/api/proxy/sql-editor/sqls/run-query`, which also accepts `CREATE DATASOURCE`, `REGISTER DATASOURCE TABLES` and `SHOW ...`. Datasource descriptions accept only alphanumerics, spaces and `_ . - ,`. `loadConfig()` reads `.env` then `.env.local` without overriding set vars.
- **vendor/hmem/** is the upstream H-MEM reference (Apache-2.0, Meterless/Meterless commit `1742dec…`). Treat it as external and do not modify it. The code uses `add`, `query`, `feedback`, `store.get`, and `ledger.history`. Embeddings are a deterministic hash, so recall is reproducible.
- Everything submitted is English: page text, console logs, README, docs, the demo script. Keep it that way.

## Known gaps

- In this environment Nightshift was installed from the Codex app, so its `proxy-token` lives under `%LOCALAPPDATA%\Packages\OpenAI.Codex_*\LocalCache\Local\ai.meterless.runtime\`, not the path `nightshiftToken()` checks. Pass it via `NIGHTSHIFT_TOKEN` (only with the user's approval to read it), or live runs fail with "unauthorized".
- `nightshiftChat()` falls back to `meterless/auto` when `NIGHTSHIFT_MODEL` is unset; `ZETARIS_ENGINE_ID` in `.env.example` is never read.
- The 1B model often picks the first candidate it reads; in the recorded runs the H-MEM lesson does not bring the lead forward (case two finds it at step five either way). Do not claim memory makes the investigation faster.

## Repo hygiene

- Gitignored and must stay out of git: `.env*` except `.env.example`, `.state/`, `reports/`, `installers/` (proprietary Zetaris/Nightshift/Docker installers), and `*.private.*` (e.g. `docs/LOCAL-NOTES.private.md`, local probe scripts).
- `.gitattributes` forces CRLF for `*.cmd` and LF for `*.ts`/`*.md`.
- `docs/RELEASE-CHECKLIST.md` tracks what has been done. The repo is public at github.com/suzyeth/liveops-investigator; never submit the entry on the user's behalf.
