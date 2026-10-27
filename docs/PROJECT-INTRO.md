# LiveOps Investigator

Track: The Agent That Can Explain Why

LiveOps Investigator helps game teams explain why a live event made less money despite attracting more players. It investigates synthetic Community Day-style data across three Postgres sources registered in Zetaris: game telemetry, payment attempts, and live-ops configuration.

Each result opens follow-up checks. Nightshift's local model chooses among valid open checks; a recalled H-MEM lesson takes priority, and fresh evidence is always checked. One case links a payment decline to an app build, gateway errors and release records. The next recalls that lead, finds payments healthy, and investigates offer changes and buyer conversion instead.

The web app links findings to SQL rows and lets reviewers dispute data, request another comparison, or challenge a conclusion. Counts and verdicts are validated in code; the model never writes SQL or declares a cause.

Zetaris runs the cross-source SQL; Meterless Nightshift provides local inference; Meterless H-MEM stores sourced lessons and review feedback. NVIDIA CUDA runs the local Llama 3.2 1B model; Nemotron is not used. Cursor was used as an editor. Pre-existing component: Meterless H-MEM reference, commit 1742dec56a66e58eef9dda2d2b865823758ca8cd, Apache-2.0. All gameplay, purchase and payment records are synthetic; findings are investigation leads, not causal proof.

Repository: https://github.com/suzyeth/liveops-investigator

Video: 2:59 recording of the local web app during a live run (2026-10-27T12-24-17-165Z), including two live reviewer challenges; script in docs/DEMO-SCRIPT.md.
