# Demo video script

Final length: **2:43** (limit 4:00). The submitted video records the local web app during a real run (run `2026-10-27T10-41-56-666Z`), made off-screen with a headless browser. The run calls local Zetaris, Meterless Nightshift, and Meterless H-MEM, and both reviewer challenges in the video are real requests that the agent answered live.

A drawn cursor shows each click; the clicks themselves are real clicks on the running page. A title card opens the video and a closing card ends it. Narration is synthesized English speech, with burned-in English subtitles. The game data is explicitly synthetic.

## 1. Problem and promise (0:00)

**Screen:** title card.

“More players joined the live event, but revenue fell. A game team has to explain why before the next event, and a guess is not good enough. LiveOps Investigator tests each explanation against evidence, using Zetaris, Meterless Nightshift, and Meterless H-MEM. The game data is synthetic; every query runs through real local services.”

## 2. The app (0:23)

**Screen:** top of the web app: the question, the four steps, the Run button.

“This is the app, running locally in the browser. It opens with the question it answers, and the four steps it takes: measure with Zetaris, choose where to look with memory, test each explanation against a stated rule, and let a person challenge any step.”

## 3. A live run (0:39)

**Screen:** Run is clicked; the live progress panel fills in step by step for both cases.

“Clicking Run starts a live investigation of two cases. Each step lights up as it finishes: the Zetaris queries, the cohort check, the memory recall, and advice from Nightshift's local model on an NVIDIA GPU, which is recorded but never decides.”

## 4. Case one (0:56)

**Screen:** case one's finding, then the symptom charts.

“Case one. The finding comes first, in plain words: look at the payment step. Below it is the symptom. Players taking part rose by half, while paying players and revenue fell by ten percent.”

## 5. Evidence behind a number (1:09)

**Screen:** the two explanation cards; a number is clicked and the evidence panel opens with its SQL row highlighted.

“Each explanation has a rule and the numbers behind it. Payment success fell from eighty to sixty percent, more than the five point rule, so it is supported. Click any number, and the app shows the exact SQL row it came from, with that cell highlighted.”

## 6. Case two: memory recalled, then overruled (1:25)

**Screen:** case two's "Where it looked first, and why" panel, then its explanation cards.

“In case two, H-MEM recalls case one's evidence, tagged payment drop, so the rule checks payment first. But fresh data says payment success held at eighty percent. The offer changed instead: reward units fell from one hundred to sixty. Memory chose where to look. Fresh evidence decided.”

## 7. A reviewer asks for more data (1:45)

**Screen:** "Compare by platform" on case one; the challenge dialog, a typed question, the agent's reply with its chart.

“A person can push back. Here a reviewer asks whether the payment drop is everywhere. The agent runs a new Zetaris query split by platform, checks that it adds up to the funnel, and answers: the drop is on Android, while iOS held at eighty percent.”

## 8. A reviewer rejects a finding (2:01)

**Screen:** "Challenge this" on case two's finding, "I don't trust this", a typed note; the agent's reply, then the finding flagged as disputed.

“A reviewer can also reject a finding. The agent marks the evidence H-MEM stored for it as wrong, lowering its confidence and logging the change, and the finding is flagged as disputed until the review is resolved.”

## 9. Boundaries (2:16)

**Screen:** case two's executed SQL list, then "What this does not claim".

“Every number on the page comes from Zetaris SQL. The model never states a number or a verdict, and a finding points to where to look next, not to a proven cause. Twenty-four automated tests cover these checks.”

## 10. Close (2:30)

**Screen:** closing card with the repository URL.

“LiveOps Investigator turns an agent's reasoning into something a team can inspect and argue with. Next, we connect real game telemetry through Zetaris. The code is open source on GitHub.”
