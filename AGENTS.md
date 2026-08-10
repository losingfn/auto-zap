# AGENTS.md — auto-zap

## Project

This repository contains the production website for the auto parts store
"Автозапчасти на Салтыкова-Щедрина" in Taldom.

The website is a catalog for a physical retail store, not an online store.
Changes must preserve existing production behavior unless the task explicitly
requires changing it.

## Core principle

**Understand first. Change minimally. Verify proportionally. Preserve working behavior.**

Do not turn a small task into a large refactor.

## Before making changes

Before editing code:

1. Read this AGENTS.md.
2. Inspect the relevant existing files and implementation.
3. Understand how the affected feature currently works.
4. Identify the smallest safe change that satisfies the request.
5. Reuse existing components, styles, utilities, patterns and APIs where possible.

Do not guess how the project works when the answer can be obtained by reading
the existing code.

Do not modify unrelated parts of the repository.

## Scope discipline

Implement only what the task requires.

Do NOT:

- perform unrelated refactors;
- rename unrelated files, variables, routes or components;
- reformat large files unnecessarily;
- replace working architecture just because another approach looks cleaner;
- introduce new dependencies when existing code can solve the task;
- modify database schema, migrations, import logic, admin workflows,
  categorization logic, deployment configuration or infrastructure unless the
  task explicitly requires it.

If a requested change appears to require a large architectural modification,
stop and explain why before implementing it.

## Preserve production behavior

This is a live production website.

Existing working functionality must remain working.

Pay special attention to:

- catalog;
- categories and subcategories;
- product pages;
- search;
- product URLs;
- SEO metadata;
- canonical URLs;
- sitemap;
- structured data;
- admin panel;
- price/catalog import;
- automatic categorization;
- product publication state;
- responsive layouts.

Do not silently change existing business logic.

## Responsive design

Any user-facing change must be checked for all relevant viewport classes:

- desktop;
- tablet;
- mobile;
- narrow mobile.

Do not fix one viewport by breaking another.

New UI must visually match the existing auto-zap design system.

Prefer existing:

- spacing;
- borders;
- typography;
- colors;
- button styles;
- hover states;
- active states;
- animation patterns;
- responsive breakpoints.

Avoid arbitrary one-off sizes when an existing project pattern can be reused.

## Small visual changes

For visual adjustments such as:

- icon size;
- logo size;
- spacing;
- alignment;
- button dimensions;
- typography;
- margins or padding;

inspect the surrounding elements first and match their existing proportions.

Do not repeatedly guess dimensions.

If several sibling elements use a common size or style, derive the new element
from that same rule whenever possible.

## Performance

Do not introduce avoidable performance regressions.

For images and visual assets:

- use appropriately sized assets;
- prefer modern efficient formats when compatible with the project;
- avoid shipping unnecessarily large source images;
- preserve image quality appropriate for the rendered size;
- prevent layout shifts where practical;
- reuse browser caching and existing asset infrastructure.

Do not add heavy libraries for functionality that can be implemented simply.

## Testing and verification

Verification must be proportional to the change.

For a small isolated visual/text change:

- inspect the relevant code;
- perform targeted verification;
- do not repeatedly run the entire test suite after every tiny adjustment.

For a functional change:

- run the smallest relevant test/type/lint/build checks that can catch likely
  regressions.

Run broader checks once after a logical batch of related changes when justified.

Do not repeatedly execute expensive tests or builds without a concrete reason.

If a command fails, diagnose the failure before rerunning it.

Do not rerun the same failing command multiple times without changing something
that could affect the result.

## Efficient tool usage

Avoid unnecessary exploration.

Do not repeatedly read the same files unless they changed or additional context
is required.

Do not repeatedly search the repository for information already established.

Batch related file reads and searches when practical.

When the cause of a problem is known, make the targeted fix instead of restarting
a broad investigation.

## Dependencies

Do not install packages unless they are genuinely necessary.

Before adding a dependency:

1. check whether the project already contains a suitable solution;
2. prefer native platform/browser/framework capabilities;
3. explain the need if the dependency materially changes the project.

Never upgrade unrelated dependencies as part of a feature or bug fix.

## Git discipline

Work on the current task branch.

Do not:

- force push;
- rewrite unrelated history;
- reset or discard user changes;
- revert unrelated work;
- merge unrelated branches;
- commit secrets or environment files.

Keep changes focused and reviewable.

Before finishing, inspect the final diff and make sure it contains only intended
changes.

## Existing data and stable identifiers

Do not assume a product URL, slug, title or price is a permanent identifier.

Where persistent client-side state needs to reference products, use the
project's stable internal product identifier when available.

Price and other mutable product data must come from the current source of truth,
not from stale client-side copies, unless the task explicitly requires
otherwise.

## Error handling

User-facing functionality must fail gracefully.

Do not allow one missing image, unavailable product, stale reference or failed
request to break an entire page.

Prefer clear empty/error states consistent with the existing design.

Do not expose internal errors, stack traces or implementation details to users.

## SEO safety

Do not change SEO behavior accidentally.

Before modifying:

- routes;
- slugs;
- canonical tags;
- robots directives;
- sitemap generation;
- metadata;
- structured data;
- redirects;

inspect the current implementation and preserve existing behavior unless the
task explicitly requests an SEO change.

Do not create duplicate indexable URLs for the same content without a deliberate
canonical/indexing strategy.

## Admin and import safety

The admin panel and catalog import pipeline are business-critical.

Unless explicitly requested, do not modify:

- import matching rules;
- stable product matching;
- price update logic;
- automatic publication/unpublication;
- categorization rules;
- review queues;
- recalculation logic;
- rollback/audit behavior.

Changes to public UI should not require modifications to import/admin logic
unless technically necessary.

## Completion criteria

Before declaring a task complete:

1. Re-read the user's requested scope.
2. Inspect the final diff.
3. Confirm no unrelated code was changed.
4. Run appropriate targeted verification.
5. Check relevant responsive behavior for UI changes.
6. Mention any verification that could not be performed.
7. Do not claim something was tested if it was not actually tested.

## Communication

Be concise and factual.

When finished, report:

- what changed;
- which important files were changed;
- what verification was performed;
- whether anything remains uncertain.

Do not claim success when an error remains unresolved.

If requirements conflict or a change carries substantial architectural or
production risk, explain the conflict instead of guessing.# AGENTS.md — auto-zap

## Project

This repository contains the production website for the auto parts store
"Автозапчасти на Салтыкова-Щедрина" in Taldom.

The website is a catalog for a physical retail store, not an online store.
Changes must preserve existing production behavior unless the task explicitly
requires changing it.

## Core principle

**Understand first. Change minimally. Verify proportionally. Preserve working behavior.**

Do not turn a small task into a large refactor.

## Before making changes

Before editing code:

1. Read this AGENTS.md.
2. Inspect the relevant existing files and implementation.
3. Understand how the affected feature currently works.
4. Identify the smallest safe change that satisfies the request.
5. Reuse existing components, styles, utilities, patterns and APIs where possible.

Do not guess how the project works when the answer can be obtained by reading
the existing code.

Do not modify unrelated parts of the repository.

## Scope discipline

Implement only what the task requires.

Do NOT:

- perform unrelated refactors;
- rename unrelated files, variables, routes or components;
- reformat large files unnecessarily;
- replace working architecture just because another approach looks cleaner;
- introduce new dependencies when existing code can solve the task;
- modify database schema, migrations, import logic, admin workflows,
  categorization logic, deployment configuration or infrastructure unless the
  task explicitly requires it.

If a requested change appears to require a large architectural modification,
stop and explain why before implementing it.

## Preserve production behavior

This is a live production website.

Existing working functionality must remain working.

Pay special attention to:

- catalog;
- categories and subcategories;
- product pages;
- search;
- product URLs;
- SEO metadata;
- canonical URLs;
- sitemap;
- structured data;
- admin panel;
- price/catalog import;
- automatic categorization;
- product publication state;
- responsive layouts.

Do not silently change existing business logic.

## Responsive design

Any user-facing change must be checked for all relevant viewport classes:

- desktop;
- tablet;
- mobile;
- narrow mobile.

Do not fix one viewport by breaking another.

New UI must visually match the existing auto-zap design system.

Prefer existing:

- spacing;
- borders;
- typography;
- colors;
- button styles;
- hover states;
- active states;
- animation patterns;
- responsive breakpoints.

Avoid arbitrary one-off sizes when an existing project pattern can be reused.

## Small visual changes

For visual adjustments such as:

- icon size;
- logo size;
- spacing;
- alignment;
- button dimensions;
- typography;
- margins or padding;

inspect the surrounding elements first and match their existing proportions.

Do not repeatedly guess dimensions.

If several sibling elements use a common size or style, derive the new element
from that same rule whenever possible.

## Performance

Do not introduce avoidable performance regressions.

For images and visual assets:

- use appropriately sized assets;
- prefer modern efficient formats when compatible with the project;
- avoid shipping unnecessarily large source images;
- preserve image quality appropriate for the rendered size;
- prevent layout shifts where practical;
- reuse browser caching and existing asset infrastructure.

Do not add heavy libraries for functionality that can be implemented simply.

## Testing and verification

Verification must be proportional to the change.

For a small isolated visual/text change:

- inspect the relevant code;
- perform targeted verification;
- do not repeatedly run the entire test suite after every tiny adjustment.

For a functional change:

- run the smallest relevant test/type/lint/build checks that can catch likely
  regressions.

Run broader checks once after a logical batch of related changes when justified.

Do not repeatedly execute expensive tests or builds without a concrete reason.

If a command fails, diagnose the failure before rerunning it.

Do not rerun the same failing command multiple times without changing something
that could affect the result.

## Efficient tool usage

Avoid unnecessary exploration.

Do not repeatedly read the same files unless they changed or additional context
is required.

Do not repeatedly search the repository for information already established.

Batch related file reads and searches when practical.

When the cause of a problem is known, make the targeted fix instead of restarting
a broad investigation.

## Dependencies

Do not install packages unless they are genuinely necessary.

Before adding a dependency:

1. check whether the project already contains a suitable solution;
2. prefer native platform/browser/framework capabilities;
3. explain the need if the dependency materially changes the project.

Never upgrade unrelated dependencies as part of a feature or bug fix.

## Git discipline

Work on the current task branch.

Do not:

- force push;
- rewrite unrelated history;
- reset or discard user changes;
- revert unrelated work;
- merge unrelated branches;
- commit secrets or environment files.

Keep changes focused and reviewable.

Before finishing, inspect the final diff and make sure it contains only intended
changes.

## Existing data and stable identifiers

Do not assume a product URL, slug, title or price is a permanent identifier.

Where persistent client-side state needs to reference products, use the
project's stable internal product identifier when available.

Price and other mutable product data must come from the current source of truth,
not from stale client-side copies, unless the task explicitly requires
otherwise.

## Error handling

User-facing functionality must fail gracefully.

Do not allow one missing image, unavailable product, stale reference or failed
request to break an entire page.

Prefer clear empty/error states consistent with the existing design.

Do not expose internal errors, stack traces or implementation details to users.

## SEO safety

Do not change SEO behavior accidentally.

Before modifying:

- routes;
- slugs;
- canonical tags;
- robots directives;
- sitemap generation;
- metadata;
- structured data;
- redirects;

inspect the current implementation and preserve existing behavior unless the
task explicitly requests an SEO change.

Do not create duplicate indexable URLs for the same content without a deliberate
canonical/indexing strategy.

## Admin and import safety

The admin panel and catalog import pipeline are business-critical.

Unless explicitly requested, do not modify:

- import matching rules;
- stable product matching;
- price update logic;
- automatic publication/unpublication;
- categorization rules;
- review queues;
- recalculation logic;
- rollback/audit behavior.

Changes to public UI should not require modifications to import/admin logic
unless technically necessary.

## Completion criteria

Before declaring a task complete:

1. Re-read the user's requested scope.
2. Inspect the final diff.
3. Confirm no unrelated code was changed.
4. Run appropriate targeted verification.
5. Check relevant responsive behavior for UI changes.
6. Mention any verification that could not be performed.
7. Do not claim something was tested if it was not actually tested.

## Communication

Be concise and factual.

When finished, report:

- what changed;
- which important files were changed;
- what verification was performed;
- whether anything remains uncertain.

Do not claim success when an error remains unresolved.

If requirements conflict or a change carries substantial architectural or
production risk, explain the conflict instead of guessing.