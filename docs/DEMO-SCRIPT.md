# Demo video script

Final length: **2:59** (limit 4:00). The prepared video records the local web app during a real run (run `2026-10-27T12-24-17-165Z`), made off-screen with a headless browser. The run queries the three Zetaris datasources and calls Meterless Nightshift and H-MEM; both reviewer challenges in the video are real requests that the agent answered live.

A drawn cursor shows each click; the clicks themselves are real clicks on the running page. A title card and an architecture card open the video and a closing card ends it. Narration is synthesized English speech, with burned-in English subtitles. The scenario follows Pokémon GO's public Community Day format; all player and payment data is synthetic.

## 1. Problem and promise (0:00)

**Screen:** title card.

“More trainers showed up for Community Day, but the event made less money. The reason is spread across the game server, the payment gateway and the live-ops calendar. LiveOps Investigator follows the evidence across all three, and lets people challenge every step. The scenario follows Pokémon GO's public Community Day format; every player and payment record is synthetic.”

## 2. Architecture (0:23)

**Screen:** architecture card: three Postgres sources, Zetaris, the agent loop, H-MEM and Nightshift, the web app and the reviewer.

“Here is how it works. Three source systems sit in Postgres, and Zetaris federates them, so one SQL statement can join orders, payment attempts and offer prices. The agent runs reviewed SQL checks, and each result opens follow-up checks. When several are open, an H-MEM lesson goes first; otherwise Nightshift's local model, on an NVIDIA GPU, picks one. A person can challenge any step, and the agent answers with new queries.”

## 3. The app (0:53)

**Screen:** top of the web app: the question, the four steps, the three data sources.

“This is the app, running locally. It opens with the question it answers, the four steps it takes, and the three data sources it will query.”

## 4. A live run (1:01)

**Screen:** Run is clicked; the live progress panel fills in check by check for both cases.

“Clicking Run starts a live investigation of two Community Days. Each check appears as it finishes, with the data sources it joined.”

## 5. Case one: the finding (1:10)

**Screen:** case one's finding and the verdict table.

“Case one. Players rose by almost a third, and revenue fell seven percent. The finding comes first, with a verdict for each explanation and links to the steps behind it.”

## 6. Case one: the drill-down (1:22)

**Screen:** case one's steps: payment success by store, by app build, payment error codes, app releases.

“The steps show the drill down. Google Play payment success fell from ninety four to forty one percent, so the agent opened a check by app version. One build completes only twenty nine percent of orders. The payment gateway's error codes show billing unavailable on that build and nowhere else, and the live-ops calendar shows it shipped two days before the event, with a billing library upgrade.”

## 7. The evidence behind a step (1:46)

**Screen:** the "Payment success by store" step opens to show its SQL and the rows Zetaris returned.

“Every step shows the SQL Zetaris ran and the rows it returned. This one joins the game server's orders with the payment gateway's log.”

## 8. Case two: memory, then fresh evidence (1:55)

**Screen:** case two's finding, memory panel, payment step, offer changes and buyers by segment.

“Case two has the same symptom. H-MEM recalls case one's lesson, so the agent checks payments first, and finds them healthy. It moves on: the ticket price rose from one ninety nine to four ninety nine, the box lost its ticket, and fewer players bought them in every segment, so the player mix does not explain it.”

## 9. A reviewer asks for more (2:15)

**Screen:** "Challenge the finding" on case one, "Something is missing", "Revenue by country"; the agent's reply with its chart.

“A reviewer can ask for something the agent did not check, here revenue by country. The agent runs a new Zetaris query and answers: revenue fell in eleven of fourteen countries, so this is not a regional problem.”

## 10. A reviewer rejects a finding (2:30)

**Screen:** "Challenge the finding" on case two, "I don't trust this", a note; the agent's reply, then the finding flagged as disputed.

“A reviewer can also reject a finding. The agent lowers the confidence of the lesson H-MEM stored for it, logs the change, and flags the finding as disputed until the review is resolved.”

## 11. Close (2:43)

**Screen:** closing card with the repository URL.

“LiveOps Investigator turns an agent's reasoning into a path a team can inspect and argue with. Next, we connect real game telemetry through Zetaris and evaluate larger models. The code is open source on GitHub.”
