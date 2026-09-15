# Assortment

Canonical language for B09 Assortment, the Commerce Business Policy capability that decides commercial eligibility for one explicit decision purpose in one trusted Commerce context. This file is a glossary only; delivery scope belongs in GitHub issues, durable architectural rationale in ADRs, and shared Commerce/OntOS terms keep the meanings owned by their contexts.

## Language

### Decision language

**Assortment**:
A Commerce Business Policy capability that decides whether a supported Catalog target is commercially eligible for one Assortment Decision Purpose in one trusted Current Commerce context.
_Avoid_: Catalog readiness, publication, Permission, Pricing, Availability, Payment, approval, or Order acceptance when the intended concept is Assortment.

**Assortment Decision Purpose**:
The exact business question an Assortment evaluation answers. Launch purposes are `VISIBILITY` and `PURCHASE`; a result or Closed Assortment Boundary for one purpose is never authority for the other.
_Avoid_: Mode, operation type, generic eligibility, PURCHASE closure as VISIBILITY authority.

**VISIBILITY**:
The Product-level Assortment Decision Purpose asking whether one Product may be exposed as a commercial offer in the exact trusted context.
_Avoid_: Variant visibility, Package Option visibility, purchase eligibility.

**PURCHASE**:
The Assortment Decision Purpose asking whether one exact Catalog Selection may be purchased by the applicable Guest Purchase Context or Purchasing Subject in the trusted Commerce Purchasing Context.
_Avoid_: Product visibility, Price, Availability, Permission, Payment, approval, Order acceptance.

**Assortment Decision Outcome**:
The result of one Assortment evaluation: `ELIGIBLE`, `INELIGIBLE`, or `INDETERMINATE`. `INELIGIBLE` is a known Current business exclusion or deny. `INDETERMINATE` means the required business conclusion cannot be established truthfully and is neither implicit allow nor business deny.
_Avoid_: Boolean allowed, stale as a fourth outcome, treating unverifiable closure or Boundary conflict as INELIGIBLE.

**Assortment Effect**:
The immutable ordinary policy effect `ALLOW` or `DENY` carried by one Assortment Rule Revision. Effect has no inherent priority; canonical ordinary specificity and conflict rules determine the resolver outcome.
_Avoid_: Deny-overrides, allow-overrides, treating Closed Assortment Boundary as an Effect.

### Policy meaning and applicability

**Assortment Stable Rule**:
The durable governance and audit lineage under which immutable Assortment Rule Revisions are recorded. It has no resolver meaning and no implicit Current or latest Revision.
_Avoid_: Runtime rule, current rule, moving rule target.

**Assortment Rule Revision**:
An immutable, time-neutral exact ordinary policy meaning containing Assortment Decision Purpose, Assortment Effect, and exactly one valid Assortment Catalog Selector plus target. It owns neither Assortment Commercial Scope nor Effective Period.
_Avoid_: Editable rule, Current Revision, latest Revision, revision expiry, revision-level Commercial Scope.

**Assortment Applicability Binding**:
An immutable ordinary applicability fact that binds one exact Assortment Rule Revision to one audience, one Assortment Commercial Scope, and its own effective lifecycle. Its Effective Period is derived from Binding Create plus an optional Binding End lifecycle fact.
_Avoid_: Assortment Subject Assignment, Rule Assignment, mutable binding, Binding to Stable Rule, Closed Assortment Boundary as a Binding kind.

**Assortment Binding Kind**:
The audience form of one Assortment Applicability Binding: `SHARED`, `COMMERCE_CUSTOMER_GROUP`, or `SUBJECT`.
_Avoid_: Customer type, role, Permission-derived audience, CLOSED as a fourth Binding kind.

**SHARED Assortment Binding**:
An Assortment Applicability Binding with no individual or Commerce Customer Group target.
_Avoid_: Global wildcard, missing subject.

**COMMERCE_CUSTOMER_GROUP Assortment Binding**:
An Assortment Applicability Binding targeting one exact Commerce Customer Group and matched through Current Commerce Customer Group Membership evidence.
_Avoid_: Segment name, group list order, inferred group.

**SUBJECT Assortment Binding**:
An Assortment Applicability Binding targeting one exact Commerce Retail Customer Profile or one exact Counterparty.
_Avoid_: Customer assignment, Principal assignment, email/account/company-name targeting, assuming SUBJECT applicability creates closed assortment.

**Closed Assortment Boundary**:
An immutable first-class managed Assortment fact representing one complete purpose-specific closed-assortment meaning for one exact identified Commerce Retail Customer Profile or Counterparty. It contains exact subject, exact Assortment Decision Purpose, exact Assortment Commercial Scope, one complete Closed Assortment Admission Set, and its own effective lifecycle. Before ordinary Assortment Resolution, the applicable unique maximal Boundary determines whether the exact Product for `VISIBILITY` or exact Catalog Selection for `PURCHASE` is admitted. A non-admitted target is `INELIGIBLE`; an admitted target still proceeds through ordinary resolution and admission itself is not `ALLOW`, `ELIGIBLE`, or entitlement. Boundary is not an Assortment Candidate, Binding kind, Effect priority, or specificity rank.
_Avoid_: `SUBJECT ALL=DENY + ALLOW` as a closed whitelist, subject-first precedence, deny-overrides, implicit closure from sparse allow rows, mutable Boundary, group or Guest closure inferred from the individual-subject contract.

**Closed Assortment Admission Set**:
The complete immutable Catalog-coverage meaning contained by one Closed Assortment Boundary. For `VISIBILITY` it uses `ALL`, `CATEGORY`, and `PRODUCT` coverage meanings; for `PURCHASE` it may also use `VARIANT` and `PACKAGE_OPTION`. Its entries are not independently-current policy resources, Rule Revisions, or ALLOW Candidates. An explicit empty Admission Set admits nothing; explicit `ALL` admits every supported target for that purpose while the Boundary still exists as an explicit fact.
_Avoid_: Whitelist rows as independent policy, partial query result treated as complete set, unioning Admission Sets from several Boundaries, admission entry as ALLOW Rule.

**Retire Rule**:
The governance transition that closes an Assortment Stable Rule lineage to new Revisions and new Bindings. Existing Bindings to already-existing Revisions continue according to their own lifecycle. It has no implicit Closed Assortment Boundary effect.
_Avoid_: End Rule, deactivate Rule, bulk-end Bindings or Boundaries.

**Replace Applicability Binding**:
One atomic business transition that ends an existing Binding and creates its replacement at the same intended Effective boundary. The old Binding is never retargeted or edited in place.
_Avoid_: Retarget Binding, edit Binding, replace Permission.

**Replace Closed Assortment Boundary**:
One atomic business transition `End(old Boundary, T) + Create(new Boundary, T)` used for any material Boundary-meaning change, including subject, purpose, Commercial Scope, or complete Admission Set. Both facts commit or neither; historical Boundary meaning is never edited in place.
_Avoid_: Mutable whitelist edit, partial End/Create replacement, per-entry upsert, union/merge as replacement.

### Commercial scope

**Assortment Commercial Scope**:
The exact commercial applicability scope owned by one ordinary Assortment Applicability Binding or one Closed Assortment Boundary. Selling Legal Entity and Channel are mandatory; Commerce Market and Storefront are independent optional narrowing dimensions.
_Avoid_: Rule Revision scope, hostname scope, locale scope, currency scope, inferred Market or Storefront.

**Assortment Commercial Scope Specificity**:
A partial order in which `SLE+Channel` is broader, Market-only and Storefront-only are each narrower but mutually incomparable, and Market+Storefront is narrower than both. The same partial order is used to determine the unique maximal applicable Closed Assortment Boundary. Higher-axis incomparability is never resolved by technical ordering.
_Avoid_: `Market > Storefront`, `Storefront > Market`, one linear scope rank, union/intersection of incomparable Boundary Admission Sets.

### Catalog selectors and coverage

**Assortment Catalog Selector**:
The explicit typed Catalog target semantics carried by one Assortment Rule Revision. Launch selectors are `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and `PACKAGE_OPTION` only. The same Catalog coverage meanings may appear inside a Closed Assortment Admission Set without becoming Rule Revisions.
_Avoid_: `PRODUCER`, Brand, Manufacturer, SKU/name patterns, direct-only Category, primary/main Category, arbitrary query, expression, callback, missing target as selector.

**ALL Assortment Selector**:
An explicit broad selector covering all Catalog targets valid for the Decision Purpose. It is a deliberate business value, never the result of a missing or broken target. `ALL` remains the broadest ordinary Catalog specificity rank and is not a closed-assortment primitive.
_Avoid_: Default selector, wildcard inferred from null, `SUBJECT ALL=DENY` treated as a Closed Assortment Boundary.

**CATEGORY Assortment Selector**:
A Product Category subtree selector matching Products directly classified in the selected Product Category or in any descendant through Current Ancestor Classification.
_Avoid_: Direct-only Category selector, main Category, first Category assignment.

**PRODUCT Assortment Selector**:
A selector for one stable Product ResourceRef, valid for `VISIBILITY` and `PURCHASE`. For `PURCHASE` it is broader than Variant and Package Option selectors for exact Catalog Selections belonging to that Product.
_Avoid_: Product name, SKU, Product Type.

**VARIANT Assortment Selector**:
A `PURCHASE`-only selector for one stable Variant ResourceRef, covering that Variant and its Package Options as a broader ordinary candidate.
_Avoid_: Variant visibility selector, Variant name or SKU selector.

**PACKAGE_OPTION Assortment Selector**:
A `PURCHASE`-only selector for one independently selectable Package Option and no sibling option. Quantity multiples or packaging used only to explain Quantity do not create this target.
_Avoid_: Pack-size heuristic, quantity-as-package identity.

**Assortment Purpose-Selector Compatibility**:
`VISIBILITY` accepts only `ALL`, `CATEGORY`, and `PRODUCT`; `PURCHASE` accepts `ALL`, `CATEGORY`, `PRODUCT`, `VARIANT`, and `PACKAGE_OPTION`. Closed Assortment Admission Set coverage follows the same purpose compatibility.
_Avoid_: Interpreting incompatible combinations at runtime or importing unsupported coverage into a Boundary.

### Subject and actor language

**Assortment Subject Context**:
The subject side of an Assortment evaluation: either a Guest Purchase Context or an identified Purchasing Subject. Guest is not a Purchasing Subject.
_Avoid_: Customer, account, Principal as the commercial subject.

**Assortment Individual Target**:
The exact individual audience target of a `SUBJECT` Binding or individual-subject Closed Assortment Boundary: one Commerce Retail Customer Profile or one Counterparty.
_Avoid_: Party similarity, email, account, domain, job title, Principal identity.

**Assortment Group Input**:
Current Commerce Customer Group Membership evidence used to determine which `COMMERCE_CUSTOMER_GROUP` Bindings apply. When Membership presence/absence can change the decision, Assortment needs the complete material Membership set proven by Owner-Verifiable Set Completeness Evidence. Membership ownership remains with the Commerce Customer Group capability.
_Avoid_: Assortment-owned membership, group order as precedence, one returned Membership treated as the complete set, group membership as implicit Closed Assortment Boundary.

**Principal / Assortment Subject Separation**:
Principal is the Actor used for authorization and audit, while Guest Purchase Context or Purchasing Subject is the commercial context whose Assortment is evaluated. One Principal may act for different Counterparties without becoming any of them.
_Avoid_: Principal equals customer, Buyer Permission implies Assortment eligibility or Boundary-management authority.

### Resolution

**Assortment Candidate**:
One exact pair of a Current Applicable Assortment Applicability Binding and the immutable Assortment Rule Revision it references.
_Avoid_: Stable Rule candidate, latest Revision candidate, Rule without Binding, Catalog Selection as candidate, Closed Assortment Boundary as candidate.

**Closed Assortment Boundary Applicability**:
The pre-resolution step for an identified subject that determines the Current applicable Boundary set for the exact purpose and trusted Commerce context. No applicable Boundary, one unique maximal Boundary, or a complete maximal conflict set may be asserted only from owner-verifiably complete material Boundary applicability evidence. A strictly narrower Boundary replaces a broader Boundary for that context; Admission Sets are never unioned or intersected.
_Avoid_: First Boundary wins, newest wins, row/ID/timestamp order, one returned Boundary proves uniqueness, empty query proves no Boundary, union, intersection, deny-for-safety tie-break.

**Closed Assortment Boundary Configuration Conflict**:
A Current configuration state with two or more distinct equally-maximal or Commercial-Scope-incomparable applicable Closed Assortment Boundaries for the same exact subject, purpose, and request context, established from a complete material Boundary set. The Assortment Decision Outcome is `INDETERMINATE`.
_Avoid_: Selecting one Boundary technically, merging Admission Sets, treating an observed but incomplete pair as the proven full conflict set, reporting the state as known INELIGIBLE.

**Assortment Resolution**:
Deterministic ordinary resolution applied after authoritative proof of no Boundary or successful admission by the applicable unique maximal Boundary. It resolves the complete material Assortment Candidate set by Catalog specificity, then Binding Commercial Scope specificity, then Binding subject specificity, followed by maximal-effect conflict handling. Incomparability on a higher axis stops lower-axis precedence.
_Avoid_: First match wins, returned candidates assumed complete, last write wins, ID/timestamp/order tie-breaks, moving subject specificity ahead of Catalog to simulate closure.

**Catalog Specificity**:
The ordinary Catalog precedence axis `ALL < CATEGORY < PRODUCT < VARIANT < PACKAGE_OPTION`, with descendant Category narrower than ancestor and unrelated matching Categories incomparable.
_Avoid_: Effect-based specificity, unrelated Category ordering, treating Admission Set membership as ordinary specificity competition.

**Assortment Subject Specificity**:
The ordinary audience precedence axis `SHARED < COMMERCE_CUSTOMER_GROUP < SUBJECT`, applied only after Catalog and Binding Commercial Scope comparison leaves candidates comparable. Closed Assortment Boundary does not change this rank.
_Avoid_: Subject always wins, individual exception bypasses narrower Catalog policy, closure implemented as subject-first precedence.

**Assortment Configuration Conflict**:
A Current ordinary configuration state whose complete material maximal Candidate set cannot produce one unambiguous effect, including opposing `ALLOW` and `DENY` among unordered maximal candidates. The Assortment Decision Outcome is `INDETERMINATE`. It is distinct from Closed Assortment Boundary Configuration Conflict.
_Avoid_: Conflict inferred from an incomplete Candidate set, technical tie-break, automatic DENY winner, automatic ALLOW winner.

**Assortment Missing Configuration**:
The authoritative absence of required applicable ordinary baseline/configuration for a supported Assortment evaluation, established only from a complete material Candidate-producing state. It yields `INDETERMINATE`, not a default Effect. Valid Boundary exclusion is a known `INELIGIBLE`; an admitted target may still have Missing Configuration in the ordinary resolver.
_Avoid_: Empty query means Missing Configuration, missing means ALLOW, missing means DENY, missing means ALL, non-admission means missing configuration.

**Broken Explicit Assortment Configuration**:
An explicit Binding, pinned Rule Revision, or material Closed Assortment Boundary aggregate/lifecycle state that is dangling, incompatible, invalid, torn, unusable, or unverifiable and could affect the decision. A partial/unproven Admission Set is not a smaller valid Boundary. Broken state is uncertainty, not absence or known exclusion.
_Avoid_: Ignore broken candidate or Boundary, treat broken as no rule/no Boundary, DENY for safety from unverifiable closure.

### Evidence and Currentness

**Assortment Decision Evidence**:
Evidence for one exact decision that identifies the relevant Product or Catalog Selection, trusted Commerce context, subject/group evidence, exact immutable Closed Assortment Boundary meaning and applicability/admission/exclusion/conflict path when material, and—when ordinary resolution occurs—the full participating/maximal Assortment Candidate set with Binding lifecycle facts, exact Rule Revisions, and resolution path. It also identifies the material Fact Currentness and Owner-Verifiable Set Completeness Evidence required for the successful validated attempt. Stable Rule or today's latest state is never a historical substitute.
_Avoid_: Rule ID only, one Candidate standing in for a multi-candidate resolution, returned rows assumed complete, fabricating a candidate winner for Boundary exclusion, replacing historical Boundary meaning with today's Boundary.

**Owner-Verifiable Set Completeness Evidence**:
Owner-verifiable evidence that, for one exact decision-relevant predicate/scope, an observed set contains every Current fact whose presence or absence can change the exact Assortment decision. The proof may be exact-predicate scoped or safely broader if the owner contract guarantees that any change capable of altering the exact predicate invalidates it. It is distinct from individual Fact Currentness Evidence and from transport pagination/query completion.
_Avoid_: All returned rows are Current therefore the set is complete, empty response means absence, final page means business completeness, event silence means completeness, local cache/row count as authority.

**Assortment Current Evaluation**:
An authoritative Assortment evaluation whose material individual Fact Currentness Evidence and every required Owner-Verifiable Set Completeness Evidence remain valid through final revalidation for that attempt. A changed material fact or set proof discards the attempt and triggers bounded retry; persistent inability to prove complete Current inputs yields `INDETERMINATE`. Revalidating returned resources alone never proves all material facts were returned.
_Avoid_: Same timestamp equals snapshot, no event means unchanged, one returned row proves uniqueness, returned ALLOW candidates prove ELIGIBLE without complete input, stale closure means admitted/excluded.

**Stale Assortment Result**:
Previously valid Assortment evidence that is no longer Current enough for the requested prospective decision, including evidence whose material set-completeness proof is no longer valid even though observed resources themselves are unchanged. Stale is an evidence state, not an Assortment Decision Outcome.
_Avoid_: STALE as a fourth outcome, stale ELIGIBLE as entitlement, stale Boundary/Membership/Candidate set reused as Current.

**Assortment Commitment Confirmation**:
An Assortment-owner-issued bounded guarantee for one exact Assortment Candidate—one exact Current Applicable Applicability Binding plus its immutable Rule Revision—and one exact Order Commitment Attempt. It may be issued only from a Current `PURCHASE=ELIGIBLE` decision that passed all material Fact Currentness and Owner-Verifiable Set Completeness requirements, including Boundary applicability and other material set-valued inputs, plus ordinary resolution. Boundary and set-completeness evidence remain source Decision Evidence rather than the covered Candidate. The Candidate is explicitly requested by the caller and validated by Assortment as a maximal `ALLOW` participant. Expiry is no later than 30 seconds after issuance; later Boundary-change revocation behavior belongs to the bounded confirmation/commitment contract rather than being inferred from ordinary Boundary lifecycle.
_Avoid_: Boundary admission or set proof as covered Candidate, Assortment choosing the Candidate, implicit default Candidate, decision-wide set as one Candidate, long-lived entitlement.

**Assortment Confirmation Candidate Selection**:
An explicit caller input naming one exact Assortment Candidate from the final-revalidated maximal `ALLOW` set that the caller asks Assortment to cover. For Order commitment, #329 or trusted orchestration supplies it. Assortment validates the same positive decision's Boundary path, complete material input proof, candidate membership/effect, exact Catalog Selection/context and exact Attempt; it does not choose, substitute, rerank, or infer the Candidate.
_Avoid_: Assortment-selected winner, first/lowest/newest Candidate, Candidate inferred from ordering, implicit selection when only one Candidate exists.

### Consumers and projections

**Assortment Visibility Evaluation**:
The authoritative Current `VISIBILITY` evaluation for one Product in one exact Guest Purchase Context or Purchasing Subject and commercial context. It uses all material Fact Currentness and Set Completeness Evidence; for an identified subject it establishes complete Boundary applicability before ordinary visibility resolution.
_Avoid_: Search hit, route, sitemap, or known URL as visibility authority, incomplete Boundary/Candidate set treated as Current, PURCHASE closure as Product visibility deny.

**Assortment Purchase Evaluation**:
The authoritative Current `PURCHASE` evaluation for one exact Catalog Selection and trusted Commerce Purchasing Context. It uses all material Fact Currentness and Set Completeness Evidence; for an identified subject it establishes complete Boundary applicability and exact admission before ordinary purchase resolution.
_Avoid_: Product-level shortcut, incomplete Membership/Candidate/Boundary set treated as Current, silent replacement of Variant, Package Option, configuration, Market, Storefront, or subject.

**Assortment Search Projection**:
A derived, rebuildable, context-bounded read model for listing or Search. It is never canonical Assortment authority; a hit is not authoritative `ELIGIBLE` and omission is not authoritative `INELIGIBLE`.
_Avoid_: Search/index as System of Record, cross-subject or cross-scope cache reuse without proven equivalence.

**Assortment Invalidation Event**:
A notification that a committed Assortment Rule/Binding/Closed Boundary change may require derived consumers to refresh or rebuild. Receipt is not a decision, not Owner-Verifiable Set Completeness Evidence, and absence or delay is not Current proof.
_Avoid_: Event as ALLOW/DENY, event silence as validity/completeness guarantee, event order as Boundary precedence.

### Administration and authorization

**Assortment Management Action**:
A named canonical state transition: `Create Rule`, `Create Rule Revision`, `Retire Rule`, `Create Applicability Binding`, `End Applicability Binding`, atomic `Replace Applicability Binding`, `Create Closed Assortment Boundary`, `End Closed Assortment Boundary`, or atomic `Replace Closed Assortment Boundary`.
_Avoid_: Change Rule, End Rule, Create Subject Assignment, generic PATCH, per-entry whitelist upsert, reconciliation write bypass.

**Assortment Management Permission**:
An atomic Permission protecting Assortment administration or governed reads: `assortment.configuration.read`, `assortment.decision.explain`, `assortment.rule.create`, `assortment.rule.revision.create`, `assortment.rule.retire`, `assortment.binding.create`, `assortment.binding.end`, `assortment.boundary.create`, and `assortment.boundary.end`. Replace operations have no super-Permission and require the relevant end+create authorities.
_Avoid_: `assortment.manage`, `assortment.admin`, `assortment.boundary.replace`, `assortment.assignment.*`, Rule/Binding authority implicitly granting Boundary management.

**Assortment Administration Scope**:
The exact trusted authorization target for one management operation. Rule authority targets exact policy meaning; Binding authority targets exact ordinary audience/Commercial Scope/Revision applicability; Boundary Create authority targets exact Tenant, identified subject, purpose, Commercial Scope, and complete proposed Admission Set policy scope; Boundary End authority targets the exact existing Boundary. A narrow grant never authorizes a broader or unrelated target.
_Avoid_: Permission code alone, Tenant membership as authority, Buyer/Catalog/Counterparty Access authority as Assortment administration, subject-only Boundary grant treated as arbitrary whitelist authority.

### Migration and reconciliation

**Assortment Migration Classification**:
The explicit verdict `RETAIN`, `TRANSFORM`, `RETIRE`, or `UNRESOLVED` for one legacy behavior or fact family.
_Avoid_: Code exists therefore retain, approximate unsupported meaning to finish migration.

**Assortment Migration Correlation**:
A provenance-backed mapping from an External Business System identifier or record to canonical OntOS identities. External IDs, names, SKU, URL, and transport routes remain correlations rather than canonical Assortment, Catalog, Profile, Counterparty, or Group identity.
_Avoid_: External ID as Resource identity, software product name as universal System of Record.

**Assortment Migration No-Implicit-Wildcard Rule**:
A migration invariant that missing legacy target, subject, Market, Storefront, effect, lifecycle evidence, or allow-list rows never broadens into an undeclared canonical default or implicit Closed Assortment Boundary. Sparse allow rows do not prove a complete Admission Set.
_Avoid_: Missing target becomes ALL, missing subject becomes SHARED, missing scope becomes wildcard, partial allow list becomes canonical closure.

**Assortment Reconciliation**:
Owner-governed evidence and disposition work for ambiguous or conflicting migration state. Once true closed meaning, exact identity/scope/lifecycle, complete Admission Set, and supported Catalog correlations are proven, application uses standard Closed Assortment Boundary Actions and Permissions. Reconciliation itself never mutates canonical Assortment through a privileged path.
_Avoid_: Reconciliation override, migration admin write, row/import order as authority, hidden Boundary write.

**Assortment Cutover Acceptance**:
The Launch condition that every Launch-critical legacy behavior has sufficient evidence, an explicit migration disposition, canonical identities and ownership, a supported canonical representation, and the required Currentness/Set Completeness contract for affected decisions. Ordinary retained behavior uses Rule/Binding. Proven true closed per-subject behavior may `TRANSFORM` to one immutable complete Closed Assortment Boundary through standard Boundary Actions/Permissions. Unproven identity, closure meaning, Admission Set completeness, scope, lifecycle, conflicting Boundary composition, or required material set completeness remains `UNRESOLVED` and blocks the affected cutover journey.
_Avoid_: Raw record parity, guessed canonical state, unresolved-but-enabled behavior, `SUBJECT ALL=DENY + ALLOW` claimed as true closed-whitelist equivalence, partial rows imported as complete Boundary.