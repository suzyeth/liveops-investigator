# LiveOps Investigator

Track: The Agent That Can Explain Why

LiveOps Investigator helps live-ops teams explain why an event earned less than its turnout predicted. It investigates synthetic Pokémon GO-style Community Day data across three Postgres sources registered in Zetaris: the game server, the store purchase log, and the live-ops calendar.

The agent splits the revenue change into players, payer conversion and spend per payer, then drills down: each result opens follow-up checks, and Nightshift's local model chooses among them (a recalled H-MEM lesson takes priority; every open check still runs). Each supported explanation gets a dollar estimate, and the part no check explains is reported. One case traces failed Google Play orders to an app build, its billing errors and its release, and sizes the lost revenue with a query across all three sources. Another finds a ticket price rise and a box change that lost buyers in every segment. The third finds nothing it can support and says the whole shortfall is unexplained.

The web app shows the SQL and returned rows behind every step and lets reviewers dispute data, request another check, or challenge a conclusion. Counts and verdicts are validated in code with noise guards; the model never writes SQL or declares a cause.

Zetaris runs the cross-source SQL; Meterless Nightshift provides local inference; Meterless H-MEM stores sourced lessons and review feedback. NVIDIA CUDA runs the local Llama 3.2 1B model; Nemotron is not used. Cursor was used as an editor. Pre-existing component: Meterless H-MEM reference, commit 1742dec56a66e58eef9dda2d2b865823758ca8cd, Apache-2.0. All gameplay, purchase and payment records are synthetic; findings are investigation leads with dollar estimates, not causal proof.

Repository: https://github.com/suzyeth/liveops-investigator

Video: 3:33 recording of the local web app during a live run (2026-10-27T14-27-37-544Z), including two live reviewer challenges; script in docs/DEMO-SCRIPT.md.
