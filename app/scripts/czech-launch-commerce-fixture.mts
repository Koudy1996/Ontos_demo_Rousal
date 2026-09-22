import { Effect, Schema } from 'effect';

import {
  AssociateStorefrontPayloadSchema,
  CreateMarketPayloadSchema,
} from '../verticals/commerce-market-catalog/shared/action-contracts.ts';
import { MarketDefinitionRevisionRefSchema } from '../verticals/commerce-market-catalog/shared/resources/market-definition-revision.ts';
import type { MarketDefinitionRevisionRef } from '../verticals/commerce-market-catalog/shared/resources/market-definition-revision.ts';
import {
  CommerceQuantityRuleAdministrationPayloadSchema,
  MarketBootstrapPolicyAdministrationPayloadSchema,
  PaymentTermPolicyAdministrationPayloadSchema,
  PurchaseCurrencyPolicyAdministrationPayloadSchema,
} from '../verticals/commerce-customer-context/shared/domain/customer-commerce-policy-administration.ts';

const tenantId = '70000000-0000-4000-8000-000000000010';
const sellingLegalEntityId = '71000000-0000-4000-8000-000000000010';
const marketId = '74000000-0000-4000-8000-000000000010';
const storefrontId = 'czech-launch-b2c';
const effectiveFrom = '2026-10-01T00:00:00.000Z';
const reason = 'Deterministic Czech Launch development fixture';

const sellingLegalEntityRef = {
  moduleId: 'core.identity',
  resourceId: sellingLegalEntityId,
  resourceType: 'core.identity.legal-entity',
  tenantId,
} as const;
const marketRef = {
  moduleId: 'commerce.market-catalog',
  resourceId: marketId,
  resourceType: 'commerce.market-catalog.market',
  tenantId,
} as const;
const storefrontRef = { appId: storefrontId, tenantId } as const;
const catalogVariantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000010',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const catalogProductUnitRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000020',
  resourceType: 'commerce.catalog.product-unit',
  tenantId,
} as const;

export const CZECH_LAUNCH_COMMERCE_FIXTURE = Object.freeze({
  actionKeys: Object.freeze({
    associateStorefront: 'commerce.market-catalog.associate-storefront',
    createMarket: 'commerce.market-catalog.create-market',
    marketBootstrap: 'commerce.customer-context.administer-market-bootstrap-policy',
    paymentTerm: 'commerce.customer-context.administer-payment-term-policy',
    purchaseCurrency: 'commerce.customer-context.administer-purchase-currency-policy',
    quantity: 'commerce.customer-context.administer-commerce-quantity-rule',
  }),
  market: {
    channels: ['B2C'],
    effectivePeriod: { startsAt: effectiveFrom },
    jurisdictions: [{ code: 'CZ', kind: 'COUNTRY' }],
    lifecycle: 'ACTIVE',
    marketCode: 'CZ_B2C',
    marketId,
    purpose: 'Czech Launch B2C commerce',
    reason,
    sellingLegalEntityRef,
    supportedLocales: ['cs-CZ'],
  },
  policies: {
    marketBootstrap: {
      _tag: 'CREATE_REVISION',
      expectedGeneration: 0,
      revision: {
        effectiveFrom,
        effectiveTo: null,
        field: 'MARKET_BOOTSTRAP',
        idempotencyKey: 'czech-launch-market-bootstrap-v1',
        lifecycle: 'ACTIVE',
        reason,
        revisionId: '75000000-0000-4000-8000-000000000010',
        scope: { channelId: 'B2C', kind: 'CHANNEL_SELLER', sellingLegalEntityId },
        value: {
          defaultChannelId: 'B2C',
          defaultCommerceMarketId: marketId,
          defaultSellingLegalEntityId: sellingLegalEntityId,
          kind: 'DEFAULT_MARKET_TUPLE',
        },
      },
    },
    paymentTerm: {
      _tag: 'CREATE_REVISION',
      expectedGeneration: 0,
      revision: {
        effectiveFrom,
        effectiveTo: null,
        field: 'PAYMENT_TERM',
        idempotencyKey: 'czech-launch-payment-term-v1',
        lifecycle: 'ACTIVE',
        reason,
        revisionId: '75000000-0000-4000-8000-000000000030',
        scope: { kind: 'SELLER', sellingLegalEntityId },
        value: {
          kind: 'FALLBACK_PAYMENT_TERM',
          paymentTermRef: {
            moduleId: 'payment.term-catalog',
            resourceId: 'czech-launch-net-14',
            resourceType: 'payment.term-catalog.payment-term',
            tenantId,
          },
        },
      },
    },
    purchaseCurrency: [
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 0,
        revision: {
          effectiveFrom,
          effectiveTo: null,
          field: 'PURCHASE_CURRENCY',
          idempotencyKey: 'czech-launch-allowed-currency-v1',
          lifecycle: 'ACTIVE',
          reason,
          revisionId: '75000000-0000-4000-8000-000000000020',
          scope: { kind: 'SELLER', sellingLegalEntityId },
          value: { currencyCode: 'CZK', kind: 'ALLOWED_CURRENCY_CONSTRAINT' },
        },
      },
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 1,
        revision: {
          effectiveFrom,
          effectiveTo: null,
          field: 'PURCHASE_CURRENCY',
          idempotencyKey: 'czech-launch-default-currency-v1',
          lifecycle: 'ACTIVE',
          reason,
          revisionId: '75000000-0000-4000-8000-000000000021',
          scope: { kind: 'SELLER', sellingLegalEntityId },
          value: { currencyCode: 'CZK', kind: 'DEFAULT_CURRENCY' },
        },
      },
    ],
    quantity: {
      _tag: 'CREATE_REVISION',
      expectedGeneration: 0,
      revision: {
        effectiveFrom,
        effectiveTo: null,
        field: 'COMMERCE_QUANTITY_RULE',
        idempotencyKey: 'czech-launch-quantity-v1',
        lifecycle: 'ACTIVE',
        reason,
        revisionId: '75000000-0000-4000-8000-000000000040',
        scope: { channelId: 'B2C', kind: 'CHANNEL_SELLER', sellingLegalEntityId },
        value: {
          basis: {
            targetDivisibilityRevision: 1,
            targetRef: catalogVariantRef,
            unitRef: catalogProductUnitRef,
            unitRuleRevision: 1,
          },
          constraintMode: 'REPLACEABLE_ENVELOPE',
          envelope: { kind: 'BOUNDED', maximum: null, minimum: '1', multiple: '1' },
          kind: 'COMMERCE_QUANTITY_RULE',
          selector: { kind: 'VARIANT', variantRef: catalogVariantRef },
        },
      },
    },
  },
  scope: { channelId: 'B2C', marketId, sellingLegalEntityId, storefrontId, tenantId },
});

const buildCzechLaunchStorefrontAssociation = (definitionRevisionRef: MarketDefinitionRevisionRef) => ({
  associationId: '74000000-0000-4000-8000-000000000020',
  channel: 'B2C',
  effectivePeriod: { startsAt: effectiveFrom },
  expectedMarketDefinitionRevisionRef: definitionRevisionRef,
  marketRef,
  provenance: { kind: 'CONFIGURATION_ACTION', reference: 'czech-launch-fixture-v1' },
  reason,
  sellingLegalEntityRef,
  storefrontRef,
});

const CzechLaunchActivationEvidenceSchema = Schema.Struct({
  catalogQuantityBasisCurrent: Schema.Literal(true),
  marketEligibleTupleCurrent: Schema.Literal(true),
  paymentTermCurrent: Schema.Literal(true),
  policySetsComplete: Schema.Struct({
    marketBootstrap: Schema.Literal(true),
    paymentTerm: Schema.Literal(true),
    purchaseCurrency: Schema.Literal(true),
    quantity: Schema.Literal(true),
  }),
}).annotate({ parseOptions: { onExcessProperty: 'error' } });

export class CzechLaunchActivationRejected extends Schema.TaggedError<CzechLaunchActivationRejected>()(
  'CzechLaunchActivationRejected',
  { reason: Schema.String },
) {}

export interface CzechLaunchActivationCandidate {
  readonly catalogQuantityBasisCurrent: boolean;
  readonly marketEligibleTupleCurrent: boolean;
  readonly paymentTermCurrent: boolean;
  readonly policySetsComplete: {
    readonly marketBootstrap: boolean;
    readonly paymentTerm: boolean;
    readonly purchaseCurrency: boolean;
    readonly quantity: boolean;
  };
}

/**
 * Operator-only activation guard. The fixture is never applied from application startup: callers must first obtain
 * Current owner evidence for the Market tuple, Payment Term, Catalog quantity basis, and every complete policy set.
 */
export const validateCzechLaunchActivation = (evidence: CzechLaunchActivationCandidate) =>
  Schema.decodeUnknownEffect(CzechLaunchActivationEvidenceSchema)(evidence).pipe(
    Effect.mapError(
      () =>
        new CzechLaunchActivationRejected({
          reason: 'Czech Launch activation requires current owner inventory and complete four-field policy evidence',
        }),
    ),
  );

export const validateCzechLaunchFixtureContracts = () =>
  Effect.gen(function* validateFixtureContracts() {
    const definitionRevisionRef = yield* Schema.decodeUnknownEffect(MarketDefinitionRevisionRefSchema)({
      moduleId: 'commerce.market-catalog',
      resourceId: '74000000-0000-4000-8000-000000000011',
      resourceType: 'commerce.market-catalog.market-definition-revision',
      tenantId,
    });
    return yield* Effect.all(
      [
        Schema.decodeUnknownEffect(CreateMarketPayloadSchema)(CZECH_LAUNCH_COMMERCE_FIXTURE.market),
        Schema.decodeUnknownEffect(MarketBootstrapPolicyAdministrationPayloadSchema)(
          CZECH_LAUNCH_COMMERCE_FIXTURE.policies.marketBootstrap,
        ),
        Effect.all(
          CZECH_LAUNCH_COMMERCE_FIXTURE.policies.purchaseCurrency.map((payload) =>
            Schema.decodeUnknownEffect(PurchaseCurrencyPolicyAdministrationPayloadSchema)(payload),
          ),
          { concurrency: 'unbounded' },
        ),
        Schema.decodeUnknownEffect(PaymentTermPolicyAdministrationPayloadSchema)(
          CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm,
        ),
        Schema.decodeUnknownEffect(CommerceQuantityRuleAdministrationPayloadSchema)(
          CZECH_LAUNCH_COMMERCE_FIXTURE.policies.quantity,
        ),
        Schema.decodeUnknownEffect(AssociateStorefrontPayloadSchema)(
          buildCzechLaunchStorefrontAssociation(definitionRevisionRef),
        ),
      ],
      { concurrency: 'unbounded' },
    );
  });
