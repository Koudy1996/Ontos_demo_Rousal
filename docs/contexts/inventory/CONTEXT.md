# Inventory language

Inventory owns canonical stock meaning and Inventory-recognized stock obligations within explicit authority boundaries. This context extends shared OntOS and Commerce language; accepted Inventory ADRs record durable trade-offs while GitHub issues hold detailed behavior and acceptance scenarios.

## Stock model

**Stock Item** — Durable Inventory Resource representing exactly one exact Catalog Selection meaning for Launch, with one explicit stock Unit. A materially different Catalog Selection meaning requires a different Stock Item.
_Avoid_: Product or SKU as stock identity, one Stock Item shared by several exact Catalog Selections, one Catalog Selection decomposed into several Stock Items.

**Stock Location** — Durable Inventory Resource identifying one explicit operational stock scope in which stock facts are interpreted.
_Avoid_: Storefront, postal address, pickup point, hostname, or legacy `store` label as Stock Location identity.

**Stock Position** — Canonical constrained quantity scope for one Stock Item in one exact Inventory stock scope/location. Reservation contention and quantity guarantees bind to Stock Positions rather than Product, SKU, Channel, or seller similarity.
_Avoid_: Product-level stock bucket, warehouse name alone as reservation scope.

**ON_HAND** — Authoritative physical Quantity for one exact Stock Position according to its declared System of Record. It is not customer-facing Availability and is not automatically reduced by Inventory obligations.

**RESERVED** — Quantity constrained by Current Inventory-recognized Reservation obligations for one exact Stock Position. It does not by itself prove that an external physical-stock owner enforces the hold.

**UNKNOWN** — Stock-fact state in which the expected owner/scope is known but the owner cannot currently establish a numeric value.

**MISSING** — Stock-fact state in which no usable evidence exists for an expected fact/scope.

**STALE** — Stock-fact state in which prior evidence exists but no longer qualifies as Current under its owner contract.

**INDETERMINATE** — Stock-fact state in which relevant evidence exists but Current truth cannot be safely resolved because of conflict or uncertain effect outcome.

**Stock Receipt** — Authoritative physical increase of one exact Stock Position for an explicit business reason in a scope whose physical-stock authority permits that transition.

**Stock Issue** — Authoritative physical decrease of one exact Stock Position for an explicit business reason in a scope whose physical-stock authority permits that transition.

**Stock Correction** — High-risk Inventory public Action establishing corrected absolute ON_HAND for one exact Stock Position only through the selected Inventory Backend's applicable authority contract. The public Inventory boundary does not turn an unselected or non-authoritative system into the physical-stock owner.
_Avoid_: generic inventory update, local override of the selected physical-stock System of Record, backend switching as correction.

## Stock demand and allocation

**Catalog-to-Stock Binding** — Stable Inventory-owned one-to-one relation between one exact Catalog Selection meaning and one exact Stock Item. It is explicit and historically explainable rather than inferred from Product, Variant, SKU, Package contents, Set components, source identifiers, or current availability; material meaning change requires a different exact Selection and Stock Item.

**Stock Requirement** — Exact Inventory demand for one Stock Item derived from one exact Catalog Selection plus the unchanged requested Quantity and Unit. Inventory does not convert the Unit, derive purchase Quantity from Configuration attributes, or decompose Package/Set contents into other Stock Items.

**Stock Allocation** — Assignment of all or part of one Stock Requirement Quantity to one Stock Position for the same Stock Item and Unit. One Requirement may use one or more Stock Allocations across Stock Positions/Locations whose quantities together cover the unchanged requirement.
_Avoid_: allocation as remapping, availability-driven substitution, Unit conversion.

## Reservations and commitment

**Inventory Backend** — Exactly one configured stock/reservation backend used by one Customer Configuration / Launch Inventory operating scope. It is either a customer-provided External Business System (for example an ERP such as ABRA) or the OntOS-provided WMS. The two modes are alternatives; they are not simultaneous authoritative backends for the same Launch scope.
_Avoid_: external ERP plus OntOS WMS composed as dual stock authorities, automatic backend fallback during outage, Integration Route treated as backend ownership.

**Inventory Reservation** — Durable Inventory Resource representing the complete provisional stock obligation for one exact Order Commitment Attempt. Launch has exactly one normal-runtime Inventory Reservation per Attempt. It preserves all Stock Requirements and may contain 1..N Stock Allocations across supported Stock Positions/Locations, all enforced through the same selected Inventory Backend / Reservation Authority.

**Reservation Authority** — The selected Inventory Backend acting as the owner capable of enforcing the exact Reservation obligation and issuing authoritative Reservation evidence. For a Customer Configuration / Launch Inventory operating scope it is singular: either the configured External Business System or the OntOS-provided WMS.
_Avoid_: Availability, Integration Route, provider adapter, or an unselected second backend treated as Reservation Authority.

**Reservation Confirmation** — Attempt-bound proof issued by the selected Reservation Authority that the exact provisional Inventory Reservation is currently guaranteed under its declared validity boundary. Renewal may issue a successor Confirmation for the same unchanged Reservation meaning. It is not part of the pre-attempt Order Acceptance Decision Bundle.

**Reservation Release** — Explicit owner-governed end of the whole provisional Inventory Reservation after release safety is proven.
_Avoid_: Confirmation expiry, `AT_RISK`, or `REVOKED` treated as Reservation Release.

**Provisional Shortage Priority** — Launch FIFO rule for competing unprotected provisional Reservation Confirmations enforced by the selected Inventory Backend: older owner-issued valid Confirmation has priority over younger Confirmation within the affected constrained stock scope.
_Avoid_: best-fit skipping, B2C-over-B2B priority, technical arrival order as FIFO.

**Commitment Protection** — Attempt-bound owner guarantee established by the selected Reservation Authority for the exact Inventory Reservation immediately before Order commitment. Once established, the protected Quantity remains fenced until authoritative Order truth proves commit or proves non-commit plus definitive Attempt closure.

**COMMITTED_OBLIGATION** — Post-commit lifecycle meaning of the successful Inventory Reservation's stock obligation for an Accepted Order. It continues to constrain its exact Stock Positions until owner-governed transitions account for the remaining Quantity.

**AT_RISK** — Guarantee-health meaning stating that an obligation still exists but its promised guarantee cannot currently be owner-verifiably honored.
_Avoid_: release, revocation, cancellation, free stock, or proof that an Order did not commit.

**REVOKED** — Pre-protection Confirmation state in which the selected Reservation Authority explicitly terminates that exact Confirmation guarantee. It does not release the underlying Reservation.

**EXPIRED** — Confirmation state reached when its declared validity interval ends. Expiry does not release the Reservation or an established Commitment Protection.

**UNVERIFIABLE** — Proof-health state in which Current owner evidence is insufficient to establish the guarantee state. It is neither implicit revocation nor release.

**Imported Committed Obligation** — Migration-origin Inventory obligation bound directly to an already-proven imported Order and explicit source lineage, starting in committed meaning without fabricating a historical OntOS Order Commitment Attempt.

## External stock evidence

**Inventory Source Assertion** — Provenance-backed claim from the selected External Business System when the Customer Configuration uses an external Inventory Backend, retaining issuer, exact correlated scope, fact meaning, Quantity/Unit, business time, and owner-defined ordering evidence. Technical arrival or parsing does not make it Current. The OntOS-provided WMS path does not create a second simultaneous external stock authority.

**Source Coverage Evidence** — Owner-verifiable evidence establishing whether an absolute ON_HAND assertion includes a particular authoritative physical Stock Issue, or an owner revision boundary that makes that relation unambiguous.
_Avoid_: message arrival order as effect coverage, double subtraction, delayed snapshot assumed to include an Issue.
