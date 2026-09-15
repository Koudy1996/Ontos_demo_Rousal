# Assortment

Canonical language for B09 Assortment, the Commerce Business Policy capability that decides commercial eligibility for one explicit decision purpose in one trusted Commerce context. This file is a glossary only; delivery scope belongs in GitHub issues, durable architectural rationale in ADRs, and shared Commerce/OntOS terms keep the meanings owned by their contexts.

## Language

### Decision language

**Assortment**:
A Commerce Business Policy capability that decides whether a supported Catalog target is commercially eligible for one Assortment Decision Purpose in one trusted Current Commerce context.
_Avoid_: Catalog readiness, publication, Permission, Pricing, Availability, Payment, approval, or Order acceptance when the intended concept is Assortment.

**Assortment Decision Purpose**:
The exact business question an Assortment evaluation answers. Launch purposes are `VISIBILITY` and `PURCHASE`, and a result for one purpose is never authority for the other.
_Avoid_: Mode, operation type, generic eligibility.

**VISIBILITY**:
The Product-level Assortment Decision Purpose asking whether one Product may be exposed as a commercial offer in the exact trusted context.
_Avoid_: Variant visibility, Package Option visibility, purchase eligibility.

**PURCHASE**:
The Assortment Decision Purpose asking whether one exact Catalog Selection may be purchased by the applicable Guest Purchase Context or Purchasing Subject in the trusted Commerce Purchasing Context.
_Avoid_: Product visibility, Price, Availability, Permission, Payment, approval, Order acceptance.

**Assortment Decision Outcome**:
The result of one Assortment evaluation: `ELIGIBLE`, `INELIGIBLE`, or `INDETERMINATE`. `INDETERMINATE` means the required business conclusion cannot be established truthfully and is neither implicit allow nor business deny.
_Avoid_: Boolean allowed, stale as a fourth outcome.

**Assortment Effect**:
The immutable policy effect `ALLOW` or `DENY` carried by one Assortment Rule Revision. Effect has no inherent priority; canonical specificity and conflict rules determine the outcome.
_Avoid_: Deny-overrides, allow-overrides.

### Policy meaning and applicability

**Assortment Stable Rule**:
The durable governance and audit lineage under which immutable Assortment Rule Revisions are recorded. It has no resolver meaning and no implicit Current or latest Revision.
_Avoid_: Runtime rule, current rule, moving rule target.

**Assortment Rule Revision**:
An immutable, time-neutral exact policy meaning containing Assortment Decision Purpose, Assortment Effect, and exactly one valid Assortment Catalog Selector plus target. It owns neither Assortment Commercial Scope nor Effective Period.
_Avoid_: Editable rule, Current Revision, latest Revision, revision expiry, revision-level Commercial Scope.

**Assortment Applicability Binding**:
An immutable applicability fact that binds one exact Assortment Rule Revision to one audience, one Assortment Commercial Scope, and its own effective lifecycle. Its Effective Period is derived from Binding Create plus an optional Binding End lifecycle fact.
_Avoid_: Assortment Subject Assignment, Rule Assignment, mutable binding, Binding to Stable Rule.

**Assortment Binding Kind**:
The audience form of one Assortment Applicability Binding: `SHARED`, `COMMERCE_CUSTOMER_GROUP`, or `SUBJECT`.
_Avoid_: Customer type, role, Permission-derived audience.

**SHARED Assortment Binding**:
An Assortment Applicability Binding with no individual or Commerce Customer Group target.
_Avoid_: Global wildcard, missing subject.

**COMMERCE_CUSTOMER_GROUP Assortment Binding**:
An Assortment Applicability Binding targeting one exact Commerce Customer Group and matched through Current Commerce Customer Group Membership evidence.
_Avoid_: Segment name, group list order, inferred group.

**SUBJECT Assortment Binding**:
An Assortment Applicability Binding targeting one exact Commerce Retail Customer Profile or one exact Counterparty.
_Avoid_: Customer assignment, Principal assignment, email/account/company-name targeting.

**Retire Rule**:
The governance transition that closes an Assortment Stable Rule lineage to new Revisions and new Bindings. Existing Bindings to already-existing Revisions continue according to their own lifecycle.
_Avoid_: End Rule, deactivate Rule, bulk-end Bindings.

**Replace Applicability Binding**:
One atomic business transition that ends an existing Binding and creates its replacement at the same intended Effective boundary. The old Binding is never retargeted or edited in place.
_Avoid_: Retarget Binding, edit Binding, replace Permission.

### Commercial scope

**Assortment Commercial Scope**:
The commercial applicability scope owned by one Assortment Applicability Binding. Selling Legal Entity and Channel are mandatory; Commerce Market and Storefront are independent optional narrowing dimensions.
_Avoid_: Rule Revision scope, hostname scope, locale scope, currency scope, inferred Market or Storefront.

**Assortment Commercial Scope Specificity**:
A partial order in which `SLE+Channel` is broader, Market-only and Storefront-only are each narrower but mutually incomparable, and Market+Storefront is narrower than both. Higher-axis incomparability cannot be resolved by subject specificity or technical ordering.
_Avoid_: `Market > Storefront`, `Storefront > Market`, one linear commercial-scope rank.

### Catalog selectors

**Assortment Catalog Selector**:
The explicit typed Catalog target semantics carried by one Assortment Rule Revision. Launch selectors are `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and `PACKAGE_OPTION` only.
_Avoid_: `PRODUCER`, Brand, Manufacturer, SKU/name patterns, direct-only Category, primary/main Category, arbitrary query, expression, callback, missing target as selector.

**ALL Assortment Selector**:
An explicit broad selector covering all Catalog targets valid for the Decision Purpose. It is a deliberate business value, never the result of a missing or broken target.
_Avoid_: Default selector, wildcard inferred from null.

**CATEGORY Assortment Selector**:
A Product Category subtree selector matching Products directly classified in the selected Product Category or in any descendant through Current Ancestor Classification.
_Avoid_: Direct-only Category selector, main Category, first Category assignment.

**PRODUCT Assortment Selector**:
A selector for one stable Product ResourceRef, valid for `VISIBILITY` and `PURCHASE`. For `PURCHASE` it is broader than Variant and Package Option selectors for exact Catalog Selections belonging to that Product.
_Avoid_: Product name, SKU, Product Type.

**VARIANT Assortment Selector**:
A `PURCHASE`-only selector for one stable Variant ResourceRef, covering that Variant and its Package Options as a broader candidate.
_Avoid_: Variant visibility selector, Variant name or SKU selector.

**PACKAGE_OPTION Assortment Selector**:
A `PURCHASE`-only selector for one independently selectable Package Option and no sibling option. Quantity multiples or packaging used only to explain Quantity do not create this target.
_Avoid_: Pack-size heuristic, quantity-as-package identity.

**Assortment Purpose-Selector Compatibility**:
`VISIBILITY` accepts only `ALL`, `CATEGORY`, and `PRODUCT`; `PURCHASE` accepts `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and `PACKAGE_OPTION`.
_Avoid_: Interpreting an incompatible combination at runtime instead of rejecting it as invalid configuration.

### Subject and actor language

**Assortment Subject Context**:
The subject side of an Assortment evaluation: either a Guest Purchase Context or an identified Purchasing Subject. Guest is not a Purchasing Subject.
_Avoid_: Customer, account, Principal as the commercial subject.

**Assortment Individual Target**:
The exact individual audience target of a `SUBJECT` Binding: one Commerce Retail Customer Profile or one Counterparty.
_Avoid_: Party similarity, email, account, domain, job title, Principal identity.

**Assortment Group Input**:
Current Commerce Customer Group Membership evidence used to determine which `COMMERCE_CUSTOMER_GROUP` Bindings apply. Membership ownership remains with the Commerce Customer Group capability.
_Avoid_: Assortment-owned membership, group order as precedence.

**Principal / Assortment Subject Separation**:
Principal is the Actor used for authorization and audit, while Guest Purchase Context or Purchasing Subject is the commercial context whose Assortment is evaluated. One Principal may act for different Counterparties without becoming any of them.
_Avoid_: Principal equals customer, Buyer Permission implies Assortment eligibility.

### Resolution

**Assortment Candidate**:
One exact pair of a Current Applicable Assortment Applicability Binding and the immutable Assortment Rule Revision it references.
_Avoid_: Stable Rule candidate, latest Revision candidate, Rule without Binding, Catalog Selection as candidate.

**Assortment Resolution**:
Deterministic resolution of applicable Assortment Candidates by Catalog specificity, then Binding Commercial Scope specificity, then Binding subject specificity, followed by maximal-effect conflict handling. Incomparability on a higher axis stops lower-axis precedence.
_Avoid_: First match wins, last write wins, ID/timestamp/order tie-breaks.

**Catalog Specificity**:
The Catalog precedence axis `ALL < CATEGORY < PRODUCT < VARIANT < PACKAGE_OPTION`, with descendant Category narrower than ancestor and unrelated matching Categories incomparable.
_Avoid_: Effect-based specificity, unrelated Category ordering.

**Assortment Subject Specificity**:
The audience precedence axis `SHARED < COMMERCE_CUSTOMER_GROUP < SUBJECT`, applied only after Catalog and Commercial Scope comparison leaves candidates comparable.
_Avoid_: Subject always wins, individual exception bypasses narrower Catalog policy.

**Assortment Configuration Conflict**:
A Current configuration state whose maximal applicable candidates cannot produce one unambiguous effect, including opposing `ALLOW` and `DENY` among unordered maximal candidates. The Assortment Decision Outcome is `INDETERMINATE`.
_Avoid_: Technical tie-break, automatic DENY winner, automatic ALLOW winner.

**Assortment Missing Configuration**:
The absence of required applicable baseline/configuration for a supported Assortment evaluation. It yields `INDETERMINATE`, not a default Effect.
_Avoid_: Missing means ALLOW, missing means DENY, missing means ALL.

**Broken Explicit Assortment Configuration**:
An explicit Binding or pinned Rule Revision that is dangling, incompatible, invalid, unusable, or unverifiable and could affect the decision. It is not equivalent to absence and must not expose a broader result by silent fallback.
_Avoid_: Ignore broken candidate, treat broken as no rule.

### Evidence and Currentness

**Assortment Decision Evidence**:
Evidence for one exact decision that identifies the relevant Product or Catalog Selection, trusted Commerce context, subject/group evidence, the full participating/maximal Assortment Candidate set with Binding lifecycle facts and exact Rule Revisions, and the resolution path. Stable Rule or today's latest Revision is never a historical substitute.
_Avoid_: Rule ID only, one Candidate standing in for a multi-candidate resolution, latest-state lookup for historical explanation.

**Assortment Current Evaluation**:
An authoritative Assortment evaluation whose material owner evidence remains verifiable through final revalidation for that evaluation attempt. Trusted operation time, cache age, hash, or event silence alone is not Current proof.
_Avoid_: Same timestamp equals snapshot, no event means unchanged.

**Stale Assortment Result**:
Previously valid Assortment evidence that is no longer Current enough for the requested prospective decision. Stale is an evidence state, not an Assortment Decision Outcome.
_Avoid_: STALE as a fourth outcome, stale ELIGIBLE as entitlement.

**Assortment Commitment Confirmation**:
An Assortment-owner-issued guarantee for one exact Assortment Candidate—one exact Current Applicable Applicability Binding plus the immutable Rule Revision it references—and one exact Order Commitment Attempt. It may be issued only when that Candidate is explicitly requested by the caller, is validated by Assortment as a maximal `ALLOW` participant in the same Current fence-validated `PURCHASE=ELIGIBLE` resolution, and the exact Catalog Selection/context/attempt match. If several same-effect maximal candidates support the decision, full Assortment Decision Evidence still retains them; the Confirmation covers one exact Candidate and never creates precedence or a resolver tie-break. Ordinary Assortment source changes do not revoke the Confirmation before expiry for its covered Candidate and attempt; expiry is no later than 30 seconds after issuance. A zero-stale immediate hard stop belongs to another mandatory commitment owner/gate.
_Avoid_: Assortment choosing the covered Candidate, implicit default Candidate, Decision-wide candidate set as one Candidate, confirmation as resolver tie-break, long-lived entitlement, approval as confirmation, emergency Assortment revocation.

**Assortment Confirmation Candidate Selection**:
An explicit caller input naming one exact Assortment Candidate from the final-revalidated maximal `ALLOW` set that the caller asks Assortment to cover with an Assortment Commitment Confirmation. For the Order commitment flow, #329 or its trusted orchestration path supplies this input. Assortment validates membership, effect, Catalog Selection/context and Order Commitment Attempt; it does not choose, substitute, rerank or infer the Candidate. Invalid/non-maximal/non-`ALLOW` selection is rejected.
_Avoid_: Assortment-selected winner, first/lowest/newest Candidate, Candidate inferred from ordering, implicit selection when only one Candidate exists.

### Consumers and projections

**Assortment Visibility Evaluation**:
The authoritative Current `VISIBILITY` evaluation for one Product in one exact Guest Purchase Context or Purchasing Subject and commercial context.
_Avoid_: Search hit, route, sitemap, or known URL as visibility authority.

**Assortment Purchase Evaluation**:
The authoritative Current `PURCHASE` evaluation for one exact Catalog Selection and trusted Commerce Purchasing Context.
_Avoid_: Product-level shortcut, silent replacement of Variant, Package Option, configuration, Market, Storefront, or subject.

**Assortment Search Projection**:
A derived, rebuildable, context-bounded read model for listing or Search. It is never canonical Assortment authority; a hit is not authoritative `ELIGIBLE` and omission is not authoritative `INELIGIBLE`.
_Avoid_: Search/index as System of Record, cross-subject or cross-scope cache reuse without proven equivalence.

**Assortment Invalidation Event**:
A notification that a committed Assortment change may require derived consumers to refresh or rebuild. Receipt is not a decision and absence or delay is not Current proof.
_Avoid_: Event as ALLOW/DENY, event silence as validity guarantee.

### Administration and authorization

**Assortment Management Action**:
A named canonical state transition: `Create Rule`, `Create Rule Revision`, `Retire Rule`, `Create Applicability Binding`, `End Applicability Binding`, or atomic `Replace Applicability Binding`.
_Avoid_: Change Rule, End Rule, Create Subject Assignment, End Subject Assignment, generic PATCH, reconciliation write bypass.

**Assortment Management Permission**:
An atomic Permission protecting Assortment administration or governed reads: `assortment.configuration.read`, `assortment.decision.explain`, `assortment.rule.create`, `assortment.rule.revision.create`, `assortment.rule.retire`, `assortment.binding.create`, and `assortment.binding.end`.
_Avoid_: `assortment.manage`, `assortment.admin`, `assortment.rule.change`, `assortment.rule.end`, `assortment.assignment.*`.

**Assortment Administration Scope**:
The exact trusted authorization target for one Assortment management operation, including the relevant policy meaning or Binding audience and Commercial Scope. Rule authority and Binding applicability authority are separate; a narrow grant never authorizes a broader or unrelated target.
_Avoid_: Permission code alone, Tenant membership as authority, Buyer/Catalog/Counterparty Access authority as Assortment administration.

### Migration and reconciliation

**Assortment Migration Classification**:
The explicit verdict `RETAIN`, `TRANSFORM`, `RETIRE`, or `UNRESOLVED` for one legacy behavior or fact family.
_Avoid_: Code exists therefore retain, approximate unsupported meaning to finish migration.

**Assortment Migration Correlation**:
A provenance-backed mapping from an External Business System identifier or record to canonical OntOS identities. External IDs, names, SKU, URL, and transport routes remain correlations rather than canonical Assortment, Catalog, profile, Counterparty, or group identity.
_Avoid_: External ID as Resource identity, software product name as universal System of Record.

**Assortment Migration No-Implicit-Wildcard Rule**:
A migration invariant that missing legacy target, subject, Market, Storefront, effect, or lifecycle evidence never broadens into an undeclared canonical default.
_Avoid_: Missing target becomes ALL, missing subject becomes SHARED, missing scope becomes wildcard.

**Assortment Reconciliation**:
Owner-governed evidence and disposition work for ambiguous or conflicting migration state. It may resolve canonical meaning or remain `UNRESOLVED`, but it never mutates canonical Assortment through a privileged path.
_Avoid_: Reconciliation override, migration admin write, row/import order as authority.

**Assortment Cutover Acceptance**:
The Launch condition that every Launch-critical legacy behavior has sufficient evidence, an explicit migration disposition, canonical identities and ownership, and any retained or transformed state represented through the ordinary Rule and Binding model. Launch-critical `UNRESOLVED` work blocks only the affected cutover journey.
_Avoid_: Raw record parity, guessed canonical state, unresolved-but-enabled behavior.
