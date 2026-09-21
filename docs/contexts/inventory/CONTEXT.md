# Inventory

Inventory defines canonical stock meaning, stock demand, Inventory-recognized stock obligations, and their authority boundaries. Detailed behavior and acceptance live in GitHub issues; durable trade-offs live in accepted ADRs.

## Stock model

**Stock Item** — Durable Inventory Resource representing exactly one immutable exact Catalog Selection meaning with one explicit stock Unit. A materially different exact Selection meaning uses a different Stock Item. Correcting a Catalog-to-Stock Binding never changes the intrinsic meaning of an existing Stock Item.
_Avoid_: Product, SKU, one Stock Item shared by materially different exact Catalog Selections, or redefining a Stock Item through relation correction.

**Stock Location** — Durable Inventory Resource identifying one explicit operational stock scope in which stock facts are interpreted.
_Avoid_: Storefront, postal address, pickup point, hostname, or legacy `store` label as identity.

**Stock Position** — Canonical constrained quantity scope for one Stock Item in one exact Stock Location. Launch has at most one Current Stock Position for the same Stock Item + Stock Location inside one Customer Configuration.
_Avoid_: Product-level stock bucket or duplicate Current Positions for one Item + Location constraint.

**ON_HAND** — Authoritative physical Quantity for one exact Stock Position according to its declared System of Record. It is not customer-facing Availability.

**RESERVED** — Derived Quantity constrained by Current provisional Inventory Reservation Allocations on one exact Stock Position. It is not an independently writable stock fact or a synonym for committed obligations.

**UNKNOWN** — Stock-fact state where the expected owner and scope are known but a Current numeric value cannot be established.

**MISSING** — Stock-fact state where no usable evidence exists for an expected fact and scope.

**STALE** — Stock-fact state where prior evidence exists but no longer qualifies as Current under its owner contract.

**INDETERMINATE** — Stock-fact state where relevant evidence exists but Current truth cannot be safely resolved.

**Stock Receipt** — Authoritative physical increase of one exact Stock Position for an explicit business reason.

**Stock Issue** — Authoritative physical decrease of one exact Stock Position for an explicit business reason.

**Stock Correction** — High-risk Inventory Action establishing corrected absolute ON_HAND for one exact Stock Position under the selected Inventory Backend's applicable authority contract.
_Avoid_: generic inventory update, local override of the selected System of Record, or backend switching.

## Stock demand and relations

**Catalog-to-Stock Binding** — Inventory-owned Current one-to-one relation between one exact Catalog Selection meaning and one compatible Stock Item carrying that same intrinsic meaning. The relation may be corrected without mutating either Stock Item identity; historical erroneous use remains explainable when the Current relation changes or ends.
_Avoid_: inference from Product, SKU, Package contents, Set components, source identifiers, availability, or redefining a Stock Item to repair a wrong relation.

**Stock Requirement** — Exact Inventory demand created for one purchase-demand occurrence, preserving its exact Catalog Selection provenance, one Stock Item, and unchanged requested Quantity + Unit. Separate purchase-demand occurrences remain separate Requirements even when they use the same Stock Item.

**Stock Allocation** — Assignment of all or part of one Stock Requirement Quantity to one Stock Position for the same Stock Item and Unit. One Requirement may use 1..N Allocations whose quantities cover that unchanged Requirement.
_Avoid_: substitution, remapping, or Unit conversion.

**External Stock Correlation** — Inventory-owned relation from one external key qualified by actual issuer/backend origin, namespace/scope, identifier kind, and external identifier value to exactly one corresponding Stock Item or Stock Location for the relevant Effective Period. Current backend selection determines whether evidence may establish Current truth; it does not rewrite historical external-key identity.
_Avoid_: similarity-based SKU/name/address matching, an external identifier treated as Inventory identity, or resolving delayed evidence through a replacement backend merely because that backend is Current.

**Stock Sharing Eligibility** — Inventory-owned positive Current relation between one exact Stock Position and a qualified commercial scope: required Selling Legal Entity + Channel, optionally restricted by Commerce Market and/or Storefront. At least one applicable Current relation establishes this eligibility; the relation is distinct from Principal Permission, Assortment, Availability, and Reservation guarantee.
_Avoid_: a durable Sales Context Resource, customer-specific stock selectors, or an ALLOW/DENY specificity resolver.

## Reservations and obligations

**Inventory Backend** — Exactly one configured stock/reservation backend selected for the whole Customer Configuration in Launch: either a customer-provided External Business System or the OntOS-provided WMS.
_Avoid_: per-Location backend selection, simultaneous authoritative backends, automatic fallback, or Integration Route as authority.

**Reservation Authority** — The selected Inventory Backend in its role as the owner capable of enforcing the exact Inventory Reservation and issuing authoritative Reservation evidence.
_Avoid_: Availability, Order Commitment Gate, Integration Route, provider adapter, or an unselected backend as issuer.

**Inventory Reservation** — Durable Inventory Resource for one exact Order Commitment Attempt representing its complete provisional stock obligation across all required Stock Requirements and 1..N Stock Allocations. After proven Order commit, the same underlying obligation identity continues in `COMMITTED_OBLIGATION` meaning rather than creating a second stock-obligation Resource.

**Reservation Confirmation** — The single Attempt-bound proof identity issued by the Reservation Authority that one exact Inventory Reservation is guaranteed within its declared validity interval. In Launch, that Confirmation identity is not renewed or replaced after pre-Protection expiry or definitive revocation.

**Reservation Release** — Explicit owner-governed transition ending the whole provisional Inventory Reservation after release safety is proven.
_Avoid_: Confirmation expiry, `AT_RISK`, or `REVOKED` treated as Release.

**Provisional Shortage Priority** — Launch priority for competing unprotected provisional Reservation Confirmations after a material shortage. Authoritative issuance establishes one stable oldest-first rank within the affected constrained scope; `AT_RISK`, `UNVERIFIABLE`, repeated evaluation, or owner-valid recovery of the same Confirmation identity do not reset that rank. Explicit lifecycle exit from the provisional priority pool is distinct from Reservation Release and does not by itself prove Quantity reusable.
_Avoid_: physical picking order, best-fit, Selling Legal Entity/Purchasing Subject priority, Current-health sorting, or technical arrival order.

**Commitment Protection** — The single Attempt-bound owner guarantee fencing the exact Inventory Reservation through Order commitment. It is established by the Reservation Authority while the Reservation Confirmation is valid and remains distinct from that Confirmation.

**COMMITTED_OBLIGATION** — Post-commit lifecycle meaning of the same underlying stock-obligation identity previously represented by the successful Inventory Reservation, now bound to the Accepted Order.
_Avoid_: a second parallel obligation created by commit.

**AT_RISK** — Guarantee-health meaning where an Inventory obligation still exists but its promised guarantee cannot currently be owner-verifiably honored.
_Avoid_: release, cancellation, or proof of non-commit.

**REVOKED** — Pre-Protection Reservation Confirmation state where the Reservation Authority explicitly terminates that exact Confirmation guarantee. Revocation is not Reservation Release.

**EXPIRED** — Reservation Confirmation state reached when its declared validity interval ends. Expiry is not Reservation Release and does not erase established Commitment Protection.

**UNVERIFIABLE** — Proof-health state where Current owner evidence is insufficient to establish the guarantee state.
_Avoid_: implicit revocation or release.

**Imported Committed Obligation** — Migration-origin Inventory obligation bound directly to an already-proven imported Order with explicit source lineage, starting in committed meaning without fabricating a historical OntOS Order Commitment Attempt.

## External stock evidence

**Inventory Source Assertion** — Provenance-backed stock claim retaining its actual issuer/backend origin, exact correlated scope, fact meaning, Quantity + Unit, business time, and owner-defined ordering evidence. In normal Current operation the selected External Business System is the authoritative external issuer; delayed pre-cutover evidence retains its original issuer and cannot establish post-cutover Current truth merely because it arrived later. Transport arrival does not make an assertion Current.

**Source Coverage Evidence** — Owner-verifiable evidence establishing whether an absolute ON_HAND assertion includes, excludes, or predates a separately known authoritative Stock Receipt or Stock Issue.
_Avoid_: message arrival order as coverage evidence or guessed/double-applied arithmetic.
