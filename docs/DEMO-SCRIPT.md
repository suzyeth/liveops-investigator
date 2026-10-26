# Four-minute demo script

Target final length: **3:45–3:55**, never over 4:00. Read at approximately 120–135 words per minute and use the remaining time for on-screen evidence. This is a recording script, not a completed video. Rehearse before recording. Record only the app/report and terminal, not account pages or environment files.

## 0:00–0:25 — Problem and promise

**Screen:** report title and case-one overview.

**Narration:**
“More players, less revenue. For a game team, that is a signal to investigate—not a reason to guess. LiveOps Investigator connects Zetaris, Nightshift, and H-MEM to turn that signal into a traceable investigation. Everything you see uses explicitly synthetic game data, queried through real local services.”

## 0:25–0:55 — Start a real run

**Screen:** double-click Run-Demo.cmd; show actual terminal progress. Allow the report to open. If services are slow, cut waiting time transparently; do not substitute a fabricated run.

**Narration:**
“This launcher runs two cases. Zetaris queries the overview, player cohorts, payment funnel, and event configuration. The application checks that the counts agree. Nightshift returns a constrained suggestion about investigation priorities. H-MEM stores attributed evidence and recalls it in the next case. The report is generated only after the workflow succeeds.”

## 0:55–1:35 — Case one: check the payment hypothesis

**Screen:** case-one metrics, funnel table, then expand checkout SQL and returned rows.

**Narration:**
“In the first case, participation rises from one thousand to fifteen hundred, but revenue falls from one thousand to nine hundred. The payment funnel reveals a more specific symptom: payment success drops from eighty to sixty percent. Event configuration has not changed. That supports investigating the payment stage, but it does not identify the underlying fault. Error logs and device segments would be the next evidence to collect. Here are the actual SQL and returned rows behind that finding.”

## 1:35–2:20 — Case two: memory helps, but does not decide the answer

**Screen:** case-two baseline versus actual order; expand prior evidence source; show payment result.

**Narration:**
“The second case starts with a similar revenue decline. It reopens H-MEM from disk and recalls the earlier payment incident. Without memory, our explicit baseline checks configuration first. With that historical evidence, it checks payment first. This is a transparent routing rule, not a claim that the model independently planned the investigation. Crucially, the new payment-success rate remains eighty percent. The workflow does not copy the previous diagnosis. It checks both hypotheses against current evidence.”

## 2:20–3:00 — A different lead

**Screen:** case-two funnel and reward comparison, then expand configuration SQL.

**Narration:**
“This time, fewer shop visitors attempt a purchase, while reward units fall from one hundred to sixty. That gives the team a different lead: investigate the offer change. It is still not causal proof. A controlled comparison would be needed before attributing the revenue decline to the reward change. Memory has helped choose where to look, while fresh evidence has prevented an outdated conclusion.”

## 3:00–3:35 — Boundaries and reproducibility

**Screen:** model suggestion, memory persistence result, README commands and tests.

**Narration:**
“Numerical conclusions come from validated calculations. Nightshift provides bounded advice, and generated hypotheses are not stored as facts. Both checks always run, so we do not claim a query-count reduction. The fixtures, source, thirteen tests, and setup instructions make the demonstration reproducible with your own local services. Missing or inconsistent evidence fails the run rather than silently producing a successful diagnosis.”

## 3:35–3:55 — Close

**Screen:** report overview; stop by 3:55.

**Narration:**
“LiveOps Investigator is a small, inspectable prototype: query evidence, test a hypothesis, remember what was observed, and recheck that memory when the situation changes. The next step is connecting external game telemetry and validating these investigation patterns across more incidents.”

## Recording notes

- Start services and run one rehearsal first; verify all report sections are visible.
- Keep the SQL panels readable; avoid displaying full unrelated desktop windows.
- English narration maps to the current bilingual/Chinese report; an English report would improve accessibility but is not implemented in this packaging step.
- Do not display `.env.local`, registry login commands, local account pages, or private deployment notes.
- Confirm the exported duration is at most 4 minutes before uploading. No recording or upload has been performed.
