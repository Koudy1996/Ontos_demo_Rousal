import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { describe, expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';

import { CreatePackageDefinitionPayloadSchema } from '../../shared/actions/create-package-definition.ts';
import { PackageDefinitionSelectionRevisionSchema } from '../../shared/domain/catalog-selection-evidence.ts';
import { PackageDefinitionRefSchema } from '../../shared/resources/package-definition.ts';
import { RevisePackageDefinitionPayloadSchema } from '../../shared/actions/revise-package-definition.ts';
import { RetirePackageDefinitionPayloadSchema } from '../../shared/actions/retire-package-definition.ts';
import {
  createPackageDefinitionAction,
  handleCreatePackageDefinition,
} from '../../src/actions/create-package-definition.action.ts';
import {
  handleRevisePackageDefinition,
  revisePackageDefinitionAction,
} from '../../src/actions/revise-package-definition.action.ts';
import {
  handleRetirePackageDefinition,
  retirePackageDefinitionAction,
} from '../../src/actions/retire-package-definition.action.ts';
import { resolvePackageMutation } from '../../src/actions/package-definition-action-support.ts';
import { PackagePersistenceUnavailable } from '../../src/persistence/package-persistence.ts';
import type { PackagePersistence } from '../../src/persistence/package-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const resource = (resourceType: string, resourceId: string, scope = tenantId) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType,
  tenantId: scope,
});
const definitionRef = resource('commerce.catalog.package-definition', '33333333-3333-4333-8333-333333333333');
const productRef = resource('commerce.catalog.product', '44444444-4444-4444-8444-444444444444');
const variantRef = resource('commerce.catalog.variant', '55555555-5555-4555-8555-555555555555');
const unitRef = resource('commerce.catalog.unit', '66666666-6666-4666-8666-666666666666');
const expectedCurrent = { resourceRef: definitionRef, revision: 1 };
const content = { amount: '10', effectiveAt: '2026-09-17T10:00:00.000Z', form: { productRef, variantRef }, unitRef };
const reason = 'Packaging content confirmed';
const evidenceRefs = ['packaging-specification-2026'];
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:package-actions:run:1',
    authMethod: 'system',
    principalId: '77777777-7777-4777-8777-777777777777',
    tenantId,
  }),
  correlationId: 'package-action-test',
};
const unavailable = () =>
  Effect.fail(
    new PackagePersistenceUnavailable({ code: 'package_persistence_unavailable', reason: 'No Current basis' }),
  );
const unexpected = () => Effect.die('Unexpected persistence call');
const context = (
  overrides: Partial<PackagePersistence> = {},
): ActionHandlerContext<Readonly<Record<string, never>>, PackagePersistence> => ({
  actionInvocationId: '88888888-8888-4888-8888-888888888888',
  addDomainEvent: () => Effect.succeed(Object.create(null)),
  addOutboxMessage: () => Effect.void,
  recordAuditEvidence: () => Effect.void,
  recordDataAccess: () => Effect.void,
  scope,
  services: { create: unavailable, retire: unavailable, revise: unavailable, ...overrides },
});

describe('Package Definition governed Action contracts', () => {
  it.effect('passes trusted invocation identity to owner-local persistence', () =>
    Effect.gen(function* trustedIdentity() {
      const payload = Schema.decodeUnknownSync(CreatePackageDefinitionPayloadSchema)({
        content,
        definitionRef,
        evidenceRefs,
        reason,
      });
      const revision = Schema.decodeUnknownSync(PackageDefinitionSelectionRevisionSchema)(expectedCurrent);
      const trustedRef = Schema.decodeUnknownSync(PackageDefinitionRefSchema)(definitionRef);
      const run = context({
        create: (input) =>
          Effect.sync(() => {
            expect(input.actionInvocationId).toBe('88888888-8888-4888-8888-888888888888');
            expect(input.principalId).toBe(scope.principalId);
            expect(input.payload.evidenceRefs).toEqual(evidenceRefs);
            return { _tag: 'created', contentRevision: revision, definitionRef: trustedRef } as const;
          }),
      });
      const result = yield* handleCreatePackageDefinition(payload, run);
      expect(result.contentRevision.revision).toBe(1);
    }),
  );
  it.effect('keeps stale and invalid persistence outcomes distinct', () =>
    Effect.gen(function* typedOutcomes() {
      const stale = yield* resolvePackageMutation({ _tag: 'stale', actualRevision: 2 }).pipe(Effect.flip);
      const invalid = yield* resolvePackageMutation({
        _tag: 'invalid',
        reason: 'Content differs from lower revision',
      }).pipe(Effect.flip);
      expect(stale.code).toBe('package_definition_stale');
      expect(invalid.code).toBe('package_definition_invalid');
    }),
  );
  it('keeps every mutation tenant-scoped, idempotent, and explicitly authorized', () => {
    for (const action of [
      createPackageDefinitionAction,
      revisePackageDefinitionAction,
      retirePackageDefinitionAction,
    ]) {
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'tenant_membership_default',
      });
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
    }
  });
  it('requires exact positive content and a pinned revision for revise and retire', () => {
    expect(
      Schema.decodeUnknownSync(CreatePackageDefinitionPayloadSchema)({ content, definitionRef, evidenceRefs, reason })
        .content.amount,
    ).toBe('10');
    expect(
      Schema.decodeUnknownSync(RevisePackageDefinitionPayloadSchema)({ content, evidenceRefs, expectedCurrent, reason })
        .expectedCurrent.revision,
    ).toBe(1);
    expect(
      Schema.decodeUnknownSync(RetirePackageDefinitionPayloadSchema)({ evidenceRefs, expectedCurrent, reason }).reason,
    ).toBe(reason);
    expect(() =>
      Schema.decodeUnknownSync(CreatePackageDefinitionPayloadSchema)({
        content: { ...content, amount: '0' },
        definitionRef,
        evidenceRefs,
        reason,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(RevisePackageDefinitionPayloadSchema)({ content, evidenceRefs, reason }),
    ).toThrow();
    expect(() => Schema.decodeUnknownSync(RetirePackageDefinitionPayloadSchema)({ definitionRef, reason })).toThrow();
  });

  it.effect('never claims success without authoritative persistence and Current verification', () =>
    Effect.gen(function* noFalseSuccess() {
      const create = Schema.decodeUnknownSync(CreatePackageDefinitionPayloadSchema)({
        content,
        definitionRef,
        evidenceRefs,
        reason,
      });
      const revise = Schema.decodeUnknownSync(RevisePackageDefinitionPayloadSchema)({
        content,
        evidenceRefs,
        expectedCurrent,
        reason,
      });
      const retire = Schema.decodeUnknownSync(RetirePackageDefinitionPayloadSchema)({
        evidenceRefs,
        expectedCurrent,
        reason,
      });
      const errors = yield* Effect.all([
        handleCreatePackageDefinition(create, context()).pipe(Effect.flip),
        handleRevisePackageDefinition(revise, context()).pipe(Effect.flip),
        handleRetirePackageDefinition(retire, context()).pipe(Effect.flip),
      ]);
      expect(errors.map((error) => error.code)).toEqual([
        'package_definition_unavailable',
        'package_definition_unavailable',
        'package_definition_unavailable',
      ]);
    }),
  );

  it.effect('rejects references from another Tenant before reporting infrastructure unavailability', () =>
    Effect.gen(function* rejectForeignTenant() {
      const payload = Schema.decodeUnknownSync(CreatePackageDefinitionPayloadSchema)({
        content: { ...content, unitRef: resource('commerce.catalog.unit', unitRef.resourceId, otherTenantId) },
        definitionRef,
        evidenceRefs,
        reason,
      });
      const error = yield* handleCreatePackageDefinition(payload, context({ create: unexpected })).pipe(Effect.flip);
      expect(error.code).toBe('package_definition_invalid');
    }),
  );
});
