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
import { QuantityPreparationResponseSchema } from '../verticals/catalog/shared/apis/quantity-preparation.ts';
import type { QuantityPreparationResponse } from '../verticals/catalog/shared/apis/quantity-preparation.ts';

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
const catalogProductRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000001',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const catalogVariantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000010',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const catalogPackageOptionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000015',
  resourceType: 'commerce.catalog.package-definition',
  tenantId,
} as const;
const catalogProductUnitRef = {
  moduleId: 'commerce.catalog',
  resourceId: '76000000-0000-4000-8000-000000000020',
  resourceType: 'commerce.catalog.product-unit',
  tenantId,
} as const;
const catalogSelection = {
  packageOption: {
    contentRevision: { resourceRef: catalogPackageOptionRef, revision: 1 },
    optionRef: catalogPackageOptionRef,
  },
  productRef: catalogProductRef,
  variantRef: catalogVariantRef,
} as const;
const catalogQuantityOwnerRevision = 'commerce.catalog.quantity:czech-launch-v1';
const catalogQuantityEvidence = {
  completeness: {
    observedAt: effectiveFrom,
    ownerRevision: catalogQuantityOwnerRevision,
    scope: {
      kind: 'EXACT_PREDICATE',
      predicateRef: 'commerce.catalog.quantity-preparation:czech-launch-package:purchase-acceptance:1',
    },
  },
  divisible: false,
  equivalentSelectionKey: 'commerce.catalog.selection:czech-launch-package',
  evidence: {
    assessedAt: effectiveFrom,
    basis: [
      { role: 'PRODUCT', source: { resourceRef: catalogProductRef, revision: 1 } },
      { role: 'VARIANT', source: { resourceRef: catalogVariantRef, revision: 1 } },
      {
        provenance: 'CATALOG_OWNER_CONFIRMED_UNTYPED_DECISION',
        role: 'PRODUCT_TYPE_UNTYPED_DECISION',
        source: { resourceRef: catalogProductRef, revision: 1 },
      },
      { role: 'PACKAGE_CONTENT', source: { resourceRef: catalogPackageOptionRef, revision: 1 } },
      { role: 'UNIT_RULE', source: { resourceRef: catalogProductUnitRef, revision: 1 } },
      { role: 'UNIT_TARGET_DIVISIBILITY', source: { resourceRef: catalogPackageOptionRef, revision: 1 } },
    ],
    membership: {
      attestationId: 'czech-launch-catalog-membership-v1',
      observedAt: effectiveFrom,
      productRef: catalogProductRef,
      source: 'CATALOG_OWNER_CURRENT_READ',
      variant: { resourceRef: catalogVariantRef, revision: 1 },
    },
    purpose: 'PURCHASE_ACCEPTANCE',
    selection: catalogSelection,
    status: 'VALID',
  },
  hierarchyRevision: 'commerce.catalog.hierarchy:czech-launch-v1',
  ownerRevision: catalogQuantityOwnerRevision,
  packageContent: {
    amount: '10',
    path: [{ resourceRef: catalogPackageOptionRef, revision: 1 }],
    status: 'VALID',
    unitRef: catalogProductUnitRef,
  },
  packageRevision: {
    amount: '10',
    form: { productRef: catalogProductRef, variantRef: catalogVariantRef },
    reference: { resourceRef: catalogPackageOptionRef, revision: 1 },
    unitRef: catalogProductUnitRef,
  },
  quantity: {
    changed: false,
    notice: null,
    requested: '1',
    resulting: '1',
    rounding: 'UP',
    status: 'VALID',
    step: '1',
    targetId: catalogPackageOptionRef.resourceId,
    tenantId,
    unitId: catalogProductUnitRef.resourceId,
    unitRuleRevision: 1,
  },
  quantityBasis: {
    targetDivisibilityRevision: 1,
    targetRef: catalogPackageOptionRef,
    unitRef: catalogProductUnitRef,
    unitRuleRevision: 1,
  },
  selection: catalogSelection,
  status: 'READY',
  unitRef: catalogProductUnitRef,
} as const;
const paymentTermRef = {
  moduleId: 'payment.term-catalog',
  resourceId: 'czech-launch-net-14',
  resourceType: 'payment.term-catalog.payment-term',
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
  ownerFacts: {
    catalogQuantity: catalogQuantityEvidence,
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
    paymentTerm: [
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 0,
        revision: {
          effectiveFrom,
          effectiveTo: null,
          field: 'PAYMENT_TERM',
          idempotencyKey: 'czech-launch-applicable-payment-term-v1',
          lifecycle: 'ACTIVE',
          reason,
          revisionId: '75000000-0000-4000-8000-000000000030',
          scope: { kind: 'SELLER', sellingLegalEntityId },
          value: { kind: 'APPLICABLE_PAYMENT_TERM_CONSTRAINT', paymentTermRef },
        },
      },
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 1,
        revision: {
          effectiveFrom,
          effectiveTo: null,
          field: 'PAYMENT_TERM',
          idempotencyKey: 'czech-launch-fallback-payment-term-v1',
          lifecycle: 'ACTIVE',
          reason,
          revisionId: '75000000-0000-4000-8000-000000000031',
          scope: { kind: 'SELLER', sellingLegalEntityId },
          value: {
            kind: 'FALLBACK_PAYMENT_TERM',
            paymentTermRef,
          },
        },
      },
    ],
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
            targetRef: catalogPackageOptionRef,
            unitRef: catalogProductUnitRef,
            unitRuleRevision: 1,
          },
          constraintMode: 'REPLACEABLE_ENVELOPE',
          envelope: { kind: 'BOUNDED', maximum: null, minimum: '1', multiple: '1' },
          kind: 'COMMERCE_QUANTITY_RULE',
          selector: { kind: 'PACKAGE_OPTION', packageOptionRef: catalogPackageOptionRef },
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

const CurrentCatalogQuantityEvidenceSchema = QuantityPreparationResponseSchema.check(
  Schema.makeFilter((evidence) =>
    evidence.status === 'READY' ? undefined : 'Czech Launch activation requires READY Catalog quantity evidence',
  ),
);

const CzechLaunchActivationEvidenceSchema = Schema.Struct({
  catalogQuantity: CurrentCatalogQuantityEvidenceSchema,
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
  readonly catalogQuantity: Extract<QuantityPreparationResponse, { readonly status: 'READY' }>;
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
        Effect.all(
          CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm.map((payload) =>
            Schema.decodeUnknownEffect(PaymentTermPolicyAdministrationPayloadSchema)(payload),
          ),
          { concurrency: 'unbounded' },
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
