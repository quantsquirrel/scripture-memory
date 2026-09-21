# Product Quality: Scripture Memory

Scripture Memory separates accurate recall from long-term retention: learners
move from **reading the text → first-letter recall → typing verification → review**.
This page explains the product decisions behind that workflow, the evidence
available, and the next questions to investigate with users.

**Evidence snapshot:** Public repository code, tests, and documentation as of
September 21, 2026. This documentation review did not include new user experiments
or test runs.

## 1. Product Decisions and Tradeoffs

| Decision                                                             | Implementation and evidence                                                                                           | Tradeoff                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Start without an account and store records locally                   | [IndexedDB adapter](../src/adapters/indexeddb.ts) · [Lifecycle tests](../tests/lifecycle.test.ts)                     | A lightweight start makes clear backup guidance essential before browser-data deletion or a device change.                |
| Link learning-state changes to evidence                              | [Learning-ladder tests](../tests/ladder.test.ts) · [Policy tests](../tests/policy.test.ts)                            | More steps than a simple completion button. Whether first-time users understand those steps remains a usability question. |
| Treat text integrity as product quality                              | [Source tests](../tests/dataSources.test.ts) · [Scripture data in the README](../README.md#scripture-data)            | Keep canonical grading text separate from the display-only full text, while preserving existing verse IDs.                |
| Include offline behavior, routing, and accessibility in verification | [Flow E2E](../e2e/flow.spec.ts) · [Routing E2E](../e2e/routing.spec.ts) · [Accessibility checks](../e2e/a11y.spec.ts) | Automated checks do not establish usability on every real device or with every assistive technology.                      |

## 2. Evidence and Open Questions

### Engineering and data quality

The README records source cross-checks and the restoration of a missing entry
using the user's booklet. These are data-quality findings, distinct from user
satisfaction research.

The [deployment workflow](../.github/workflows/deploy.yml) is configured to run
lint, formatting checks, coverage, type checking, and a build before deploying
to GitHub Pages. [Actions](https://github.com/quantsquirrel/scripture-memory/actions)
provides the latest execution results.

### Learning outcomes and adoption

FSRS uses a **90% target retention setting**, not an outcome measured among this
app's users. The reviewed materials contain no interview findings, first-session
learning-completion rate, measured long-term recall improvement, or return-use
metrics. Demand and learning effectiveness remain open questions.

### Contribution context

Development includes AI assistance. Commit authorship and test counts alone do
not establish any individual's product, implementation, or verification
contribution. Individual contributions should be explained alongside the relevant
decision records.

## 3. First-Use Walkthrough

1. Open the [deployed app](https://quantsquirrel.github.io/scripture-memory/) and
   choose a verse to learn.
2. Work through one verse, noting the differences between learning the text,
   first-letter recall, and typing verification.
3. On the review screen, inspect the suggested rating and choose the final rating
   yourself.
4. Export a JSON backup from Settings. Use Import to restore it when changing devices.

Clearing browser storage can erase learning records. Backup files contain personal
learning history and should not be uploaded to a public repository.

## 4. Next Usability Study: Planned, Not Yet Conducted

Before adding more features, the next study will ask whether first-time users
**understand what to do and can complete one verse**.

- **Participants:** Three to five volunteers using the app for the memory curriculum
  for the first time. Obtain separate consent for contact, participation, and recording.
- **Tasks:** Start a verse without explanation → complete the stages → explain the
  review process → find the backup option.
- **Observations:** Success on each task, start and finish times, requests for help,
  blocking screens, and short comments recorded with consent. Keep personal
  information and raw recordings out of public materials.
- **Prioritization:** Address risks of data loss and blocked progress first, then
  group recurring confusion about terms and buttons into improvement candidates.
- **Follow-up:** Use the same tasks before and after changes. Small-sample
  observations will not be generalized into population-wide effects or statistical
  improvements.

Future findings will follow the sequence **observation → problem → change →
follow-up check**. Completion rates, task times, and interview quotes will be
added only when observed; none are reported yet.
