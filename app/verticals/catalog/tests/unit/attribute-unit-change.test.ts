import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { AttributeDefinitionSchema } from '../../shared/domain/attribute-values.ts';
import { assessAttributeUnitChange } from '../../shared/domain/attribute-unit-change.ts';

const current = Schema.decodeUnknownSync(AttributeDefinitionSchema)({
  label: 'Width',
  levels: ['PRODUCT', 'VARIANT'],
  meaning: 'Width of product',
  measurement: { canonicalUnit: 'cm', decimalPlaces: 2, quantity: 'length' },
  multiplicity: 'SINGLE',
  ref: {
    moduleId: 'commerce.catalog',
    resourceId: '22222222-2222-4222-8222-222222222222',
    resourceType: 'commerce.catalog.attribute-definition',
    tenantId: '11111111-1111-4111-8111-111111111111',
  },
  specialStates: ['UNKNOWN'],
  valueKind: 'MEASUREMENT',
});
const proposed = {
  ...current,
  measurement: { canonicalUnit: 'mm', decimalPlaces: 2, quantity: 'length' },
};
const conversions = [{ denominator: 1, from: 'cm', numerator: 10, quantity: 'length', to: 'mm' }] as const;
const original = { amount: 80, kind: 'MEASUREMENT', unit: 'cm' } as const;
const recorded = [{ original, provenance: 'Supplier technical sheet, revision 4' }] as const;

describe('Catalog Attribute unit revision assessment', () => {
  it('converts the same measured meaning exactly without altering the recorded value', () => {
    expect(assessAttributeUnitChange(current, proposed, recorded, conversions)).toEqual({
      converted: [{ amount: 800, kind: 'MEASUREMENT', unit: 'mm' }],
      kind: 'CONVERTIBLE',
      originals: [original],
    });
    expect(original).toEqual({ amount: 80, kind: 'MEASUREMENT', unit: 'cm' });
  });

  it('does not guess an absent value, its provenance, or an unknown unit', () => {
    expect(assessAttributeUnitChange(current, proposed, [], conversions).kind).toBe('INDETERMINATE');
    expect(
      assessAttributeUnitChange(current, proposed, [{ original: null, provenance: 'sheet' }], conversions).kind,
    ).toBe('INDETERMINATE');
    expect(assessAttributeUnitChange(current, proposed, [{ original, provenance: ' ' }], conversions).kind).toBe(
      'INDETERMINATE',
    );
    expect(
      assessAttributeUnitChange(
        current,
        proposed,
        [{ original: { ...original, unit: 'unknown' }, provenance: 'sheet' }],
        conversions,
      ).kind,
    ).toBe('INDETERMINATE');
    expect(
      assessAttributeUnitChange(
        current,
        proposed,
        [{ original: { kind: 'SPECIAL', state: 'UNKNOWN' }, provenance: 'sheet' }],
        conversions,
      ).kind,
    ).toBe('INDETERMINATE');
  });

  it('requires a new definition for a changed measured meaning', () => {
    expect(
      assessAttributeUnitChange(current, { ...proposed, meaning: 'Width of package' }, recorded, conversions).kind,
    ).toBe('NEW_DEFINITION_REQUIRED');
    expect(
      assessAttributeUnitChange(
        current,
        { ...proposed, measurement: { ...proposed.measurement, quantity: 'mass' } },
        recorded,
        conversions,
      ).kind,
    ).toBe('NEW_DEFINITION_REQUIRED');
  });

  it('requires remediation for untrusted ratios and precision loss', () => {
    expect(assessAttributeUnitChange(current, proposed, recorded, []).kind).toBe('REMEDIATION_REQUIRED');
    expect(assessAttributeUnitChange(current, proposed, recorded, [{ ...conversions[0], numerator: 1 }]).kind).toBe(
      'REMEDIATION_REQUIRED',
    );
    const imprecise = { ...proposed, measurement: { ...proposed.measurement, decimalPlaces: 0 } };
    expect(
      assessAttributeUnitChange(
        current,
        imprecise,
        [{ original: { ...original, amount: 0.01 }, provenance: 'sheet' }],
        conversions,
      ).kind,
    ).toBe('REMEDIATION_REQUIRED');
  });

  it('does not silently choose among multiple values when rules narrow', () => {
    const multiple = { ...current, multiplicity: 'MULTIPLE' as const };
    expect(
      assessAttributeUnitChange(
        multiple,
        proposed,
        [recorded[0], { original: { ...original, amount: 90 }, provenance: 'sheet' }],
        conversions,
      ).kind,
    ).toBe('REMEDIATION_REQUIRED');
  });
});
