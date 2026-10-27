# Demo video script

Final length: **2:33** (limit 4:00). The submitted video is a recording of a real run (run `2026-10-27T08-45-40-399Z`), made off-screen with a headless browser:

- **Terminal segment:** a terminal view streams the stdout of a real `npm run demo` process as it runs, against local Zetaris, Meterless Nightshift, and Meterless H-MEM.
- **Report segment:** the browser opens the `reports/demo.html` that run produced, scrolls through it, and expands the SQL and memory panels while the narration plays.

A title card opens the video and a closing card ends it. Narration is synthesized English speech, with burned-in English subtitles. The game data is explicitly synthetic.

## 1. Problem and promise (0:00)

**Screen:** title card.

“More players, less revenue. For a game team, that is a signal to investigate, not a reason to guess. LiveOps Investigator connects Zetaris, Meterless Nightshift, and Meterless H-MEM to investigate it with traceable evidence. The game data is synthetic, but every query runs through real local services.”

## 2. A live run (0:21)

**Screen:** `npm run demo` is typed and its real output streams in, ending with `SUCCESS`.

“Here is a live run. One command runs two cases. Zetaris queries the overview, the player cohorts, the payment funnel, and the event configuration, and the code checks that every count reconciles. H-MEM recalls earlier evidence, and Nightshift, running a small local model on an NVIDIA GPU, returns a fenced suggestion. The report is written only after both cases succeed.”

## 3. Case one (0:48)

**Screen:** the generated report opens at the top, then scrolls to case one and its hypothesis-check table.

“The run produces this report. In case one, participation rises from one thousand to fifteen hundred, but revenue falls from one thousand to nine hundred. Payment success drops from eighty to sixty percent, while the event configuration is unchanged. That supports investigating the payment stage, but it does not name the fault.”

## 4. Audit trail (1:09)

**Screen:** case one's "SQL actually executed" list; the checkout query expands to show its statement and returned rows.

“Every finding links back to the exact SQL statement Zetaris executed, the rows it returned, and how long it took. Payment successes must equal the payers in the overview, or the run fails.”

## 5. Case two: memory recalled (1:22)

**Screen:** case two's header and query order, then "Show prior evidence sources" expands to show the H-MEM record saved in case one.

“Case two starts with a similar revenue drop. The agent reopens H-MEM from disk and recalls the evidence saved in case one, so it checks payment first. But fresh evidence says payment success is still eighty percent, so the earlier diagnosis is not copied.”

## 6. A different lead (1:39)

**Screen:** case two's hypothesis-check table and finding.

“Instead, fewer shop visitors try to buy, and reward units fell from one hundred to sixty. That points to the offer change. It is still a lead, not proof. Memory chose where to look. Fresh evidence decided what was true.”

## 7. Sponsor technology and boundaries (1:53)

**Screen:** case two's executed SQL list, then the "How to run it again" section.

“Zetaris is the data layer for every number. Nightshift gives bounded advice that never writes SQL or states numbers. H-MEM stores sourced evidence across cases. Numerical conclusions come only from validated code, covered by thirteen automated tests, and missing or inconsistent evidence fails the run.”

## 8. Close (2:15)

**Screen:** closing card with the repository URL.

“LiveOps Investigator is a small, inspectable prototype: query evidence, test a hypothesis, remember what was observed, and recheck that memory when the situation changes. Next, we connect real game telemetry through Zetaris. The code is open source on GitHub.”
