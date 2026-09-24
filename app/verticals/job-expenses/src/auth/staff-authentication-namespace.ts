import {
  AuthenticationNamespaceRegistry,
  makeAuthenticationNamespaceRegistryEffect,
} from '@app/core-runtime/auth/external-identity-admission';
import { AuthenticationNamespaceRegistrationSchema } from '@app/core-runtime/auth/external-identity-contracts';
import { Effect, Layer, Schema } from 'effect';

/** Deployment trust for Shell staff assertions, after issuer/audience verification. */
export const StaffAuthenticationNamespaceRegistryLive = Layer.effect(
  AuthenticationNamespaceRegistry,
  Schema.decodeEffect(AuthenticationNamespaceRegistrationSchema)({
    allowedAudiences: ['job-expenses'],
    authenticationNamespaceId: 'ontos.staff.better-auth.v1',
    provider: 'better-auth',
    requiresOperationAdmission: false,
    reservationPrincipalKind: 'human',
    subjectTypes: ['user', 'api_key'],
    trustedAttesterPrincipalIds: [],
  }).pipe(Effect.flatMap((registration) => makeAuthenticationNamespaceRegistryEffect([registration]))),
);
