# Code Review Graph Integration Instructions

This workspace uses `code-review-graph` to map architectural dependencies and minimize token usage during focused development tasks. Follow these rules to maintain graph sync and enable efficient context gathering.

## When to Use Code Review Graph

Use the code-review-graph tool **only** for these specific activities:
- **Architecture planning** — Understanding system structure, dependencies, and design implications
- **Code reviews** — Analyzing impact of changes, identifying affected modules, and blast radius assessment
- **Major refactors** — Restructuring components, moving files, or significant dependency changes

Do **not** use the graph for routine bug fixes, feature implementation, or minor edits.

---

## Graph Maintenance Rules

### Cache-Aware Initialization

Before starting architecture work, check the cache metadata at `.copilot/graph-cache.json`:

1. **If `graphExists` is `false`** or file is missing → Build: `python -m code_review_graph build`
2. **If `graphExists` is `true` AND `lastUpdateTimestamp` is older than 24 hours** → Update: `python -m code_review_graph update`
3. **If `graphExists` is `true` AND timestamp is recent** → Proceed with `status` or `detect-changes` commands

**Never rebuild unnecessarily.** Use `update` for incremental changes, `build` only for corruption or stale cache (>7 days).

### After Executing Graph Commands

Update `.copilot/graph-cache.json` with:
- `lastUpdate` — Current ISO timestamp
- `lastUpdateTimestamp` — Epoch seconds
- `fileCount` — Files analyzed in graph
- `graphExists` — Set to `true`

See [graph-cache-guide.md](graph-cache-guide.md) for detailed cache management strategies.

---

## Context Gathering Protocol

Before blindly searching files or making broad assumptions, query the graph to understand scope:

```bash
python -m code_review_graph status
```

or

```bash
python -m code_review_graph detect-changes
```

Use the graph output to:
- Identify exactly which files need modification
- Discover dependent modules that may be affected
- Understand the blast radius of changes
- Minimize unnecessary file reads

---

## Focused Reading

**Only read files identified by the graph output.** Never assume which files are relevant; rely on the dependency analysis provided by the tool.

This approach:
- Reduces token usage by avoiding full-file reads
- Prevents missing critical dependencies
- Keeps focus on the actual change scope

---

## Error Handling

If a code-review-graph command fails or the tool is unavailable:
1. **Report the error** to the user
2. **Do not fall back** to manual file searching or broad semantic searches
3. **Ask for troubleshooting help** — the graph is a prerequisite for these types of tasks

---

## Example Workflow

**Scenario:** Adding a new field to the user database schema and updating related services.

1. Run `python -m code_review_graph status` to see the current dependency map
2. Run `python -m code_review_graph detect-changes` to identify all files that interact with the schema
3. Based on graph output, read only the affected files
4. Make changes and confirm they align with the identified dependencies

---

## Task Types NOT Requiring the Graph

- Implementing isolated UI components
- Writing utility functions with no dependencies
- Fixing bugs in single files
- Routine code formatting or small refactors
- Documentation updates

For these, use standard search and file-reading practices.
