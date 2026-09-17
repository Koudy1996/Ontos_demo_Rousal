import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  CatalogAcceptedSelectionEvidenceSchema,
  CatalogSelectionAssessmentResultSchema,
  CatalogSelectionEvidenceSchema,
  CatalogSelectionSchema,
  CatalogSelectionWithQuantitySchema,
  ProductSelectionRevisionSchema,
} from '../../shared/domain/catalog-selection-evidence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const ref = (resourceType: string, resourceId: string, scopedTenantId = tenantId) => ({
  moduleId: 'commerce.catalog' as const,
  resourceId,
  resourceType,
  tenantId: scopedTenantId,
});
const productRef = ref('commerce.catalog.product', '22222222-2222-4222-8222-222222222222');
const variantRef = ref('commerce.catalog.variant', '33333333-3333-4333-8333-333333333333');
const selection = { productRef, variantRef };
const instant = '2026-09-17T12:00:00.000Z';
const decodeSelection = Schema.decodeUnknownSync(CatalogSelectionSchema, { onExcessProperty: 'error' });
const decodeEvidence = Schema.decodeUnknownSync(CatalogSelectionEvidenceSchema, { onExcessProperty: 'error' });

describe('Catalog Selection decision references', () => {
  it('keeps exact Product and Variant identity without inventing a revision ID', () => {
    expect(decodeSelection(selection)).toMatchObject(selection);
    expect(
      Schema.decodeUnknownSync(ProductSelectionRevisionSchema)({ resourceRef: productRef, revision: 1 }),
    ).toMatchObject({
      resourceRef: productRef,
      revision: 1,
    });
    expect(() =>
      Schema.decodeUnknownSync(ProductSelectionRevisionSchema)({ resourceRef: variantRef, revision: 1 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProductSelectionRevisionSchema)({ resourceRef: productRef, revision: 'latest' }),
    ).toThrow();
    expect(() => decodeSelection({ productRef })).toThrow();
    expect(() =>
      decodeSelection({
        ...selection,
        variantRef: { ...variantRef, tenantId: '99999999-9999-4999-8999-999999999999' },
      }),
    ).toThrow();
  });

  it('pins package content and set composition without accepting a successor silently', () => {
    const packageRef = ref('commerce.catalog.package-definition', '44444444-4444-4444-8444-444444444444');
    const setRef = ref('commerce.catalog.set-composition', '55555555-5555-4555-8555-555555555555');
    const packedSet = {
      ...selection,
      packageOption: { contentRevision: { resourceRef: packageRef, revision: 1 }, optionRef: packageRef },
      setComposition: { resourceRef: setRef, revision: 1 },
    };
    expect(decodeSelection(packedSet)).toMatchObject(packedSet);
    expect(
      decodeSelection({
        ...packedSet,
        packageOption: { ...packedSet.packageOption, contentRevision: { resourceRef: packageRef, revision: 2 } },
      }),
    ).not.toEqual(decodeSelection(packedSet));
    expect(() =>
      decodeSelection({
        ...packedSet,
        packageOption: { contentRevision: { resourceRef: setRef, revision: 1 }, optionRef: packageRef },
      }),
    ).toThrow();
    expect(() =>
      decodeSelection({
        ...packedSet,
        setComposition: {
          resourceRef: ref(
            'commerce.catalog.set-composition',
            setRef.resourceId,
            '99999999-9999-4999-8999-999999999999',
          ),
          revision: 1,
        },
      }),
    ).toThrow();
  });

  it('keeps Configuration as a value and Quantity separate from package contents', () => {
    const definition = ref('commerce.catalog.configuration-definition', '66666666-6666-4666-8666-666666666666');
    const attribute = ref('commerce.catalog.attribute-definition', '77777777-7777-4777-8777-777777777777');
    const configured = {
      ...selection,
      configuration: {
        choices: [{ attributeDefinition: { resourceRef: attribute, revision: 3 }, choiceKey: 'length', value: '83' }],
        definition: { resourceRef: definition, revision: 1 },
      },
    };
    const line = {
      quantity: { amount: '2', unitRef: ref('commerce.catalog.unit', '88888888-8888-4888-8888-888888888888') },
      selection: configured,
    };
    expect(Schema.decodeUnknownSync(CatalogSelectionWithQuantitySchema)(line)).toMatchObject(line);
    expect(() => decodeSelection({ ...configured, configurationRef: definition })).toThrow();
  });

  it('distinguishes invalid, indeterminate, unavailable and historical accepted evidence', () => {
    const basis = [{ role: 'PRODUCT', source: { resourceRef: productRef, revision: 1 } }];
    expect(decodeEvidence({ assessedAt: instant, basis, selection, status: 'VALID' })).toMatchObject({
      status: 'VALID',
    });
    expect(
      decodeEvidence({ assessedAt: instant, basis, reason: 'Retired Variant', selection, status: 'INVALID' }),
    ).toMatchObject({ status: 'INVALID' });
    expect(
      decodeEvidence({ assessedAt: instant, basis, reason: 'Type unavailable', selection, status: 'INDETERMINATE' }),
    ).toMatchObject({ status: 'INDETERMINATE' });
    expect(
      Schema.decodeUnknownSync(CatalogSelectionAssessmentResultSchema)({
        kind: 'UNAVAILABLE',
        reason: 'Owner offline',
      }),
    ).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(() =>
      decodeEvidence({ assessedAt: instant, basis, kind: 'UNAVAILABLE', selection, status: 'VALID' }),
    ).toThrow();
    const accepted = {
      acceptedAt: instant,
      acceptedSelection: {
        quantity: { amount: '1', unitRef: ref('commerce.catalog.unit', '88888888-8888-4888-8888-888888888888') },
        selection,
      },
      basis,
      historical: true,
    };
    expect(Schema.decodeUnknownSync(CatalogAcceptedSelectionEvidenceSchema)(accepted)).toMatchObject(accepted);
    expect(() =>
      Schema.decodeUnknownSync(CatalogAcceptedSelectionEvidenceSchema)({ ...accepted, historical: false }),
    ).toThrow();
  });
});
