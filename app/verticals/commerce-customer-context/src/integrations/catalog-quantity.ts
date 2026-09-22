import { executeQuantityPreparationWithAuthorization } from '@app/catalog/api/client';
import { Effect, Option, Redacted, Schema } from 'effect';

import {
  CatalogQuantityGatewayCredentialService,
  unavailableCatalogQuantityGatewayCredentialIssuer,
} from '../../shared/domain/catalog-quantity-gateway-credential.ts';
import type { CommerceQuantityCatalogPortService } from '../../shared/domain/commerce-quantity-catalog-port.ts';
import type { CommerceQuantityCatalogUnavailable } from '../../shared/domain/commerce-quantity-catalog-port.ts';
import { ExactPositiveCommerceQuantitySchema } from '../../shared/domain/customer-commerce-policy.ts';

type QuantityPreparationRequest = Parameters<typeof executeQuantityPreparationWithAuthorization>[0];
type QuantityPreparationEffect = ReturnType<typeof executeQuantityPreparationWithAuthorization>;
type QuantityPreparationResponse =
  QuantityPreparationEffect extends Effect.Effect<infer Success, unknown, unknown> ? Success : never;
type QuantityPreparationFailure =
  QuantityPreparationEffect extends Effect.Effect<unknown, infer Failure, unknown> ? Failure : never;
type QuantityPreparationExecutor = (
  payload: QuantityPreparationRequest,
  credential: string,
  requestCorrelation: string,
  options: { readonly baseUrl: URL },
) => Effect.Effect<QuantityPreparationResponse, QuantityPreparationFailure>;

const unavailable = (
  code: CommerceQuantityCatalogUnavailable['code'],
  reason: string,
  cause?: unknown,
): CommerceQuantityCatalogUnavailable => {
  const failure: CommerceQuantityCatalogUnavailable = {
    _tag: 'CommerceQuantityCatalogUnavailable',
    code,
    reason,
    retryable: true,
  };
  return cause === undefined ? failure : Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
};

const failureFor = (result: Exclude<QuantityPreparationResponse, { readonly status: 'READY' }>) =>
  unavailable(
    result.status === 'INVALID'
      ? 'catalog_selection_invalid'
      : result.status === 'STALE'
        ? 'catalog_selection_stale'
        : 'catalog_selection_unverifiable',
    result.reason,
  );

const decodeOwnerQuantity = (value: string) =>
  Schema.decodeEffect(ExactPositiveCommerceQuantitySchema)(value).pipe(
    Effect.mapError((cause) =>
      unavailable('catalog_selection_invalid', 'Catalog returned invalid Quantity evidence', cause),
    ),
  );

export const catalogQuantityPortFromEnvironment = (
  context: { readonly legalEntityId: string; readonly requestCorrelation: string },
  execute: QuantityPreparationExecutor = executeQuantityPreparationWithAuthorization,
): Effect.Effect<CommerceQuantityCatalogPortService> =>
  Effect.serviceOption(CatalogQuantityGatewayCredentialService).pipe(
    Effect.map((issuerOption) => {
      const issuer = Option.isSome(issuerOption)
        ? issuerOption.value
        : unavailableCatalogQuantityGatewayCredentialIssuer;
      return {
        resolveCurrentSelections: ({ lines, tenantId }) =>
          issuer
            .issue({
              audience: 'catalog',
              legalEntityId: context.legalEntityId,
              requestCorrelation: context.requestCorrelation,
            })
            .pipe(
              Effect.flatMap(({ baseUrl, credential }) =>
                Effect.forEach(
                  lines,
                  (line) =>
                    execute(
                      {
                        amount: line['requestedQuantity'],
                        purpose: 'PURCHASE_ACCEPTANCE',
                        selection: line['selection'],
                      },
                      Redacted.value(credential),
                      context.requestCorrelation,
                      { baseUrl },
                    ).pipe(
                      Effect.mapError((cause) =>
                        unavailable(
                          'catalog_selection_unavailable',
                          'Catalog Quantity preparation is unavailable',
                          cause,
                        ),
                      ),
                      Effect.flatMap((result) =>
                        result.status === 'READY'
                          ? Effect.all({
                              normalizedQuantity: decodeOwnerQuantity(result.quantity.resulting),
                              physicalMultiple: decodeOwnerQuantity(result.quantity.step),
                              requestedQuantity: decodeOwnerQuantity(result.quantity.requested),
                            }).pipe(
                              Effect.map((quantity) => ({
                                lineId: line['lineId'],
                                selection: {
                                  basis: result.quantityBasis,
                                  catalogSelection: result.selection,
                                  completeness: result.completeness,
                                  divisible: result.divisible,
                                  equivalentSelectionKey: result.equivalentSelectionKey,
                                  hierarchyRevision: result.hierarchyRevision,
                                  normalizedQuantity: quantity.normalizedQuantity,
                                  ownerRevision: result.ownerRevision,
                                  physicalMultiple: quantity.physicalMultiple,
                                  requestedQuantity: quantity.requestedQuantity,
                                },
                              })),
                            )
                          : Effect.fail(failureFor(result)),
                      ),
                    ),
                  { concurrency: 8 },
                ),
              ),
              Effect.flatMap((resolved) =>
                resolved.every(({ selection }) => selection.catalogSelection.productRef.tenantId === tenantId)
                  ? Effect.succeed(resolved)
                  : Effect.fail(
                      unavailable(
                        'catalog_selection_invalid',
                        'Catalog returned a selection outside the trusted Tenant',
                      ),
                    ),
              ),
            ),
      } satisfies CommerceQuantityCatalogPortService;
    }),
  );
