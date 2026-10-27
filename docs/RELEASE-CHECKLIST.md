# Release and submission checklist

Hard deadline: **2026-10-27 23:45 UTC** (official event page, Open Agent Hackathon 2026). Track: The Agent That Can Explain Why.

## Prepared locally

- [x] English README with setup, usage, dependencies, architecture, limitations, and attribution
- [x] Sponsor technology section covering Zetaris, Meterless, NVIDIA, and Cursor (rule 6.4)
- [x] English project description for the submission form
- [x] Timed English script for a video under four minutes
- [x] Synthetic Pokémon GO-style Community Day data in three Postgres sources, registered in Zetaris as three datasources (`npm run data:setup`)
- [x] Drill-down agent: reviewed SQL probes across the sources, follow-ups opened by results, H-MEM lessons and Nightshift choosing among open checks
- [x] Local web app (`npm run app`, Run-App.cmd) with steps, charts, rows and reviewer challenges
- [x] Two cases with actual service calls
- [x] Sensitive/local artifacts excluded from Git
- [x] MIT license for original code; H-MEM stays Apache-2.0

## Publishing

- [x] Create the public GitHub repository and push reviewed files (https://github.com/suzyeth/liveops-investigator)
- [x] Verify repository access while signed out (page and raw README return 200)

## Submission requirements (official rules, section 6)

- [x] Demo video produced (2:59: title and architecture cards, then a recording of the web app during live run 2026-10-27T12-24-17-165Z with two live reviewer challenges, English throughout; local file reports/submission/liveops-demo.mp4, not uploaded)
- [x] Slide deck produced (15 slides covering every item in rule 6.2, including the data sources (4), the architecture (5) and the web app (10, 11); export to PDF or PPTX for upload)
- [x] GitHub repository link: https://github.com/suzyeth/liveops-investigator
- [ ] Integration explanation (README "Sponsor technology" section can be pasted)
- [ ] Declare the vendored H-MEM reference implementation as a pre-existing component
- [ ] Select the track and review the completed form before final submission

The repository does not include licensed Zetaris software, Nightshift binaries, local credentials, or model files. Reviewers must provision these dependencies. Do not interpret local integration success as clean-machine verification.
