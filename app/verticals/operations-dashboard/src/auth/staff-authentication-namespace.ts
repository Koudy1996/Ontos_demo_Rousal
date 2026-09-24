import {
  AuthenticationNamespaceRegistry,
  makeAuthenticationNamespaceRegistryEffect,
} from '@app/core-runtime/auth/external-identity-admission';
import { AuthenticationNamespaceRegistrationSchema } from '@app/core-runtime/auth/external-identity-contracts';
import { Effect, Layer, Schema } from 'effect';

export const StaffAuthenticationNamespaceRegistryLive = Layer.effect(
  AuthenticationNamespaceRegistry,
  Schema.decodeEffect(AuthenticationNamespaceRegistrationSchema)({
    allowedAudiences: ['operations-dashboard'],
    authenticationNamespaceId: 'ontos.staff.better-auth.v1',
    provider: 'better-auth',
    requiresOperationAdmission: false,
    reservationPrincipalKind: 'human',
    subjectTypes: ['user', 'api_key'],
    trustedAttesterPrincipalIds: [],
  }).pipe(Effect.flatMap((registration) => makeAuthenticationNamespaceRegistryEffect([registration]))),
);
