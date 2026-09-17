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
});

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
    return refs.every((ref) => ref === undefined || ref.tenantId === tenantId)
      ? undefined
      : 'Selection references must share one Tenant';
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

/** Evidence is a point-in-time assessment, not a guarantee that it remains Current at Order commit. */
const assessmentFields = {
  assessedAt: CatalogRevisionInstantSchema,
  basis: Schema.Array(CatalogSelectionBasisSchema),
  selection: CatalogSelectionSchema,
  validUntil: Schema.optionalKey(CatalogRevisionInstantSchema),
};
export const CatalogSelectionValidEvidenceSchema = Schema.Struct({
  ...assessmentFields,
  status: Schema.Literal('VALID'),
});
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
});
