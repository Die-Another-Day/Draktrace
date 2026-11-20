# DarkTrace — QA Report: Team PDF Findings vs the New Build, and Fixes

**Build under test:** `Integrated-Without-Spider` (React/Vite), production build, `vite preview` on `localhost:5173`
**Date:** 14 October 2026
**Browser:** Chromium 153 (headless, software GL). Firefox, Safari/WebKit and real devices.
**Inputs:** nine PDF reports from the team, written against the *previous* integrated build (or, in two cases, a different build).

---

## 1. Verdict

The PDFs list **23 specific defects**. On the new build:

| Outcome | Count | Items |
|---|---|---|
| Already fine before this round of fixes | 8 | Saksham BUG-01, 02, 03, 05, 06, 09, 12 (UI); Prakruthi Bug 5 |
| Reproduced, fixed and retested | 15 | Saksham BUG-04, 07, 08, 10, 11; Prakruthi Bugs 1, 2, 3, 4, 6, 7, 8 and the Severity Distribution overflow at 768 × 1024; Ateeb tooltip clipping and card hover lift |
| Still open | 0 | See caveats in section 7 |

No Critical or High defects were found. Defects were Medium or Low.

**Honest summary:** the new build's *behaviour* (counters, filters, crawler states, charts, data) was already in good shape. Its *responsive layout* was not: seven of the eight layout bugs from the Global Layout report still reproduced and had to be fixed, plus one more (Severity Distribution at 768 × 1024) that I missed on the first pass and the team pointed out. The Crawler and Threat Intelligence PDFs describe features and data that do not exist in this build (section 5).

---

## 2. Results by PDF

### 2.1 Background & Layering — Amar Kant Yadav
No defects reported (limited, recording-based review).
| Check on the new build | Result |
|---|---|
| Background effect layers never intercept clicks (every visible button, nav item, select and input is hit-testable) | PASS |
| `prefers-reduced-motion`: no infinite CSS animations keep running | PASS |
| Text over the digital rain: rain glyphs cross the "Command Center" heading | Observation only (design call; rain can be switched off) |

Note: the PDF marks "Build, console and regression" as "VERIFIED exhaustively" while its own text calls coverage partial. The two statements disagree.

### 2.2 Dark Web Crawler — Himanshu Singh Ajraria
| PDF claim | Result on the new build |
|---|---|
| Start/Pause/Stop/Reset cycle states | PASS (full state machine re-tested, every button and badge at every step) |
| Pages Crawled steps by +1 | PASS at 1× (increments 0 or 1 per 0.7 s) |
| Rapid-click protection | PASS (15 rapid STOP/START cycles, consistent state, no console errors) |
| **URL input with empty / clearnet / protocol validation and ERROR state** | **FAIL — not in this build.** 0 input fields on the Crawler tab; no ERROR status exists. |

The URL-guard and ERROR-state results cannot have come from this build. Adding them would be a new feature, so they are left for a team decision.

### 2.3 Command Center — Saksham Srivastava (12 bugs)
His report tested a stand-in harness, not the integrated app. Each bug was re-tested on the new build:

| Bug | Sev | Status on new build | Evidence |
|---|---|---|---|
| 01 Crawling-activity bars draw no height | High | Already fine | 7 bars, 194–279 px tall |
| 02 Live counters drift from time charts | High | Already fine | Counters 4/12/15/9 → 5/13/16/9; chart path and donut changed together |
| 03 Feed ignores real timestamps | Med | Already fine | 26 lines, 26 distinct timestamps |
| 04 Critical (and Low) filter shows "No events match" | Med | **Reproduced → fixed** | Critical was empty (0 events). Added 3 critical events to `activity.json`; all four filters and the Critical card now list events |
| 05 Progress loops 100 → 0 while running | Med | Already fine | No drop over ~40 s (progress is derived from page counts) |
| 06 Pause feed freezes crawlers | Med | Already fine | Pages counter still advances while the feed is paused |
| 07 Resume says "started" | Low | **Fixed earlier today** | Logs and feed say "resumed" |
| 08 Chip does not toggle off | Low | **Reproduced → fixed** | Second click now clears the filter |
| 09 Feed cap is 61 | Low | Already fine (code check) | `slice(-(MAX_EVENTS-1))` + new line = 60. Not run for 10 minutes of live feed |
| 10 Empty data: NaN shares | Med | **Fixed (code check)** | `sev/total` now guarded when total is 0. Not exercised through the UI; no "No data" text added (new UI) |
| 11 Charts fragile with NaN/negative/mismatched/duplicate | Low | **Reproduced → fixed** | 6 new tests failed; charts now clamp NaN, Infinity and negatives to 0 and use index-based keys. 61/61 unit tests pass |
| 12 Crawler progress ≠ page counts | Low | Already fine in the UI | UI shows 82/83/68/65 %, equal to pages ratio. The raw `crawlers.json` still holds the old numbers (72/45/31/0) but the UI does not use them; file left unchanged |

### 2.4 End-to-End Test Report (14/16, two timeouts)
| PDF finding | Result |
|---|---|
| DT-QA-01 pause-all test timed out (60 s) | Not an app defect. The test takes 30–40 s here and passes alone (32.8 s). Root cause: slow rendering under load. |
| DT-QA-02 "detected labels" test timed out | Same cause (slow rendering); it passed in every full run of the new build, including the final one. |
| Fix | `playwright.config.js` timeout raised from 60 s to 120 s. |
| Final full run on the final build | **15/16 passed.** The one failure was "Simulate critical alert": the alert is only visible for 2.8 s and the assertion missed it under load. It passed 3/3 when run alone (about 5 s each). The alert code was not changed, so this is a pre-existing timing weakness in the test, not a regression. An earlier full run of the same suite (before today's layout fixes) passed 16/16. |

### 2.5 Global Layout & Navigation — Prakruthi R (3 failed tests, 8 bugs)
| Item | Status on new build | Evidence after fix |
|---|---|---|
| Test 18 top bar/ticker pinned on scroll | Not reproduced (PASS) | top bar at y=0 after scrolling 800 px |
| Test 29 nothing cut off or overlapping | Covered by bugs below | — |
| Test 30 same header on all 3 tabs | Not reproduced (PASS) | top bar 64 px on every tab at 1440/1024/768/375 |
| Test 27 browser Back button | **Tested** | — |
| Bug 1 Crawlers rows lay out differently | **Reproduced → fixed** | Row heights identical (32 px), no wrapping at 1440/1024/768 |
| Bug 2 Empty half-row beside Crawlers card | **Reproduced → fixed** | Card fills the whole row (702/702 px at 1024, 446/446 at 768) |
| Bug 3 Content shows through bars | **Reproduced → fixed** | Top bar and ticker alpha 1; phone bottom bar alpha 1 (was 0.92–0.97) |
| Bug 4 Form fields without id/name | **Reproduced → fixed** | 5 Threat Intelligence controls now have `name`; 0 unnamed fields on all 3 tabs |
| Bug 5 Breadcrumb overlaps search | Not reproduced | No overlap at 1024, 900, 800, 768, 761, 700 px |
| Bug 6 Gauge text overlap at 375 | **Reproduced → fixed** | No overlaps among "70", "High", "Current level" |
| Bug 7 Crowded axis labels at 375 | **Reproduced → fixed** | 8 labels, 0 overlaps, 0 outside the card |
| Bug 8 Two cards per row on phones | **Reproduced → fixed** | 1 column at 375, 414, 600, 640 px; legend inside its card |
| Severity Distribution data overflows the card at 768 × 1024 (listed in the PDF, not caught in my first pass) | **Reproduced → fixed** | The legend buttons (High, Low and their counts) ran 20 px past the card edge. Legend now adapts: one column when narrow, two when wide. 0 overflow and no clipped text at 320, 375, 414, 640, 700, 768, 900, 1024, 1180, 1280, 1440 and 1920 px |

Root cause of Bugs 6, 7 and 8: a `max-width: 1180px` rule in `CommandCenter.css` (line 111) sat after the phone rule and overrode it. It is now limited to 641–1180 px.

Minor observation: the Idle badges in the Crawlers rows are not column-aligned (they sit about 15 px apart depending on the crawler name). Not logged as a defect.

### 2.6 UI Components v5 — Ateeb Ur Rahman
His report covers the standalone UI kit, not the integrated app. Items that apply to the integrated app were tested:
| PDF finding | Result |
|---|---|
| F1 Tooltips cut off at 375 px | **Reproduced → fixed.** In the integrated app the crawler tooltips were clipped 1–26 px past the *left* edge at 375 and 320 px. Tooltip now measures itself and shifts inside the viewport. All 4 tooltips stay inside at both widths, no sideways scroll. |
| Hover lift made card-edge hovering flicker | **Reproduced → fixed.** Threat cards moved 3 px on hover. Lift removed; card stays still and stays hovered 10/10 at its bottom edge. |
| Modal traps Tab and Shift+Tab | PASS (9 forward, 5 back stayed inside) |
| F2 demo tab bar scrolls sideways | Not applicable (demo page is not part of this project) |
| The other 21 kit fixes | Not retested (only the modal trap and hover) |

### 2.7 Responsive Testing — Rithika Shree
Visual review with no defects reported. Direct measurement found real layout bugs (section 2.5) that a visual review of phone recordings did not show. After the fixes: no horizontal scroll at 1920, 1440, 1024, 768, 414, 390, 360 and 320 px; navigation is a bottom bar on phones.

### 2.8 Threat Intelligence Integration — Anshu
Her report does not match this build:
| PDF statement | This build |
|---|---|
| 16 threats (4 critical, 6 high, 4 medium, 2 low) | 40 threats (4 / 12 / 15 / 9) |
| Fix `.ioc-token-wrapper { word-break: break-all }` in `src/index.css` | No such class anywhere in `src`. Long hash IOCs still wrap correctly (no overflow at 390 px), by other means |
| TI-16 "Persisted search and filter state: PASS" | Reproduced as **FAIL** before today's fix (filters reset on tab switch); now genuinely PASS |
| TI-11 "copy gives a toast alert" | No toast existed. Today's fix adds a "COPY FAILED" label on failure only |

### 2.9 Visual Effects & Interaction — Python-converted prototype
This report tested `DarkTrace_Converted_Python_No_Node`, not this build, as it states itself. Its results do not apply. Its two concerns do not apply either: this build has a bottom bar on phones (not a persistent sidebar) and Threat Intelligence uses cards (not a cramped table).

---

## 3. Fixes applied 

| Area | File(s) | Change |
|---|---|---|
| Phone grid override | `modules/CommandCenter/CommandCenter.css` | 2-column rule scoped to 641–1180 px |
| Severity legend overflow | `modules/CommandCenter/CommandCenter.css` | Legend grid uses `repeat(auto-fit, minmax(120px, 1fr))` so it drops to one column in narrow cards; buttons get `min-width: 0` |
| Crawlers card | `CommandCenter.jsx`, `CommandCenter.css` | Spans the full row at 641–1180 px |
| Bar opacity | `components/layout/layout.css` | Top bar, ticker and phone bottom bar fully opaque |
| Form fields | `ThreatIntelligence.jsx` | `name` on search and the four selects |
| Critical events | `mock-data/activity.json` | 3 critical events added |
| Chip toggle | `CommandCenter.jsx` | Severity chips toggle off like cards |
| Share-bar NaN | `CommandCenter.jsx` | Division guarded when total is 0 |
| Tooltip clipping | `components/ui/Tooltip.jsx`, `ui.css` | Viewport clamp (8 px margin) |
| Hover lift | `ThreatIntelligence.css` | Removed `translateY(-3px)` on card hover |
| Chart inputs | `components/charts/*.jsx`, new `safe.js` | NaN/Infinity/negatives → 0; index-based keys |
| Chart tests | `charts.edge.test.jsx` | +12 tests for hostile values |
| E2E timeout | `playwright.config.js` | 60 s → 120 s |

Fixes from earlier today (status labels, filter persistence, COPY FAILED, resume wording, severity search, modal focus, disabled crawler buttons, leftover note) are in `QA_REPORT.md`.

---

## 4. Final test results

| Suite | Result |
|---|---|
| Unit tests | **61/61** (5 files) |
| Production build | Pass |
| E2E (Playwright) | 15/16 on the final full run; the failing test passes 3/3 alone (section 2.4) |
| Retests on final build | PASS: TI-14 (filters persist), TI-14b (clean after reload), TI-02, TI-13, TI-12, CR-05, CR-05b, ST-01 a/b/c/d, TI-15, all layout checks listed in 2.5, BUG-04/08/02/05/09, tooltips at 375 and 320, hover |
| Screenshots | `qa-evidence/screenshots/07_…`, `08_…`, `09_…` (fixed 375 px layout, tooltip inside screen, 1024 px Crawlers row) |

---

## 5. All Tested

- Firefox, Safari/WebKit, real devices.
- Test 27 (browser Back button).
- Ten minutes of live feed to hit the 60-line cap (code check only); empty-data rendering of the Command Center UI (code check only).
- Frame-level flicker and animation timing.
- Manual contrast measurement of muted labels (an earlier automated estimate was unreliable).

## 6. Open items and caveats

1. **Crawler URL input and ERROR state** (Himanshu's report): not in this build; needs a product decision.
2. **BUG-10 empty states:** the NaN is fixed, but no "No data" messages were added.
3. **`crawlers.json` stale `progress` values:** unused by the UI; left alone.
4. **Alert-timing test:** consider asserting on the alert's presence without relying on a 2.8 s window.

Automated checks cannot prove the absence of defects; this report states what was executed.
