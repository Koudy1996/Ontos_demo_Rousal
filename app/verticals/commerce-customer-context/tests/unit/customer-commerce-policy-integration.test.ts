import type { ContextAccessService, OperationalScope, ScopedRoutineDefinition } from '@app/core-runtime';
import { getVerticalRuntimeEntrypoints, toContextPermissionAccessKey } from '@app/core-runtime';
import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { Effect, Predicate, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { makeReadRuntime } from '../../../../packages/core-runtime/src/reads/runtime.ts';
import { makeTestDatabase } from '../../../../packages/core-runtime/tests/support/database.ts';
import { openModuleEntrypointGateway } from '../../../../packages/core-runtime/tests/support/open-module-entrypoint-gateway.ts';
import { CommerceQuantityPolicyCurrentResponseSchema } from '../../shared/apis/commerce-quantity-policy-current.ts';
import { PaymentTermPolicyCurrentResponseSchema } from '../../shared/apis/payment-term-policy-current.ts';
import { PurchaseCurrencyPolicyCurrentResponseSchema } from '../../shared/apis/purchase-currency-policy-current.ts';
import {
  CustomerCommercePolicyAdministrationRejected,
  PurchaseCurrencyPolicyAdministrationPayloadSchema,
  toTrustedPurchaseCurrencyPolicyAdministrationCommand,
} from '../../shared/domain/customer-commerce-policy-administration.ts';
import type { MarketBootstrapPolicyBatchCurrentResponse } from '../../shared/domain/customer-commerce-policy-administration.ts';
import { OutboxPayloadSchema as QuantityAssignmentChangedOutboxPayloadSchema } from '../../shared/outbox/commerce-customer-context-commerce-quantity-rule-assignment-changed.ts';
import { OutboxPayloadSchema as QuantityRuleChangedOutboxPayloadSchema } from '../../shared/outbox/commerce-customer-context-commerce-quantity-rule-changed.ts';
import { OutboxPayloadSchema as MarketBootstrapChangedOutboxPayloadSchema } from '../../shared/outbox/commerce-customer-context-market-bootstrap-policy-changed.ts';
import { OutboxPayloadSchema as PaymentTermChangedOutboxPayloadSchema } from '../../shared/outbox/commerce-customer-context-payment-term-policy-changed.ts';
import { OutboxPayloadSchema as PurchaseCurrencyChangedOutboxPayloadSchema } from '../../shared/outbox/commerce-customer-context-purchase-currency-policy-changed.ts';
import { administerCommerceQuantityRuleAction } from '../../src/actions/administer-commerce-quantity-rule.action.ts';
import { administerMarketBootstrapPolicyAction } from '../../src/actions/administer-market-bootstrap-policy.action.ts';
import { administerPaymentTermPolicyAction } from '../../src/actions/administer-payment-term-policy.action.ts';
import { createAdministerPurchaseCurrencyPolicyCommerceCustomerContextPurchaseCurrencyPolicyChangedOutboxMessage } from '../../src/actions/administer-purchase-currency-policy-commerce-customer-context-purchase-currency-policy-changed.outbox-message.ts';
import { administerPurchaseCurrencyPolicyAction } from '../../src/actions/administer-purchase-currency-policy.action.ts';
import { assignCommerceQuantityRuleAction } from '../../src/actions/assign-commerce-quantity-rule.action.ts';
import { commerceQuantityPolicyCurrentRead } from '../../src/api/commerce-quantity-policy-current.read.ts';
import { marketBootstrapPolicyCurrentRead } from '../../src/api/market-bootstrap-policy-current.read.ts';
import { paymentTermPolicyCurrentRead } from '../../src/api/payment-term-policy-current.read.ts';
import { purchaseCurrencyPolicyCurrentRead } from '../../src/api/purchase-currency-policy-current.read.ts';
import type { CustomerCommercePolicyScopedRoutineInvoker } from '../../src/persistence/customer-commerce-policy-persistence.ts';
import { customerCommercePolicyAdministrationServiceFactory } from '../../src/services/customer-commerce-policy-administration.service.ts';
import type { CustomerCommercePolicyAdministrationService } from '../../src/services/customer-commerce-policy-administration.service.ts';
import { commerceCustomerContextManifest } from '../../vertical.manifest.ts';
import { commerceCustomerContextRegistration } from '../../vertical.registration.ts';

const tenantId = '10000000-0000-4000-8000-000000000001';
const legalEntityId = '20000000-0000-4000-8000-000000000001';
const principalId = '30000000-0000-4000-8000-000000000001';
const purchaseCurrencyRevisionId = '50000000-0000-4000-8000-000000000001';
const stalePurchaseCurrencyRevisionId = '50000000-0000-4000-8000-000000000002';
const paymentTermRevisionId = '50000000-0000-4000-8000-000000000003';
const quantityRuleRevisionId = '50000000-0000-4000-8000-000000000004';
const quantityAssignmentId = '50000000-0000-4000-8000-000000000005';
const at = '2026-09-21T10:00:00.000Z';
const emptyBootstrapBatch: MarketBootstrapPolicyBatchCurrentResponse = { sellers: [] };

const scopeFields = {
  authBindingId: '40000000-0000-4000-8000-000000000001',
  authContextRef: 'session:customer-commerce-policy-integration',
  authMethod: 'session',
  correlationId: 'customer-commerce-policy-integration',
  legalEntityId,
  principalId,
  tenantId,
} as const;
// SAFETY: fixed UUIDs and session metadata satisfy the trusted OperationalScope test contract.
const scope = scopeFields as OperationalScope & { readonly legalEntityId: string };
const actionPrincipal = {
  authBindingId: scopeFields.authBindingId,
  authContextRef: scopeFields.authContextRef,
  authMethod: scopeFields.authMethod,
  legalEntityId,
  principalId,
  tenantId,
} as const;

interface PolicyReadAuthorizationHarnessOptions {
  readonly contextPermissionDecision: (permission: string) => 'allowed' | 'denied' | 'unavailable';
  readonly modulePermissionDecision: 'allowed' | 'denied' | 'unavailable';
}

const makePolicyReadAuthorizationHarness = Effect.fn(function* makePolicyReadAuthorizationHarness(
  options: PolicyReadAuthorizationHarnessOptions,
) {
  let businessPermissionCalls = 0;
  let handlerQueries = 0;
  const contextPermissions: string[] = [];
  const database = {
    executor: yield* makeTestDatabase((text) => {
      if (text.includes('data_access_events')) {
        return Effect.succeed([]);
      }
      handlerQueries += 1;
      return Effect.succeed([]);
    }),
  };
  const contextAccess: ContextAccessService = {
    businessPermissions: () => {
      businessPermissionCalls += 1;
      return Effect.die('Policy Current reads must not call the business-permission adapter');
    },
    contextPermissions: ({ targets }) =>
      Effect.succeed(
        targets.map((target) => {
          contextPermissions.push(target.permission);
          return {
            decision: options.contextPermissionDecision(target.permission),
            key: toContextPermissionAccessKey(target),
          };
        }),
      ),
    legalEntities: ({ legalEntityIds }) =>
      Effect.succeed(legalEntityIds.map((key) => ({ decision: 'allowed' as const, key }))),
    modules: ({ moduleIds }) =>
      Effect.succeed(moduleIds.map((key) => ({ decision: options.modulePermissionDecision, key }))),
    resources: ({ resources }) =>
      Effect.succeed(
        resources.map((resource) => ({
          decision: 'denied' as const,
          key: `${resource.moduleId}:${resource.resourceType}:${resource.resourceId}`,
        })),
      ),
    tenants: ({ tenantIds }) => Effect.succeed(tenantIds.map((key) => ({ decision: 'allowed' as const, key }))),
  };
  const runtime = makeReadRuntime(
    database,
    openModuleEntrypointGateway,
    { resolve: () => Effect.succeed(scope) },
    contextAccess,
  );
  return {
    businessPermissionCalls: () => businessPermissionCalls,
    contextPermissions,
    handlerQueries: () => handlerQueries,
    runtime,
  };
});

const emptyStates = () => ({
  load_commerce_quantity_rule_assignments: {
    assignments: [],
    commandReceipts: [],
    generation: 0,
    unassignments: [],
  },
  load_commerce_quantity_rule_state: {
    commandReceipts: [],
    field: 'COMMERCE_QUANTITY_RULE',
    generation: 0,
    lifecycleTransitions: [],
    revisions: [],
  },
  load_market_bootstrap_policy_state: {
    commandReceipts: [],
    field: 'MARKET_BOOTSTRAP',
    generation: 0,
    lifecycleTransitions: [],
    revisions: [],
  },
  load_payment_term_policy_state: {
    commandReceipts: [],
    field: 'PAYMENT_TERM',
    generation: 0,
    lifecycleTransitions: [],
    revisions: [],
  },
  load_purchase_currency_policy_state: {
    commandReceipts: [],
    field: 'PURCHASE_CURRENCY',
    generation: 0,
    lifecycleTransitions: [],
    revisions: [],
  },
});

interface RoutineCall {
  readonly name: string;
  readonly values: readonly unknown[];
}

interface StatefulInvoker {
  readonly calls: RoutineCall[];
  readonly invoker: CustomerCommercePolicyScopedRoutineInvoker;
}

const statefulInvoker = (
  bootstrapBatch: MarketBootstrapPolicyBatchCurrentResponse = emptyBootstrapBatch,
  stateOverrides: Readonly<Record<string, Schema.Json>> = {},
): StatefulInvoker => {
  const calls: RoutineCall[] = [];
  const states = new Map<string, Schema.Json>(Object.entries({ ...emptyStates(), ...stateOverrides }));
  const fake = {
    invoke: (routine: ScopedRoutineDefinition, values: readonly unknown[]) =>
      Effect.sync(() => {
        calls.push({ name: routine.name, values });
        if (routine.name === 'load_current_market_bootstrap_policy_candidates') {
          return [{ result: bootstrapBatch }];
        }
        if (routine.name.startsWith('load_')) {
          return [{ result: states.get(routine.name) ?? null }];
        }
        const loadName = routine.name.replace(/^persist_/u, 'load_');
        const [, payloadValue] = values;
        const payload = Schema.decodeUnknownSync(Schema.Struct({ state: Schema.Json }))(payloadValue);
        states.set(loadName, payload.state);
        return [{ result: { applied: true } }];
      }),
  };
  // SAFETY: the fake implements the repository's sole generic `invoke` test seam and returns routine-schema-shaped rows.
  return { calls, invoker: fake as CustomerCommercePolicyScopedRoutineInvoker };
};

const asServiceTransaction = (invoker: CustomerCommercePolicyScopedRoutineInvoker) =>
  // SAFETY: the service uses only the scoped-routine `invoke` seam exposed by its persistence repository.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Scoped transaction behavior beyond `invoke` is unreachable in this owner repository test.
  invoker as Parameters<typeof customerCommercePolicyAdministrationServiceFactory>[0];

const purchaseCurrencyRevisionInput = {
  effectiveFrom: at,
  effectiveTo: null,
  field: 'PURCHASE_CURRENCY',
  idempotencyKey: 'purchase-currency-create-1',
  lifecycle: 'ACTIVE',
  reason: 'Launch currency',
  revisionId: purchaseCurrencyRevisionId,
  scope: { kind: 'SELLER', sellingLegalEntityId: legalEntityId },
  value: { currencyCode: 'CZK', kind: 'DEFAULT_CURRENCY' },
} as const;
const purchaseCurrencyPayload = Schema.decodeUnknownSync(PurchaseCurrencyPolicyAdministrationPayloadSchema)({
  _tag: 'CREATE_REVISION',
  expectedGeneration: 0,
  revision: purchaseCurrencyRevisionInput,
});

const purchaseCurrencyCommand = toTrustedPurchaseCurrencyPolicyAdministrationCommand(
  purchaseCurrencyPayload,
  {
    actionInvocationId: '60000000-0000-4000-8000-000000000001',
    actorPrincipalId: principalId,
    sellingLegalEntityId: legalEntityId,
    tenantId,
  },
  at,
);
const stalePurchaseCurrencyCommand = toTrustedPurchaseCurrencyPolicyAdministrationCommand(
  Schema.decodeUnknownSync(PurchaseCurrencyPolicyAdministrationPayloadSchema)({
    _tag: 'CREATE_REVISION',
    expectedGeneration: 0,
    revision: {
      ...purchaseCurrencyRevisionInput,
      idempotencyKey: 'purchase-currency-create-2',
      revisionId: stalePurchaseCurrencyRevisionId,
    },
  }),
  {
    actionInvocationId: '60000000-0000-4000-8000-000000000002',
    actorPrincipalId: principalId,
    sellingLegalEntityId: legalEntityId,
    tenantId,
  },
  at,
);

const administrationFields = {
  actionInvocationId: '60000000-0000-4000-8000-000000000003',
  actorPrincipalId: principalId,
  effectiveFrom: at,
  effectiveTo: null,
  idempotencyKey: 'policy-projection-idempotency',
  lifecycle: 'ACTIVE',
  reason: 'Must remain private administration metadata',
  tenantId,
} as const;

const currentProjectionStates = {
  load_commerce_quantity_rule_assignments: {
    assignments: [
      {
        ...administrationFields,
        assignmentId: quantityAssignmentId,
        profile: {
          kind: 'RETAIL',
          profileRef: {
            moduleId: 'commerce.customer-context',
            resourceId: 'retail-profile-1',
            resourceType: 'commerce.customer-context.retail-customer-profile',
            tenantId,
          },
        },
        recordedAt: at,
        ruleRevisionRef: {
          moduleId: 'commerce.customer-context',
          resourceId: quantityRuleRevisionId,
          resourceType: 'commerce.customer-context.commerce-quantity-rule',
          tenantId,
        },
        sellingLegalEntityId: legalEntityId,
      },
    ],
    commandReceipts: [],
    generation: 1,
    unassignments: [],
  },
  load_commerce_quantity_rule_state: {
    commandReceipts: [],
    field: 'COMMERCE_QUANTITY_RULE',
    generation: 1,
    lifecycleTransitions: [],
    revisions: [
      {
        ...administrationFields,
        field: 'COMMERCE_QUANTITY_RULE',
        revisionId: quantityRuleRevisionId,
        scope: { channelId: 'web', kind: 'CHANNEL_SELLER', sellingLegalEntityId: legalEntityId },
        value: {
          basis: {
            basisRef: {
              moduleId: 'commerce.catalog',
              resourceId: 'each',
              resourceType: 'commerce.catalog.quantity-basis',
              tenantId,
            },
            ownerRevision: 'quantity-basis:1',
            unitRef: {
              moduleId: 'commerce.catalog',
              resourceId: 'piece',
              resourceType: 'commerce.catalog.quantity-unit',
              tenantId,
            },
          },
          constraintMode: 'REPLACEABLE_ENVELOPE',
          envelope: { kind: 'NO_COMMERCIAL_QUANTITY_RESTRICTION' },
          kind: 'COMMERCE_QUANTITY_RULE',
          selector: { kind: 'ALL' },
        },
      },
    ],
  },
  load_payment_term_policy_state: {
    commandReceipts: [],
    field: 'PAYMENT_TERM',
    generation: 1,
    lifecycleTransitions: [],
    revisions: [
      {
        ...administrationFields,
        field: 'PAYMENT_TERM',
        revisionId: paymentTermRevisionId,
        scope: { kind: 'SELLER', sellingLegalEntityId: legalEntityId },
        value: {
          kind: 'FALLBACK_PAYMENT_TERM',
          paymentTermRef: {
            moduleId: 'payment.term-catalog',
            resourceId: 'net-14',
            resourceType: 'payment.term-catalog.payment-term',
            tenantId,
          },
        },
      },
    ],
  },
  load_purchase_currency_policy_state: {
    commandReceipts: [],
    field: 'PURCHASE_CURRENCY',
    generation: 1,
    lifecycleTransitions: [],
    revisions: [
      {
        ...administrationFields,
        field: 'PURCHASE_CURRENCY',
        revisionId: purchaseCurrencyRevisionId,
        scope: { kind: 'SELLER', sellingLegalEntityId: legalEntityId },
        value: { currencyCode: 'CZK', kind: 'DEFAULT_CURRENCY' },
      },
    ],
  },
} as const satisfies Readonly<Record<string, Schema.Json>>;

describe('Customer Commerce Policy integration', () => {
  it.effect('persists a changed mutation once, replays idempotently, and maps stale generation', () => {
    const { calls, invoker } = statefulInvoker();
    return Effect.gen(function* mutationRoundTrip() {
      const service = yield* customerCommercePolicyAdministrationServiceFactory(asServiceTransaction(invoker), scope);
      const changed = yield* service.administerPurchaseCurrencyPolicy(purchaseCurrencyCommand);
      const replay = yield* service.administerPurchaseCurrencyPolicy(purchaseCurrencyCommand);
      const stale = yield* Effect.flip(service.administerPurchaseCurrencyPolicy(stalePurchaseCurrencyCommand));

      expect(changed.changed).toBe(true);
      expect(changed.generation).toBe(1);
      expect(replay.changed).toBe(false);
      expect(calls.filter(({ name }) => name === 'persist_purchase_currency_policy_state')).toHaveLength(1);
      expect(calls.find(({ name }) => name === 'persist_purchase_currency_policy_state')?.values[0]).toBe(0n);
      expect(stale.code).toBe('GENERATION_CONFLICT');
    });
  });

  it.effect('combines quantity owner sets and rejects an incomplete bootstrap seller exchange', () => {
    const { invoker } = statefulInvoker({ sellers: [] });
    return Effect.gen(function* currentReads() {
      const service = yield* customerCommercePolicyAdministrationServiceFactory(asServiceTransaction(invoker), scope);
      const quantity = yield* service.readCurrentCommerceQuantityPolicy(purchaseCurrencyCommand.observedAt);
      const bootstrapFailure = yield* Effect.flip(
        service.readCurrentMarketBootstrapPolicyCandidates({
          at: purchaseCurrencyCommand.observedAt,
          eligibleSellingLegalEntityIds: [legalEntityId],
        }),
      );

      expect(quantity.ruleSet.candidates).toEqual([]);
      expect(quantity.assignmentSet.assignments).toEqual([]);
      expect(quantity.ruleSet.completeness.ownerRevision).toBe('COMMERCE_QUANTITY_RULE:0');
      expect(quantity.assignmentSet.completeness.ownerRevision).toBe('COMMERCE_QUANTITY_ASSIGNMENT:0');
      expect(bootstrapFailure.code).toBe('PERSISTENCE_UNAVAILABLE');
    });
  });

  it.effect('projects resolver-facing Current sets without private administration metadata', () => {
    const { invoker } = statefulInvoker(emptyBootstrapBatch, currentProjectionStates);
    return Effect.gen(function* safeCurrentProjections() {
      const service = yield* customerCommercePolicyAdministrationServiceFactory(asServiceTransaction(invoker), scope);
      const currency = yield* service.readCurrentPurchaseCurrencyPolicy(at);
      const paymentTerm = yield* service.readCurrentPaymentTermPolicy(at);
      const quantity = yield* service.readCurrentCommerceQuantityPolicy(at);

      const encodedCurrency = Schema.encodeUnknownSync(PurchaseCurrencyPolicyCurrentResponseSchema)(currency);
      const encodedPaymentTerm = Schema.encodeUnknownSync(PaymentTermPolicyCurrentResponseSchema)(paymentTerm);
      const encodedQuantity = Schema.encodeUnknownSync(CommerceQuantityPolicyCurrentResponseSchema)(quantity);

      expect(Object.keys(currency.candidates[0] ?? {})).toEqual([
        'effectiveFrom',
        'effectiveTo',
        'policyRevisionId',
        'scope',
        'value',
      ]);
      expect(Object.keys(paymentTerm.candidates[0] ?? {})).toEqual([
        'effectiveFrom',
        'effectiveTo',
        'policyRevisionId',
        'scope',
        'value',
      ]);
      expect(Object.keys(quantity.ruleSet.candidates[0] ?? {})).toEqual([
        'effectiveFrom',
        'effectiveTo',
        'policyRevisionId',
        'scope',
        'value',
      ]);
      expect(Object.keys(quantity.assignmentSet.assignments[0] ?? {})).toEqual([
        'assignmentId',
        'effectiveFrom',
        'effectiveTo',
        'profile',
        'ruleRevisionRef',
        'sellingLegalEntityId',
      ]);

      for (const encoded of [encodedCurrency, encodedPaymentTerm, encodedQuantity]) {
        const json = JSON.stringify(encoded);
        expect(json).not.toContain('actionInvocationId');
        expect(json).not.toContain('actorPrincipalId');
        expect(json).not.toContain('idempotencyKey');
        expect(json).not.toContain('lifecycle');
        expect(json).not.toContain('reason');
        expect(json).not.toContain('recordedAt');
      }

      expect(
        Schema.is(PurchaseCurrencyPolicyCurrentResponseSchema)({
          ...currency,
          candidates: [{ ...currency.candidates[0], lifecycle: 'ACTIVE' }],
        }),
      ).toBe(false);
      expect(
        Schema.is(PaymentTermPolicyCurrentResponseSchema)({
          ...paymentTerm,
          candidates: [{ ...paymentTerm.candidates[0], reason: 'private' }],
        }),
      ).toBe(false);
      expect(
        Schema.is(CommerceQuantityPolicyCurrentResponseSchema)({
          ...quantity,
          assignmentSet: {
            ...quantity.assignmentSet,
            assignments: [{ ...quantity.assignmentSet.assignments[0], recordedAt: at }],
          },
        }),
      ).toBe(false);
    });
  });

  it.effect('preserves a typed lifecycle rejection through the real Action runtime', () =>
    Effect.gen(function* actionLifecycleRejection() {
      const rejection = new CustomerCommercePolicyAdministrationRejected({
        code: 'INVALID_LIFECYCLE_TRANSITION',
        reason: 'The requested lifecycle transition is not valid',
        retryable: false,
      });
      const service = {
        administerCommerceQuantityRule: () => Effect.die('unused'),
        administerMarketBootstrapPolicy: () => Effect.die('unused'),
        administerPaymentTermPolicy: () => Effect.die('unused'),
        administerPurchaseCurrencyPolicy: () => Effect.fail(rejection),
        assignCommerceQuantityRule: () => Effect.die('unused'),
        readCurrentCommerceQuantityAssignments: () => Effect.die('unused'),
        readCurrentCommerceQuantityPolicy: () => Effect.die('unused'),
        readCurrentCommerceQuantityRules: () => Effect.die('unused'),
        readCurrentMarketBootstrapPolicy: () => Effect.die('unused'),
        readCurrentMarketBootstrapPolicyCandidates: () => Effect.die('unused'),
        readCurrentPaymentTermPolicy: () => Effect.die('unused'),
        readCurrentPurchaseCurrencyPolicy: () => Effect.die('unused'),
      } satisfies CustomerCommercePolicyAdministrationService;
      const harness = yield* makeActionTestHarness({
        actionPermission: 'allowed',
        services: [bindActionTestServices(administerPurchaseCurrencyPolicyAction, service)],
      });
      const failure = yield* harness.runtime
        .runAction({
          payload: purchaseCurrencyPayload,
          principal: actionPrincipal,
          registration: administerPurchaseCurrencyPolicyAction,
          transport: {
            correlationId: 'policy-lifecycle-rejection',
            idempotencyKey: purchaseCurrencyRevisionInput.idempotencyKey,
          },
        })
        .pipe(Effect.flip);

      expect(Schema.is(CustomerCommercePolicyAdministrationRejected)(failure)).toBe(true);
      expect(failure).toMatchObject({
        code: 'INVALID_LIFECYCLE_TRANSITION',
        reason: rejection.reason,
        retryable: false,
      });
      expect(harness.snapshot().committed).toHaveLength(0);
    }),
  );

  it.effect('short-circuits a missing Action executor before the owner service', () =>
    Effect.gen(function* actionExecutionDenied() {
      let ownerServiceCalls = 0;
      const service = {
        administerCommerceQuantityRule: () => Effect.die('unused'),
        administerMarketBootstrapPolicy: () => Effect.die('unused'),
        administerPaymentTermPolicy: () => Effect.die('unused'),
        administerPurchaseCurrencyPolicy: () => {
          ownerServiceCalls += 1;
          return Effect.die('The denied Action must not reach its owner service');
        },
        assignCommerceQuantityRule: () => Effect.die('unused'),
        readCurrentCommerceQuantityAssignments: () => Effect.die('unused'),
        readCurrentCommerceQuantityPolicy: () => Effect.die('unused'),
        readCurrentCommerceQuantityRules: () => Effect.die('unused'),
        readCurrentMarketBootstrapPolicy: () => Effect.die('unused'),
        readCurrentMarketBootstrapPolicyCandidates: () => Effect.die('unused'),
        readCurrentPaymentTermPolicy: () => Effect.die('unused'),
        readCurrentPurchaseCurrencyPolicy: () => Effect.die('unused'),
      } satisfies CustomerCommercePolicyAdministrationService;
      const harness = yield* makeActionTestHarness({
        actionPermission: 'denied',
        services: [bindActionTestServices(administerPurchaseCurrencyPolicyAction, service)],
      });
      const failure = yield* harness.runtime
        .runAction({
          payload: purchaseCurrencyPayload,
          principal: actionPrincipal,
          registration: administerPurchaseCurrencyPolicyAction,
          transport: {
            correlationId: 'policy-action-executor-denied',
            idempotencyKey: purchaseCurrencyRevisionInput.idempotencyKey,
          },
        })
        .pipe(Effect.flip);

      expect(Predicate.isTagged(failure, 'ActionPermissionDenied')).toBe(true);
      expect(ownerServiceCalls).toBe(0);
      expect(harness.snapshot().committed).toHaveLength(0);
      expect(harness.snapshot().permissionDenials).toHaveLength(1);
    }),
  );

  it.effect('requires both the field context permission and module authority for Current reads', () =>
    Effect.gen(function* isolatedCurrentReadAuthority() {
      const runCurrencyRead = (harness: Effect.Success<ReturnType<typeof makePolicyReadAuthorizationHarness>>) =>
        harness.runtime.runRead({
          input: { at },
          principal: actionPrincipal,
          registration: purchaseCurrencyPolicyCurrentRead,
          transport: { correlationId: 'policy-current-read-authority' },
        });

      const contextOnly = yield* makePolicyReadAuthorizationHarness({
        contextPermissionDecision: () => 'allowed',
        modulePermissionDecision: 'denied',
      });
      const moduleOnly = yield* makePolicyReadAuthorizationHarness({
        contextPermissionDecision: () => 'denied',
        modulePermissionDecision: 'allowed',
      });
      const siblingOnly = yield* makePolicyReadAuthorizationHarness({
        contextPermissionDecision: (permission) =>
          permission === 'customer_commerce_policy.payment_term.read' ? 'allowed' : 'denied',
        modulePermissionDecision: 'allowed',
      });

      for (const harness of [contextOnly, moduleOnly, siblingOnly]) {
        const failure = yield* Effect.flip(runCurrencyRead(harness));
        expect(Predicate.isTagged(failure, 'ReadPermissionDenied')).toBe(true);
        expect(harness.businessPermissionCalls()).toBe(0);
        expect(harness.handlerQueries()).toBe(0);
      }
      expect(contextOnly.contextPermissions).toEqual(['customer_commerce_policy.purchase_currency.read']);
      expect(moduleOnly.contextPermissions).toEqual(['customer_commerce_policy.purchase_currency.read']);
      expect(siblingOnly.contextPermissions).toEqual(['customer_commerce_policy.purchase_currency.read']);
    }),
  );

  it('publishes real Action, outbox, read-scope, audit, and exact permission contracts', () => {
    const actions = [
      administerMarketBootstrapPolicyAction,
      administerPurchaseCurrencyPolicyAction,
      administerPaymentTermPolicyAction,
      administerCommerceQuantityRuleAction,
      assignCommerceQuantityRuleAction,
    ] as const;
    for (const action of actions) {
      expect(action.descriptor.auditEvidenceSchema).toBeDefined();
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
      expect(action.descriptor.businessPermission).toBeUndefined();
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('required');
      expect(Object.keys(action.descriptor.domainEvents)).toHaveLength(1);
    }

    expect(new Set(actions.map(({ descriptor }) => descriptor.actionKey)).size).toBe(actions.length);

    expect(marketBootstrapPolicyCurrentRead.descriptor.legalEntityScope).toBe('optional');
    expect(commerceQuantityPolicyCurrentRead.descriptor.legalEntityScope).toBe('required');
    expect(
      [
        marketBootstrapPolicyCurrentRead,
        purchaseCurrencyPolicyCurrentRead,
        paymentTermPolicyCurrentRead,
        commerceQuantityPolicyCurrentRead,
      ].map(({ descriptor }) => descriptor.entrypoint.authorization),
    ).toEqual([
      { kind: 'context_permission', permission: 'customer_commerce_policy.market_bootstrap.read' },
      { kind: 'context_permission', permission: 'customer_commerce_policy.purchase_currency.read' },
      { kind: 'context_permission', permission: 'customer_commerce_policy.payment_term.read' },
      { kind: 'context_permission', permission: 'customer_commerce_policy.quantity.read' },
    ]);
    expect(
      (commerceCustomerContextManifest.publicSurface.businessPermissions ?? []).some(({ key }) =>
        key.includes('customer_commerce_policy'),
      ),
    ).toBe(false);
    expect(commerceCustomerContextManifest.publicSurface.api?.['commerce-quantity-resolution']).toBeDefined();
    expect(commerceCustomerContextManifest.publicSurface.api?.['market-bootstrap-resolution']).toBeDefined();
    const runtimeEntrypoints = getVerticalRuntimeEntrypoints(commerceCustomerContextRegistration);
    expect(runtimeEntrypoints.api['commerce-quantity-resolution']).toBeTypeOf('function');
    expect(runtimeEntrypoints.api['market-bootstrap-resolution']).toBeTypeOf('function');

    expect(
      createAdministerPurchaseCurrencyPolicyCommerceCustomerContextPurchaseCurrencyPolicyChangedOutboxMessage(
        Schema.decodeUnknownSync(PurchaseCurrencyChangedOutboxPayloadSchema)({
          changed: true,
          field: 'PURCHASE_CURRENCY',
          generation: 1,
          revisionIds: [purchaseCurrencyRevisionId],
        }),
      ),
    ).toEqual({
      payloadJson: {
        changed: true,
        field: 'PURCHASE_CURRENCY',
        generation: 1,
        revisionIds: [purchaseCurrencyRevisionId],
      },
      producerModuleKey: 'commerce.customer-context',
      topic: 'commerce.customer-context.purchase-currency-policy.changed',
    });

    const outboxContracts = [
      [MarketBootstrapChangedOutboxPayloadSchema, 'MARKET_BOOTSTRAP'],
      [PurchaseCurrencyChangedOutboxPayloadSchema, 'PURCHASE_CURRENCY'],
      [PaymentTermChangedOutboxPayloadSchema, 'PAYMENT_TERM'],
      [QuantityRuleChangedOutboxPayloadSchema, 'COMMERCE_QUANTITY_RULE'],
      [QuantityAssignmentChangedOutboxPayloadSchema, 'COMMERCE_QUANTITY_ASSIGNMENT'],
    ] as const;
    for (const [schema, field] of outboxContracts) {
      expect(
        Schema.is(schema)({ changed: false, field, generation: 1, revisionIds: [purchaseCurrencyRevisionId] }),
      ).toBe(false);
      expect(Schema.is(schema)({ changed: true, field, generation: 1, revisionIds: [] })).toBe(false);
      expect(Schema.is(schema)({ changed: true, field, generation: 1, revisionIds: ['not-a-uuid'] })).toBe(false);
    }
  });
});
