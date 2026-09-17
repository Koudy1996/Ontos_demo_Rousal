import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { catalogAuthorityBundles, catalogPublicOperationContracts } from '../../shared/api.ts';
import { AssignSkuPayloadSchema } from '../../shared/actions/assign-sku.ts';
import { RenameSkuPayloadSchema } from '../../shared/actions/rename-sku.ts';
import { CorrectSkuPayloadSchema } from '../../shared/actions/correct-sku.ts';
import { assignSkuAction } from '../../src/actions/assign-sku.action.ts';
import { renameSkuAction } from '../../src/actions/rename-sku.action.ts';
import { correctSkuAction } from '../../src/actions/correct-sku.action.ts';
import { SkuActionConflict, SkuActionErrorSchema, SkuActionStale } from '../../src/actions/sku-action-support.ts';
import { SkuActionInvalid } from '../../src/actions/sku-action-invalid.ts';
import { SkuActionNotFound } from '../../src/actions/sku-action-not-found.ts';
import { SkuPersistenceUnavailable } from '../../src/persistence/sku-persistence.ts';
import { mapAssignSkuActionProblem } from '../../api/assign-sku-action-problems.ts';
import { mapCorrectSkuActionProblem } from '../../api/correct-sku-action-problems.ts';
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
    expect(assignSkuAction.descriptor.actionKey).toBe('commerce.catalog.assign-sku');
    expect(renameSkuAction.descriptor.actionKey).toBe('commerce.catalog.rename-sku');
    expect(correctSkuAction.descriptor.actionKey).toBe('commerce.catalog.correct-sku');
    expect(correctSkuAction.descriptor.actionKey).not.toBe(assignSkuAction.descriptor.actionKey);
    expect(correctSkuAction.descriptor.actionKey).not.toBe(renameSkuAction.descriptor.actionKey);
    expect(catalogPublicOperationContracts['commerce.catalog.correct-sku']).toMatchObject({
      permission: 'commerce.catalog.correct-sku',
      permissionKind: 'action_execution',
      scope: 'tenant',
    });
    const grantsWithoutCorrection = new Set<string>(
      catalogAuthorityBundles.PRODUCT_EDITOR.filter((permission) => permission !== 'commerce.catalog.correct-sku'),
    );
    expect(grantsWithoutCorrection.has('commerce.catalog.assign-sku')).toBe(true);
    expect(grantsWithoutCorrection.has('commerce.catalog.rename-sku')).toBe(true);
    expect(grantsWithoutCorrection.has('commerce.catalog.correct-sku')).toBe(false);
  });

  it('retains exact correction attribution and permits a same-target display-code intent', () => {
    const correctedTarget = {
      kind: 'PACKAGE_OPTION',
      packageDefinitionId: '33333333-3333-4333-8333-333333333333',
      tenantId,
    } as const;
    expect(
      Schema.decodeUnknownSync(CorrectSkuPayloadSchema)({
        ...base,
        code: 'DRZ-10',
        expectedRevision: 2,
        previousTarget: target,
        target: correctedTarget,
      }).previousTarget,
    ).toEqual(target);
    expect(
      Schema.decodeUnknownSync(CorrectSkuPayloadSchema)({
        ...base,
        code: 'drz-10',
        expectedRevision: 2,
        previousTarget: target,
      }).target,
    ).toEqual(target);
    expect(() =>
      Schema.decodeUnknownSync(CorrectSkuPayloadSchema)({
        ...base,
        evidenceRefs: [],
        expectedRevision: 2,
        previousTarget: target,
      }),
    ).toThrow();
  });

  it('declares every expected persistence and domain failure as a typed Action error', () => {
    const failures = [
      new SkuActionConflict({ code: 'sku_action_conflict', reason: 'retained' }),
      new SkuActionStale({ actualRevision: 2, code: 'sku_action_stale' }),
      new SkuActionInvalid({ code: 'sku_action_invalid', reason: 'invalid' }),
      new SkuActionNotFound({ code: 'sku_action_not_found', reason: 'missing' }),
      new SkuPersistenceUnavailable({ code: 'sku_persistence_unavailable', reason: 'unavailable' }),
    ];
    for (const failure of failures) {
      expect(Schema.is(SkuActionErrorSchema)(failure)).toBe(true);
    }
  });

  it('maps retained-code conflict and stale CAS to typed 409 problems', () => {
    const conflict = mapAssignSkuActionProblem(
      new SkuActionConflict({ code: 'sku_action_conflict', reason: 'retained' }),
    );
    const stale = mapRenameSkuActionProblem(new SkuActionStale({ actualRevision: 2, code: 'sku_action_stale' }));
    const correctionConflict = mapCorrectSkuActionProblem(
      new SkuActionConflict({ code: 'sku_action_conflict', reason: 'wrong previous target' }),
    );
    expect(conflict.status).toBe(409);
    expect(stale.status).toBe(409);
    expect(correctionConflict.status).toBe(409);
  });
});
