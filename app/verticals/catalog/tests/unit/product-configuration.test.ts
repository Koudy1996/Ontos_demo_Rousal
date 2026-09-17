import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  CatalogResourceRefSchema,
  CatalogRevisionNumberSchema,
} from '../../shared/domain/catalog-revision-reference.ts';
import {
  inspectConfigurationDefinition,
  inspectProductConfiguration,
  sameProductConfigurationSelection,
} from '../../shared/domain/product-configuration.ts';
import type {
  ProductConfiguration,
  ProductConfigurationDefinitionRevision,
} from '../../shared/domain/product-configuration.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import { VariantRefSchema } from '../../shared/resources/variant.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const makeRef = (resourceType: string, resourceId: string) =>
  Schema.decodeUnknownSync(CatalogResourceRefSchema)({
    moduleId: 'commerce.catalog',
    resourceId,
    resourceType,
    tenantId,
  });
const productRef = Schema.decodeUnknownSync(ProductRefSchema)(
  makeRef('commerce.catalog.product', '22222222-2222-4222-8222-222222222222'),
);
const whiteVariant = Schema.decodeUnknownSync(VariantRefSchema)(
  makeRef('commerce.catalog.variant', '33333333-3333-4333-8333-333333333333'),
);
const blackVariant = Schema.decodeUnknownSync(VariantRefSchema)(
  makeRef('commerce.catalog.variant', '44444444-4444-4444-8444-444444444444'),
);
const unitRef = makeRef('commerce.catalog.unit', '55555555-5555-4555-8555-555555555555');
const definitionRef = makeRef('commerce.catalog.configuration-definition', '66666666-6666-4666-8666-666666666666');
const definition: ProductConfigurationDefinitionRevision = {
  choices: [
    {
      choiceKey: 'mount',
      kind: 'SINGLE_CHOICE',
      meaning: 'Mounting component',
      options: [
        { label: 'A', meaning: 'Component A', optionKey: 'A' },
        { label: 'None', meaning: 'No mount', optionKey: 'none' },
      ],
      required: true,
    },
    { choiceKey: 'length', kind: 'MEASURED_VALUE', meaning: 'Cut length', required: true, unitRef },
    {
      choiceKey: 'finish',
      kind: 'SINGLE_CHOICE',
      meaning: 'Optional finish',
      options: [{ label: 'None', meaning: 'No finish', optionKey: 'none' }],
      required: false,
    },
  ],
  productRef,
  reference: {
    resourceRef: definitionRef,
    revision: Schema.decodeUnknownSync(CatalogRevisionNumberSchema)(1),
  },
};
const selected: ProductConfiguration = {
  definition: definition.reference,
  productRef,
  values: [
    { choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'A' },
    { amount: '83', choiceKey: 'length', kind: 'MEASURED_VALUE', unitRef },
  ],
  variantRef: whiteVariant,
};

describe('Product Configuration definition and identity', () => {
  it('supports only explicit Single Choice and exact Measured Value, including optional absence', () => {
    expect(inspectConfigurationDefinition(definition).status).toBe('VALID');
    expect(inspectProductConfiguration(selected, definition).status).toBe('VALID');
    expect(inspectProductConfiguration({ ...selected, values: selected.values.slice(1) }, definition).status).toBe(
      'INVALID',
    );
    expect(
      inspectProductConfiguration({ ...selected, values: [...selected.values, selected.values[0]] }, definition).status,
    ).toBe('INVALID');
    expect(
      inspectProductConfiguration(
        { ...selected, values: [...selected.values, { choiceKey: 'unknown', kind: 'SINGLE_CHOICE', optionKey: 'A' }] },
        definition,
      ).status,
    ).toBe('INVALID');
    const unavailable = new Map<string, ProductConfigurationDefinitionRevision>().get('missing');
    expect(inspectProductConfiguration(selected, unavailable).status).toBe('INDETERMINATE');
  });

  it('distinguishes exact targets and values, but ignores labels, order, and decimal spelling', () => {
    expect(
      sameProductConfigurationSelection(selected, { ...selected, variantRef: blackVariant }, definition),
    ).toMatchObject({ same: false, status: 'VALID' });
    expect(
      sameProductConfigurationSelection(
        selected,
        {
          ...selected,
          values: [selected.values[0], { amount: '84', choiceKey: 'length', kind: 'MEASURED_VALUE', unitRef }],
        },
        definition,
      ),
    ).toMatchObject({ same: false, status: 'VALID' });
    expect(
      sameProductConfigurationSelection(
        selected,
        {
          ...selected,
          values: [{ amount: '83.00', choiceKey: 'length', kind: 'MEASURED_VALUE', unitRef }, selected.values[0]],
        },
        definition,
      ),
    ).toMatchObject({ same: true, status: 'VALID' });
    expect(
      sameProductConfigurationSelection(
        selected,
        {
          ...selected,
          values: [...selected.values, { choiceKey: 'finish', kind: 'SINGLE_CHOICE', optionKey: 'none' }],
        },
        definition,
      ),
    ).toMatchObject({ same: false, status: 'VALID' });
  });

  it('does not infer equivalence from a changed Unit or an unavailable revision', () => {
    const millimeterRef = makeRef('commerce.catalog.unit', '77777777-7777-4777-8777-777777777777');
    expect(
      inspectProductConfiguration(
        {
          ...selected,
          values: [
            selected.values[0],
            { amount: '830', choiceKey: 'length', kind: 'MEASURED_VALUE', unitRef: millimeterRef },
          ],
        },
        definition,
      ).status,
    ).toBe('INDETERMINATE');
    expect(
      inspectProductConfiguration(
        {
          ...selected,
          definition: { ...definition.reference, revision: Schema.decodeUnknownSync(CatalogRevisionNumberSchema)(2) },
        },
        definition,
      ).status,
    ).toBe('INDETERMINATE');
  });
});
