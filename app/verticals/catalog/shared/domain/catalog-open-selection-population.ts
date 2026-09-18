/* eslint-disable effect-native/require-context-service-for-service-interface -- This structural port is injected by the Catalog composition boundary rather than a global Context service; owner: #479; tracking: #398; remove when the Cart open-selection owner contract is provisioned as a Core service. expires: 2027-03-31. */
import type { Effect } from 'effect';
import { Schema } from 'effect';

import { CatalogRevisionInstantSchema } from './catalog-revision-reference.ts';
import type { CatalogSelectionOwnerAssessmentResult } from './catalog-selection-owner-contract.ts';
import type { CatalogSelectionPurpose } from './catalog-selection-purpose.ts';
import { CatalogSelectionSchema } from './catalog-selection-evidence.ts';
import type { CatalogSelection } from './catalog-selection-evidence.ts';

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300), Schema.isTrimmed());
const cartSelectionIdSchema = nonEmptyText.pipe(Schema.brand('CartOpenSelectionId'));

/**
 * One open selection as declared by its owning Cart. `selectionId` is the Cart-issued durable
 * identity; `selection` is the exact Catalog Selection the Cart is holding open. Catalog never
 * derives either from its own rows.
 */
export const CartOpenSelectionReferenceSchema = Schema.Struct({
  selection: CatalogSelectionSchema,
  selectionId: cartSelectionIdSchema,
});
export type CartOpenSelectionReference = typeof CartOpenSelectionReferenceSchema.Type;

/**
 * The Cart owner's attestation that this is the complete durable open-selection population for
 * the Tenant at `observedAt`. Catalog treats an absent, failing, or partial population as a typed
 * unavailable outcome and never manufactures an empty population from DRAFT/WIP/unavailable data.
 */
export const CartOpenSelectionPopulationEvidenceSchema = Schema.Struct({
  complete: Schema.Literal(true),
  observedAt: CatalogRevisionInstantSchema,
  revisionToken: nonEmptyText,
  selections: Schema.Array(CartOpenSelectionReferenceSchema),
});
export type CartOpenSelectionPopulationEvidence = typeof CartOpenSelectionPopulationEvidenceSchema.Type;

/** Typed "Catalog does not own this fact" outcome for the Cart open-selection population. */
export class CartOpenSelectionPopulationUnavailable extends Schema.TaggedError<CartOpenSelectionPopulationUnavailable>()(
  'CartOpenSelectionPopulationUnavailable',
  { code: Schema.Literal('cart_open_selection_population_unavailable'), reason: Schema.String },
) {}

/**
 * Injected owner contract. The port is built at the composition boundary from Cart's own durable
 * source; Catalog never imports Cart's private tables, registration, or executable behavior. An
 * absent port or a failing read is a typed unavailable outcome, never an empty population.
 */
export interface CartOpenSelectionPopulationPort {
  readonly read: Effect.Effect<CartOpenSelectionPopulationEvidence, CartOpenSelectionPopulationUnavailable>;
}

/**
 * Catalog's own #479 evidence reader. It is the Catalog-owned half of any open-selection
 * decision: the exact-selection Current assessment. Foreign owner facts still enter only through
 * their own injected ports.
 */
export interface CatalogSelectionEvidenceReader {
  readonly assess: (input: {
    readonly purpose: CatalogSelectionPurpose;
    readonly selection: CatalogSelection;
  }) => Effect.Effect<{ readonly evidence: CatalogSelectionOwnerAssessmentResult }>;
}

/** A selection references the exact Product when owner, Resource, and Tenant all match. */
export const openSelectionReferencesProduct = (
  selection: CatalogSelection,
  product: { readonly resourceId: string; readonly tenantId: string },
): boolean =>
  selection.productRef.moduleId === 'commerce.catalog' &&
  selection.productRef.tenantId === product.tenantId &&
  selection.productRef.resourceId === product.resourceId;
