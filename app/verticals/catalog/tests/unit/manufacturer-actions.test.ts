import { Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  ChangeProductManufacturerPayloadSchema,
  RemoveProductManufacturerPayloadSchema,
  SetProductManufacturerPayloadSchema,
} from '../../shared/actions/manufacturer-mutations.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const subject = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const partyRef = {
  moduleId: 'party.registry',
  resourceId: 'external-maker',
  resourceType: 'party.registry.party',
  tenantId,
} as const;
const basis = {
  effectivePeriod: {},
  evidenceRefs: ['owner-record'],
  reason: 'Documented manufacturer',
  relationId: '33333333-3333-4333-8333-333333333333',
  subject,
  target: { kind: 'PARTY', partyRef },
} as const;

describe('manufacturer Action contracts', () => {
  it('requires typed identity, exact subject, reason and evidence', () => {
    const decode = Schema.decodeUnknownSync(SetProductManufacturerPayloadSchema);
    expect(decode(basis).target).toEqual(basis.target);
    expect(() => decode({ ...basis, evidenceRefs: [] })).toThrow();
    expect(() => decode({ ...basis, reason: ' ' })).toThrow();
    expect(() => decode({ ...basis, target: { kind: 'PARTY', name: 'Maker' } })).toThrow();
    expect(() => decode({ ...basis, subject: { ...subject, resourceType: 'commerce.catalog.unknown' } })).toThrow();
    expect(() =>
      decode({
        ...basis,
        target: { kind: 'PARTY', partyRef: { ...partyRef, tenantId: '99999999-9999-4999-8999-999999999999' } },
      }),
    ).toThrow();
  });

  it('requires optimistic revision for change and removal', () => {
    const change = Schema.decodeUnknownSync(ChangeProductManufacturerPayloadSchema);
    const remove = Schema.decodeUnknownSync(RemoveProductManufacturerPayloadSchema);
    expect(change({ ...basis, expectedRevision: 1 }).expectedRevision).toBe(1);
    expect(
      remove({
        evidenceRefs: ['owner-record'],
        expectedRevision: 1,
        reason: 'Retracted',
        relationId: basis.relationId,
        subject,
      }).expectedRevision,
    ).toBe(1);
    expect(() => change({ ...basis, expectedRevision: 0 })).toThrow();
    expect(() => remove({ ...basis, expectedRevision: -1 })).toThrow();
  });
});
