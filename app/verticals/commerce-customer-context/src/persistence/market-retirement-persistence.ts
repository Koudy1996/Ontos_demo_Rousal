import type {
  OperationalScope,
  ScopedRoutineDefinition,
  ScopedRoutineInputValues,
  ScopedRoutineInvocationError,
  ScopedRoutineParameter,
} from '@app/core-runtime';
import { ReadHandlerUnavailable, defineScopedRoutine } from '@app/core-runtime';
import {
  MarketAffectedUseAssessmentResponseSchema,
  ReserveMarketRetirementPayloadSchema,
  ReserveMarketRetirementResultSchema,
} from '@app/customer-market-retirement-contracts';
import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
  ReserveMarketRetirementPayload,
  ReserveMarketRetirementResult,
} from '@app/customer-market-retirement-contracts';
import { Effect, Option, Schema } from 'effect';

const MODULE_KEY = 'commerce.customer-context' as const;
const ROUTINE_SCHEMA = 'commerce_customer_context' as const;
const RoutineResultSchema = Schema.Struct({ result: Schema.Json });
const MarketAffectedUseAssessmentResponseDecoder = Schema.make<Schema.Decoder<MarketAffectedUseAssessmentResponse>>(
  MarketAffectedUseAssessmentResponseSchema.ast,
);
const ReserveMarketRetirementPayloadCodec = Schema.make<
  Schema.Codec<ReserveMarketRetirementPayload, typeof ReserveMarketRetirementPayloadSchema.Encoded>
>(ReserveMarketRetirementPayloadSchema.ast);
const ReserveMarketRetirementResultDecoder = Schema.make<Schema.Decoder<ReserveMarketRetirementResult>>(
  ReserveMarketRetirementResultSchema.ast,
);
const assessParameters = [
  { source: 'tenantId', type: 'uuid' },
  { source: 'legalEntityId', type: 'uuid' },
  { source: 'input', type: 'text' },
  { source: 'input', type: 'bigint' },
  { source: 'input', type: 'timestamptz' },
] as const;
const reserveParameters = [
  { source: 'tenantId', type: 'uuid' },
  { source: 'legalEntityId', type: 'uuid' },
  { source: 'input', type: 'jsonb' },
] as const;

const assessMarketRetirementAffectedUseRoutine = defineScopedRoutine({
  name: 'assess_market_retirement_affected_use',
  ownerModuleKey: MODULE_KEY,
  parameters: assessParameters,
  resultSchema: RoutineResultSchema,
  routineKey: 'market-retirement.assess-affected-use',
  schema: ROUTINE_SCHEMA,
});

const reserveMarketRetirementRoutine = defineScopedRoutine({
  name: 'reserve_market_retirement',
  ownerModuleKey: MODULE_KEY,
  parameters: reserveParameters,
  resultSchema: RoutineResultSchema,
  routineKey: 'market-retirement.reserve',
  schema: ROUTINE_SCHEMA,
});

export const marketRetirementRoutineAllowlist = Object.freeze([
  assessMarketRetirementAffectedUseRoutine,
  reserveMarketRetirementRoutine,
]);

export interface MarketRetirementScopedRoutineInvoker {
  readonly invoke: <
    RowSchema extends Schema.ConstraintDecoder<object>,
    const Parameters extends readonly ScopedRoutineParameter[],
  >(
    routine: ScopedRoutineDefinition<RowSchema, Parameters>,
    values: ScopedRoutineInputValues<Parameters>,
  ) => Effect.Effect<readonly RowSchema['Type'][], ScopedRoutineInvocationError>;
}

export class MarketRetirementReservationConflict extends Schema.TaggedError<MarketRetirementReservationConflict>()(
  'MarketRetirementReservationConflict',
  { reason: Schema.String },
) {}

export class MarketRetirementReservationInvalidRequest extends Schema.TaggedError<MarketRetirementReservationInvalidRequest>()(
  'MarketRetirementReservationInvalidRequest',
  { reason: Schema.String },
) {}

export class MarketRetirementReservationNotFound extends Schema.TaggedError<MarketRetirementReservationNotFound>()(
  'MarketRetirementReservationNotFound',
  { reason: Schema.String },
) {}

export class MarketRetirementReservationUnavailable extends Schema.TaggedError<MarketRetirementReservationUnavailable>()(
  'MarketRetirementReservationUnavailable',
  { reason: Schema.String },
) {}

export type MarketRetirementReservationFailure =
  | MarketRetirementReservationConflict
  | MarketRetirementReservationInvalidRequest
  | MarketRetirementReservationNotFound
  | MarketRetirementReservationUnavailable;

const decodeJson = <Result, Failure>(
  rows: readonly { readonly result: Schema.Json }[],
  schema: Schema.Decoder<Result>,
  unavailable: (reason: string) => Failure,
): Effect.Effect<Result, Failure> => {
  const [row] = rows;
  return row === undefined
    ? Effect.fail(unavailable('Market retirement owner routine returned no result'))
    : Schema.decodeEffect(schema)(row.result).pipe(
        Effect.mapError(() => unavailable('Market retirement owner routine returned invalid evidence')),
      );
};

export interface MarketAffectedUseAssessmentRepository {
  readonly assess: (
    input: MarketAffectedUseAssessmentRequest,
  ) => Effect.Effect<MarketAffectedUseAssessmentResponse, ReadHandlerUnavailable>;
}

export const makeMarketAffectedUseAssessmentRepository = ({
  invoker,
  scope,
}: {
  readonly invoker: MarketRetirementScopedRoutineInvoker;
  readonly scope: OperationalScope & { readonly legalEntityId: string };
}): MarketAffectedUseAssessmentRepository => ({
  assess: (input) =>
    invoker
      .invoke(assessMarketRetirementAffectedUseRoutine, [
        input.marketRef.resourceId,
        BigInt(input.marketRevision),
        input.evaluatedAt,
      ])
      .pipe(
        Effect.mapError(
          () =>
            new ReadHandlerUnavailable({
              code: 'read_handler_unavailable',
              reason: 'Market affected-use evidence is unavailable',
            }),
        ),
        Effect.flatMap((rows) =>
          decodeJson(
            rows,
            MarketAffectedUseAssessmentResponseDecoder,
            (reason) => new ReadHandlerUnavailable({ code: 'read_handler_unavailable', reason }),
          ),
        ),
        Effect.withSpan('commerce.customer-context.market-retirement.assess-affected-use', {
          attributes: { legalEntityId: scope.legalEntityId, tenantId: scope.tenantId },
        }),
      ),
});

const JsonValueSchema: Schema.Codec<Schema.Json> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Finite,
    Schema.Boolean,
    Schema.String,
    Schema.Array(JsonValueSchema),
    Schema.Record(Schema.String, JsonValueSchema),
  ]),
);
const JsonObjectSchema = Schema.Record(Schema.String, JsonValueSchema);
type JsonObject = typeof JsonObjectSchema.Type;

const mapReservationFailure = (failure: ScopedRoutineInvocationError): MarketRetirementReservationFailure => {
  const constraint = Option.getOrUndefined(failure.constraint);
  if (constraint === 'market_retirement_reservation_conflict') {
    return new MarketRetirementReservationConflict({
      reason: 'Market affected-use evidence changed or another retirement reservation is active',
    });
  }
  if (constraint === 'market_retirement_reservation_not_found') {
    return new MarketRetirementReservationNotFound({ reason: 'Market retirement reservation was not found' });
  }
  if (constraint === 'market_retirement_reservation_invalid') {
    return new MarketRetirementReservationInvalidRequest({
      reason: 'Market retirement reservation request is invalid',
    });
  }
  return new MarketRetirementReservationUnavailable({ reason: 'Market retirement reservation persistence failed' });
};

export interface MarketRetirementReservationService {
  readonly execute: (
    payload: ReserveMarketRetirementPayload,
    attribution: Readonly<{ readonly actionInvocationId: string; readonly actorPrincipalId: string }>,
  ) => Effect.Effect<ReserveMarketRetirementResult, MarketRetirementReservationFailure>;
}

export const makeMarketRetirementReservationService = ({
  invoker,
  scope,
}: {
  readonly invoker: MarketRetirementScopedRoutineInvoker;
  readonly scope: OperationalScope & { readonly legalEntityId: string };
}): MarketRetirementReservationService => ({
  execute: (payload, attribution) =>
    Schema.encodeEffect(ReserveMarketRetirementPayloadCodec)(payload).pipe(
      Effect.mapError(
        () =>
          new MarketRetirementReservationInvalidRequest({ reason: 'Market retirement reservation input is invalid' }),
      ),
      Effect.flatMap((encodedPayload) =>
        Schema.decodeEffect(JsonObjectSchema)({ ...encodedPayload, ...attribution }).pipe(
          Effect.mapError(
            () =>
              new MarketRetirementReservationInvalidRequest({
                reason: 'Market retirement reservation input is invalid',
              }),
          ),
        ),
      ),
      Effect.flatMap((encoded) =>
        invoker.invoke(reserveMarketRetirementRoutine, [encoded]).pipe(Effect.mapError(mapReservationFailure)),
      ),
      Effect.flatMap((rows) =>
        decodeJson(
          rows,
          ReserveMarketRetirementResultDecoder,
          (reason) => new MarketRetirementReservationUnavailable({ reason }),
        ),
      ),
      Effect.withSpan('commerce.customer-context.market-retirement.reserve', {
        attributes: { legalEntityId: scope.legalEntityId, tenantId: scope.tenantId },
      }),
    ),
});

export const marketRetirementPersistenceForTransaction = ({
  invoker,
  scope,
}: {
  readonly invoker: MarketRetirementScopedRoutineInvoker;
  readonly scope: OperationalScope & { readonly legalEntityId: string };
}) => ({
  assessment: makeMarketAffectedUseAssessmentRepository({ invoker, scope }),
  reservation: makeMarketRetirementReservationService({ invoker, scope }),
});
