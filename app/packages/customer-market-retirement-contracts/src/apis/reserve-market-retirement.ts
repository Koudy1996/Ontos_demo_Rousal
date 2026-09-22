import { makeProblemDetailsSchema, makeRetryableProblemDetailsSchema } from '@app/shared-contracts';
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';

import { MarketRefSchema } from '../market-reference.ts';

import {
  MarketAffectedUseSourceEvidenceSchema,
  MarketRetirementInstantSchema,
  MarketRevisionSchema,
} from './market-affected-use-assessment.ts';

const strict = { parseOptions: { onExcessProperty: 'error' as const } };
const boundedReason = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500), Schema.isTrimmed());
const sha256Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const checkedUuid = Schema.String.check(Schema.isUUID());
export const MarketRetirementReservationTokenSchema = checkedUuid.pipe(
  Schema.brand('MarketRetirementReservationToken'),
  Schema.decodeTo(checkedUuid),
);
export const MarketRetirementReservationVersionSchema = Schema.Finite.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
);
export const MarketRetirementReservationOperationSchema = Schema.Literals(['RESERVE', 'COMMIT', 'RELEASE']);
export type MarketRetirementReservationOperation = typeof MarketRetirementReservationOperationSchema.Type;

const reservationIdentity = {
  marketRef: MarketRefSchema,
  marketRevision: MarketRevisionSchema,
  tenantId: MarketRefSchema.fields.tenantId,
} as const;

const reserve = Schema.Struct({
  ...reservationIdentity,
  assessmentDigest: sha256Digest,
  evaluatedAt: MarketRetirementInstantSchema,
  operation: Schema.Literal('RESERVE'),
  reason: boundedReason,
  sourceEvidence: Schema.Array(MarketAffectedUseSourceEvidenceSchema).check(Schema.isMinLength(1)),
}).annotate(strict);

const finish = <Operation extends 'COMMIT' | 'RELEASE'>(operation: Operation) =>
  Schema.Struct({
    ...reservationIdentity,
    operation: Schema.Literal(operation),
    reason: boundedReason,
    reservationToken: MarketRetirementReservationTokenSchema,
    reservationVersion: MarketRetirementReservationVersionSchema,
  }).annotate(strict);

export const ReserveMarketRetirementPayloadSchema = Schema.Union([reserve, finish('COMMIT'), finish('RELEASE')]).check(
  Schema.makeFilter(({ marketRef, tenantId }) =>
    marketRef.tenantId === tenantId ? undefined : 'Market and reservation must belong to the same Tenant',
  ),
);
export type ReserveMarketRetirementPayload = typeof ReserveMarketRetirementPayloadSchema.Type;

export const ReserveMarketRetirementResultSchema = Schema.Struct({
  ...reservationIdentity,
  assessmentDigest: sha256Digest,
  lifecycle: Schema.Literals(['RESERVED', 'COMMITTED', 'RELEASED']),
  reservationToken: MarketRetirementReservationTokenSchema,
  reservationVersion: MarketRetirementReservationVersionSchema,
}).annotate(strict);
export type ReserveMarketRetirementResult = typeof ReserveMarketRetirementResultSchema.Type;

export const ReserveMarketRetirementAuthenticationProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementAuthenticationProblem',
  401,
);
export const ReserveMarketRetirementInvalidProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementInvalidProblem',
  400,
);
export const ReserveMarketRetirementForbiddenProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementForbiddenProblem',
  403,
);
export const ReserveMarketRetirementNotFoundProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementNotFoundProblem',
  404,
);
export const ReserveMarketRetirementConflictProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementConflictProblem',
  409,
);
export const ReserveMarketRetirementPolicyProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementPolicyProblem',
  422,
);
export const ReserveMarketRetirementUnavailableProblemSchema = makeRetryableProblemDetailsSchema(
  'ReserveMarketRetirementUnavailableProblem',
  503,
);
export const ReserveMarketRetirementInternalProblemSchema = makeProblemDetailsSchema(
  'ReserveMarketRetirementInternalProblem',
  500,
);

export const ReserveMarketRetirementApi = HttpApi.make('ReserveMarketRetirementApi').add(
  HttpApiGroup.make('reserveMarketRetirement').add(
    HttpApiEndpoint.post('execute', '/commerce-customer-context/actions/reserve-market-retirement', {
      error: [
        ReserveMarketRetirementInvalidProblemSchema,
        ReserveMarketRetirementAuthenticationProblemSchema,
        ReserveMarketRetirementForbiddenProblemSchema,
        ReserveMarketRetirementNotFoundProblemSchema,
        ReserveMarketRetirementConflictProblemSchema,
        ReserveMarketRetirementPolicyProblemSchema,
        ReserveMarketRetirementUnavailableProblemSchema,
        ReserveMarketRetirementInternalProblemSchema,
      ],
      headers: {},
      params: {},
      payload: Schema.toEncoded(ReserveMarketRetirementPayloadSchema),
      query: {},
      success: ReserveMarketRetirementResultSchema,
    }),
  ),
);
