import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { AssignSkuPayloadSchema } from '../../shared/actions/assign-sku.ts';
import { RenameSkuPayloadSchema } from '../../shared/actions/rename-sku.ts';
import { CorrectSkuPayloadSchema } from '../../shared/actions/correct-sku.ts';
import { assignSkuAction } from '../../src/actions/assign-sku.action.ts';
import { renameSkuAction } from '../../src/actions/rename-sku.action.ts';
import { correctSkuAction } from '../../src/actions/correct-sku.action.ts';
import { SkuActionConflict, SkuActionStale } from '../../src/actions/sku-action-support.ts';
import { mapAssignSkuActionProblem } from '../../api/assign-sku-action-problems.ts';
import { mapRenameSkuActionProblem } from '../../api/rename-sku-action-problems.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const target = { kind: 'VARIANT', tenantId, variantId } as const;
const base = { code: ' DRZ-10 ', evidenceRefs: ['doc:1'], reason: 'Confirmed catalog record', target };

describe('governed SKU Action contracts', () => {
  it('requires exact target, evidence, and revision intent', () => {
    expect(Schema.decodeUnknownSync(AssignSkuPayloadSchema)({ ...base, expectedRevision: 0 }).target).toEqual(target);
    expect(() => Schema.decodeUnknownSync(AssignSkuPayloadSchema)({ ...base, expectedRevision: 1 })).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(AssignSkuPayloadSchema)({ ...base, evidenceRefs: [], expectedRevision: 0 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(AssignSkuPayloadSchema)({
        ...base,
        expectedRevision: 0,
        target: { ...target, variantId: 'bad' },
      }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(RenameSkuPayloadSchema)({ ...base, expectedRevision: 1, oldCode: 'D-10' }).oldCode,
    ).toBe('D-10');
    expect(() =>
      Schema.decodeUnknownSync(RenameSkuPayloadSchema)({ ...base, expectedRevision: 0, oldCode: 'D-10' }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(CorrectSkuPayloadSchema)({ ...base, expectedRevision: 1, previousTarget: target })
        .previousTarget,
    ).toEqual(target);
    expect(() => Schema.decodeUnknownSync(CorrectSkuPayloadSchema)({ ...base, expectedRevision: 1 })).toThrow();
  });

  it('keeps public operations explicit, permissioned, and idempotent', () => {
    for (const action of [assignSkuAction, renameSkuAction, correctSkuAction]) {
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
    }
  });

  it('maps retained-code conflict and stale CAS to typed 409 problems', () => {
    const conflict = mapAssignSkuActionProblem(
      new SkuActionConflict({ code: 'sku_action_conflict', reason: 'retained' }),
    );
    const stale = mapRenameSkuActionProblem(new SkuActionStale({ actualRevision: 2, code: 'sku_action_stale' }));
    expect(conflict.status).toBe(409);
    expect(stale.status).toBe(409);
  });
});
