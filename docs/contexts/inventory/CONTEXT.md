# Inventory language

Inventory owns canonical stock meaning and Inventory-recognized stock obligations within explicit authority boundaries. This context extends the shared OntOS and Commerce language and owns Inventory-specific vocabulary; it does not prescribe storage, transport, locking, provider APIs, or other implementation mechanics.

For Inventory-specific terms, this context together with Accepted Inventory ADRs is the specialization authority. If an older Commerce glossary shorthand conflicts with an Inventory definition here, use this Inventory definition and the Accepted ADR; do not preserve the older shorthand as a second valid meaning.

## Stock model

**Stock Item** — Durable Inventory Resource representing exactly one exact Catalog Selection meaning for Launch. Each exact Catalog Selection has exactly one Stock Item, and one Stock Item does not represent several materially different Catalog Selections. Product, Variant, SKU, display name, external identifier, Package contents, Set components, or similarity do not replace this exact one-to-one binding. A material change of the Catalog Selection meaning, including material Package Content, Set Composition, or Product Configuration meaning, requires a new Stock Item rather than redefining the old one.
_Avoid_: Product or SKU as stock identity, one Stock Item shared by several exact Catalog Selections, one Catalog Selection decomposed into several Stock Items.

**Stock Location** — Durable Inventory Resource identifying one explicit operational stock scope in which stock facts are interpreted. It is not a Storefront, postal address, pickup point, hostname, or legacy `store` label.

**Stock Position** — Canonical constrained quantity scope for one Stock Item in one exact Inventory stock scope/location. Reservation contention and quantity guarantees bind to Stock Positions rather than Product, SKU, Channel, or seller similarity.
_Avoid_: warehouse name alone as reservation scope, Product-level stock bucket.

**ON_HAND** — Authoritative physical Quantity currently attributed to one exact Stock Position by its declared System of Record. It is not customer-facing Availability and is not automatically reduced by Inventory-recognized Reservations.

**RESERVED** — Quantity currently constrained by Inventory-recognized Reservation obligations for one exact Stock Position. It describes Inventory obligation meaning; by itself it does not prove that an external physical-stock owner enforces the hold.

### Quantity and Unit invariant

Inventory consumes the exact purchase Quantity and explicit Unit supplied by the purchase/Catalog contract and does not reinterpret them.

- Inventory does not convert one Unit into another merely for stock handling.
- Product Configuration attributes are not silently converted into purchase Quantity.
- Attributes of one stock unit describe that unit; they are not summed across several units to fabricate another Quantity.
- Example: two `piece` units each having attribute `length = 500 mm` are `2 piece`, not `1000 mm`.
- If the exact stock Unit itself is `millimeter`, then `ON_HAND = 1000 millimeter` genuinely means one thousand millimeters of that Stock Item.
- A Package selected and quantified in Package units remains Package quantity; Inventory does not convert it to the count of contained pieces.
- A Set remains the exact Set Stock Item; Inventory does not decompose it into component stock.

## Stock demand and allocation

**Catalog-to-Stock Binding** — Inventory-owned one-to-one relation between one exact Catalog Selection meaning and one exact Stock Item. The relation must be unambiguous and historically explainable. It is not inferred from Product, Variant, SKU, Package contents, Set components, source identifiers, or current stock availability. This term describes the business relation and does not require a separate durable Resource or generic mapping engine.

**Stock Requirement** — Exact Inventory-owned demand for one exact Stock Item derived from one exact Catalog Selection plus the unchanged requested Quantity and Unit. One exact selection demand produces one Stock Requirement. Missing or conflicting Catalog-to-Stock Binding is a non-success; every supported Launch Catalog Selection is stock-managed.

**Stock Allocation** — Exact assignment of all or part of one Stock Requirement Quantity to one Stock Position for the same Stock Item and Unit. One Requirement may be satisfied by one or more Stock Allocations across multiple Stock Positions/Locations; the allocation quantities must together cover the exact requested Quantity without Unit conversion, substitution, decomposition, or remapping.
_Avoid_: Location allocation treated as a new Catalog meaning, Package/Set decomposition, Unit conversion, availability-driven substitution.

## Reservations and commitment

**Inventory Reservation** — Durable Inventory Resource representing one exact stock obligation. Normal runtime provisional Reservations are bound to one exact Order Commitment Attempt and may cover the Attempt's exact Stock Requirements; a migration-origin obligation may start directly in committed meaning only when it is bound to an already-proven imported Order and preserves explicit source lineage rather than fabricating a historical Attempt.
_Avoid_: Cart line as Reservation identity, synthetic Order Commitment Attempt created only to satisfy migration shape.

**Reservation Authority** — Owner capable of enforcing one exact Reservation obligation in the applicable scope and therefore of issuing authoritative Reservation evidence. It may be Inventory, an External Business System, or absent; Availability, an Integration Route, or a provider adapter does not gain this authority merely by consuming or transporting evidence.

**Reservation Confirmation** — Attempt-bound owner proof issued by the actual Reservation Authority that one exact provisional Inventory Reservation is currently guaranteed under its declared validity boundary. It is not issued by Availability merely because Availability owns the customer-facing promise, and it is not part of the pre-attempt Order Acceptance Decision Bundle.
_Avoid_: `Inventory/Availability-owner-issued`, local `RESERVED` bookkeeping treated as physical guarantee.

**Reservation Release** — Explicit owner-governed end of one whole provisional Inventory Reservation after release safety is proven. Confirmation expiry, `AT_RISK`, or `REVOKED` proof state is not Reservation Release.

**Provisional Shortage Priority** — Launch FIFO rule for competing unprotected provisional Reservation Confirmations after a material shortage: older owner-issued Confirmation has priority over younger Confirmation. Commitment Protection and `COMMITTED_OBLIGATION` are outside this priority pool.
_Avoid_: best-fit skipping, B2C-over-B2B priority, technical arrival order as FIFO.

**Commitment Protection** — Attempt-bound owner guarantee established for one exact Inventory Reservation immediately before Order commitment. Once established, the protected Quantity remains fenced from incompatible competing use until authoritative Order truth proves commit or proves non-commit plus closure of that Attempt; an unknown outcome keeps the fence.
_Avoid_: final read/check treated as protection, provisional Confirmation expiry treated as release of a protected commitment.

**COMMITTED_OBLIGATION** — Post-commit lifecycle meaning of the Inventory stock obligation for an Accepted Order. It continues to constrain its exact Stock Positions until explicit owner-governed transitions account for the remaining Quantity; old provisional expiry does not release it.

**AT_RISK** — Guarantee-health meaning stating that an obligation still exists but its promised physical guarantee cannot currently be owner-verifiably honored. `AT_RISK` is not release, revocation, cancellation, free stock, or proof that an Order did not commit.

**Imported Committed Obligation** — Migration-origin Inventory obligation bound directly to an already-proven imported Order and explicit source lineage, starting in committed meaning without claiming that an OntOS Order Commitment Attempt historically existed. Uncommitted legacy holds without a real Attempt are not converted into canonical provisional Reservations by inventing history.

## External stock evidence

**Inventory Source Assertion** — Provenance-backed claim from an External Business System about one Inventory fact, retaining issuer, exact correlated scope, fact meaning, Quantity/Unit, business time, and owner-defined ordering evidence. Technical arrival or parsing does not make it Current.

**Source Coverage Evidence** — Owner-verifiable evidence establishing whether an absolute ON_HAND assertion includes a particular authoritative physical stock effect, or establishing an owner revision boundary that makes that relationship unambiguous. When coverage of a material Stock Issue cannot be determined, Inventory must not guess whether the same physical effect is already reflected in ON_HAND.
_Avoid_: message arrival order as physical-effect coverage, subtracting an issue twice, assuming a delayed snapshot already includes an issue.

**Stock Correction** — High-risk Inventory Action establishing corrected absolute ON_HAND for one exact Stock Position only where the applicable authority contract permits Inventory to own that correction. It is not a generic inventory update and never overrides an external physical-stock System of Record.
