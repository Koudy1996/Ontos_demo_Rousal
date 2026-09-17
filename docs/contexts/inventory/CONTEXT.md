# Inventory language

Inventory owns canonical stock meaning and Inventory-recognized stock obligations within explicit authority boundaries. This context extends the shared OntOS and Commerce language and owns Inventory-specific vocabulary; it does not prescribe storage, transport, locking, provider APIs, or other implementation mechanics.

For Inventory-specific terms, this context together with Accepted Inventory ADRs is the specialization authority. If an older Commerce glossary shorthand conflicts with an Inventory definition here, use this Inventory definition and the Accepted ADR; do not preserve the older shorthand as a second valid meaning.

## Stock model

**Stock Item** — Inventory Resource identifying one stock-bearing subject whose units are interchangeable for the same Inventory stock requirement. Product, Variant, SKU, display name, or external identifier is not Stock Item identity.
_Avoid_: Product as stock identity, SKU as stock identity, source item code as canonical identity.

**Stock Location** — Durable Inventory Resource identifying one explicit operational stock scope in which stock facts are interpreted. It is not a Storefront, postal address, pickup point, hostname, or legacy `store` label.

**Stock Position** — Canonical constrained quantity scope for one Stock Item in one exact Inventory stock scope/location. Reservation contention and quantity guarantees bind to Stock Positions rather than Product, SKU, Channel, or seller similarity.
_Avoid_: warehouse name alone as reservation scope, Product-level stock bucket.

**ON_HAND** — Authoritative physical Quantity currently attributed to one exact Stock Position by its declared System of Record. It is not customer-facing Availability and is not automatically reduced by Inventory-recognized Reservations.

**RESERVED** — Quantity currently constrained by Inventory-recognized Reservation obligations for one exact Stock Position. It describes Inventory obligation meaning; by itself it does not prove that an external physical-stock owner enforces the hold.

## Stock demand and mapping

**Stock Requirement** — Exact Inventory-owned physical demand derived from one exact Catalog Selection and purchase Quantity under one Stock Mapping Revision. It identifies the required Stock Item, Quantity/Unit, provenance, and every physical-feasibility constraint needed to decide whether an allocation truly satisfies the demand.

**Stock Requirement Feasibility** — Business meaning that determines whether Quantity arithmetic alone is sufficient to satisfy one Stock Requirement. Additively divisible demand may be satisfied by compatible summed allocations; indivisible, contiguous, single-source, or otherwise constrained demand requires owner-valid evidence that the proposed physical allocation is actually realizable.
_Avoid_: assuming equal total Quantity always means physical fulfillability, inferring contiguity from aggregate ON_HAND.

**Stock Mapping Revision** — Immutable Inventory-owned evidence of how one exact Catalog Selection and purchase Quantity were translated into Stock Requirements. Later mapping changes do not reinterpret an existing Reservation, Commitment Protection, or Accepted Order history.

## Reservations and commitment

**Inventory Reservation** — Durable Inventory Resource representing one exact stock obligation. Normal runtime provisional Reservations are bound to one exact Order Commitment Attempt; a migration-origin obligation may start directly in committed meaning only when it is bound to an already-proven imported Order and preserves explicit source lineage rather than fabricating a historical Attempt.
_Avoid_: Cart line as Reservation identity, synthetic Order Commitment Attempt created only to satisfy migration shape.

**Reservation Authority** — Owner capable of enforcing one exact Reservation obligation in the applicable scope and therefore of issuing authoritative Reservation evidence. It may be Inventory, an External Business System, or absent; Availability, an Integration Route, or a provider adapter does not gain this authority merely by consuming or transporting evidence.

**Reservation Confirmation** — Attempt-bound owner proof issued by the actual Reservation Authority that one exact provisional Inventory Reservation is currently guaranteed under its declared validity boundary. It is not issued by Availability merely because Availability owns the customer-facing promise, and it is not part of the pre-attempt Order Acceptance Decision Bundle.
_Avoid_: `Inventory/Availability-owner-issued`, local `RESERVED` bookkeeping treated as physical guarantee.

**Commitment Protection** — Attempt-bound owner guarantee established for one exact Inventory Reservation immediately before Order commitment. Once established, the protected Quantity remains fenced from incompatible competing use until authoritative Order truth proves commit or proves non-commit plus closure of that Attempt; an unknown outcome keeps the fence.
_Avoid_: final read/check treated as protection, provisional Confirmation expiry treated as release of a protected commitment.

**COMMITTED_OBLIGATION** — Post-commit lifecycle meaning of the Inventory stock obligation for an Accepted Order. It continues to constrain its exact Stock Positions until explicit owner-governed transitions account for the remaining Quantity; old provisional expiry does not release it.

**AT_RISK** — Guarantee-health meaning stating that an obligation still exists but its promised physical guarantee cannot currently be owner-verifiably honored. `AT_RISK` is not release, cancellation, free stock, or proof that an Order did not commit.

**Imported Committed Obligation** — Migration-origin Inventory obligation bound directly to an already-proven imported Order and explicit source lineage, starting in committed meaning without claiming that an OntOS Order Commitment Attempt historically existed. Uncommitted legacy holds without a real Attempt are not converted into canonical provisional Reservations by inventing history.

## External stock evidence

**Inventory Source Assertion** — Provenance-backed claim from an External Business System about one Inventory fact, retaining issuer, exact correlated scope, fact meaning, Quantity/Unit, business time, and owner-defined ordering evidence. Technical arrival or parsing does not make it Current.

**Source Coverage Evidence** — Owner-verifiable evidence establishing whether an absolute ON_HAND assertion includes a particular authoritative physical stock effect, or establishing an owner revision boundary that makes that relationship unambiguous. When coverage of a material Stock Issue cannot be determined, Inventory must not guess whether the same physical effect is already reflected in ON_HAND.
_Avoid_: message arrival order as physical-effect coverage, subtracting an issue twice, assuming a delayed snapshot already includes an issue.

**Stock Correction** — High-risk Inventory Action establishing corrected absolute ON_HAND for one exact Stock Position only where the applicable authority contract permits Inventory to own that correction. It is not a generic inventory update and never overrides an external physical-stock System of Record.
