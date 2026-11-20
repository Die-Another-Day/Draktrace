# DarkTrace integration notes

## UI integration

| Area | Change |
|---|---|
| Charts | Added Threat categories and Source activity charts backed by `mock-data/charts.json`; the shared simulation updates their live values. |
| Shared UI | Threat details use the shared Modal; the Loader is used for crawler activity states. |
| Background | Added a lightweight CSS particle layer that respects reduced-motion and automatic lite mode. |
| Threat data | Live threats carry a real category so chart category counts can update. |

## rendering performance

- Moved per-source live counters into a separate context, published in batches, so source chart updates do not force the entire threat list to re-render on every crawl step.
- Shortened the boot intro while retaining the ability to skip it with a key or click.

## Current crawler behavior

- Every crawler starts in `idle`; synthetic crawl steps and new feed records begin only after a crawler is started.
- The primary crawler terminal starts empty so the START control has immediate visible feedback.
- Automatic critical alert flashes have a 20-second cooldown. Manual critical demos from the top bar and command palette bypass it.

## QA sprint fixes

See QA_REPORT.md (section 9) for the list of changed files: status labels follow crawler state, Threat Intelligence filters persist across tabs, COPY FAILED feedback, severity searchable, "resumed" wording, dimmed disabled crawler controls, modal focus restore, leftover internal note removed. Added chart edge-case unit tests.
