# Demo video script

Final length: **3:33** (limit 4:00). The submitted video records the local web app during a real run (run `2026-10-27T14-27-37-544Z`), made off-screen with a headless browser. The run queries the three Zetaris datasources and calls Meterless Nightshift and H-MEM; both reviewer challenges in the video are real requests that the agent answered live.

A drawn cursor shows each click; the clicks themselves are real clicks on the running page. A title card and an architecture card open the video and a closing card ends it. Narration is synthesized English speech, with burned-in English subtitles. The scenario follows Pokémon GO's public Community Day format; all player and purchase data is synthetic.

## 1. Problem and promise (0:00)

**Screen:** title card.

“More trainers showed up for Community Day, but revenue did not keep up. The reasons are spread across the game server, the store purchase log and the live-ops calendar. LiveOps Investigator follows the evidence across all three, sizes each explanation in dollars, says what it cannot explain, and lets people challenge every step. The scenario follows Pokémon GO's public Community Day format; all player and purchase data is synthetic.”

## 2. Architecture (0:28)

**Screen:** architecture card: three Postgres sources, Zetaris, the agent loop, H-MEM and Nightshift, the web app and the reviewer.

“Three source systems sit in Postgres, and Zetaris federates them. The agent runs reviewed SQL checks, and each result opens follow-up checks. When several are open, an H-MEM lesson goes first; otherwise Nightshift's local model, on an NVIDIA GPU, picks one, and its choice counts only if it names exactly one valid check. A person can challenge any step.”

## 3. The app (0:53)

**Screen:** top of the web app: the question, the four steps, the three data sources.

“This is the app, running locally. It states the question, the four steps, and the three data sources.”

## 4. A live run (1:00)

**Screen:** Run is clicked; the live progress panel fills in check by check for all three cases.

“Clicking Run investigates three Community Days live. Each check appears as it finishes, with the sources it joined.”

## 5. Case one: the finding in dollars (1:13)

**Screen:** case one's finding and its verdict table with dollar estimates.

“Case one. Players rose twenty four percent, so about forty eight thousand dollars was expected, and revenue came in about twelve thousand four hundred short. The finding sizes each explanation: about four thousand nine hundred from failed Google Play orders, and about seven thousand two hundred from a shift toward returning players, who spend less.”

## 6. Case one: the drill-down (1:35)

**Screen:** case one's steps: order completion by store, by app build, purchase error codes, app releases.

“The steps show how it got there. Google Play order completion fell from ninety four to sixty eight percent, far beyond noise. One build completes only forty eight percent. Store billing reports billing unavailable on that build and not on the others, and the live-ops calendar shows it shipped two days before the event, with a billing library upgrade.”

## 7. One query, three sources (1:57)

**Screen:** the "Revenue lost to failed orders" step opens to show its three-source SQL.

“This check joins all three sources in one Zetaris query: orders from the game server, purchase results from the store log, and list prices from the live-ops calendar, to size the revenue lost.”

## 8. Case two: memory, then fresh evidence (2:10)

**Screen:** case two's finding, its payment step, offer changes, buyers by segment, and its verdict table.

“Case two. Memory sent the agent to payments first, and they were healthy. The ticket price had risen from one ninety nine to four ninety nine, and the box had lost its ticket. Fewer players bought them in every segment. Of a thirteen and a half thousand dollar shortfall, about thirty nine hundred is the offer, about six thousand the player mix, and thirty five hundred the agent cannot explain.”

## 9. Case three: an honest gap (2:34)

**Screen:** case three's finding and verdict table: nothing supported, the whole shortfall unexplained.

“Case three is the honest one. Payments held, no offer changed, and the player mix even helped. The agent says so: none of its checks explains the sixty two hundred dollar shortfall: it may be normal variation, or a cause that needs data it does not have.”

## 10. A reviewer asks for more (2:51)

**Screen:** "Challenge the finding" on case one, "Something is missing", "Revenue by country"; the agent's reply with its chart.

“A reviewer can ask for something the agent did not check, here revenue by country. The agent runs a new Zetaris query, and warns that one country's swing is weak evidence on its own.”

## 11. A reviewer disputes a value (3:03)

**Screen:** a value in case two's overview rows is flagged as wrong; the agent re-runs the query, and the finding is marked "Data disputed".

“A reviewer can also say a value looks wrong. The agent re-runs that step on Zetaris, reports whether the sources still return the same rows, and marks everything that rests on it as disputed.”

## 12. Close (3:16)

**Screen:** closing card with the repository URL.

“LiveOps Investigator turns an agent's reasoning into dollar estimates a team can check and argue with. Next, we connect real game telemetry through Zetaris and evaluate larger models through Nightshift. The code is open source on GitHub.”
