# Owner-requested public catalog restrictions

The owner chose to stop publicly offering GAZ/NAZ-related products and, after
reviewing the evidence and its limitations, KAMAZ, Hyundai, Kia, WABCO, BMW and
Mitsubishi products, plus Lukoil oils/chemicals. This publication decision is not an admission of infringement.

The rule checks current product name, raw source name and slug. Twenty-one exact
complained-about slugs are additionally excluded even if their titles change.
Common Cyrillic/Latin names and make-specific model names are covered. Generic
NEXT, Business, NN, the letter G, and bare numeric part codes are not sufficient.
Unrecognized aliases, images and unlabelled fitment cannot be inferred reliably.

The predicate applies before public counts and pagination. Product details,
purchase-list reads, public search and sitemap are covered. Administrative
inventory and import source records are retained. Old indexed hits are authorized
against current public rows; rejected batches use the existing PostgreSQL fallback
with correct totals. No index operation is required to enable the restriction.
Recognizable excluded batches go straight to fallback before database hydration;
accepted indexed batches still require current public rows. Public fallback gets
rows and their total in one scan using a window count. The public search page
allows 12 seconds for fallback instead of 6; some queries can remain slower than
indexed search. Administrative count/pagination behavior is preserved.

## Validation

- `pnpm typecheck`, `pnpm test`, `pnpm build`
- `node --import tsx scripts/test-public-product-exclusions.ts`
- `node --import tsx scripts/test-public-product-exclusions-postgres.ts`

The PostgreSQL test creates a fresh temporary local container with no network,
host mounts or production connection string, then removes it. It requires Docker
Desktop with `postgres:16-alpine` already installed.

## Deployment baseline

GitHub main predates the already-deployed AvtoVAZ publication-policy layer. This
draft adapts the same restriction to main's public query paths without including
unrelated uncommitted user changes. Do not deploy main as a replacement for the
live source: that could omit existing AvtoVAZ protection and other deployed work.

A separate five-file application patch was prepared against the live baseline:
the new catalog predicate, its call in publication-policy/public-condition.ts,
search/documents.ts, search/postgres.ts and app/search/page.tsx.
Relevant baseline file hashes were checked read-only against the live server.
The production-baseline candidate also passed isolated public-surface tests with
a stale search index. Deployment requires a fresh baseline check and explicit
authorization for the web-process restart. No database migration, data deletion,
import change, index rewrite, worker restart or infrastructure change is needed.

## Evidence about BRANDPOL

- The owner's current complaint establishes the NAZ representative claim; the
  earlier AvtoVAZ complaint is reported by the owner.
- BRANDPOL's service page names GAZ, KAMAZ and Lukoil as users of its service:
  https://brandpolgroup.com/ru/services/brand-protection/
- Its client/partner display includes Hyundai, Kia and WABCO:
  https://brandpolgroup.com/ru/
- Page 8 of its 2021 presentation includes BMW and a Mitsubishi logo:
  https://brandpolgroup.com/wp-content/uploads/2021/02/brandpol-bp-presentation-en2021.02.02.pdf

These marketing references do not establish current Russian representation
powers, a complete customer list, or which Mitsubishi legal entity is meant.
