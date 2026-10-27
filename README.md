# Scripture Memory: Topical Bible Memorization PWA

A local-first PWA for practicing the Navigators' scripture-memory curriculum,
with an emphasis on both **word-perfect recall** and **long-term retention**.

- **495 verses included**: Five Assurances (5) → Guidelines for Christian Living (8) →
  Topical Memory System (60) → The Disciple's Path, DEP (242) →
  Topical Scripture Memory Series (180).
- **315 verses in the goal scope**: Target-date pacing counts only
  the curriculum through DEP242 (5+8+60+242). The 180-verse extension is excluded
  from the goal and used for maintenance review
  (`src/domain/goal.ts`, `GOAL_VERSE_COUNT`). Records stay in the browser's IndexedDB,
  without a server. Install the app on an iPhone or Android home screen for offline use.

## Product & Quality

**The user problem:** Learners need to memorize an assigned curriculum accurately
while continuing to review verses they have already learned. The app separates
learning into stages, connects typing evidence to review schedules, and keeps
records on the device without requiring an account.

- **Try it:** Open the [deployed app](https://quantsquirrel.github.io/scripture-memory/),
  select a verse, and follow the learning ladder. Before changing devices, create
  a backup using Export in Settings.
- **Implementation evidence:** [Text-source tests](tests/dataSources.test.ts),
  [storage and restoration lifecycle tests](tests/lifecycle.test.ts),
  [end-to-end flow tests](e2e/flow.spec.ts), [accessibility checks](e2e/a11y.spec.ts),
  and [CI history](https://github.com/quantsquirrel/scripture-memory/actions).
- **What that evidence covers:** Tests and deployment records provide evidence of
  implementation quality, not measured improvements in users' recall, achievement
  of the target retention rate, onboarding completion, or repeat use.
- **Read more:** [Product decisions, evidence, and the usability study plan](docs/PRODUCT-QUALITY.md).
  The observation plan describes future work, not completed user research.

## Core Design

- **Learning ladder** for new verses: Learn the text (recitation order: topic →
  reference → verse → reference) → first-letter recall (at most two peeks) →
  word-perfect typing verification → graduation.
- **Three card directions:** Graduation creates topic-to-verse, reference-to-verse,
  and verse-to-reference cards, each with an independent FSRS state.
- **FSRS scheduling:** Uses [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
  with a 90% target retention setting. This is a scheduling parameter, not a
  measured learning outcome.
- **Objective grading and suggested ratings:** Typing accuracy is calculated with
  a whitespace-delimited word-unit LCS diff, ignoring punctuation, to suggest an
  FSRS rating (Again, Hard, or Good). First-letter mode uses the number of peeks;
  reference entry uses correctness. The user confirms the final rating.
- **Review-mode policy:** Young cards (`reps < 3`) use first-letter recall, followed
  by recitation and self-grading, with a typing audit every fifth review.
  Verse-to-reference cards always require reference entry.

## Scripture Data

- **Translation:** The 1961 Korean Revised Version, **성경전서 개역한글판**.
  Its economic copyright expired on December 31, 2011; the text is public domain.
- **Extraction:** Chapters were extracted from the Korean Bible Society's online
  text (bskorea.or.kr, `version=HAN`), with footnotes removed, then exhaustively
  compared at the word-unit level against two independent GitHub KRV datasets.
- **Verse lists**, each cross-checked against multiple sources:
  - **Five Assurances:** Five verses on Christian assurance, checked against the
    English original, the _Lessons on Assurance_ PDF.
  - **Guidelines for Christian Living:** Eight verses, matching two independent
    Korean sources.
  - **60 verses:** TMS, five series × six topics × two verses.
  - **DEP:** 242 verses across eight sections: assurance of salvation, quiet time,
    the Word, prayer, fellowship, witness, lordship, and world vision. The ninth
    world-vision topic, “The Glory of Fulfilled Promises” (Habakkuk 2:14; Malachi 1:11),
    was missing from the blog source and was restored by comparison with the user's
    booklet in July 2026. Source: `scripts/data/dep242.txt`;
    build script: `scripts/data/build_v2.py`. Four partial-verse entries, such as
    2 Chronicles 16:9a, retain their partial-verse references but include the full
    verse text.
  - **180 verses:** Topical Scripture Memory Series, five series × 36 verses.
    Source: `scripts/data/tms180.txt`. References match in all 180 entries, and
    all 180 verse texts match character for character (`npm run verify:data`).
- **Schema (v2)** in `src/data/verses.json`:
  collection → section (main heading) → group → topic (title) → reference → verse text.
  Existing IDs for the 60-verse collection (`A1a` through `E6b`) are preserved for
  compatibility with user data.

## Development

```bash
npm install
npm run dev             # Development server
npm test                # Vitest (fixed TZ=Asia/Seoul)
npm run coverage        # Vitest + domain/ coverage thresholds
npm run typecheck       # tsc --noEmit
npm run lint            # ESLint 9 (typescript-eslint strict-type-checked)
npm run format          # Prettier
npm run build           # Production build, including the PWA
npm run preview         # Serve the production build locally
npm run e2e             # Playwright against the production build
npm run verify:data     # Exhaustive word-unit comparison with source texts
npm run audit:contrast  # WCAG AA contrast audit for design tokens
npm run bench           # Repository-query benchmarks
```

## Architecture

Hexagonal architecture: the domain contains only pure functions and types,
with no knowledge of I/O.

```text
src/
  domain/      Pure rules, no I/O
    card.ts        Card, direction, and evidence types
    ladder.ts      Learning-ladder state machine; types prevent invalid transitions
    scheduler.ts   ts-fsrs wrapper; applyRating stays inside this module
    grading.ts     Character-level LCS diff grading and rating mapping
    ref.ts         Reference-entry parsing and grading
    policy.ts      Review-mode selection and periodic typing audits
    goal.ts        Goal-date pacing
  ports/       Storage interfaces (CardRepository / ReviewLog / … / Store)
  adapters/    indexeddb (v2 + migrations), memory (tests), gist, theme
  app/         Use cases; submitReview is the only path for applying a rating
  views/       Container/presentation separation and hash routing
  styles/      Design tokens → base → components → accessibility adjustments
```

`app/submitReview` is the sole path for applying a rating.
`applyRating` in `domain/scheduler.ts` is not exported; the single entry point,
`rateCard()`, requires evidence, and storage can commit only its result,
`RatedCard`. Card-state changes and evidence records are linked by the type
system and persisted in one transaction.

## Backups

Use Settings → Export to save the complete state as JSON. On a new device,
use Import to restore it.

## Documentation History

The [original README from before this revision](docs/archive/README-before-product-ops-2026-09-21.md)
is preserved. Where earlier descriptions differ from the current evidence scope,
refer to this README and the product-quality guide.
