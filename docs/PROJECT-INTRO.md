# Project introduction

Project name: **LiveOps Investigator**

Suggested repository name: `liveops-investigator`

Suggested track: **The Agent That Can Explain Why**

Tagline: **Turn game revenue anomalies into traceable investigations, and recheck what memory suggests.**

## Submission description

LiveOps Investigator helps game teams investigate a familiar puzzle: player participation rises while event revenue falls. It connects real Zetaris SQL queries, Nightshift local inference, and the official H-MEM reference implementation in a reproducible local workflow.

Two clearly labeled synthetic cases demonstrate the approach. The first finds a payment-success decline while event configuration remains unchanged. The second recalls that evidence and checks payments first, but fresh results show healthy payment success and a changed reward configuration. Memory guides the investigation without turning yesterday's explanation into today's assumed cause.

Every run produces an HTML report with SQL, returned rows, validated metrics, model suggestions, and memory provenance. Numerical findings and execution routing are deterministic. Nightshift provides constrained priority suggestions; uncertain causal explanations remain hypotheses requiring further evidence.

Built with TypeScript, the prototype runs from a Windows launcher or npm command. It currently uses SQL fixtures rather than production integrations and does not automate remediation. Its value is a transparent, inspectable investigation loop that separates observations, historical context, and claims still needing validation.

## Reviewer positioning

- Implemented: actual service calls, cohort/funnel reconciliation, configuration comparisons, persistence and recall, traceable report.
- Demonstrated: prior evidence changes query order; new evidence prevents copying the earlier diagnosis.
- Not claimed: autonomous SQL planning, proven causality, production readiness, or measured speed improvements.
- Next: external game telemetry tables, controlled experiments, more incidents, and model evaluation.
