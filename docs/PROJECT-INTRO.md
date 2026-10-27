# Project introduction

Project name: **LiveOps Investigator**

Suggested repository name: `liveops-investigator`

Suggested track: **The Agent That Can Explain Why**

Tagline: **Turn game revenue anomalies into traceable investigations, and recheck what memory suggests.**

## Submission description

LiveOps Investigator helps game teams investigate a familiar puzzle: player participation rises while event revenue falls. It connects real Zetaris SQL queries, Nightshift local inference, and the official H-MEM reference implementation in a reproducible local workflow.

Two clearly labeled synthetic cases demonstrate the approach. The first finds a payment-success decline while event configuration remains unchanged. The second recalls that evidence and checks payments first, but fresh results show healthy payment success and a changed reward configuration. Memory guides the investigation without turning yesterday's explanation into today's assumed cause.

It runs as a local web app. Each finding is shown with the rule it was tested against, a chart, and the numbers behind it, and every number opens the SQL row it came from. A reviewer can dispute a number (the agent re-runs the query on Zetaris), ask for another comparison (a platform or cohort split that must add up to the totals), or reject a finding (H-MEM's feedback API lowers the stored evidence's confidence). Numerical findings and execution routing are deterministic. Nightshift provides constrained priority suggestions; uncertain causal explanations remain hypotheses requiring further evidence.

Built with TypeScript, the prototype runs from `npm run app`, a Windows launcher, or a terminal command. It currently uses SQL fixtures rather than production integrations and does not automate remediation. Its value is a transparent, inspectable investigation loop that separates observations, historical context, and claims still needing validation.

## Reviewer positioning

- Implemented: actual service calls, cohort/funnel reconciliation, configuration comparisons, persistence and recall, a web app that traces every number to its SQL row, and reviewer challenges answered with new queries or memory feedback.
- Demonstrated: prior evidence changes query order; new evidence prevents copying the earlier diagnosis.
- Not claimed: autonomous SQL planning, proven causality, production readiness, or measured speed improvements.
- Next: external game telemetry tables, controlled experiments, more incidents, and model evaluation.
