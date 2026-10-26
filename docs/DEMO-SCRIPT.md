# Demo video script

Final length: **2:45** (limit 4:00). The submitted video was assembled from artifacts of a real run (run `2026-10-26T22-15-09-147Z`): the captured console log, screenshots of the generated report, and values from the report JSON. Narration is synthesized English speech. Data is explicitly synthetic; every query ran through real local Zetaris, Meterless Nightshift, and Meterless H-MEM.

## 1. Problem and promise (0:00)

**Screen:** title card.

“More players, less revenue. For a game team, that is a signal to investigate, not a reason to guess. LiveOps Investigator connects Zetaris, Meterless Nightshift, and Meterless H-MEM to turn that signal into a traceable investigation. The game data is explicitly synthetic, but every query runs through real local services.”

## 2. A real run (0:22)

**Screen:** console output of `npm run demo`, with English notes beside the Chinese case titles.

“One command runs two cases. Zetaris queries the overview, the player cohorts, the payment funnel, and the event configuration, and the code checks that every count reconciles. H-MEM recalls earlier evidence. Nightshift, running a small local model on an NVIDIA GPU, returns a fenced suggestion. In this run the model broke format once, so the agent retried. The report is written only after both cases succeed.”

## 3. Case one (0:51)

**Screen:** case-one section of the generated report, with English captions.

“In case one, participation rises from one thousand to fifteen hundred, but revenue falls from one thousand to nine hundred. The payment funnel shows a sharper symptom: payment success drops from eighty to sixty percent, while the event configuration is unchanged. That supports investigating the payment stage, but it does not name the fault. Error logs and device segments would come next.”

## 4. Audit trail (1:15)

**Screen:** the checkout query, its returned rows and timing, from the report JSON.

“Every finding links back to the exact SQL statement Zetaris executed, the rows it returned, and how long it took. Here, payment successes must equal the payers in the overview, or the run fails.”

## 5. Case two: memory recalled (1:29)

**Screen:** case-two section of the generated report, with English captions.

“Case two starts with a similar revenue drop. The agent reopens H-MEM from disk and recalls case one, so it checks payment first instead of the default order. But fresh evidence says payment success is still eighty percent. The earlier diagnosis is not copied.”

## 6. A different lead (1:46)

**Screen:** side-by-side comparison of both cases.

“Instead, fewer shop visitors try to buy, and reward units fell from one hundred to sixty. That points to the offer change. It is still a lead, not proof, and a controlled comparison would confirm it. Memory chose where to look. Fresh evidence decided what was true.”

## 7. Sponsor technology and boundaries (2:03)

**Screen:** four cards for Zetaris, Nightshift, H-MEM, and validated code.

“Zetaris is the data layer for every number. Nightshift gives bounded advice that never writes SQL or states numbers. H-MEM stores sourced evidence across cases. Numerical conclusions come only from validated code, thirteen automated tests cover it, and missing or inconsistent evidence fails the run instead of producing a confident answer.”

## 8. Close (2:26)

**Screen:** closing card with the repository URL.

“LiveOps Investigator is a small, inspectable prototype: query evidence, test a hypothesis, remember what was observed, and recheck that memory when the situation changes. Next, we connect real game telemetry through Zetaris. The code is open source on GitHub.”
