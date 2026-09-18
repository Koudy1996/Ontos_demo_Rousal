import { Schema } from 'effect';

import type { CatalogFactAdmission, CatalogFactScope } from './catalog-source-resolution.ts';

const boundedText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000), Schema.isTrimmed());
const positiveDecimal = Schema.String.check(Schema.isPattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u), Schema.isMaxLength(100));
const MeasurementSchema = Schema.Struct({ amount: positiveDecimal, unitId: Schema.String.check(Schema.isUUID()) });

export const CatalogAdmittedSourceFactKeySchema = Schema.Literals([
  'catalog.name',
  'catalog.factual-description',
  'catalog.dimension.height',
  'catalog.dimension.width',
  'catalog.dimension.depth',
  'catalog.weight.net',
  'catalog.weight.gross',
]);
export type CatalogAdmittedSourceFactKey = typeof CatalogAdmittedSourceFactKeySchema.Type;

interface CatalogFactAdmissionDefinition {
  readonly admission: CatalogFactAdmission;
  readonly factKey: CatalogAdmittedSourceFactKey;
  readonly targetKinds: readonly CatalogFactScope['targetKind'][];
  readonly valueSchema: Schema.Top;
}

/**
 * Closed fact admission registry for #481. Every admitted fact remains Catalog owned, but it may
 * accept an assertion from one separately verified external authority. Unknown and foreign-owner
 * fact families fail closed instead of becoming writable through a caller supplied key.
 */
export const catalogSourceFactAdmissions: readonly CatalogFactAdmissionDefinition[] = [
  {
    admission: {
      assertionAdmission: 'EXTERNAL_SOURCE',
      factOwnership: 'CATALOG_LOCAL',
      overridePermitted: true,
      overrideValueValid: true,
    },
    factKey: 'catalog.name',
    targetKinds: ['PRODUCT', 'VARIANT'],
    valueSchema: boundedText,
  },
  {
    admission: {
      assertionAdmission: 'EXTERNAL_SOURCE',
      factOwnership: 'CATALOG_LOCAL',
      overridePermitted: true,
      overrideValueValid: true,
    },
    factKey: 'catalog.factual-description',
    targetKinds: ['PRODUCT', 'VARIANT'],
    valueSchema: boundedText,
  },
  ...(
    [
      'catalog.dimension.height',
      'catalog.dimension.width',
      'catalog.dimension.depth',
      'catalog.weight.net',
      'catalog.weight.gross',
    ] as const
  ).map((factKey): CatalogFactAdmissionDefinition => ({
    admission: {
      assertionAdmission: 'EXTERNAL_SOURCE',
      factOwnership: 'CATALOG_LOCAL',
      overridePermitted: true,
      overrideValueValid: true,
    },
    factKey,
    targetKinds: ['PRODUCT', 'VARIANT', 'PACKAGE_DEFINITION'],
    valueSchema: MeasurementSchema,
  })),
];

export const catalogFactAdmissionForScope = (scope: CatalogFactScope): CatalogFactAdmissionDefinition | null =>
  catalogSourceFactAdmissions.find(
    (definition) => definition.factKey === scope.factKey && definition.targetKinds.includes(scope.targetKind),
  ) ?? null;

export const isCatalogSourceFactValueValid = (scope: CatalogFactScope, value: unknown): boolean => {
  const definition = catalogFactAdmissionForScope(scope);
  return definition !== null && Schema.is(definition.valueSchema)(value);
};
