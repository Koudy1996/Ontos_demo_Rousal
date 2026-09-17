---
status: accepted
---

# Inventory demand is defined before Stock Position allocation

For Launch, one exact Catalog Selection + purchase Quantity + Stock Mapping Revision determines one Stock Basis and its Stock Requirements before any Stock Location or Stock Position is selected. We chose this over Location-specific mapping or alternative stock plans so physical demand remains stable, explainable, and independent of current availability; later Stock Allocation may choose one or more owner-valid Stock Positions but cannot remap the purchase to a different package/component/set basis merely because another Location has different stock.

## Considered Options

- Define Stock Basis before Location/Position allocation — accepted.
- Select Location first and let Location change Stock Basis — rejected because it makes demand depend on a prior sourcing decision and can create a mapping/allocation cycle.
- Return several alternative Stock Requirement plans and choose one by availability — rejected for Launch because it introduces a separate substitution/routing decision and makes Reservation evidence materially more complex.
