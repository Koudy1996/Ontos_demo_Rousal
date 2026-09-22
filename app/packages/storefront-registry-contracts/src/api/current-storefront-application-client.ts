import { makeGovernedEffectBffClient } from '@app/shared-contracts/client-runtime';
import { Effect, Redacted, Schema } from 'effect';

import {
  CurrentStorefrontApplicationApi,
  CurrentStorefrontApplicationRequestSchema,
} from '../apis/current-storefront-application.ts';
import type { CurrentStorefrontApplicationRequest } from '../apis/current-storefront-application.ts';
import { operationGateway } from './action-gateway.ts';

export interface CurrentStorefrontApplicationClientOptions {
  readonly baseUrl?: string | URL;
}

type AuthorizedInvocation = readonly [
  credential: string,
  requestCorrelation: string,
  options?: CurrentStorefrontApplicationClientOptions,
];
type OperationInvocation = readonly [requestCorrelation: string, options?: CurrentStorefrontApplicationClientOptions];

export const executeCurrentStorefrontApplicationWithAuthorization = (
  payload: CurrentStorefrontApplicationRequest,
  ...[credential, requestCorrelation, options = {}]: AuthorizedInvocation
) =>
  Schema.encodeUnknownEffect(CurrentStorefrontApplicationRequestSchema)(payload).pipe(
    Effect.flatMap((encoded) =>
      makeGovernedEffectBffClient(
        {
          api: CurrentStorefrontApplicationApi,
          credential: Redacted.make(credential),
          defaultApiPrefix: '/storefront-registry-api',
          requestCorrelation,
        },
        options,
      ).pipe(
        Effect.flatMap((client) =>
          client.currentStorefrontApplication.execute({ headers: {}, params: {}, payload: encoded, query: {} }),
        ),
      ),
    ),
  );

export const executeCurrentStorefrontApplication = (
  payload: CurrentStorefrontApplicationRequest,
  ...[requestCorrelation, options = {}]: OperationInvocation
) =>
  operationGateway.invoke((credential) =>
    executeCurrentStorefrontApplicationWithAuthorization(payload, credential, requestCorrelation, options),
  );
