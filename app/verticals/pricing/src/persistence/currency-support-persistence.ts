import { defineScopedRoutine } from '@app/core-runtime';
import type { OperationalScope, ReadServiceFactory, ScopedRoutineInvocationError } from '@app/core-runtime';
import type { CurrentSupportedCurrenciesRequest } from '@app/pricing-contracts/current-supported-currencies';
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
}
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
});
export const currencySupportPersistenceForScope: ReadServiceFactory<CurrencySupportPersistence> = (
  transaction,
  scope,
) => Effect.succeed(persistenceForTransaction(transaction, scope));
