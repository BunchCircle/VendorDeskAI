# Graph Cache Management

## Cache Strategy

The code-review-graph is cached locally to avoid unnecessary rebuilds. This guide explains how caching works and when to refresh.

---

## Cache Rules

| Scenario | Action | Command |
|----------|--------|---------|
| **Session start** | Check cache age | `npx code-review-graph status` |
| **Cache older than 24 hours** | Update (don't rebuild) | `python -m code_review_graph update` |
| **Major file changes detected** | Manual rebuild | `python -m code_review_graph build` |
| **Uncertain state** | Verify with status | `python -m code_review_graph status` |

---

## Cache Metadata File

Location: `.copilot/graph-cache.json`

**Fields:**
- `lastUpdate` — ISO timestamp of last graph update
- `lastUpdateTimestamp` — Epoch seconds for comparison logic
- `fileCount` — Number of files analyzed in graph
- `graphExists` — Boolean flag if graph was successfully built
- `cacheStrategy` — Update frequency strategy (currently: update-if-older-than-24h)

---

## Manual Cache Refresh

### Option 1: Quick Status Check
```bash
python -m code_review_graph status
```
Returns cache age and current file state. Use this before starting architecture work.

### Option 2: Incremental Update (Preferred)
```bash
python -m code_review_graph update
```
Fast update that only processes changed files. Use after code modifications.

### Option 3: Complete Rebuild (Force Refresh)
```bash
python -m code_review_graph build
```
Rebuilds the entire graph from scratch. Use if cache is corrupted or very stale (>7 days).

---

## Decision Flow for Agent

```
Start a task requiring graph analysis
    ↓
Read .copilot/graph-cache.json
    ↓
Is graphExists == true?
    ├─ NO → Run: python -m code_review_graph build
    └─ YES → Is lastUpdateTimestamp older than 24 hours?
        ├─ YES → Run: python -m code_review_graph update
        └─ NO → Use existing graph, proceed with status/detect-changes
```

---

## Updating Cache Metadata

After running any graph command, update `.copilot/graph-cache.json`:

```json
{
  "lastUpdate": "2026-05-06T14:30:00Z",
  "lastUpdateTimestamp": 1714998600,
  "fileCount": 47,
  "graphExists": true,
  "cacheStrategy": "update-if-older-than-24h"
}
```

---

## Cache Invalidation

Cache should be **invalidated and rebuilt** if:
- Major architectural refactor (50+ file changes)
- Monorepo structure changes (new packages, directory moves)
- Dependencies significantly modified
- More than 7 days have passed since last update

For any of these scenarios, run the full build command.
