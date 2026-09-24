import { randomUUID } from 'node:crypto';

import { DateTime, Effect, Layer } from 'effect';

import { STAFF_AUTHENTICATION_NAMESPACE_ID } from '../apps/shell-super-app/api/auth/authentication-namespace.ts';
import { ActionRuntime, ReadRuntime } from '../packages/core-runtime/src/index.ts';
import {
  paymentTermCatalogActionRuntime,
  paymentTermCatalogReadRuntime,
} from '../verticals/payment-term-catalog/api/index.ts';
import { unavailableCustomerContextGatewayCredentialLive } from '../verticals/payment-term-catalog/api/payment-term-catalog-production-layers.ts';
import { createPaymentTermAction } from '../verticals/payment-term-catalog/src/actions/create-payment-term.action.ts';
import { currentPaymentTermsRead } from '../verticals/payment-term-catalog/src/api/current-payment-terms.read.ts';
import { StaffAuthenticationNamespaceRegistryLive } from '../verticals/billing-documents/src/auth/staff-authentication-namespace.ts';
import { LOCAL_BILLING_DOCUMENTS_API_KEY_ID, LOCAL_DEVELOPMENT_CONTEXT } from './initialize-local-development.mts';

const actionRuntime = Layer.mergeAll(
  paymentTermCatalogActionRuntime.pipe(Layer.provideMerge(unavailableCustomerContextGatewayCredentialLive)),
  paymentTermCatalogReadRuntime,
  StaffAuthenticationNamespaceRegistryLive,
);

const hasSuitablePaymentTerm = Effect.gen(function* findSuitablePaymentTerm() {
  const correlationId = randomUUID();
  const runtime = yield* ReadRuntime;
  const at = DateTime.formatIso(yield* DateTime.now);
  const result = yield* runtime.runRead({
    input: { at, limit: 200, references: [] },
    principal: {
      authBindingId: LOCAL_DEVELOPMENT_CONTEXT.billingApiKeyAuthBindingId,
      authContextRef: `better-auth-api-key:${LOCAL_BILLING_DOCUMENTS_API_KEY_ID}`,
      authenticationNamespaceId: STAFF_AUTHENTICATION_NAMESPACE_ID,
      authMethod: 'api_key',
      legalEntityId: LOCAL_DEVELOPMENT_CONTEXT.legalEntityId,
      principalId: LOCAL_DEVELOPMENT_CONTEXT.principalId,
      tenantId: LOCAL_DEVELOPMENT_CONTEXT.tenantId,
    },
    registration: currentPaymentTermsRead,
    transport: { correlationId },
  });
  return result.current.some(
    ({ semantics }) =>
      semantics.kind === 'NET_DAYS' &&
      semantics.days === 14 &&
      semantics.dueDateAnchor === 'INVOICE_ISSUED_AT' &&
      semantics.calendarRule === 'CALENDAR_DAYS_UTC' &&
      semantics.calculationRuleVersion === 1,
  );
});

const createDefaultPaymentTerm = ActionRuntime.pipe(
  Effect.flatMap((runtime) =>
    runtime.runAction({
      payload: {
        activeFrom: '2026-01-01T00:00:00.000Z',
        code: 'NET_14',
        description: 'Splatnost čtrnáct kalendářních dnů od vystavení faktury.',
        name: 'Splatnost 14 dní',
        reason: 'Výchozí platební podmínka lokálního ERP dema SOS vyklízení',
        semantics: {
          calculationRuleVersion: 1,
          calendarRule: 'CALENDAR_DAYS_UTC',
          days: 14,
          dueDateAnchor: 'INVOICE_ISSUED_AT',
          kind: 'NET_DAYS',
        },
      },
      principal: {
        authBindingId: LOCAL_DEVELOPMENT_CONTEXT.billingApiKeyAuthBindingId,
        authContextRef: `better-auth-api-key:${LOCAL_BILLING_DOCUMENTS_API_KEY_ID}`,
        authenticationNamespaceId: STAFF_AUTHENTICATION_NAMESPACE_ID,
        authMethod: 'api_key',
        legalEntityId: LOCAL_DEVELOPMENT_CONTEXT.legalEntityId,
        principalId: LOCAL_DEVELOPMENT_CONTEXT.principalId,
        tenantId: LOCAL_DEVELOPMENT_CONTEXT.tenantId,
      },
      registration: createPaymentTermAction,
      transport: {
        correlationId: randomUUID(),
        idempotencyKey: 'ontos-local-billing-demo-payment-term-net-14-v2',
      },
    }),
  ),
  Effect.catchTag('ActionAlreadyCommitted', () => Effect.void),
);

const initializeBillingDemo = hasSuitablePaymentTerm.pipe(
  Effect.flatMap((suitableExists) => (suitableExists ? Effect.void : createDefaultPaymentTerm)),
  Effect.asVoid,
  Effect.provide(actionRuntime),
);

await Effect.runPromise(initializeBillingDemo);
