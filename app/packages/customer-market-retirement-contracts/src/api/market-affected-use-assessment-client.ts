import { makeGovernedEffectBffClient } from '@app/shared-contracts/client-runtime';
import { Effect, Redacted, Schema } from 'effect';

import {
  MarketAffectedUseAssessmentApi,
  MarketAffectedUseAssessmentRequestSchema,
} from '../apis/market-affected-use-assessment.ts';
import type { MarketAffectedUseAssessmentRequest } from '../apis/market-affected-use-assessment.ts';
import { operationGateway } from './action-gateway.ts';

export interface MarketAffectedUseAssessmentClientOptions {
  readonly baseUrl?: string | URL;
}

type AuthorizedInvocation = readonly [
  credential: string,
  requestCorrelation: string,
  options?: MarketAffectedUseAssessmentClientOptions,
];
type OperationInvocation = readonly [requestCorrelation: string, options?: MarketAffectedUseAssessmentClientOptions];

export const executeMarketAffectedUseAssessmentWithAuthorization = (
  payload: MarketAffectedUseAssessmentRequest,
  ...[credential, requestCorrelation, options = {}]: AuthorizedInvocation
) =>
  Schema.encodeUnknownEffect(MarketAffectedUseAssessmentRequestSchema)(payload).pipe(
    Effect.flatMap((encoded) =>
      makeGovernedEffectBffClient(
        {
          api: MarketAffectedUseAssessmentApi,
          credential: Redacted.make(credential),
          defaultApiPrefix: '/commerce-customer-context-api',
          requestCorrelation,
        },
        options,
      ).pipe(
        Effect.flatMap((client) =>
          client.marketAffectedUseAssessment.execute({ headers: {}, params: {}, payload: encoded, query: {} }),
        ),
      ),
    ),
  );

export const executeMarketAffectedUseAssessment = (
  payload: MarketAffectedUseAssessmentRequest,
  ...[requestCorrelation, options = {}]: OperationInvocation
) =>
  operationGateway.invoke((credential) =>
    executeMarketAffectedUseAssessmentWithAuthorization(payload, credential, requestCorrelation, options),
  );
