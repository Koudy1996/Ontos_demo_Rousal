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
        productRef,
        variantRef,
      },
    };
    const line = {
      quantity: { amount: '2', unitRef: ref('commerce.catalog.unit', '88888888-8888-4888-8888-888888888888') },
      selection: configured,
    };
    expect(Schema.decodeUnknownSync(CatalogSelectionWithQuantitySchema)(line)).toMatchObject(line);
    expect(() => decodeSelection({ ...configured, configurationRef: definition })).toThrow();
    expect(() =>
      decodeSelection({
        ...configured,
        configuration: {
          ...configured.configuration,
          variantRef: ref('commerce.catalog.variant', '99999999-9999-4999-8999-999999999999'),
        },
      }),
    ).toThrow();
    expect(
      decodeSelection({
        ...configured,
        configuration: {
          ...configured.configuration,
          choices: [{ choiceKey: 'length', unit: { resourceRef: line.quantity.unitRef, revision: 4 }, value: '83' }],
        },
      }),
    ).toBeDefined();
    expect(() =>
      decodeSelection({
        ...configured,
        configuration: {
          ...configured.configuration,
          choices: [{ choiceKey: 'length', unit: { resourceRef: definition, revision: 4 }, value: '83' }],
        },
      }),
    ).toThrow();
    expect(() =>
      decodeSelection({
        ...configured,
        configuration: {
          ...configured.configuration,
          choices: [...configured.configuration.choices, ...configured.configuration.choices],
        },
      }),
    ).toThrow();
  });

  it('distinguishes invalid, indeterminate, unavailable and historical accepted evidence', () => {
    const membership = {
      attestationId: 'catalog-membership-1',
      observedAt: instant,
      productRef,
      source: 'CATALOG_OWNER_CURRENT_READ',
      variant: { resourceRef: variantRef, revision: 2 },
    };
    const basis = [
      { role: 'PRODUCT', source: { resourceRef: productRef, revision: 1 } },
      { role: 'VARIANT', source: membership.variant },
    ];
    const purpose = 'PURCHASE_ACCEPTANCE';
    expect(
      decodeEvidence({ assessedAt: instant, basis, membership, purpose, selection, status: 'VALID' }),
    ).toMatchObject({
      status: 'VALID',
    });
    expect(() => decodeEvidence({ assessedAt: instant, basis, purpose, selection, status: 'VALID' })).toThrow();
    expect(() =>
      decodeEvidence({
        assessedAt: instant,
        basis,
        membership: { ...membership, observedAt: '2026-09-16T12:00:00.000Z' },
        purpose,
        selection,
        status: 'VALID',
      }),
    ).toThrow();
    expect(() =>
      decodeEvidence({
        assessedAt: instant,
        basis,
        membership: { ...membership, variant: { resourceRef: variantRef, revision: 3 } },
        purpose,
        selection,
        status: 'VALID',
      }),
    ).toThrow();
    expect(
      decodeEvidence({ assessedAt: instant, basis, purpose, reason: 'Retired Variant', selection, status: 'INVALID' }),
    ).toMatchObject({ status: 'INVALID' });
    expect(
      decodeEvidence({
        assessedAt: instant,
        basis,
        purpose,
        reason: 'Type unavailable',
        selection,
        status: 'INDETERMINATE',
      }),
    ).toMatchObject({ status: 'INDETERMINATE' });
    expect(
      Schema.decodeUnknownSync(CatalogSelectionAssessmentResultSchema)({
        kind: 'UNAVAILABLE',
        reason: 'Owner offline',
      }),
    ).toMatchObject({ kind: 'UNAVAILABLE' });
    expect(() =>
      decodeEvidence({
        assessedAt: instant,
        basis,
        kind: 'UNAVAILABLE',
        membership,
        purpose,
        selection,
        status: 'VALID',
      }),
    ).toThrow();
    const accepted = {
      acceptedAt: instant,
      acceptedSelection: {
        quantity: { amount: '1', unitRef: ref('commerce.catalog.unit', '88888888-8888-4888-8888-888888888888') },
        selection,
      },
      basis,
      historical: true,
      purpose,
    };
    expect(Schema.decodeUnknownSync(CatalogAcceptedSelectionEvidenceSchema)(accepted)).toMatchObject(accepted);
    expect(() =>
      Schema.decodeUnknownSync(CatalogAcceptedSelectionEvidenceSchema)({ ...accepted, historical: false }),
    ).toThrow();
  });

  it('rejects VALID evidence missing a pinned package, set, or configuration source', () => {
    const packageRef = ref('commerce.catalog.package-definition', '44444444-4444-4444-8444-444444444444');
    const setRef = ref('commerce.catalog.set-composition', '55555555-5555-4555-8555-555555555555');
    const definitionRef = ref('commerce.catalog.configuration-definition', '66666666-6666-4666-8666-666666666666');
    const attributeRef = ref('commerce.catalog.attribute-definition', '77777777-7777-4777-8777-777777777777');
    const unitRef = ref('commerce.catalog.unit', '88888888-8888-4888-8888-888888888888');
    const contentRevision = { resourceRef: packageRef, revision: 4 };
    const setComposition = { resourceRef: setRef, revision: 3 };
    const definition = { resourceRef: definitionRef, revision: 2 };
    const attributeDefinition = { resourceRef: attributeRef, revision: 5 };
    const unit = { resourceRef: unitRef, revision: 1 };
    const membership = {
      attestationId: 'catalog-membership-2',
      observedAt: instant,
      productRef,
      source: 'CATALOG_OWNER_CURRENT_READ',
      variant: { resourceRef: variantRef, revision: 2 },
    };
    const configuredPackedSet = {
      ...selection,
      configuration: {
        choices: [{ attributeDefinition, choiceKey: 'length', unit, value: '83' }],
        definition,
        productRef,
        variantRef,
      },
      packageOption: { contentRevision, optionRef: packageRef },
      setComposition,
    };
    const directBasis = [
      { role: 'PRODUCT', source: { resourceRef: productRef, revision: 1 } },
      { role: 'VARIANT', source: membership.variant },
    ];
    const requiredBasis = [
      { role: 'PACKAGE_CONTENT', source: contentRevision },
      { role: 'SET_COMPOSITION', source: setComposition },
      { role: 'CONFIGURATION_DEFINITION', source: definition },
      { role: 'ATTRIBUTE_DEFINITION', source: attributeDefinition },
      { role: 'UNIT', source: unit },
    ];
    const evidence = {
      assessedAt: instant,
      basis: [...directBasis, ...requiredBasis],
      membership,
      purpose: 'PURCHASE_ACCEPTANCE',
      selection: configuredPackedSet,
      status: 'VALID',
    };
    expect(decodeEvidence(evidence)).toMatchObject(evidence);
    const choiceWithoutAttribute = {
      ...configuredPackedSet,
      configuration: {
        ...configuredPackedSet.configuration,
        choices: [{ choiceKey: 'length', unit, value: '83' }],
      },
    };
    expect(
      decodeEvidence({
        ...evidence,
        basis: evidence.basis.filter((entry) => entry.role !== 'ATTRIBUTE_DEFINITION'),
        selection: choiceWithoutAttribute,
      }),
    ).toBeDefined();
    for (const omitted of requiredBasis) {
      expect(() =>
        decodeEvidence({ ...evidence, basis: evidence.basis.filter((entry) => entry !== omitted) }),
      ).toThrow();
    }
    expect(() =>
      decodeEvidence({
        ...evidence,
        basis: [
          ...directBasis,
          ...requiredBasis.map((entry) =>
            entry.role === 'PACKAGE_CONTENT' ? { ...entry, source: { resourceRef: packageRef, revision: 5 } } : entry,
          ),
        ],
      }),
    ).toThrow();
  });
});
