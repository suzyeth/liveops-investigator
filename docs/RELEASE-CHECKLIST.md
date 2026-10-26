# Release and submission checklist

Hard deadline: **2026-10-27 23:45 UTC** (official event page, Open Agent Hackathon 2026). Track: The Agent That Can Explain Why.

## Prepared locally

- [x] English README with setup, usage, dependencies, architecture, limitations, and attribution
- [x] Sponsor technology section covering Zetaris, Meterless, NVIDIA, and Cursor (rule 6.4)
- [x] English project description for the submission form
- [x] Timed English script for a video under four minutes
- [x] Windows launcher and two synthetic cases with actual service calls
- [x] Sensitive/local artifacts excluded from Git
- [x] MIT license for original code; H-MEM stays Apache-2.0

## Publishing

- [ ] Create the public GitHub repository and push reviewed files
- [ ] Verify repository access from a signed-out browser

## Submission requirements (official rules, section 6)

- [ ] Demo video, 1–4 minutes, showing the workflow and the Zetaris and Meterless integration
- [ ] Slide deck: problem and users, solution, workflow, stack, sponsor technology use, product visuals, future work
- [ ] GitHub repository link
- [ ] Integration explanation (README "Sponsor technology" section can be pasted)
- [ ] Declare the vendored H-MEM reference implementation as a pre-existing component
- [ ] Select the track and review the completed form before final submission

The repository does not include licensed Zetaris software, Nightshift binaries, local credentials, or model files. Reviewers must provision these dependencies. Do not interpret local integration success as clean-machine verification.
