import type { TrustedPrincipalContext } from '@app/core-runtime/actions/principal-context';
import { Effect } from 'effect';
import type { Redacted } from 'effect';

import { ActionPrincipalScopeErrorSchema, bindGatewayPrincipalVerifier } from './server.ts';

/** Inspect without consuming: only the destination owner redeems this single-use assertion. */
export const bindDependencyReadVerifier = (audience: string) => {
  const verifier = bindGatewayPrincipalVerifier(audience);
  return (credential: Redacted.Redacted<string | undefined>, authenticatedPrincipal: TrustedPrincipalContext) =>
    verifier.verify(credential).pipe(
      Effect.flatMap((dependencyPrincipal) => {
        // Exhaustive named record: adding a principal field requires reviewing this boundary.
        const comparisons = {
          authBindingId: authenticatedPrincipal.authBindingId === dependencyPrincipal.authBindingId,
          authContextRef: authenticatedPrincipal.authContextRef === dependencyPrincipal.authContextRef,
          authenticationNamespaceId:
            authenticatedPrincipal.authenticationNamespaceId === dependencyPrincipal.authenticationNamespaceId,
          authMethod: authenticatedPrincipal.authMethod === dependencyPrincipal.authMethod,
          impersonatedByPrincipalId:
            authenticatedPrincipal.impersonatedByPrincipalId === dependencyPrincipal.impersonatedByPrincipalId,
          legalEntityId: authenticatedPrincipal.legalEntityId === dependencyPrincipal.legalEntityId,
          principalId: authenticatedPrincipal.principalId === dependencyPrincipal.principalId,
          tenantId: authenticatedPrincipal.tenantId === dependencyPrincipal.tenantId,
          trustedStorefrontId: authenticatedPrincipal.trustedStorefrontId === dependencyPrincipal.trustedStorefrontId,
        } satisfies Record<keyof TrustedPrincipalContext, boolean>;
        const matches = Object.values(comparisons).every(Boolean);
        return matches
          ? Effect.succeed(credential)
          : Effect.fail(
              ActionPrincipalScopeErrorSchema.make({
                reason: 'Dependency credential context does not match the operation',
              }),
            );
      }),
    );
};
