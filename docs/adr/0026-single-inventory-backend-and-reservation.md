---
status: accepted
---

# One configured Inventory Backend and one Inventory Reservation per Order Commitment Attempt

For Launch, one Customer Configuration / Inventory operating scope selects exactly one **Inventory Backend** for stock and Reservation enforcement.

The selected backend is exactly one of:

- a customer-provided External Business System, for example an ERP such as ABRA, accessed through its supported API / Integration Route; or
- the OntOS-provided WMS for a customer that does not use its own supported stock/reservation system.

The two modes are alternatives. A Launch deployment does not compose an external ERP and the OntOS-provided WMS as simultaneous authoritative stock/reservation backends.

Inventory remains the public OntOS boundary and preserves provider-neutral Stock Item, Stock Position, Stock Requirement, Stock Allocation, Reservation, evidence and recovery semantics. The selected Inventory Backend remains the actual System of Record for the stock facts it owns and the actual Reservation Authority for the supported Reservation lifecycle.

## Reservation cardinality

One exact Order Commitment Attempt has exactly one normal-runtime Inventory Reservation.

That Reservation may contain 1..N Stock Allocations across supported Stock Positions/Locations, but every Allocation is enforced through the same selected Inventory Backend / Reservation Authority. One Stock Requirement may still be split across several Stock Positions as long as Stock Item and Unit remain unchanged.

The Reservation is successful only when it covers every required Stock Requirement in the exact requested Quantity + Unit.

Immediately before Order commitment, the selected Reservation Authority establishes one Attempt-bound Commitment Protection for that Reservation.

Proven Order commit converts that Reservation into one corresponding `COMMITTED_OBLIGATION`. Proven non-commit plus definitive Attempt closure permits safe whole-Reservation release.

## External-backend rule

If a customer keeps its own External Business System, OntOS talks to that system directly through the supported owner contract/API. The existence of an OntOS-provided WMS product does not insert that WMS between the external system and Inventory.

If the selected external backend cannot provide the Reservation guarantee required by the standard Launch purchase contract, that scope cannot report successful guaranteed Reservation. Inventory does not silently fall back to another backend or to a local synthetic hold.

## Cutover rule

Changing the selected Inventory Backend is a migration/cutover decision, not ordinary runtime composition.

Before the cutover boundary, the pre-cutover backend is authoritative for the declared scope. From the cutover boundary onward, the post-cutover backend is authoritative. Both may exist technically during migration work, but they are never simultaneously active canonical stock/reservation backends for the same Customer Configuration / Inventory operating scope.

Late or indeterminate effects from the pre-cutover backend remain migration/reconciliation debt and never create a dual-authority steady state.

## Considered options

- Select exactly one Inventory Backend and use one Reservation per Attempt — **accepted** because this matches the supported product modes: customer-owned external stock/reservation system or OntOS-provided WMS.
- Compose an external ERP for physical stock with a different WMS/Inventory authority for Reservations in one Launch deployment — rejected because this is not a supported product mode.
- Allow one Attempt to span multiple Reservation Authorities — rejected because the required mixed-backend runtime does not exist in the supported Launch model.
- Automatically fall back from an unavailable external backend to the OntOS-provided WMS — rejected because changing backend authority is an explicit migration/configuration decision, not an outage fallback.

## Consequences

There is no active `Attempt Reservation Coverage` aggregate, member-Reservation partition, cross-authority Confirmation, cross-authority Commitment Protection, or cross-authority FIFO problem in Launch.

Provider-specific mechanics remain private. Inventory contracts continue to distinguish Current evidence, Reservation proof health, Commitment Protection, idempotent recovery, safe Release, committed obligation and migration provenance.
