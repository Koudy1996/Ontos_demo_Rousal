import { ConfigProvider, Effect, Layer, Redacted } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  catalogQuantityGatewayCredentialLive,
  makeCatalogQuantityGatewayCredentialLayer,
} from '../../api/catalog-quantity-gateway-credential.ts';
import {
  CatalogQuantityGatewayCredentialService,
  unavailableCatalogQuantityGatewayCredentialIssuer,
} from '../../shared/domain/catalog-quantity-gateway-credential.ts';
import { catalogQuantityPortFromEnvironment } from '../../src/integrations/catalog-quantity.ts';

const tenantId = '10000000-0000-4000-8000-000000000001';
const productRef = {
  moduleId: 'commerce.catalog' as const,
  resourceId: '50000000-0000-4000-8000-000000000001',
  resourceType: 'commerce.catalog.product' as const,
  tenantId,
};
const variantRef = {
  moduleId: 'commerce.catalog' as const,
  resourceId: '50000000-0000-4000-8000-000000000002',
  resourceType: 'commerce.catalog.variant' as const,
  tenantId,
};
const unitRef = {
  moduleId: 'commerce.catalog' as const,
  resourceId: '50000000-0000-4000-8000-000000000003',
  resourceType: 'commerce.catalog.product-unit' as const,
  tenantId,
};
const selection = { productRef, variantRef };
const gateway = Layer.succeed(CatalogQuantityGatewayCredentialService, {
  issue: () =>
    Effect.succeed({
      baseUrl: new URL('https://catalog.example.test'),
      credential: Redacted.make('Bearer owner-issued'),
    }),
});

const ready = {
  completeness: {
    observedAt: '2026-09-22T10:00:00.000Z',
    ownerRevision: 'catalog:42',
    scope: { kind: 'EXACT_PREDICATE', predicateRef: 'quantity:selection:1' },
  },
  divisible: true,
  equivalentSelectionKey: 'selection:equivalent:1',
  hierarchyRevision: 'hierarchy:9',
  ownerRevision: 'catalog:42',
  quantity: { requested: '7', resulting: '10', status: 'VALID', step: '5' },
  quantityBasis: {
    targetDivisibilityRevision: 8,
    targetRef: variantRef,
    unitRef,
    unitRuleRevision: 11,
  },
  selection,
  status: 'READY',
};

describe('Catalog Quantity production adapter', () => {
  it.effect('keeps the unavailable credential issuer on the typed fail-closed path', () =>
    Effect.gen(function* rejectsUnavailableCredentialIssuer() {
      const failure = yield* unavailableCatalogQuantityGatewayCredentialIssuer
        .issue({
          audience: 'catalog',
          legalEntityId: '20000000-0000-4000-8000-000000000001',
          requestCorrelation: 'quantity-test',
        })
        .pipe(Effect.flip);

      expect(failure).toEqual({
        _tag: 'CommerceQuantityCatalogUnavailable',
        code: 'catalog_selection_unavailable',
        reason: 'No server-owned Catalog gateway credential issuer is configured',
        retryable: true,
      });
    }),
  );

  it.effect('uses the production gateway composition and retains exact selection, basis, and normalization', () => {
    const gatewayRequests: unknown[] = [];
    return Effect.gen(function* resolvesOwnerFacts() {
      const calls: unknown[] = [];
      const port = yield* catalogQuantityPortFromEnvironment(
        { legalEntityId: '20000000-0000-4000-8000-000000000001', requestCorrelation: 'quantity-test' },
        (payload, credential, correlation, options) => {
          calls.push({ correlation, credential, options, payload });
          return Effect.succeed(ready as never);
        },
      );
      const result = yield* port.resolveCurrentSelections({
        lines: [{ lineId: 'line-1', requestedQuantity: '7', selection }],
        observedAt: '2026-09-22T10:00:00.000Z',
        tenantId,
      });
      expect(calls).toEqual([
        {
          correlation: 'quantity-test',
          credential: 'Bearer owner-issued',
          options: { baseUrl: new URL('https://catalog.example.test') },
          payload: { amount: '7', purpose: 'PURCHASE_ACCEPTANCE', selection },
        },
      ]);
      expect(gatewayRequests).toEqual([
        {
          options: {
            apiKey: expect.anything(),
            baseUrl: new URL('https://shell.example.test'),
            requestCorrelation: 'quantity-test',
          },
          payload: {
            audience: 'catalog',
            legalEntityId: '20000000-0000-4000-8000-000000000001',
          },
        },
      ]);
      expect(result[0]).toMatchObject({
        lineId: 'line-1',
        selection: {
          basis: ready.quantityBasis,
          catalogSelection: selection,
          normalizedQuantity: '10',
          physicalMultiple: '5',
          requestedQuantity: '7',
        },
      });
    }).pipe(
      Effect.provide(
        makeCatalogQuantityGatewayCredentialLayer((payload, options) =>
          Effect.sync(() => {
            gatewayRequests.push({ options, payload });
            return { expiresAt: 1_700_000_300, token: 'owner-issued' };
          }),
        ),
      ),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown(
            {
              ONTOS_CATALOG_BASE_URL: 'https://catalog.example.test',
              ONTOS_COMMERCE_CUSTOMER_CONTEXT_GATEWAY_API_KEY: 'customer-context-owner-key',
              ONTOS_SHELL_GATEWAY_BASE_URL: 'https://shell.example.test',
            },
            { preserveEmptyStrings: true },
          ),
        ),
      ),
    );
  });

  it.effect('fails closed before the owner read when production gateway configuration is unavailable', () =>
    Effect.gen(function* rejectsMissingConfiguration() {
      let ownerReadExecuted = false;
      const port = yield* catalogQuantityPortFromEnvironment(
        { legalEntityId: '20000000-0000-4000-8000-000000000001', requestCorrelation: 'quantity-test' },
        () => {
          ownerReadExecuted = true;
          return Effect.succeed(ready as never);
        },
      );
      const failure = yield* port
        .resolveCurrentSelections({
          lines: [{ lineId: 'line-1', requestedQuantity: '7', selection }],
          observedAt: '2026-09-22T10:00:00.000Z',
          tenantId,
        })
        .pipe(Effect.flip);

      expect(ownerReadExecuted).toBe(false);
      expect(failure).toMatchObject({
        code: 'catalog_selection_unavailable',
        reason: 'Catalog gateway configuration is unavailable',
        retryable: true,
      });
    }).pipe(
      Effect.provide(catalogQuantityGatewayCredentialLive),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}, { preserveEmptyStrings: true }))),
    ),
  );

  it.effect('maps owner invalid, stale, and unverifiable results without fabricating facts', () =>
    Effect.gen(function* mapsOwnerFailures() {
      for (const status of ['INVALID', 'STALE', 'UNVERIFIABLE'] as const) {
        const port = yield* catalogQuantityPortFromEnvironment(
          { legalEntityId: '20000000-0000-4000-8000-000000000001', requestCorrelation: 'quantity-test' },
          () => Effect.succeed({ reason: `${status} owner result`, status } as never),
        );
        const failure = yield* port
          .resolveCurrentSelections({
            lines: [{ lineId: 'line-1', requestedQuantity: '7', selection }],
            observedAt: '2026-09-22T10:00:00.000Z',
            tenantId,
          })
          .pipe(Effect.flip);
        expect(failure.code).toBe(
          status === 'INVALID'
            ? 'catalog_selection_invalid'
            : status === 'STALE'
              ? 'catalog_selection_stale'
              : 'catalog_selection_unverifiable',
        );
      }
    }).pipe(Effect.provide(gateway)),
  );

  it.effect('rejects an owner response outside the trusted Tenant', () =>
    Effect.gen(function* rejectsForeignTenant() {
      const foreignTenantId = '10000000-0000-4000-8000-000000000099';
      const port = yield* catalogQuantityPortFromEnvironment(
        { legalEntityId: '20000000-0000-4000-8000-000000000001', requestCorrelation: 'quantity-test' },
        () =>
          Effect.succeed({
            ...ready,
            selection: {
              productRef: { ...productRef, tenantId: foreignTenantId },
              variantRef: { ...variantRef, tenantId: foreignTenantId },
            },
          } as never),
      );
      const failure = yield* port
        .resolveCurrentSelections({
          lines: [{ lineId: 'line-1', requestedQuantity: '7', selection }],
          observedAt: '2026-09-22T10:00:00.000Z',
          tenantId,
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ code: 'catalog_selection_invalid', retryable: true });
    }).pipe(Effect.provide(gateway)),
  );
});
