import { Schema } from 'effect';

import {
  CatalogResourceRefSchema,
  CatalogRevisionIdSchema,
  CatalogRevisionInstantSchema,
  CatalogRevisionNumberSchema,
} from './catalog-revision-reference.ts';
import { ProductRefSchema } from '../resources/product.ts';
import { VariantRefSchema } from '../resources/variant.ts';

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300), Schema.isTrimmed());
const choiceKeySchema = nonEmptyText.pipe(Schema.brand('CatalogConfigurationChoiceKey'));
const membershipAttestationIdSchema = nonEmptyText.pipe(Schema.brand('CatalogMembershipAttestationId'));

/** An owner-issued business revision; no revision ID is invented when the owner issues only a sequence. */
export const CatalogSelectionRevisionSchema = Schema.Struct({
  resourceRef: CatalogResourceRefSchema,
  revision: CatalogRevisionNumberSchema,
  revisionId: Schema.optionalKey(CatalogRevisionIdSchema),
});
export type CatalogSelectionRevision = typeof CatalogSelectionRevisionSchema.Type;

const revisionOf = (resourceType: string) =>
  CatalogSelectionRevisionSchema.check(
    Schema.makeFilter(({ resourceRef }) =>
      resourceRef.resourceType === resourceType ? undefined : `Expected ${resourceType} revision`,
    ),
  );

export const ProductSelectionRevisionSchema = revisionOf('commerce.catalog.product');
export const VariantSelectionRevisionSchema = revisionOf('commerce.catalog.variant');
export const ProductTypeSelectionRevisionSchema = revisionOf('commerce.catalog.product-type');
export const AttributeDefinitionSelectionRevisionSchema = revisionOf('commerce.catalog.attribute-definition');
export const PackageDefinitionSelectionRevisionSchema = revisionOf('commerce.catalog.package-definition');
export const ConfigurationDefinitionSelectionRevisionSchema = revisionOf('commerce.catalog.configuration-definition');
export const SetCompositionSelectionRevisionSchema = revisionOf('commerce.catalog.set-composition');

const sameResource = (
  left: { readonly resourceId: string; readonly tenantId: string },
  right: {
    readonly resourceId: string;
    readonly tenantId: string;
  },
) => left.tenantId === right.tenantId && left.resourceId === right.resourceId;
const sameRef = (
  left: {
    readonly moduleId: string;
    readonly resourceId: string;
    readonly resourceType: string;
    readonly tenantId: string;
  },
  right: {
    readonly moduleId: string;
    readonly resourceId: string;
    readonly resourceType: string;
    readonly tenantId: string;
  },
) => left.moduleId === right.moduleId && left.resourceType === right.resourceType && sameResource(left, right);

/** A configuration is a complete value for one exact target, not a Configuration Resource. */
export const ProductConfigurationSelectionSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      attributeDefinition: AttributeDefinitionSelectionRevisionSchema,
      choiceKey: choiceKeySchema,
      unit: Schema.optionalKey(CatalogSelectionRevisionSchema),
      value: nonEmptyText,
    }),
  ),
  definition: ConfigurationDefinitionSelectionRevisionSchema,
  productRef: ProductRefSchema,
  variantRef: VariantRefSchema,
}).check(
  Schema.makeFilter(({ choices }) =>
    new Set(choices.map(({ choiceKey }) => choiceKey)).size === choices.length
      ? undefined
      : 'Configuration choice keys must be unique',
  ),
);

/** Package quantity remains distinct from purchase-line Quantity. */
export const CatalogPackageOptionSelectionSchema = Schema.Struct({
  contentRevision: PackageDefinitionSelectionRevisionSchema,
  optionRef: CatalogResourceRefSchema,
}).check(
  Schema.makeFilter(({ contentRevision, optionRef }) =>
    optionRef.resourceType === 'commerce.catalog.package-definition' &&
    sameResource(optionRef, contentRevision.resourceRef)
      ? undefined
      : 'Package Option must identify its exact Package Definition content revision',
  ),
);

/** Immutable requested product meaning. Parentage and completeness still require owner validation. */
export const CatalogSelectionSchema = Schema.Struct({
  configuration: Schema.optionalKey(ProductConfigurationSelectionSchema),
  packageOption: Schema.optionalKey(CatalogPackageOptionSelectionSchema),
  productRef: ProductRefSchema,
  setComposition: Schema.optionalKey(SetCompositionSelectionRevisionSchema),
  variantRef: VariantRefSchema,
}).check(
  Schema.makeFilter((selection) => {
    const { tenantId } = selection.productRef;
    const refs = [
      selection.variantRef,
      selection.packageOption?.optionRef,
      selection.configuration?.definition.resourceRef,
      selection.setComposition?.resourceRef,
      ...(selection.configuration?.choices.flatMap((choice) => [
        choice.attributeDefinition.resourceRef,
        choice.unit?.resourceRef,
      ]) ?? []),
    ];
    if (!refs.every((ref) => ref === undefined || ref.tenantId === tenantId)) {
      return 'Selection references must share one Tenant';
    }
    const { configuration } = selection;
    return configuration === undefined ||
      (sameRef(configuration.productRef, selection.productRef) &&
        sameRef(configuration.variantRef, selection.variantRef))
      ? undefined
      : 'Configuration must target the exact selected Product and Variant';
  }),
);
export type CatalogSelection = typeof CatalogSelectionSchema.Type;

/** A line's Quantity is separate from its selected product meaning and package contents. */
export const CatalogSelectionWithQuantitySchema = Schema.Struct({
  quantity: Schema.Struct({ amount: nonEmptyText, unitRef: CatalogResourceRefSchema }),
  selection: CatalogSelectionSchema,
}).check(
  Schema.makeFilter(({ quantity, selection }) =>
    quantity.unitRef.tenantId === selection.productRef.tenantId
      ? undefined
      : 'Quantity must share the Selection Tenant',
  ),
);

export const CatalogSelectionBasisSchema = Schema.Struct({
  role: Schema.Literals([
    'PRODUCT',
    'VARIANT',
    'PRODUCT_TYPE',
    'ATTRIBUTE_DEFINITION',
    'INHERITED_VALUE',
    'VARIANT_AXIS',
    'CONFIGURATION_DEFINITION',
    'UNIT',
    'PACKAGE_CONTENT',
    'SET_COMPOSITION',
    'COMPONENT',
    'CATEGORY',
    'OTHER_CATALOG_FACT',
  ]),
  source: CatalogSelectionRevisionSchema,
});

/** Owner-issued membership evidence binds a Variant revision to its Product without changing the request. */
export const CatalogSelectionMembershipSchema = Schema.Struct({
  attestationId: membershipAttestationIdSchema,
  observedAt: CatalogRevisionInstantSchema,
  productRef: ProductRefSchema,
  source: Schema.Literal('CATALOG_OWNER_CURRENT_READ'),
  variant: VariantSelectionRevisionSchema,
}).check(
  Schema.makeFilter(({ productRef, variant }) =>
    productRef.tenantId === variant.resourceRef.tenantId
      ? undefined
      : 'Variant membership must share the Product Tenant',
  ),
);
export type CatalogSelectionMembership = typeof CatalogSelectionMembershipSchema.Type;

/** Evidence is a point-in-time assessment, not a guarantee that it remains Current at Order commit. */
const assessmentFields = {
  assessedAt: CatalogRevisionInstantSchema,
  basis: Schema.Array(CatalogSelectionBasisSchema),
  purpose: nonEmptyText,
  selection: CatalogSelectionSchema,
  validUntil: Schema.optionalKey(CatalogRevisionInstantSchema),
};
export const CatalogSelectionValidEvidenceSchema = Schema.Struct({
  ...assessmentFields,
  membership: CatalogSelectionMembershipSchema,
  status: Schema.Literal('VALID'),
}).check(
  Schema.makeFilter(({ assessedAt, basis, membership, selection, validUntil }) =>
    sameRef(membership.productRef, selection.productRef) &&
    sameRef(membership.variant.resourceRef, selection.variantRef) &&
    membership.observedAt === assessedAt &&
    (validUntil === undefined || validUntil > assessedAt) &&
    basis.every(({ source }) => source.resourceRef.tenantId === selection.productRef.tenantId) &&
    basis.some(({ role, source }) => role === 'PRODUCT' && sameRef(source.resourceRef, selection.productRef)) &&
    basis.some(
      ({ role, source }) =>
        role === 'VARIANT' &&
        sameRef(source.resourceRef, membership.variant.resourceRef) &&
        source.revision === membership.variant.revision &&
        source.revisionId === membership.variant.revisionId,
    )
      ? undefined
      : 'VALID evidence requires the exact Product–Variant membership and Variant source revision',
  ),
);
export const CatalogSelectionInvalidEvidenceSchema = Schema.Struct({
  ...assessmentFields,
  reason: nonEmptyText,
  status: Schema.Literal('INVALID'),
});
export const CatalogSelectionIndeterminateEvidenceSchema = Schema.Struct({
  ...assessmentFields,
  reason: nonEmptyText,
  status: Schema.Literal('INDETERMINATE'),
});
export const CatalogSelectionEvidenceSchema = Schema.Union([
  CatalogSelectionValidEvidenceSchema,
  CatalogSelectionInvalidEvidenceSchema,
  CatalogSelectionIndeterminateEvidenceSchema,
]);
export type CatalogSelectionEvidence = typeof CatalogSelectionEvidenceSchema.Type;

/** Operational outcomes cannot be disguised as a product-rule decision. */
export const CatalogSelectionAssessmentResultSchema = Schema.Union([
  CatalogSelectionEvidenceSchema,
  Schema.Struct({ kind: Schema.Literal('NOT_FOUND'), requested: CatalogSelectionSchema }),
  Schema.Struct({ kind: Schema.Literal('PERMISSION_DENIED') }),
  Schema.Struct({ kind: Schema.Literal('CONFLICT'), reason: nonEmptyText }),
  Schema.Struct({ kind: Schema.Literal('UNAVAILABLE'), reason: nonEmptyText }),
]);

/** Accepted Order evidence is historical; it is never a Current validation result. */
export const CatalogAcceptedSelectionEvidenceSchema = Schema.Struct({
  acceptedAt: CatalogRevisionInstantSchema,
  acceptedSelection: CatalogSelectionWithQuantitySchema,
  basis: Schema.Array(CatalogSelectionBasisSchema),
  historical: Schema.Literal(true),
  purpose: nonEmptyText,
});
