/* oxlint-disable effect-native/no-unbranded-identifier-schema, sonarjs/no-duplicate-string -- Catalog owns these opaque identifiers; this consumer preserves them without assigning local business meaning; tracked in: #333; remove-when: Catalog publishes branded quantity-selection refs. */
import { Effect, Schema } from 'effect';
import { OwnerVerifiableSetCompletenessEvidenceSchema } from '@app/shared-contracts';
import {
  CommerceQuantityBasisSchema,
  CustomerCommercePolicyTenantIdSchema,
  ExactPositiveCommerceQuantitySchema,
} from './customer-commerce-policy.ts';

const stableReference = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000), Schema.isTrimmed());

const CommerceQuantityCatalogSelectionRefSchema = Schema.Struct({
  moduleId: Schema.Literal('commerce.catalog'),
  resourceId: stableReference,
  resourceType: Schema.Literal('commerce.catalog.selection'),
  tenantId: CustomerCommercePolicyTenantIdSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });
const CatalogProductRefSchema = Schema.Struct({
  moduleId: Schema.Literal('commerce.catalog'),
  resourceId: stableReference,
  resourceType: Schema.Literal('commerce.catalog.product'),
  tenantId: CustomerCommercePolicyTenantIdSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });

const CatalogVariantRefSchema = Schema.Struct({
  moduleId: Schema.Literal('commerce.catalog'),
  resourceId: stableReference,
  resourceType: Schema.Literal('commerce.catalog.variant'),
  tenantId: CustomerCommercePolicyTenantIdSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });

const CatalogPackageOptionRefSchema = Schema.Struct({
  moduleId: Schema.Literal('commerce.catalog'),
  resourceId: stableReference,
  resourceType: Schema.Literal('commerce.catalog.package-option'),
  tenantId: CustomerCommercePolicyTenantIdSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });

/**
 * Exact Current Catalog facts consumed by quantity resolution. Every identity and revision is
 * issued by Catalog; Customer Context never traverses Catalog hierarchy or normalizes Quantity.
 */
const CurrentCommerceQuantityCatalogSelectionSchema = Schema.Struct({
  basis: CommerceQuantityBasisSchema,
  completeness: Schema.toEncoded(OwnerVerifiableSetCompletenessEvidenceSchema),
  configurationRevision: Schema.optionalKey(stableReference),
  equivalentSelectionKey: stableReference,
  hierarchyRevision: stableReference,
  normalizedQuantity: ExactPositiveCommerceQuantitySchema,
  ownerRevision: stableReference,
  packageOptionRef: Schema.optionalKey(CatalogPackageOptionRefSchema),
  physicalMultiple: ExactPositiveCommerceQuantitySchema,
  productRef: CatalogProductRefSchema,
  requestedQuantity: ExactPositiveCommerceQuantitySchema,
  selectionRef: CommerceQuantityCatalogSelectionRefSchema,
  setConstituentRevision: Schema.optionalKey(stableReference),
  variantRef: Schema.optionalKey(CatalogVariantRefSchema),
}).check(
  Schema.makeFilter((selection) => {
    const tenantIds = [
      selection.selectionRef.tenantId,
      selection.productRef.tenantId,
      selection.variantRef?.tenantId,
      selection.packageOptionRef?.tenantId,
      selection.basis.basisRef.tenantId,
      selection.basis.unitRef.tenantId,
    ].filter((tenantId): tenantId is string => tenantId !== undefined);
    return tenantIds.every((tenantId) => tenantId === selection.selectionRef.tenantId)
      ? undefined
      : 'Catalog selection, hierarchy, and Quantity basis must belong to one Tenant';
  }),
);
export type CurrentCommerceQuantityCatalogSelection = typeof CurrentCommerceQuantityCatalogSelectionSchema.Type;

export const CommerceQuantityCatalogLineRequestSchema = Schema.Struct({
  lineId: stableReference,
  requestedQuantity: ExactPositiveCommerceQuantitySchema,
  selectionRef: CommerceQuantityCatalogSelectionRefSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });
type CommerceQuantityCatalogLineRequest = typeof CommerceQuantityCatalogLineRequestSchema.Type;

export const CurrentCommerceQuantityCatalogLineSchema = Schema.Struct({
  lineId: stableReference,
  selection: CurrentCommerceQuantityCatalogSelectionSchema,
}).annotate({ parseOptions: { onExcessProperty: 'error' } });
export type CurrentCommerceQuantityCatalogLine = typeof CurrentCommerceQuantityCatalogLineSchema.Type;

export const CommerceQuantityCatalogUnavailableSchema = Schema.TaggedStruct('CommerceQuantityCatalogUnavailable', {
  code: Schema.Literals(['catalog_selection_unavailable', 'catalog_quantity_normalization_unavailable']),
  reason: Schema.String,
  retryable: Schema.Literal(true),
});
export type CommerceQuantityCatalogUnavailable = typeof CommerceQuantityCatalogUnavailableSchema.Type;

// oxlint-disable-next-line effect-native/require-context-service-for-service-interface -- The governed Read factory supplies this narrow Catalog owner port explicitly rather than through ambient Context.
export interface CommerceQuantityCatalogPortService {
  readonly resolveCurrentSelections: (input: {
    readonly lines: readonly CommerceQuantityCatalogLineRequest[];
    readonly observedAt: string;
    readonly tenantId: string;
  }) => Effect.Effect<readonly CurrentCommerceQuantityCatalogLine[], CommerceQuantityCatalogUnavailable>;
}

/** Production stays fail-closed until Catalog publishes and wires its owner-issued adapter. */
export const unavailableCommerceQuantityCatalogPort = (): CommerceQuantityCatalogPortService => ({
  resolveCurrentSelections: () =>
    Effect.fail({
      _tag: 'CommerceQuantityCatalogUnavailable',
      code: 'catalog_selection_unavailable',
      reason: 'The Current Catalog Selection and Quantity Normalization provider is not configured',
      retryable: true,
    }),
});
