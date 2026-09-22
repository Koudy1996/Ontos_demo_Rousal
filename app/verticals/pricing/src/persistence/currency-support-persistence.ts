import { defineScopedRoutine } from '@app/core-runtime';
import type { OperationalScope, ReadServiceFactory, ScopedRoutineInvocationError } from '@app/core-runtime';
import type {
  CurrentSupportedCurrenciesRequest,
  PricingCurrencySubject,
} from '@app/pricing-contracts/current-supported-currencies';
import { Effect, Option, Schema } from 'effect';

const canonicalInstant = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u));
const StoredCurrencySupportSchema = Schema.Struct({
  generation: Schema.Int.check(Schema.isGreaterThan(0)),
  nextApplicabilityBoundary: Schema.NullOr(canonicalInstant),
  observedAt: canonicalInstant,
  pricingRevision: Schema.String.check(Schema.isMinLength(1), Schema.isTrimmed()),
  supportedCurrencies: Schema.Array(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u))).check(
    Schema.isMinLength(1),
    Schema.makeFilter((codes) =>
      new Set(codes).size === codes.length ? undefined : 'Stored currencies must be unique',
    ),
  ),
});
const StoredCurrencySupportRowSchema = Schema.Struct({ result: StoredCurrencySupportSchema });
const readCurrentSupportedCurrenciesRoutine = defineScopedRoutine({
  name: 'read_current_supported_currencies',
  ownerModuleKey: 'commerce.pricing',
  parameters: [
    { source: 'tenantId', type: 'uuid' },
    { source: 'legalEntityId', type: 'uuid' },
    { source: 'input', type: 'jsonb' },
  ],
  resultSchema: StoredCurrencySupportRowSchema,
  routineKey: 'pricing.read-current-supported-currencies',
  schema: 'pricing',
});
const SetCurrencySupportResultSchema = Schema.Struct({
  actualGeneration: Schema.Int,
  changed: Schema.Boolean,
  outcome: Schema.Literals(['APPLIED', 'EFFECTIVE_TIME_CONFLICT', 'REVISION_CONFLICT', 'UNCHANGED']),
  pricingRevision: Schema.NullOr(Schema.String),
  supportedCurrencies: Schema.Array(Schema.String),
});
const setSupportedCurrenciesRoutine = defineScopedRoutine({
  name: 'set_supported_currencies',
  ownerModuleKey: 'commerce.pricing',
  parameters: [
    { source: 'tenantId', type: 'uuid' },
    { source: 'legalEntityId', type: 'uuid' },
    { source: 'input', type: 'jsonb' },
  ],
  resultSchema: Schema.Struct({ result: SetCurrencySupportResultSchema }),
  routineKey: 'pricing.set-supported-currencies',
  schema: 'pricing',
});

export interface StoredCurrencySupport {
  readonly generation: number;
  readonly nextApplicabilityBoundary?: string;
  readonly observedAt: string;
  readonly pricingRevision: string;
  readonly supportedCurrencies: readonly string[];
}
export interface CurrencySupportPersistence {
  readonly loadCurrent: (
    input: CurrentSupportedCurrenciesRequest,
  ) => Effect.Effect<Option.Option<StoredCurrencySupport>, CurrencySupportPersistenceUnavailable>;
  readonly setCurrent: (
    command: SetCurrencySupportCommand,
  ) => Effect.Effect<SetCurrencySupportOutcome, CurrencySupportPersistenceUnavailable>;
}
export interface SetCurrencySupportCommand {
  readonly actionInvocationId: string;
  readonly actorPrincipalId: string;
  readonly cartId: string;
  readonly channelId: string;
  readonly contextRevision: string;
  readonly effectiveFrom: string;
  readonly expectedGeneration: number;
  readonly marketId: string;
  readonly reason: string;
  readonly storefrontId: string;
  readonly subject: PricingCurrencySubject;
  readonly supportedCurrencies: readonly string[];
}
export interface SetCurrencySupportResult {
  readonly changed: boolean;
  readonly generation: number;
  readonly pricingRevision: string;
  readonly supportedCurrencies: readonly string[];
}
export type SetCurrencySupportOutcome =
  | { readonly _tag: 'applied'; readonly result: SetCurrencySupportResult }
  | { readonly _tag: 'unchanged'; readonly result: SetCurrencySupportResult }
  | { readonly _tag: 'revision_conflict'; readonly actualGeneration: number; readonly expectedGeneration: number }
  | { readonly _tag: 'effective_time_conflict' };

const decodeSetCurrencySupportOutcome = (
  value: typeof SetCurrencySupportResultSchema.Type | undefined,
  expectedGeneration: number,
): Effect.Effect<SetCurrencySupportOutcome, CurrencySupportPersistenceUnavailable> => {
  if (value === undefined) return Effect.fail(unavailable('Pricing write routine returned no outcome'));
  if (value.outcome === 'REVISION_CONFLICT') {
    return Effect.succeed({
      _tag: 'revision_conflict',
      actualGeneration: value.actualGeneration,
      expectedGeneration,
    });
  }
  if (value.outcome === 'EFFECTIVE_TIME_CONFLICT') {
    return Effect.succeed({ _tag: 'effective_time_conflict' });
  }
  if (value.pricingRevision === null) {
    return Effect.fail(unavailable('Pricing write routine omitted its revision'));
  }
  const result = {
    changed: value.changed,
    generation: value.actualGeneration,
    pricingRevision: value.pricingRevision,
    supportedCurrencies: value.supportedCurrencies,
  };
  return Effect.succeed(value.outcome === 'APPLIED' ? { _tag: 'applied', result } : { _tag: 'unchanged', result });
};

export class CurrencySupportPersistenceUnavailable extends Schema.TaggedError<CurrencySupportPersistenceUnavailable>()(
  'CurrencySupportPersistenceUnavailable',
  { reason: Schema.String },
) {}
const unavailable = (cause: unknown) => {
  const error = new CurrencySupportPersistenceUnavailable({ reason: 'Pricing currency support could not be verified' });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};
const subjectFingerprint = (subject: CurrentSupportedCurrenciesRequest['subject']) =>
  subject.kind === 'GUEST'
    ? `GUEST:${subject.guestSessionRef}:${subject.guestEvidenceRef}`
    : subject.authorizationSubject.kind === 'RETAIL'
      ? `PROFILE:RETAIL:${subject.profileRef.resourceId}`
      : `PROFILE:COUNTERPARTY:${subject.profileRef.resourceId}:${subject.authorizationSubject.counterpartyRef.resourceId}`;

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const persistenceForTransaction = (
  transaction: ScopedTransaction,
  _scope: Pick<OperationalScope, 'tenantId' | 'legalEntityId'>,
): CurrencySupportPersistence => ({
  loadCurrent: (input) =>
    transaction
      .invoke(readCurrentSupportedCurrenciesRoutine, [
        {
          cartId: input.cartId,
          channelId: input.channelId,
          contextRevision: input.contextRevision,
          effectiveAt: input.effectiveAt,
          marketId: input.marketId,
          storefrontId: input.storefrontId,
          subjectFingerprint: subjectFingerprint(input.subject),
        },
      ])
      .pipe(
        Effect.mapError((cause: ScopedRoutineInvocationError) => unavailable(cause)),
        Effect.map(([row]) =>
          row === undefined
            ? Option.none()
            : Option.some({
                generation: row.result.generation,
                observedAt: row.result.observedAt,
                pricingRevision: row.result.pricingRevision,
                supportedCurrencies: row.result.supportedCurrencies,
                ...(row.result.nextApplicabilityBoundary === null
                  ? {}
                  : { nextApplicabilityBoundary: row.result.nextApplicabilityBoundary }),
              }),
        ),
      ),
  setCurrent: (command) =>
    transaction
      .invoke(setSupportedCurrenciesRoutine, [
        {
          ...command,
          subjectFingerprint: subjectFingerprint(command.subject),
        },
      ])
      .pipe(
        Effect.mapError((cause: ScopedRoutineInvocationError) => unavailable(cause)),
        Effect.flatMap(([row]) => decodeSetCurrencySupportOutcome(row?.result, command.expectedGeneration)),
      ),
});
export const currencySupportPersistenceForScope: ReadServiceFactory<CurrencySupportPersistence> = (
  transaction,
  scope,
) => Effect.succeed(persistenceForTransaction(transaction, scope));
