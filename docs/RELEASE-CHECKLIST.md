# Release checklist — 2026-10-27

Track: The Agent That Can Explain Why. Deadline: 27 October 23:45 UTC / London.

- [x] README, project description and sponsor/H-MEM attribution for the current version: three cases, dollar attribution per explanation, an unexplained remainder, noise guards.
- [x] Synthetic Pokémon GO-style data with segments derived from history and long-tailed spend, in three Postgres sources registered in Zetaris; one check joins all three.
- [x] All 24 unit tests passed; all three live investigations passed on 2026-10-27 (run 2026-10-27T14-27-37-544Z).
- [x] Current 3:33 video (`reports/submission/liveops-demo.mp4`): title and architecture cards, a real web-app run of three cases, the drill-down, the three-source query, an unexplained case, and two live reviewer challenges; synthesized English narration and burned English subtitles.
- [x] 16-slide deck prepared (Claude deck "LiveOps Investigator", version 17), including the data sources, the architecture, the three cases and the unexplained case.
- [ ] Replace the 2:59 video and the eight-slide PPTX in the submission draft with the current video and an export of the 16-slide deck.
- [x] GitHub implementation synchronized; no secrets or licensed installers tracked.
- [ ] Final human review; do not submit without authorization.

Reproducibility limitation: services were verified on this machine, not a clean machine. All gameplay/payment data is synthetic; findings are leads with dollar estimates, not causal proof. Original code MIT; vendored H-MEM reference Apache-2.0.
