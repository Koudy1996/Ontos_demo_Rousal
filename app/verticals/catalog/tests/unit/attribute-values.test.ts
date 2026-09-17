import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  AttributeDefinitionSchema,
  AttributeValueSchema,
  validateAttributeValues,
} from '../../shared/domain/attribute-values.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const ref = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
} as const;
const definition = Schema.decodeUnknownSync(AttributeDefinitionSchema)({
  ref,
  label: 'Width',
  meaning: 'Width of the product itself',
  levels: ['PRODUCT', 'VARIANT'],
  multiplicity: 'SINGLE',
  valueKind: 'MEASUREMENT',
  specialStates: ['UNKNOWN'],
  measurement: { quantity: 'length', canonicalUnit: 'mm', minimum: 0, maximum: 1000, decimalPlaces: 2 },
});
const centimeters = [{ from: 'cm', to: 'mm', quantity: 'length', numerator: 10, denominator: 1 }] as const;

describe('Attribute Definition and per-subject values', () => {
  it('keeps identity distinct from label and measured meaning', () => {
    expect(Schema.is(AttributeDefinitionSchema)({ ...definition, label: 'Product width' })).toBe(true);
    expect(Schema.is(AttributeDefinitionSchema)({ ...definition, measurement: undefined })).toBe(false);
    expect(Schema.is(AttributeDefinitionSchema)({ ...definition, levels: [] })).toBe(false);
  });

  it('normalizes evidenced compatible units without silently changing magnitude', () => {
    expect(validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 8, unit: 'cm' }], centimeters)).toEqual({
      valid: true,
      normalized: [{ kind: 'MEASUREMENT', amount: 80, unit: 'mm' }],
      reasons: [],
    });
    expect(
      validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 80, unit: 'cm' }], centimeters).normalized,
    ).toEqual([{ kind: 'MEASUREMENT', amount: 800, unit: 'mm' }]);
    expect(validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 8, unit: 'cm' }]).valid).toBe(false);
    expect(
      validateAttributeValues(
        definition,
        [{ kind: 'MEASUREMENT', amount: 8, unit: 'cm' }],
        [{ ...centimeters[0], quantity: 'mass' }],
      ).valid,
    ).toBe(false);
  });

  it('checks exact range and decimal precision after conversion, without rounding', () => {
    expect(validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 0.1, unit: 'mm' }]).valid).toBe(true);
    expect(
      validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 0.001, unit: 'cm' }], centimeters).valid,
    ).toBe(true);
    expect(validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 0.001, unit: 'mm' }]).reasons).toContain(
      'Measurement loses required precision',
    );
    expect(
      validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 1000.01, unit: 'mm' }]).reasons,
    ).toContain('Measurement is outside its valid range');
    expect(
      validateAttributeValues(
        definition,
        [{ kind: 'MEASUREMENT', amount: 8, unit: 'cm' }],
        [{ ...centimeters[0], denominator: 0 }],
      ).reasons,
    ).toContain('Invalid unit conversion');
  });

  it('distinguishes absence, explicit special state, zero, and incomplete measurements', () => {
    expect(validateAttributeValues(definition, []).valid).toBe(true);
    expect(validateAttributeValues(definition, [{ kind: 'MEASUREMENT', amount: 0, unit: 'mm' }]).valid).toBe(true);
    expect(validateAttributeValues(definition, [{ kind: 'SPECIAL', state: 'UNKNOWN' }]).valid).toBe(true);
    expect(validateAttributeValues(definition, [{ kind: 'SPECIAL', state: 'NONE' }]).valid).toBe(false);
    expect(Schema.is(AttributeValueSchema)({ kind: 'MEASUREMENT', amount: 80 })).toBe(false);
    expect(Schema.is(AttributeValueSchema)({ kind: 'MEASUREMENT', amount: 80, unit: '' })).toBe(false);
    expect(Schema.is(AttributeValueSchema)({ kind: 'TEXT', text: '' })).toBe(false);
  });

  it('enforces single versus multiple values and never mixes a special state with facts', () => {
    const twoWidths = [
      { kind: 'MEASUREMENT', amount: 80, unit: 'mm' },
      { kind: 'MEASUREMENT', amount: 90, unit: 'mm' },
    ] as const;
    expect(validateAttributeValues(definition, twoWidths).reasons).toContain('Single attribute has multiple values');
    expect(validateAttributeValues({ ...definition, multiplicity: 'MULTIPLE' }, twoWidths).valid).toBe(true);
    expect(
      validateAttributeValues({ ...definition, multiplicity: 'MULTIPLE' }, [
        { kind: 'SPECIAL', state: 'UNKNOWN' },
        twoWidths[0],
      ]).reasons,
    ).toContain('A special state cannot coexist with another value');
  });

  it('accepts multiple controlled materials while enforcing kind and Tenant', () => {
    const { measurement: _measurement, ...withoutMeasurement } = definition;
    const material = Schema.decodeUnknownSync(AttributeDefinitionSchema)({
      ...withoutMeasurement,
      valueKind: 'CONTROLLED',
      multiplicity: 'MULTIPLE',
    });
    const first = {
      moduleId: 'commerce.catalog',
      resourceId: '33333333-3333-4333-8333-333333333333',
      resourceType: 'commerce.catalog.controlled-attribute-value',
      tenantId,
    } as const;
    const second = { ...first, resourceId: '44444444-4444-4444-8444-444444444444' } as const;
    expect(
      validateAttributeValues(material, [
        { kind: 'CONTROLLED', valueRef: first },
        { kind: 'CONTROLLED', valueRef: second },
      ]).valid,
    ).toBe(true);
    expect(validateAttributeValues(material, [{ kind: 'TEXT', text: 'wood' }]).valid).toBe(false);
    expect(
      validateAttributeValues(material, [
        { kind: 'CONTROLLED', valueRef: { ...first, tenantId: '99999999-9999-4999-8999-999999999999' } },
      ]).valid,
    ).toBe(false);
  });
});
