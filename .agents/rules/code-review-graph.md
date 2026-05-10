---
trigger: always_on
---

# Code Review Graph Workflow Guidelines

Whenever we are doing development, architecture planning, or code reviews, actively use the `code-review-graph` tool to maintain context and minimize token usage.

## Rules for Every Task

### 1. Graph Maintenance

At the start of a session or after significant file changes, run the following command using the `run_command` tool to keep the local graph in sync:

```bash
python -m code_review_graph update
```

If it fails because a graph doesn't exist yet, run:

```bash
python -m code_review_graph build
```

---

### 2. Context Gathering

Before blindly searching or reading full files, use the following commands to understand the architecture, dependencies, and blast radius of the components we are working on:

```bash
python -m code_review_graph status
```

or

```bash
python -m code_review_graph detect-changes
```

---

### 3. Focused Reading

Rely on the graph's output to identify exactly which files, dependents, and callers need to be modified.

Only read the specific files that the graph identifies as relevant.
