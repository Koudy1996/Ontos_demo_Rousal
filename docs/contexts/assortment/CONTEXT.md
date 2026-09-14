# Assortment language

Assortment is the Commerce Business Policy capability that decides commercial eligibility for an
explicit Decision Purpose in one trusted Commerce context. This context owns canonical Assortment
semantics and vocabulary, not storage, transport, search-engine implementation, or UI mechanics. It
extends [Commerce language](../commerce/CONTEXT.md) and [OntOS language](../ontos/CONTEXT.md); shared
Commerce/OntOS terms retain their owning meanings. Accepted ADRs govern durable architecture.

These terms describe the Current target contract for B09 Assortment. GitHub issue bodies own delivery
scope and acceptance detail. Older planning/GOLD comments are discovery history and do not override
Current issue bodies or this context.

## Decision model

**Assortment Decision Purpose** — Explicit reason for an Assortment evaluation. Launch has exactly
two purposes: `VISIBILITY` and `PURCHASE`. A result for one purpose is never authority for the other.

**VISIBILITY** — Product-level Assortment Decision Purpose answering whether one Product may be
exposed as a commercial offer in the exact trusted context. It never decides visibility of Variant
or Package Option as independent canonical targets and never proves that any exact Catalog Selection
may be purchased.

**PURCHASE** — Exact-purchase Assortment Decision Purpose answering whether one exact Catalog
Selection may be purchased by the applicable Guest Purchase Context or Purchasing Subject in the
trusted Commerce Purchasing Context. It does not prove Price, Availability, Permission, Payment,
approval, or final Order acceptance.

**Assortment Decision Outcome** — Typed result of one Assortment evaluation: `ELIGIBLE`,
`INELIGIBLE`, or `INDETERMINATE`. `ELIGIBLE` means sufficient authoritative Assortment evidence
allows the exact question. `INELIGIBLE` means sufficient authoritative Assortment evidence denies it.
`INDETERMINATE` means neither conclusion can be established truthfully because required evidence or
configuration is missing, conflicting, stale, unavailable, or otherwise unverifiable. It is neither
implicit allow nor business deny.

**Assortment Effect** — Rule effect `ALLOW` or `DENY`. Effect does not carry implicit priority.
Specificity and explicit resolution rules determine precedence; `DENY` is not globally stronger than
`ALLOW` and vice versa.

## Commercial scope

**Assortment Commercial Scope** — Trusted commercial scope of one Assortment Rule Revision. Selling
Legal Entity and Channel are mandatory. Commerce Market and Storefront are optional narrowing
dimensions. Missing mandatory scope is invalid configuration, not a wildcard and not a request to
infer scope from hostname, locale, IP address, account type, currency, or another convenience signal.

Supported Launch scope ranks from broader to narrower are:

1. Selling Legal Entity + Channel;
2. Selling Legal Entity + Channel + Storefront;
3. Selling Legal Entity + Channel + Commerce Market;
4. Selling Legal Entity + Channel + Commerce Market + Storefront.

Commerce Market is intentionally more specific than Storefront when only one of those optional
dimensions is present. A rule matching both Commerce Market and Storefront is narrower than either.
The exact precedence from narrower to broader is therefore:
`SLE+Channel+Market+Storefront > SLE+Channel+Market > SLE+Channel+Storefront > SLE+Channel`.
A conflict at the same resolved scope rank is handled by Assortment Resolution, never by technical
ordering.

## Catalog selectors

**Assortment Catalog Selector** — Explicit typed Catalog Policy Scope used by an Assortment Rule
Revision. Launch has a closed selector set: `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and
`PACKAGE_OPTION`. No missing selector, SKU/name convention, primary/main category, arbitrary query,
expression, callback, or user code is an alternate selector.

**ALL Assortment Selector** — Explicit broad selector covering all Catalog targets applicable to the
Decision Purpose and commercial scope. `ALL` is a deliberate business value and never arises from a
missing or broken target reference.

**CATEGORY Assortment Selector** — Product Category subtree selector using Current Direct Category
Assignment plus Ancestor Classification. It matches Products directly classified in the selected
Product Category or any descendant. Launch has no separate direct-only Category selector and no
implicit main/primary Product Category. Category hierarchy/classification changes can therefore
materially change Current Assortment without editing the Assortment Rule.

**PRODUCT Assortment Selector** — Selector for one stable Product ResourceRef. It is valid for both
`VISIBILITY` and `PURCHASE`. For `PURCHASE`, it is a broader rule covering exact Catalog Selections
belonging to that Product unless a more-specific applicable selector wins.

**VARIANT Assortment Selector** — Selector for one stable Variant ResourceRef. It is valid only for
`PURCHASE`. It matches exact Catalog Selections whose Catalog Selection Target is that Variant or a
Package Option belonging to it. `VISIBILITY + VARIANT` is invalid configuration and is never
aggregated into Product visibility.

**PACKAGE_OPTION Assortment Selector** — Selector for one independently selectable Package Option.
It is valid only for `PURCHASE` and matches that exact Package Option. Quantity multiples or
packaging used only to explain quantity do not create a Package Option selector target.

**Assortment Purpose-Selector Compatibility** — Launch invariant:

| Selector | `VISIBILITY` | `PURCHASE` |
| --- | --- | --- |
| `ALL` | valid | valid |
| `CATEGORY` | valid | valid |
| `PRODUCT` | valid | valid |
| `VARIANT` | invalid | valid |
| `PACKAGE_OPTION` | invalid | valid |

Create Rule and Change Rule reject incompatible combinations. Migration must not invent semantics for
an incompatible legacy representation; it remains `UNRESOLVED` until a meaning-preserving
transformation is approved.

**Non-Launch Assortment Selector** — `PRODUCER`, Brand, Manufacturer and other undeclared Catalog
dimensions are not Launch Assortment selectors. Legacy evidence that such targeting existed does not
expand the canonical model. Active legacy behavior may be transformed only when its ongoing business
meaning is preserved; otherwise it remains `UNRESOLVED`. Expanding a dynamic Producer/Brand rule to
the Product list that happens to exist today is not meaning-preserving unless business explicitly
confirms snapshot semantics.

## Subject model

**Assortment Subject Context** — Subject side of an Assortment evaluation. It is either a Guest
Purchase Context or an identified Purchasing Subject. Guest is not a Purchasing Subject. The acting
Principal remains separate from both.

**Assortment Subject-Specific Target** — Canonical exact target for an individual Assortment
exception. Launch supports one Commerce Retail Customer Profile or one Counterparty. Email, account,
Party matching alone, job title, Principal identity, Permission, domain, or another heuristic never
creates a subject-specific Assortment target.

**Assortment Group Input** — Complete Current Commerce Customer Group Membership set applicable to
the relevant Commerce Customer Profile. Commerce Customer Group and its Membership owner provide the
facts only; Assortment owns their interpretation. Membership list order, name, creation time, or
source order creates no priority.

**Principal / Assortment Subject Separation** — Principal is the Actor authorized to perform an
operation. It is not automatically the commercial subject whose Assortment is being evaluated. One
Principal may act for different Counterparties, and changing trusted Purchasing Subject may change
Assortment without changing Principal identity.

## Rules, revisions, and assignments

**Assortment Stable Rule** — Durable identity of one continuing Assortment Business Policy across
successive immutable Assortment Rule Revisions. Display label, database row identity, or Current
payload is not the business identity. A materially different independent policy uses another
Assortment Stable Rule; a changed version of the same continuing policy may create a successor
revision under the same stable identity.

**Assortment Rule Revision** — Immutable Effective representation of one Assortment Stable Rule's
business meaning. Material fields include at least Decision Purpose, Assortment Effect, Catalog
selector and target, Assortment Commercial Scope, and Effective Period semantics. Material change
creates another distinguishable revision and never rewrites a revision that was already Effective or
used as evidence. Effective Period uses standard OntOS half-open semantics.

**Assortment Subject Assignment** — Explicit Effective binding of one exact Assortment
Subject-Specific Target to one **specific immutable Assortment Rule Revision**. It retains its own
Effective Period, provenance, acting Principal/Actor and bounded reason/evidence. It never points only
to Assortment Stable Rule identity.

Creating a successor Assortment Rule Revision does not change any existing Assortment Subject
Assignment. Changing a subject from revision R1 to R2 is an explicit business transition represented
in Launch by End Subject Assignment plus Create Subject Assignment at the intended Effective
boundary. A partial, conflicting, or indeterminate replacement is not presented as complete and is
reconciled before the system claims the new binding is Current.

**Assortment Rule / Subject Assignment Lifecycle Separation** — Change Rule / Create New Revision
changes the shared Assortment Stable Rule's future/current revision semantics but never retargets
existing Assortment Subject Assignments. End Rule ends shared Current/future applicability and blocks
new Subject Assignments to that ended Stable Rule, but it does not automatically end existing
Assignments pinned to already-existing immutable Rule Revisions. Those Assignments continue only
according to their own Effective Period and End Subject Assignment lifecycle. This separation keeps
`assortment.rule.*` and `assortment.assignment.*` authorization boundaries real rather than
indirectly interchangeable.

## Resolution

**Assortment Resolution** — Deterministic lexicographic evaluation of all applicable Current rules
and explicit Assortment Subject Assignments. Resolution order is:

1. Catalog specificity;
2. Assortment Commercial Scope specificity;
3. subject specificity;
4. equal-rank conflict detection.

No technical ordering is a business tie-breaker.

**Catalog Specificity** — For applicable selector kinds, broader to narrower:
`ALL < CATEGORY < PRODUCT < VARIANT < PACKAGE_OPTION`. `VARIANT` and `PACKAGE_OPTION` participate
only in `PURCHASE` because they are invalid for `VISIBILITY`.

**Subject Specificity** — At equal Catalog and commercial-scope rank, broader to narrower:
shared rule < Commerce Customer Group rule < exact Assortment Subject Assignment. Subject specificity
is evaluated after Catalog and commercial scope, so a broad exact-subject exception does not defeat a
narrower Product/Variant/Package or commercial-scope rule solely because it names one subject.

**Assortment Configuration Conflict** — State in which equally ranked applicable configuration cannot
produce one unambiguous effect, including opposing `ALLOW`/`DENY` at the same resolved rank. Result
is `INDETERMINATE`. Database order, numeric ID, created/updated time, last write, import order and
event arrival order are forbidden tie-breakers.

**Assortment Missing Configuration** — Required baseline/rule is absent for a supported evaluation.
It yields `INDETERMINATE`, not implicit `ALLOW`, implicit `DENY`, or a platform default.

**Broken Explicit Assortment Configuration** — Explicit Rule/Assortment Subject Assignment exists but
is dangling, incompatible, invalid, unusable or unverifiable. It is not equivalent to absence and
must not be silently ignored in favor of a broader result when doing so could change eligibility.

## Evidence and currentness

**Assortment Decision Evidence** — Evidence sufficient to explain one exact Assortment decision and
later determine whether it may still be used. As applicable it retains Decision Purpose and outcome,
Product or exact Catalog Selection, material Catalog Revision References, trusted Commerce
Purchasing Context or Guest Purchase Context, Purchasing Subject / exact subject-specific target,
Current Commerce Customer Group Memberships used, exact Assortment Rule Revisions and Assortment
Subject Assignments used, trusted operation time, and resolution reason/rank. Category classification
evidence is retained only when Category matching materially participated. Evidence does not transfer
ownership of source facts to Assortment.

**Stale Assortment Result** — Prospective result whose material source facts or applicability can no
longer be established as Current for the next decision boundary. A cached result, lack of an
invalidation event, timestamp or hash is not Current proof. Material changes may include commercial
scope, Purchasing Subject, Commerce Customer Group Membership, Catalog Selection/classification, or
Assortment configuration.

**Assortment Commitment Confirmation** — Assortment-owner-issued bounded proof for one exact purchase
candidate and one exact Order Commitment Attempt, retaining the relevant Assortment evidence and an
explicit short expiry. Once issued, ordinary later Assortment Rule Revision, Assortment Subject
Assignment, Commerce Customer Group Membership, Catalog classification or other source changes do
**not** revoke that confirmation for its exact attempt before expiry. New evaluations use the new
Current state. An expired, mismatched, or unverifiable confirmation is unusable and requires a new
owner confirmation.

Launch Assortment has no emergency-revocation mechanism for already-issued Assortment Commitment
Confirmations. The validity window must therefore remain deliberately bounded and short. A timestamp,
old read, hash, cached `ELIGIBLE`, or absence of a change event is not a substitute for this owner
confirmation.

## Consumers and projections

**Assortment Visibility Evaluation** — Authoritative Current `VISIBILITY` evaluation for one Product
in the exact Guest Purchase Context or Purchasing Subject/commercial context. Product detail and
protected direct access use authoritative evaluation rather than trusting Search/index presence.

**Assortment Purchase Evaluation** — Authoritative Current `PURCHASE` evaluation for the exact Catalog
Selection and trusted Commerce Purchasing Context. Cart/Checkout/Order acceptance consumers use this
meaning and never let Assortment substitute another selection.

**Assortment Search Projection** — Derived, rebuildable, bounded read model/filter for listing and
Search in one exact context. It is never canonical Assortment authority. A safe positive projection
may accelerate browse; omission is not proof of `INELIGIBLE`, and partial/degraded projection must be
represented honestly. Projection/cache partitioning must prevent cross-subject, cross-Market and
cross-Storefront leakage.

**Assortment Invalidation Event** — Notification that derived consumers may need to invalidate or
rebuild state after a committed Assortment change. Delivery may be duplicated, delayed or out of
order. Event receipt is not an Assortment decision and absence of an event is not proof that an older
result remains Current.

## Administration and authorization

**Assortment Management Action** — Named public mutation of canonical Assortment state. Launch has
exactly five write Actions: Create Rule, Change Rule / Create New Revision, End Rule, Create Subject
Assignment, and End Subject Assignment. Generic field patching is not another mutation path.

**Assortment Management Permission** — Atomic Permission protecting one Assortment management Action
or governed read. Launch codes are `assortment.configuration.read`, `assortment.decision.explain`,
`assortment.rule.create`, `assortment.rule.change`, `assortment.rule.end`,
`assortment.assignment.create`, and `assortment.assignment.end`. Named bundles, if provided, are only
reviewed groupings of these atomic Permissions.

**Assortment Administration Scope** — Exact trusted target scope resolved before authorization. It
may include Tenant, Selling Legal Entity, Channel, Commerce Market, Storefront and exact subject for
subject-specific operations. A narrower grant never authorizes a broader target. Rule management and
Assortment Subject Assignment management are separately authorized. Because Assortment Subject
Assignments pin immutable Assortment Rule Revisions, Change Rule has no hidden authority to mutate
downstream subject bindings.

Buyer Permission, Catalog Editor authority and Counterparty Access Administrator authority do not
imply Assortment administration. Missing, denied, unavailable or indeterminate authorization fails
closed.

## Migration and reconciliation

**Assortment Migration Classification** — Explicit verdict for one legacy behavior/fact family:
`RETAIN`, `TRANSFORM`, `RETIRE`, or `UNRESOLVED`. `RETAIN` preserves a required business capability
that already fits the canonical model. `TRANSFORM` preserves required business meaning through a
different canonical representation. `RETIRE` deliberately excludes the behavior from Launch.
`UNRESOLVED` means evidence is insufficient/contradictory or no meaning-preserving canonical
transformation has been established. Code presence alone is not Active Behavior.

**Assortment Migration Correlation** — Provenance-backed mapping from an External Business System
record/identifier to canonical OntOS identities. External IDs, SKU, URL, names and transport routes
remain correlation/source evidence and never become Product, Commerce Retail Customer Profile,
Counterparty, Commerce Customer Group or Assortment identity. System of Record is determined per
fact, not per software product name.

**Assortment Migration No-Implicit-Wildcard Rule** — Missing legacy Product, Commerce Market,
subject, effect or other value never becomes `ALL`, all markets, unrestricted subject, ALLOW/DENY, or
another broad default unless that exact business meaning is independently proven.

**Assortment Reconciliation** — Owner-governed evidence work for ambiguous, conflicting, partial or
indeterminate migration/integration state. It preserves provenance and may conclude a migration
classification/correlation or remain `UNRESOLVED`. Reconciliation **does not mutate canonical
Assortment directly and is not a privileged write path**. Any resulting canonical change is performed
through the standard Assortment Management Actions, Permissions, scope, idempotency and audit.
Reconciliation never silently unions subject-specific exceptions, Permissions or unrelated settings.

**Assortment Cutover Acceptance** — Launch condition requiring every Launch-critical legacy behavior
to have sufficient Active Behavior evidence, an explicit migration classification, canonical
subject/target/scope and System of Record, and any retained/transformed canonical state to have been
applied through standard Assortment Management Actions or authoritatively reconciled. A
Launch-critical `UNRESOLVED` item blocks the affected cutover rather than being approximated. A
non-Launch or explicitly `RETIRE` item does not block unrelated Launch journeys merely because its
legacy representation remains unresolved.

## Boundaries

Assortment does not own or imply Catalog readiness/lifecycle, Product publication/navigation, Search
ranking, Price, Inventory, Availability/delivery promise, Principal Permission, Payment, purchasing
approval, or Accepted Order. Positive results from those owners do not create Assortment eligibility,
and Assortment `ELIGIBLE` does not create their positive results.

Accepted Orders preserve the exact historical Assortment evidence used at acceptance time. Later
Assortment changes do not rewrite Accepted history. Repeat Order creates a new Current purchase and
therefore re-evaluates Assortment.
