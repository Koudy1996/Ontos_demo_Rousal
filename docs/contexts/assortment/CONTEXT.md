# Assortment language

Assortment is the Commerce Business Policy capability that decides commercial eligibility for an explicit Decision Purpose in one trusted Commerce context. This context owns canonical Assortment semantics and vocabulary, not storage, transport, search-engine implementation, or UI mechanics. It extends [Commerce language](../commerce/CONTEXT.md) and [OntOS language](../ontos/CONTEXT.md); shared Commerce/OntOS terms retain their owning meanings. Accepted ADRs govern durable architecture.

These terms describe the Current target contract for B09 Assortment. GitHub issue bodies own delivery scope and acceptance detail.

## Decision model

**Assortment Decision Purpose** — Explicit reason for an Assortment evaluation. Launch has exactly two purposes: `VISIBILITY` and `PURCHASE`. A result for one purpose is never authority for the other.

**VISIBILITY** — Product-level Assortment Decision Purpose answering whether one Product may be exposed as a commercial offer in the exact trusted context. It never decides visibility of Variant or Package Option as independent canonical targets and never proves that any exact Catalog Selection may be purchased.

**PURCHASE** — Exact-purchase Assortment Decision Purpose answering whether one exact Catalog Selection may be purchased by the applicable Guest Purchase Context or Purchasing Subject in the trusted Commerce Purchasing Context. It does not prove Price, Availability, Permission, Payment, approval, or final Order acceptance.

**Assortment Decision Outcome** — Typed result of one Assortment evaluation: `ELIGIBLE`, `INELIGIBLE`, or `INDETERMINATE`. `ELIGIBLE` means sufficient authoritative Assortment evidence allows the exact question. `INELIGIBLE` means sufficient authoritative Assortment evidence denies it. `INDETERMINATE` means neither conclusion can be established truthfully because required evidence or configuration is missing, conflicting, stale, unavailable, or otherwise unverifiable. It is neither implicit allow nor business deny.

**Assortment Effect** — Rule effect `ALLOW` or `DENY`. Effect does not carry implicit priority. Specificity and explicit resolution rules determine precedence; `DENY` is not globally stronger than `ALLOW` and vice versa.

## Commercial scope

**Assortment Commercial Scope** — Trusted commercial scope of one Assortment Rule Revision. Selling Legal Entity and Channel are mandatory. Commerce Market and Storefront are optional narrowing dimensions. Missing mandatory scope is invalid configuration, not a wildcard and not a request to infer scope from hostname, locale, IP address, account type, currency, or another convenience signal.

Supported Launch scope ranks from broader to narrower are:

1. Selling Legal Entity + Channel;
2. Selling Legal Entity + Channel + Storefront;
3. Selling Legal Entity + Channel + Commerce Market;
4. Selling Legal Entity + Channel + Commerce Market + Storefront.

Commerce Market is intentionally more specific than Storefront when only one of those optional dimensions is present. The exact precedence from narrower to broader is `SLE+Channel+Market+Storefront > SLE+Channel+Market > SLE+Channel+Storefront > SLE+Channel`.

## Catalog selectors

**Assortment Catalog Selector** — Explicit typed Catalog Policy Scope used by an Assortment Rule Revision. Launch has a closed selector set: `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and `PACKAGE_OPTION`. No missing selector, SKU/name convention, primary/main category, arbitrary query, expression, callback, or user code is an alternate selector.

**CATEGORY Assortment Selector** — Product Category subtree selector using Current Direct Category Assignment plus Ancestor Classification. It matches Products directly classified in the selected Product Category or any descendant. Launch has no separate direct-only Category selector and no implicit main/primary Product Category.

**Assortment Purpose-Selector Compatibility** — Launch invariant:

| Selector | `VISIBILITY` | `PURCHASE` |
| --- | --- | --- |
| `ALL` | valid | valid |
| `CATEGORY` | valid | valid |
| `PRODUCT` | valid | valid |
| `VARIANT` | invalid | valid |
| `PACKAGE_OPTION` | invalid | valid |

Create Rule and Change Rule reject incompatible combinations. Migration must not invent semantics for an incompatible legacy representation; it remains `UNRESOLVED` until a meaning-preserving transformation is approved.

**Non-Launch Assortment Selector** — `PRODUCER`, Brand, Manufacturer and other undeclared Catalog dimensions are not Launch Assortment selectors. Legacy evidence that such targeting existed does not expand the canonical model. Active legacy behavior may be transformed only when its ongoing business meaning is preserved; otherwise it remains `UNRESOLVED`. Expanding a dynamic Producer/Brand rule to the Product list that happens to exist today is not meaning-preserving unless business explicitly confirms snapshot semantics.

## Subject model

**Assortment Subject Context** — Subject side of an Assortment evaluation. It is either a Guest Purchase Context or an identified Purchasing Subject. Guest is not a Purchasing Subject. The acting Principal remains separate from both.

**Assortment Subject-Specific Target** — Canonical exact target for an individual Assortment exception. Launch supports one Commerce Retail Customer Profile or one Counterparty. Email, account, Party matching alone, job title, Principal identity, Permission, domain, or another heuristic never creates a subject-specific Assortment target.

**Assortment Group Input** — Complete Current Commerce Customer Group Membership set applicable to the relevant Commerce Customer Profile. Commerce Customer Group and its Membership owner provide the facts only; Assortment owns their interpretation. Membership list order, name, creation time, or source order creates no priority.

**Principal / Assortment Subject Separation** — Principal is the Actor authorized to perform an operation. It is not automatically the commercial subject whose Assortment is being evaluated.

## Rules, revisions, and assignments

**Assortment Stable Rule** — Durable identity of one continuing Assortment Business Policy across successive immutable Assortment Rule Revisions.

**Assortment Rule Revision** — Immutable Effective representation of one Assortment Stable Rule's business meaning. Material fields include at least Decision Purpose, Assortment Effect, Catalog selector and target, Assortment Commercial Scope, and Effective Period semantics. Material change creates another distinguishable revision and never rewrites a revision already Effective or used as evidence.

**Assortment Subject Assignment** — Explicit Effective binding of one exact Assortment Subject-Specific Target to one **specific immutable Assortment Rule Revision**. It retains its own Effective Period, provenance, acting Principal/Actor and bounded reason/evidence. It never points only to Assortment Stable Rule identity.

Creating a successor Assortment Rule Revision does not change any existing Assortment Subject Assignment. Moving a subject from revision R1 to R2 is an explicit business transition represented in Launch by End Subject Assignment plus Create Subject Assignment at the intended Effective boundary.

**Assortment Rule / Subject Assignment Lifecycle Separation** — Change Rule / Create New Revision changes the shared Assortment Stable Rule's future/current revision semantics but never retargets existing Assortment Subject Assignments. Rule management and Subject Assignment management remain separately authorized.

## Resolution

**Assortment Resolution** — Deterministic lexicographic evaluation in this order: Catalog specificity, Assortment Commercial Scope specificity, subject specificity, then equal-rank conflict detection. No technical ordering is a business tie-breaker.

**Catalog Specificity** — Broader to narrower: `ALL < CATEGORY < PRODUCT < VARIANT < PACKAGE_OPTION`. `VARIANT` and `PACKAGE_OPTION` participate only in `PURCHASE`.

**Subject Specificity** — At equal Catalog and commercial-scope rank: shared rule < Commerce Customer Group rule < exact Assortment Subject Assignment.

**Assortment Configuration Conflict** — Equally ranked applicable configuration cannot produce one unambiguous effect. Result is `INDETERMINATE`; technical ordering is forbidden.

**Assortment Missing Configuration** — Required baseline/rule is absent. Result is `INDETERMINATE`, not implicit ALLOW/DENY.

**Broken Explicit Assortment Configuration** — Explicit Rule or Subject Assignment exists but is unusable. It is not equivalent to absence and must not be silently ignored in favor of broader configuration.

## Evidence and currentness

**Assortment Decision Evidence** — Evidence sufficient to explain one exact decision: Decision Purpose and outcome, Product or exact Catalog Selection, material Catalog Revision References, trusted Commerce Purchasing Context or Guest Purchase Context, Purchasing Subject or exact subject-specific target, Current Commerce Customer Group Memberships used, exact Assortment Rule Revisions and Subject Assignments used, trusted operation time, and resolution reason/rank as applicable.

**Stale Assortment Result** — Prospective result whose material source facts or applicability can no longer be established as Current for the next decision boundary. Cached result, lack of invalidation event, timestamp or hash is not Current proof.

**Assortment Commitment Confirmation** — Assortment-owner-issued bounded proof for one exact purchase candidate and one exact Order Commitment Attempt, with an explicit short expiry. Once issued, ordinary later Assortment Rule Revision, Subject Assignment, Commerce Customer Group Membership, Catalog classification or other source changes do **not** revoke that confirmation for its exact attempt before expiry. New evaluations use the new Current state. Expired, mismatched, or unverifiable confirmation is unusable.

Launch Assortment has no emergency-revocation mechanism for already-issued Assortment Commitment Confirmations. The validity window must therefore remain deliberately bounded and short.

## Consumers and projections

**Assortment Visibility Evaluation** — Authoritative Current `VISIBILITY` evaluation for one Product in the exact Guest Purchase Context or identified subject/commercial context.

**Assortment Purchase Evaluation** — Authoritative Current `PURCHASE` evaluation for the exact Catalog Selection and trusted Commerce Purchasing Context.

**Assortment Search Projection** — Derived, rebuildable bounded read model/filter. It is never canonical authority; omission is not proof of `INELIGIBLE`, and partitioning must prevent cross-subject, cross-Market and cross-Storefront leakage.

**Assortment Invalidation Event** — Notification that derived consumers may need to invalidate or rebuild state after committed change. Event receipt is not a decision and absence of event is not Current proof.

## Administration and authorization

**Assortment Management Action** — Named public mutation of canonical Assortment state. Launch has exactly five write Actions: Create Rule, Change Rule / Create New Revision, End Rule, Create Subject Assignment, and End Subject Assignment.

**Assortment Management Permission** — Atomic Permission protecting one management Action or governed read. Launch codes are `assortment.configuration.read`, `assortment.decision.explain`, `assortment.rule.create`, `assortment.rule.change`, `assortment.rule.end`, `assortment.assignment.create`, and `assortment.assignment.end`.

**Assortment Administration Scope** — Exact trusted target scope resolved before authorization. It may include Tenant, Selling Legal Entity, Channel, Commerce Market, Storefront and exact subject for subject-specific operations. A narrower grant never authorizes a broader target. Buyer Permission, Catalog Editor authority and Counterparty Access Administrator authority do not imply Assortment administration. Missing, denied, unavailable or indeterminate authorization fails closed.

## Migration and reconciliation

**Assortment Migration Classification** — Explicit verdict for one legacy behavior/fact family: `RETAIN`, `TRANSFORM`, `RETIRE`, or `UNRESOLVED`.

**Assortment Migration Correlation** — Provenance-backed mapping from an External Business System record/identifier to canonical OntOS identities. External IDs, SKU, URL, names and transport routes remain source/correlation evidence and never become canonical identity.

**Assortment Migration No-Implicit-Wildcard Rule** — Missing legacy Product, Commerce Market, subject, effect or other value never becomes `ALL`, all markets, unrestricted subject, ALLOW/DENY, or another broad default unless that exact business meaning is independently proven.

**Assortment Reconciliation** — Owner-governed evidence work for ambiguous, conflicting, partial or indeterminate migration/integration state. It may conclude a migration classification/correlation or remain `UNRESOLVED`. Reconciliation **does not mutate canonical Assortment directly and is not a privileged write path**. Any resulting canonical change is performed through the standard Assortment Management Actions, Permissions, scope, idempotency and audit.

**Assortment Cutover Acceptance** — Every Launch-critical legacy behavior must have sufficient Active Behavior evidence, explicit migration classification, canonical subject/target/scope and System of Record. Launch-critical `UNRESOLVED` blocks the affected cutover rather than being approximated.

## Boundaries

Assortment does not own or imply Catalog readiness/lifecycle, Product publication/navigation, Search ranking, Price, Inventory, Availability/delivery promise, Principal Permission, Payment, purchasing approval, or Accepted Order. Accepted Orders preserve the exact historical Assortment evidence used at acceptance time. Later Assortment changes do not rewrite Accepted history. Repeat Order creates a new Current purchase and therefore re-evaluates Assortment.
