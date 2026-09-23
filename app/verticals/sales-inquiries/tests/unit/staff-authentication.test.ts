import { makeOperationalScopeResolver, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema, Predicate } from 'effect';
import { expect, it } from 'effect-rstest';
import { StaffAuthenticationNamespaceRegistryLive } from '../../src/auth/staff-authentication-namespace.ts';

const principal = Schema.decodeSync(TrustedPrincipalContextSchema)({
  authBindingId: '10000000-0000-4000-8000-000000000003',
  authContextRef: 'staff-session',
  authenticationNamespaceId: 'ontos.staff.better-auth.v1',
  authMethod: 'session',
  principalId: '10000000-0000-4000-8000-000000000002',
  tenantId: '10000000-0000-4000-8000-000000000001',
});
const resolve = (namespace: string, audience: string, bindingStatus = 'active') => {
  const caller = Schema.decodeSync(TrustedPrincipalContextSchema)({
    ...principal,
    authenticationNamespaceId: namespace,
  });
  return makeOperationalScopeResolver(
    {
      load: () =>
        Effect.succeed({
          bindingAuthenticationNamespaceId: namespace,
          bindingPrincipalId: principal.principalId,
          bindingRevision: 1,
          bindingRevokedAt: null,
          bindingStatus,
          bindingSubjectType: 'user',
          bindingTenantId: principal.tenantId,
          impersonatorStatus: null,
          impersonatorTenantId: null,
          legalEntityStatus: null,
          legalEntityTenantId: null,
          principalStatus: 'active',
          principalTenantId: principal.tenantId,
          tenantStatus: 'active',
        }),
    },
    { legalEntities: () => Effect.succeed([]) },
  ).resolve({
    audience,
    correlationId: 'staff-test',
    legalEntityScope: 'forbidden',
    principal: caller,
  });
};
it.layer(StaffAuthenticationNamespaceRegistryLive)('staff admission', (suite) => {
  suite.effect(
    'accepts the known staff namespace at execution and rejects unknown, wrong audience and inactive binding',
    () =>
      Effect.gen(function* staffAdmission() {
        const scope = yield* resolve('ontos.staff.better-auth.v1', 'sales-inquiries');
        expect(scope.tenantId).toBe(principal.tenantId);
        for (const [namespace, audience, status] of [
          ['unknown.realm', 'sales-inquiries', 'active'],
          ['ontos.staff.better-auth.v1', 'another-owner', 'active'],
          ['ontos.staff.better-auth.v1', 'sales-inquiries', 'inactive'],
        ] as const) {
          const failure = yield* resolve(namespace, audience, status).pipe(Effect.flip);
          expect(Predicate.isTagged(failure, 'OperationAuthenticationRequired')).toBe(true);
        }
      }),
  );
});
