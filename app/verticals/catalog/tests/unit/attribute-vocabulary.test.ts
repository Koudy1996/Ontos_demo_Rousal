import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ControlledAttributeValueSchema,
  ControlledValueReactivationDecisionSchema,
  ControlledValueRenameDecisionSchema,
  SizeEquivalenceAssertionSchema,
  SizeUsageListSchema,
  mayAssignControlledValue,
  mayReactivateControlledValue,
  mayRenameControlledValue,
} from '../../shared/domain/attribute-vocabulary.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '99999999-9999-4999-8999-999999999999';
const ref = (resourceType: string, resourceId: string, scopedTenantId = tenantId) => ({
  moduleId: 'commerce.catalog' as const,
  resourceId,
  resourceType,
  tenantId: scopedTenantId,
});
const definitionRef = ref('commerce.catalog.attribute-definition', '22222222-2222-4222-8222-222222222222');
const valueRef = ref('commerce.catalog.controlled-attribute-value', '33333333-3333-4333-8333-333333333333');
const anotherValueRef = ref('commerce.catalog.controlled-attribute-value', '44444444-4444-4444-8444-444444444444');
const productRef = ref('commerce.catalog.product', '55555555-5555-4555-8555-555555555555');
const base = {
  attributeDefinitionRef: definitionRef,
  label: 'M',
  lifecycle: 'ACTIVE',
  ref: valueRef,
  specialization: 'SIZE',
} as const;

describe('Catalog controlled attribute vocabulary', () => {
  it('keeps identity through a reviewed same-meaning rename, but rejects a different meaning', () => {
    const value = Schema.decodeUnknownSync(ControlledAttributeValueSchema)(base);
    const correction = Schema.decodeUnknownSync(ControlledValueRenameDecisionSchema)({
      current: value,
      proposedLabel: 'Medium',
      sameMeaning: true,
      evidence: 'Reviewed typo/translation',
    });
    expect(mayRenameControlledValue(correction)).toBe(true);
    expect(correction.current.ref).toEqual(valueRef);
    expect(mayRenameControlledValue({ ...correction, sameMeaning: false })).toBe(false);
    expect(() =>
      Schema.decodeUnknownSync(ControlledValueRenameDecisionSchema)({ ...correction, evidence: ' ' }),
    ).toThrow();
  });

  it('blocks new assignment after retirement without invalidating the existing reference', () => {
    const value = Schema.decodeUnknownSync(ControlledAttributeValueSchema)(base);
    expect(mayAssignControlledValue({ ref: definitionRef }, value)).toBe(true);
    const retired = { ...value, lifecycle: 'RETIRED' as const };
    expect(mayAssignControlledValue({ ref: definitionRef }, retired)).toBe(false);
    expect(retired.ref).toEqual(value.ref);
    expect(mayAssignControlledValue({ ref: { ...definitionRef, tenantId: otherTenantId } }, value)).toBe(false);
    const review = Schema.decodeUnknownSync(ControlledValueReactivationDecisionSchema)({
      value: retired,
      currentMeaningConfirmed: true,
      evidence: 'Current review',
    });
    expect(mayReactivateControlledValue(review)).toBe(true);
    expect(mayReactivateControlledValue({ ...review, currentMeaningConfirmed: false })).toBe(false);
  });

  it('does not merge Color identity from shared labels, group, or preview', () => {
    const color = {
      ...base,
      label: 'Anthracite',
      specialization: 'COLOR' as const,
      color: { groupLabel: 'Grey', previewHex: '#333333', distinguishingEvidence: 'Physical shade A' },
    };
    const first = Schema.decodeUnknownSync(ControlledAttributeValueSchema)(color);
    const second = Schema.decodeUnknownSync(ControlledAttributeValueSchema)({
      ...color,
      ref: anotherValueRef,
      color: { ...color.color, distinguishingEvidence: 'Physical shade B' },
    });
    expect(first.ref).not.toEqual(second.ref);
    expect(first.color?.previewHex).toBe(second.color?.previewHex);
    expect(() =>
      Schema.decodeUnknownSync(ControlledAttributeValueSchema)({
        ...color,
        color: { ...color.color, distinguishingEvidence: ' ' },
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ControlledAttributeValueSchema)({
        ...color,
        color: { ...color.color, swatchCode: 'A1' },
      }),
    ).toThrow();
  });

  it('stores Size order per Product and does not infer measurements from numeric labels', () => {
    const numeric = Schema.decodeUnknownSync(ControlledAttributeValueSchema)({ ...base, label: '80' });
    expect(numeric).not.toHaveProperty('measurement');
    const first = Schema.decodeUnknownSync(SizeUsageListSchema)({
      productRef,
      orderedSizeRefs: [valueRef, anotherValueRef],
    });
    const second = Schema.decodeUnknownSync(SizeUsageListSchema)({
      productRef: { ...productRef, resourceId: '66666666-6666-4666-8666-666666666666' },
      orderedSizeRefs: [anotherValueRef, valueRef],
    });
    expect(first.orderedSizeRefs[0]).toEqual(valueRef);
    expect(second.orderedSizeRefs[1]).toEqual(valueRef);
    expect(() =>
      Schema.decodeUnknownSync(SizeUsageListSchema)({ productRef, orderedSizeRefs: [valueRef, valueRef] }),
    ).toThrow();
  });

  it('requires scoped evidence to assert Size equivalence', () => {
    expect(() =>
      Schema.decodeUnknownSync(SizeEquivalenceAssertionSchema)({
        leftSizeRef: valueRef,
        rightSizeRef: anotherValueRef,
        scope: ' ',
        evidence: 'Conversion chart',
      }),
    ).toThrow();
    const assertion = Schema.decodeUnknownSync(SizeEquivalenceAssertionSchema)({
      leftSizeRef: valueRef,
      rightSizeRef: anotherValueRef,
      scope: 'Manufacturer A, 2026 line',
      evidence: 'Published chart',
    });
    expect(assertion.scope).toBe('Manufacturer A, 2026 line');
    expect(() =>
      Schema.decodeUnknownSync(SizeEquivalenceAssertionSchema)({
        ...assertion,
        rightSizeRef: { ...anotherValueRef, tenantId: otherTenantId },
      }),
    ).toThrow();
  });
});
