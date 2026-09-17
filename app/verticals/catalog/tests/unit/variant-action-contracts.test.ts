import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { ChangeVariantPayloadSchema } from '../../shared/actions/change-variant.ts';
import { CreateVariantPayloadSchema } from '../../shared/actions/create-variant.ts';
import { ReactivateVariantPayloadSchema } from '../../shared/actions/reactivate-variant.ts';
import { RetireVariantPayloadSchema } from '../../shared/actions/retire-variant.ts';
import { changeVariantAction } from '../../src/actions/change-variant.action.ts';
import { createVariantAction } from '../../src/actions/create-variant.action.ts';
import { reactivateVariantAction } from '../../src/actions/reactivate-variant.action.ts';
import { retireVariantAction } from '../../src/actions/retire-variant.action.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;

describe('Variant Action payload contracts', () => {
  it('requires explicit Product and Variant identity plus evidence for creation', () => {
    const decode = Schema.decodeUnknownSync(CreateVariantPayloadSchema);
    expect(
      decode({
        evidenceRefs: ['factory-sheet'],
        expectedProductRevision: 1,
        productRef,
        reason: 'Recorded form',
        variantRef,
      }).variantRef,
    ).toEqual(variantRef);
    expect(() => decode({ expectedProductRevision: 1, productRef, reason: 'No evidence', variantRef })).toThrow();
    expect(() =>
      decode({
        evidenceRefs: ['factory-sheet'],
        expectedProductRevision: 1,
        productRef,
        reason: 'Cross tenant',
        variantRef: { ...variantRef, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      }),
    ).toThrow();
  });

  it('permits identity-preserving corrections only with classification and evidence', () => {
    const decode = Schema.decodeUnknownSync(ChangeVariantPayloadSchema);
    expect(
      decode({
        classification: 'EVIDENCED_RECORD_CORRECTION',
        evidenceRefs: ['drawing'],
        expectedVariantRevision: 2,
        reason: 'Correct wrong record',
        variantRef,
      }).classification,
    ).toBe('EVIDENCED_RECORD_CORRECTION');
    expect(() =>
      decode({
        classification: 'NEW_REALIZATION',
        evidenceRefs: ['drawing'],
        expectedVariantRevision: 2,
        reason: 'New form',
        variantRef,
      }),
    ).toThrow();
    expect(() =>
      decode({
        classification: 'EVIDENCED_RECORD_CORRECTION',
        evidenceRefs: [],
        expectedVariantRevision: 2,
        reason: 'No proof',
        variantRef,
      }),
    ).toThrow();
    expect(
      decode({
        classification: 'SAME_MEANING_RENAME',
        evidenceRefs: ['name-record'],
        expectedVariantRevision: 2,
        reason: 'Same form, clearer name',
        variantRef,
      }).classification,
    ).toBe('SAME_MEANING_RENAME');
    expect(
      decode({
        classification: 'EVIDENCED_PARENT_CORRECTION',
        evidenceRefs: ['original-parent-record'],
        expectedVariantRevision: 2,
        reason: 'Wrong parent recorded',
        targetProductRef: { ...productRef, resourceId: '77777777-7777-4777-8777-777777777777' },
        variantRef,
      }).targetProductRef?.resourceId,
    ).toBe('77777777-7777-4777-8777-777777777777');
  });

  it('requires an optimistic revision and identity evidence for reactivation', () => {
    expect(() => Schema.decodeUnknownSync(RetireVariantPayloadSchema)({ reason: 'Retire', variantRef })).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ReactivateVariantPayloadSchema)({
        expectedVariantRevision: 1,
        reason: 'Restore',
        variantRef,
      }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(ReactivateVariantPayloadSchema)({
        evidenceRefs: ['same-identity-proof'],
        expectedVariantRevision: 2,
        reason: 'Restore the same form',
        variantRef,
      }).variantRef,
    ).toEqual(variantRef);
  });

  it('routes all mutations through explicit tenant-scoped, idempotent Action authorization', () => {
    for (const action of [createVariantAction, changeVariantAction, retireVariantAction, reactivateVariantAction]) {
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(action.descriptor.owningModuleKey).toBe('commerce.catalog');
    }
  });
});
