# AGENTS.md — auto-zap

## Project

This repository contains the production website for the auto parts store
"Автозапчасти на Салтыкова-Щедрина" in Taldom.

The website is a catalog for a physical retail store, not an online store.

This is a live production project. Preserve existing working behavior unless the
task explicitly requires changing it.

---

## Core principle

**Understand first. Change only what is needed. Verify proportionally.**

Do not turn a focused task into:

- a repository-wide audit;
- an unrelated refactor;
- an architecture rewrite;
- repeated diagnostics;
- repeated test/build cycles.

Once the requested behavior and root cause are sufficiently understood, implement
the targeted solution instead of continuing to investigate "just in case".

---

## Context and token efficiency

Codex usage must be economical.

### Before editing

1. Read this `AGENTS.md` once.
2. Identify the feature/files directly relevant to the task.
3. Search for the relevant symbols, routes, components, actions or error text.
4. Read only the portions of files needed to understand the implementation.
5. Form a short implementation plan.
6. Start implementation.

Do not inspect the whole repository unless the task genuinely requires it.

### File reading

Prefer targeted reads.

Do not:

- repeatedly read a file whose relevant contents are already known;
- dump entire large files when only one function/component is needed;
- reopen unchanged files without a concrete reason;
- inspect unrelated neighboring subsystems "for completeness".

Batch related searches and reads when practical.

If a function calls another function that is important to the task, follow that
dependency. Do not recursively explore unrelated dependencies.

### Repository searches

Do not repeat searches that already established the answer.

Use precise searches for:

- function names;
- component names;
- route names;
- exact error messages;
- database table names;
- relevant state variables.

Once the root cause is known, stop broad searching and fix it.

### Communication during work

Do not produce long intermediate reports after every action.

Only report intermediate findings when:

- an important assumption was disproved;
- a blocker requires user input;
- the requested change carries substantial production risk;
- requirements conflict.

Otherwise continue working and provide one concise final report.

---

## Scope discipline

Implement only what the current task requires.

Do NOT:

- perform unrelated refactors;
- rename unrelated files, variables, routes or components;
- reformat large files unnecessarily;
- rewrite working architecture because another design seems cleaner;
- introduce abstractions with no immediate need;
- upgrade unrelated packages;
- modify unrelated tests;
- fix unrelated warnings while passing through a file.

Reuse existing:

- components;
- APIs;
- utilities;
- data models;
- styles;
- patterns;
- infrastructure.

If the requested behavior can be implemented safely inside the current
architecture, do that.

If a large architectural change is genuinely required, explain why before
expanding scope.

---

## Production safety

Never directly modify production infrastructure or production data unless the
task explicitly requests it and the change is understood.

Do not independently:

- deploy to production;
- restart production services;
- modify PM2 configuration;
- modify nginx;
- modify `.env` or secrets;
- modify production database records manually;
- run destructive database operations;
- force publication of catalog versions;
- delete production data.

Never commit secrets, credentials, environment files or backups containing
secrets.

---

## Admin and catalog safety

The following areas are business-critical:

- catalog import;
- product matching;
- price updates;
- automatic categorization;
- review queue;
- review workspace;
- categorization rules;
- publication;
- rollback / undo;
- catalog versions;
- search index generation and swap.

Do not change their semantics unless the current task explicitly requires it.

For review/import work, preserve these invariants unless explicitly changed by
the task:

1. The currently published catalog remains unchanged until final publication.
2. Review actions must not immediately mutate the public catalog.
3. Undo/rollback behavior must remain safe.
4. Publication must remain transactional where currently designed that way.
5. Stale/conflicting data must not silently overwrite newer state.
6. Existing product identity semantics must be preserved.
7. A categorization rule must not be created unintentionally.

UI simplification must not remove backend safety checks.

Technical mechanisms may be hidden from ordinary users while remaining active
internally.

---

## Existing data and identifiers

Do not assume that these are permanent identifiers:

- product title;
- slug;
- URL;
- price;
- category label.

Use stable internal IDs where persistent state requires identity.

Mutable product data must come from the current source of truth rather than stale
client-side copies unless the task explicitly requires otherwise.

---

## UI / UX

User-facing admin functionality must be understandable to a normal store
employee or accountant, not only to a developer.

Do not expose implementation terminology when a normal-language equivalent can
be used.

Examples of technical concepts that normally belong behind the UI:

- dry-run;
- preview token;
- workspace;
- scope;
- internal status enums;
- database IDs;
- implementation-specific error codes.

Do not remove useful safety mechanisms merely to simplify the interface. Hide or
translate them instead.

User actions should:

- have clear labels;
- preserve the user's position where practical;
- show understandable success/error feedback;
- avoid unnecessary full-page reloads;
- avoid requiring knowledge of backend architecture.

---

## Responsive design

Any user-facing UI change must preserve usability on:

- desktop;
- tablet;
- mobile;
- narrow mobile.

Match the existing auto-zap design system.

Prefer existing:

- spacing;
- typography;
- borders;
- colors;
- buttons;
- hover states;
- active states;
- breakpoints.

Do not introduce arbitrary one-off styling when an existing project pattern can
be reused.

---

## Performance

Do not introduce avoidable performance regressions.

When working on a performance problem:

1. Use existing measurements/logging when available.
2. Identify the dominant cost.
3. Fix that cost.
4. Measure again.

Do not optimize unrelated code.

Avoid:

- loading hundreds of records when the view needs only a few;
- expensive recalculation on every render when results can be reused;
- repeated classification/enrichment of unchanged data;
- full-page reloads for small mutations;
- unnecessarily large client payloads;
- heavy new dependencies for simple behavior.

Prefer server-side pagination for large datasets.

---

## Dependencies

Do not install a package unless it is genuinely necessary.

Before adding one:

1. check whether the project already has a suitable solution;
2. check native browser/framework/platform capabilities;
3. prefer existing dependencies.

Never upgrade unrelated dependencies as part of another task.

---

## Testing strategy

Verification must be proportional to the change.

### During implementation

Run targeted checks first.

Examples:

- relevant unit test;
- relevant integration test;
- typecheck for affected code when practical;
- focused lint;
- targeted runtime check.

Do not repeatedly run:

`lint + typecheck + all tests + production build`

after every small edit.

### Expensive checks

Run broader checks after a logical implementation batch, normally once near the
end when justified.

Do not rerun the same expensive command if nothing relevant changed.

If a command fails:

1. inspect the failure;
2. identify the cause;
3. make a change that could affect it;
4. then rerun.

Never repeatedly run the same failing command hoping for a different result.

### Claims

Do not say something was tested if it was not actually tested.

If a verification step could not be performed, state that clearly.

---

## Bug fixing

For a bug:

1. reproduce or establish the incorrect behavior;
2. find the responsible code path;
3. determine the root cause;
4. implement the smallest safe correction;
5. add/update a regression test when appropriate;
6. verify the affected path.

Once the root cause is established, do not restart a broad investigation unless
the fix disproves the diagnosis.

Do not confuse an observed technical characteristic with the user's actual
problem.

---

## Git discipline

Work on the task branch.

Do not:

- force push;
- rewrite unrelated history;
- reset or discard user changes;
- revert unrelated commits;
- merge unrelated branches;
- merge into `main` unless explicitly requested;
- deploy automatically unless explicitly requested.

Before finishing:

1. inspect `git status`;
2. inspect the final diff;
3. confirm only intended files changed.

Keep commits focused and reviewable.

---

## Error handling

User-facing errors must be understandable.

Do not expose:

- stack traces;
- raw SQL errors;
- internal error codes;
- implementation terminology;
- internal IDs unless necessary.

Preserve useful technical detail in logs for developers.

A failed action should not unnecessarily destroy UI state or send the user to an
unrelated location.

---

## SEO safety

Do not accidentally change:

- product URLs;
- slugs;
- canonical tags;
- robots directives;
- sitemap;
- metadata;
- structured data;
- redirects;
- indexing behavior.

Inspect the existing implementation before touching these systems.

---

## Completion criteria

Before declaring the task complete:

1. Re-read the original request.
2. Confirm all requested behavior was addressed.
3. Inspect the final diff.
4. Confirm unrelated code was not changed.
5. Run appropriate targeted verification.
6. Run broader final checks only when justified.
7. Check responsive behavior for relevant UI changes.
8. State anything that remains unverified or uncertain.

---

## Final response

Keep the final report compact.

Report only:

- what was changed;
- important files changed;
- root cause of any fixed bug;
- tests/checks performed;
- any remaining limitation;
- branch/commit/PR status when relevant.

Do not paste large source files or long command logs into the final report unless
explicitly requested.
