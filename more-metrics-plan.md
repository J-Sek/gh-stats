# More Metrics Plan

## Guiding principle: PRESERVE DATA

All existing data in `data/vuetify/open-issues.json` must be preserved.
New fields are additive — old entries keep their current shape and get
zero-defaults for any field they lack. New data types go in separate files.

---

## 1. Issue close reason: "completed" vs "not planned"

GitHub's search API supports `reason:completed` and `reason:"not planned"` qualifiers on closed issues.

### Data changes

Extend `DayEntry` with two optional fields (backward-compatible):

```ts
interface DayEntry {
  date: string
  count: number
  added: number
  closed: number
  closedCompleted?: number   // NEW — closed as completed
  closedNotPlanned?: number  // NEW — closed as not planned
}
```

### Scraping

For each date, two additional search queries:

```
repo:vuetifyjs/vuetify+is:issue+closed:<date>+reason:completed
repo:vuetifyjs/vuetify+is:issue+closed:<date>+reason:"not planned"
```

This adds 2 API calls per day on top of the existing 2 (created + closed).
Total per day: **4 calls** → ~7.5 days/min at 30 req/min.

### Backfill strategy

Run a second pass over existing entries where `closedCompleted` is undefined.
`nextDate()` logic stays the same for the primary pass; a separate
`nextBackfillDate()` scans for entries missing the new fields.

---

## 2. Pull Requests (added, merged, closed)

PRs are a separate data type — they go in their own file.

### Data

New file: `data/vuetify/pull-requests.json`

```ts
interface PRDayEntry {
  date: string
  added: number    // created:DATE
  merged: number   // merged:DATE
  closed: number   // closed:DATE (includes merged)
}
```

### Scraping

Three queries per day:

```
repo:vuetifyjs/vuetify+is:pr+created:<date>
repo:vuetifyjs/vuetify+is:pr+merged:<date>
repo:vuetifyjs/vuetify+is:pr+closed:<date>
```

**3 calls per day.** Can run in parallel with issue scraping or as
a separate pass.

### Progress tracking

Separate progress calculation since PR data has its own file and
may complete at a different rate than issues.

---

## 3. Filtering by issue label

238 labels makes per-label-per-day scraping infeasible:
238 labels × ~3400 days × 1 query = **~810k API calls**.

### Approach: scrape label counts per-day lazily, not exhaustively

**Option A — Top-N labels only (recommended)**

1. One-time query: fetch the top ~20 labels by total issue count using
   `gh api repos/vuetifyjs/vuetify/labels --paginate --jq '.[].name'`
   and then `search/issues?q=repo:vuetifyjs/vuetify+label:"<name>"` to rank.
2. Store label list in `data/vuetify/tracked-labels.json`.
3. For each tracked label, scrape `created:<date>+label:"<name>"` —
   one query per label per day.
4. Store in `data/vuetify/label-issues.json`:

```ts
interface LabelDayEntry {
  date: string
  label: string
  added: number
  closed: number
}
```

At 20 labels × 2 queries × 3400 days = **136k calls** (~75 hours at
30 req/min). Still a lot — see rate budget below.

**Option B — Monthly snapshots (lighter)**

Instead of per-day granularity, query per-month ranges:

```
repo:vuetifyjs/vuetify+is:issue+label:"bug"+created:2024-01-01..2024-01-31
```

20 labels × 2 queries × ~100 months = **4k calls** (~2 hours).
Much more feasible. Daily drill-down can be done on-demand for a
specific label + month.

**Option C — On-demand only**

Don't pre-scrape labels at all. Add a UI control to select a label,
then scrape that label's history in real-time (same fill-backward
approach as the main scraper). Cache results in
`data/vuetify/labels/<label-slug>.json`.

### Recommendation

Start with **Option B** (monthly) for the top 20 labels to get a
useful overview fast, with **Option C** as a follow-up for deep-dives
into specific labels.

---

## Rate budget summary

| Metric                  | Queries/day | Days  | Total calls | Time @ 30/min |
|-------------------------|-------------|-------|-------------|---------------|
| Issues (current)        | 2           | 3,400 | 6,800       | ~3.8 hrs      |
| + close reason          | 2           | 3,400 | 6,800       | ~3.8 hrs      |
| PRs                     | 3           | 3,400 | 10,200      | ~5.7 hrs      |
| Labels (Option B, mo.)  | 40          | 100   | 4,000       | ~2.2 hrs      |
| **Total**               |             |       | **27,800**  | **~15.5 hrs** |

All passes are independent and can run sequentially with shared
cooldown/rate-limit logic.

---

## Implementation order

1. **Close reason fields** — smallest change, backfill existing data
2. **PR scraping** — new file, new progress tracker, new sparkline row
3. **Label filtering (monthly)** — new UI picker, new scraper pass
4. **Label drill-down (on-demand)** — optional follow-up
