# Landing page · UI/UX review

**Assessment: 8/10 after this pass** — a subjective design review, not a prediction of judging results. The editorial glass hero and restrained palette give Tessera a recognisable identity. The main gaps were navigation out of secondary pages, a timetable object that was too small to read, and marketing copy that sometimes presented examples or implementation details as product outcomes.

## What changed

- **Find your way back:** the sign-in page, public editorial pages and every workspace page have a visible route back to the site. The workspace retains its own navigation for moving between tools.
- **A more useful week:** day controls now display schedule-derived counts and the selected day shows the earliest real sessions with their times, faculty and rooms. The panel is larger and more legible; its layered tilt remains decorative, while actual buttons work with keyboard and touch.
- **More credible storytelling:** removed a fabricated assistant verdict, invented faculty titles, non-functional sign-in fields and placeholder draft actions. Reference photography is labelled. Preview mode remains clearly labelled because it cannot save changes.
- **A calmer voice:** user-facing failures remain visible and actionable, but routine copy no longer exposes raw endpoint names and HTTP codes. Typography and focus states are more consistent across the site.

## Next improvements

1. Test with actual judges and campus users: ask them to find a room, submit a request and return home without prompts. A design score is not a substitute for usability testing.
2. Replace illustrative room photographs with authorised photos of the actual campus, if available. Until then, keep their labels.
3. Test on physical iOS and Android devices and with screen readers. Local Chromium checks covered desktop and emulated 390px and 320px widths, not real devices.
4. Continue refining small labels and visual hierarchy against real content and longer course names; preserve accessible contrast and reduced-motion support.
5. Confirm the hosted deployment, demo identities and video. Product limitations (including priority handling for competing manual bookings) are tracked in [CORE_TEST_REPORT.md](CORE_TEST_REPORT.md).

Local checks include frontend build, snapshot and live-local smoke tests, and Chromium navigation/day-selection checks. They do not prove production deployment or contest results.
