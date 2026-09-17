import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  PublishProductConfigurationPayloadSchema,
  PublishProductConfigurationError,
} from '../../shared/actions/publish-product-configuration.ts';
import { mapPublishProductConfigurationActionProblem } from '../../api/publish-product-configuration-action-problems.ts';
import {
  handlePublishProductConfiguration,
  publishProductConfigurationAction,
} from '../../src/actions/publish-product-configuration.action.ts';
import type { ProductConfigurationPersistence } from '../../src/persistence/product-configuration-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const payload = Schema.decodeUnknownSync(PublishProductConfigurationPayloadSchema)({
  choices: [
    {
      choiceKey: 'length',
      kind: 'MEASURED_VALUE',
      label: 'Length',
      meaning: 'Exact length',
      required: true,
      unitId: 'cm',
    },
  ],
  compatibilityRules: [],
  definitionId: 'definition-1',
  effectiveFrom: new Date('2026-09-18T00:00:00.000Z'),
  evidenceRefs: ['document-1'],
  expectedRevision: 0,
  measuredRules: [{ choiceKey: 'length', evidenceRefs: ['document-1'], minimum: '0', minimumInclusive: true }],
  optionAllowances: [],
  productId: 'product-1',
  reason: 'Initial publication',
});
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:configuration-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'configuration-test',
};
const context = (
  services: ProductConfigurationPersistence,
): ActionHandlerContext<Readonly<Record<string, never>>, ProductConfigurationPersistence> => ({
  actionInvocationId: '33333333-3333-4333-8333-333333333333',
  addDomainEvent: () => Effect.succeed(Object.create(null)),
  addOutboxMessage: () => Effect.void,
  recordAuditEvidence: () => Effect.void,
  recordDataAccess: () => Effect.void,
  scope,
  services,
});

describe('Product Configuration publication Action', () => {
  it('is an explicit governed write with no caller principal', () => {
    expect(publishProductConfigurationAction.descriptor.entrypoint.authorization).toEqual({
      kind: 'action_execution',
      provisioning: 'explicit',
    });
    expect(publishProductConfigurationAction.descriptor.legalEntityScope).toBe('forbidden');
    expect('principalId' in payload).toBe(false);
  });

  it.effect('passes trusted principal, invocation, and exact CAS basis to persistence', () =>
    Effect.gen(function* verifyTrustedPublication() {
      const services: ProductConfigurationPersistence = {
        publish: (input) =>
          Effect.sync(() => {
            expect(input.principalId).toBe(principalId);
            expect(input.actionInvocationId).toBe('33333333-3333-4333-8333-333333333333');
            expect(input.expectedRevision).toBe(0);
            expect(input.effectiveFrom.toISOString()).toBe('2026-09-18T00:00:00.000Z');
            return { _tag: 'published' as const, revision: 1 };
          }),
        readCurrent: () => Effect.die('unexpected read'),
      };
      expect(yield* handlePublishProductConfiguration(payload, context(services))).toEqual({
        definitionId: 'definition-1',
        revision: 1,
      });
    }),
  );

  it('maps stale, invalid, and unavailable distinctly', () => {
    for (const [code, status] of [
      ['product_configuration_stale', 409],
      ['product_configuration_invalid', 422],
      ['product_configuration_unavailable', 503],
    ] as const) {
      expect(
        mapPublishProductConfigurationActionProblem(new PublishProductConfigurationError({ code, reason: 'safe' }))
          .status,
      ).toBe(status);
    }
  });
});
