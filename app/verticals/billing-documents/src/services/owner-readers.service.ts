import { legalEntityDetailRead, ReadRuntime } from '@app/core-runtime';
import type { OperationalScope } from '@app/core-runtime';
import { LegalEntityRefSchema } from '@app/core-runtime/resources/legal-entity';
import { executeCurrentPaymentTermsWithAuthorization } from '@app/payment-term-catalog-contracts/current-payment-terms/client';
import type { PaymentTermDefinition } from '@app/payment-term-catalog-contracts/payment-term';
import type { PaymentTermRef } from '@app/payment-term-catalog-contracts/resources/payment-term';
import {
  executePartyContactPointsWithAuthorization,
  executePartyDetailWithAuthorization,
  executePartyOfficialIdentifierHistoryWithAuthorization,
} from '@app/party-registry/api/client';
import type { PartyRef } from '@app/party-registry/resources/party';
import { executeJobDetailWithAuthorization, executeJobListWithAuthorization } from '@app/service-jobs/api/client';
import type { ServiceJob, ServiceJobRef } from '@app/service-jobs/resources/service-job';
import { JobIdSchema } from '@app/service-jobs/resources/service-job';
import { withDependencyCredentialRedaction } from '@app/shared-contracts/dependency-read-gateway';
import { Config, DateTime, Effect, Option, Redacted, Schema } from 'effect';
import type { EligibleBillingAddress } from '../../shared/apis/invoice-draft-support.ts';
import type { InvoiceAddress, RecipientSnapshot } from '../../shared/resources/invoice.ts';
import { InvoiceRejected } from '../../shared/resources/invoice-rejected.ts';
import { InvoiceUnavailable } from '../../shared/resources/invoice-unavailable.ts';
import { BillingOwnerGatewayCredentialService } from '../../shared/domain/owner-gateway-credential.ts';

const rejected = (code: ConstructorParameters<typeof InvoiceRejected>[0]['code'], reason: string, cause?: unknown) =>
  Object.defineProperty(new InvoiceRejected({ code, reason }), 'cause', { enumerable: false, value: cause });
const unavailable = (reason: string, cause?: unknown) =>
  Object.defineProperty(new InvoiceUnavailable({ code: 'billing_documents_unavailable', reason }), 'cause', {
    enumerable: false,
    value: cause,
  });

const effectiveAt = (value: DateTime.Utc | string, at: DateTime.Utc): boolean =>
  DateTime.Order(DateTime.makeUnsafe(value), at) <= 0;

const notEndedAt = (value: DateTime.Utc | string | null, at: DateTime.Utc): boolean =>
  value === null || DateTime.Order(at, DateTime.makeUnsafe(value)) < 0;

export const isUsableCurrentContactAssertion = (
  assertion: {
    readonly current: boolean;
    readonly state: string;
    readonly validFrom: DateTime.Utc | string;
    readonly validTo: DateTime.Utc | null;
    readonly verification: { readonly state: string };
  },
  at: DateTime.Utc,
): boolean =>
  assertion.current &&
  assertion.state === 'ACTIVE' &&
  notEndedAt(assertion.validTo, at) &&
  assertion.verification.state !== 'REJECTED' &&
  effectiveAt(assertion.validFrom, at);

export const isUsableCurrentIdentifierAssertion = (
  assertion: {
    readonly state: string;
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly verification: string;
  },
  at: DateTime.Utc,
): boolean =>
  assertion.state === 'ACTIVE' &&
  notEndedAt(assertion.validTo, at) &&
  assertion.verification !== 'REJECTED' &&
  effectiveAt(assertion.validFrom, at);

const ownerUrlSchema = (requiredPath: string) =>
  Schema.URLFromString.check(
    Schema.makeFilter((url) =>
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === requiredPath &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
        ? undefined
        : `Owner API URL must use HTTP(S), the ${requiredPath} path, and no credentials, query, or fragment`,
    ),
  );

const ownerUrl = (environmentName: string, requiredPath: string) =>
  Config.schema(ownerUrlSchema(requiredPath), environmentName).pipe(
    Effect.map((url) => url.toString().replace(/\/$/u, '')),
    Effect.mapError((cause) => unavailable(`${environmentName} is not configured safely`, cause)),
  );

export interface JobsReader {
  readonly get: (ref: ServiceJobRef) => Effect.Effect<ServiceJob, InvoiceRejected | InvoiceUnavailable>;
  readonly listCompleted: (input: {
    readonly cursor?: string;
    readonly pageSize?: number;
  }) => Effect.Effect<
    Effect.Success<ReturnType<typeof executeJobListWithAuthorization>>,
    InvoiceRejected | InvoiceUnavailable
  >;
}

export const jobsReader = Effect.fn('BillingDocuments.jobsReader')(function* makeJobsReader(scope: OperationalScope) {
  const credentials = yield* BillingOwnerGatewayCredentialService;
  const configuredBaseUrl = ownerUrl('ONTOS_SERVICE_JOBS_API_URL', '/service-jobs-api');
  const credential = () =>
    credentials.issue({
      audience: 'service-jobs',
      legalEntityId: scope.legalEntityId ?? '',
      requestCorrelation: scope.correlationId,
    });
  const assertScope = (job: ServiceJob) =>
    job.ref.tenantId === scope.tenantId && job.legalEntityId === scope.legalEntityId
      ? Effect.succeed(job)
      : Effect.fail(rejected('scope_mismatch', 'Zakázka není dostupná pro aktuální právní subjekt'));
  return {
    get: (ref: ServiceJobRef) =>
      Effect.gen(function* getJob() {
        if (ref.tenantId !== scope.tenantId) {
          return yield* rejected('scope_mismatch', 'Zakázka není dostupná pro aktuální tenant');
        }
        const id = yield* Schema.decodeEffect(JobIdSchema)(ref.resourceId).pipe(
          Effect.mapError((cause) => rejected('job_not_found', 'Zakázka nebyla nalezena', cause)),
        );
        const [authorization, baseUrl] = yield* Effect.all([credential(), configuredBaseUrl], { concurrency: 2 });
        const job = yield* executeJobDetailWithAuthorization(
          { target: { id } },
          Redacted.value(authorization),
          scope.correlationId,
          { baseUrl },
        ).pipe(Effect.mapError((cause) => unavailable('Aktuální zakázku nelze načíst', cause)));
        return yield* assertScope(job);
      }).pipe(withDependencyCredentialRedaction),
    listCompleted: (input) =>
      Effect.gen(function* listJobs() {
        const [authorization, baseUrl] = yield* Effect.all([credential(), configuredBaseUrl], { concurrency: 2 });
        const result = yield* executeJobListWithAuthorization(
          { ...input, view: 'COMPLETED' },
          Redacted.value(authorization),
          scope.correlationId,
          { baseUrl },
        ).pipe(Effect.mapError((cause) => unavailable('Dokončené zakázky nelze načíst', cause)));
        yield* Effect.forEach(result.items, assertScope, { concurrency: 1, discard: true });
        return result;
      }).pipe(withDependencyCredentialRedaction),
  } satisfies JobsReader;
});

export interface PartyBillingContext {
  readonly billingAddresses: readonly EligibleBillingAddress[];
  readonly displayName: string;
  readonly partyRef: PartyRef;
  readonly partyRevision: number;
  readonly snapshot: (selection: {
    readonly address: InvoiceAddress;
    readonly evidence: RecipientSnapshot['addressEvidence'];
  }) => RecipientSnapshot;
}

export interface PartyReader {
  readonly billingContext: (ref: PartyRef) => Effect.Effect<PartyBillingContext, InvoiceRejected | InvoiceUnavailable>;
}

export const partyReader = Effect.fn('BillingDocuments.partyReader')(function* makePartyReader(
  scope: OperationalScope,
) {
  const credentials = yield* BillingOwnerGatewayCredentialService;
  const configuredBaseUrl = ownerUrl('ONTOS_PARTY_REGISTRY_API_URL', '/party-registry-api');
  return {
    billingContext: (partyRef: PartyRef) =>
      Effect.gen(function* loadPartyContext() {
        if (partyRef.tenantId !== scope.tenantId) {
          return yield* rejected('scope_mismatch', 'Kontakt není dostupný pro aktuální tenant');
        }
        const [baseUrl, at] = yield* Effect.all([configuredBaseUrl, DateTime.now], { concurrency: 2 });
        const issueCredential = () =>
          credentials
            .issue({
              audience: 'party-registry',
              legalEntityId: scope.legalEntityId ?? '',
              requestCorrelation: scope.correlationId,
            })
            .pipe(Effect.map(Redacted.value));
        const [detailCredential, contactCredential, identifierCredential] = yield* Effect.all(
          [issueCredential(), issueCredential(), issueCredential()],
          { concurrency: 3 },
        );
        const [detail, contactPoints, identifiers] = yield* Effect.all(
          [
            executePartyDetailWithAuthorization({ partyRef }, detailCredential, scope.correlationId, { baseUrl }),
            executePartyContactPointsWithAuthorization(
              { includeHistorical: false, partyRef, type: 'ADDRESS' },
              contactCredential,
              scope.correlationId,
              { baseUrl },
            ),
            executePartyOfficialIdentifierHistoryWithAuthorization(
              { partyRef },
              identifierCredential,
              scope.correlationId,
              { baseUrl },
            ),
          ],
          { concurrency: 1 },
        ).pipe(Effect.mapError((cause) => unavailable('Fakturační údaje kontaktu nelze načíst', cause)));
        const canonicalRef = detail.party.partyRef;
        if (canonicalRef.tenantId !== scope.tenantId) {
          return yield* rejected('scope_mismatch', 'Kontakt není dostupný pro aktuální tenant');
        }
        const billingAddresses: EligibleBillingAddress[] = [];
        for (const point of contactPoints.items) {
          if (isUsableCurrentContactAssertion(point, at) && point.value.type === 'ADDRESS') {
            const purpose = point.value.purposes.find(
              (candidate) => candidate.purpose === 'BILLING' && isUsableCurrentContactAssertion(candidate, at),
            );
            if (purpose !== undefined) {
              billingAddresses.push({
                address: point.value.address,
                contactPointRef: point.contactPointRef,
                contactPointRevision: point.revision,
                preferred: purpose.preferred,
                purposeRevision: purpose.revision,
              });
            }
          }
        }
        const officialIdentifiers: RecipientSnapshot['officialIdentifiers'][number][] = [];
        for (const identifier of identifiers.items) {
          if (
            isUsableCurrentIdentifierAssertion(identifier, at) &&
            (identifier.identifierType === 'ICO' || identifier.identifierType === 'CZ_DIC')
          ) {
            officialIdentifiers.push({
              identifierType: identifier.identifierType,
              normalizedValue: identifier.normalizedValue,
              officialIdentifierRef: identifier.officialIdentifierRef,
            });
          }
        }
        const displayName = Option.getOrUndefined(detail.party.displayName);
        if (displayName === undefined) {
          return yield* rejected('missing_billing_address', 'Kontakt nemá identitu použitelnou pro fakturaci');
        }
        return {
          billingAddresses,
          displayName,
          partyRef: canonicalRef,
          partyRevision: detail.party.revision,
          snapshot: ({ address, evidence }) => ({
            address,
            addressEvidence: evidence,
            displayName,
            officialIdentifiers,
            partyRef: canonicalRef,
            partyRevision: detail.party.revision,
          }),
        } satisfies PartyBillingContext;
      }).pipe(withDependencyCredentialRedaction),
  } satisfies PartyReader;
});

export interface PaymentTermsReader {
  readonly current: Effect.Effect<readonly PaymentTermDefinition[], InvoiceUnavailable>;
  readonly resolve: (
    ref: PaymentTermRef,
    at: DateTime.Utc,
  ) => Effect.Effect<PaymentTermDefinition, InvoiceRejected | InvoiceUnavailable>;
}

export const paymentTermsReader = Effect.fn('BillingDocuments.paymentTermsReader')(function* makePaymentTermsReader(
  scope: OperationalScope,
) {
  const credentials = yield* BillingOwnerGatewayCredentialService;
  const configuredBaseUrl = ownerUrl('ONTOS_PAYMENT_TERM_CATALOG_API_URL', '/payment-term-catalog-api');
  const read = (
    at: DateTime.Utc,
    references: Parameters<typeof executeCurrentPaymentTermsWithAuthorization>[0]['references'],
  ) =>
    Effect.gen(function* currentTerms() {
      const [authorization, baseUrl] = yield* Effect.all(
        [
          credentials.issue({
            audience: 'payment-term-catalog',
            legalEntityId: scope.legalEntityId ?? '',
            requestCorrelation: scope.correlationId,
          }),
          configuredBaseUrl,
        ],
        { concurrency: 2 },
      );
      return yield* executeCurrentPaymentTermsWithAuthorization(
        { at: DateTime.formatIso(at), limit: 200, references },
        Redacted.value(authorization),
        scope.correlationId,
        { baseUrl },
      ).pipe(Effect.mapError((cause) => unavailable('Platební podmínky nelze načíst', cause)));
    }).pipe(withDependencyCredentialRedaction);
  return {
    current: DateTime.now.pipe(
      Effect.flatMap((at) => read(at, [])),
      Effect.map(({ current }) => current),
    ),
    resolve: (ref, at) =>
      read(at, [{ expectedConsumerCompatibility: 'customer-payment-terms.v1', paymentTermRef: ref }]).pipe(
        Effect.flatMap(({ referenceOutcomes }) => {
          const [outcome] = referenceOutcomes;
          return outcome?.kind === 'USABLE'
            ? Effect.succeed(outcome.definition)
            : Effect.fail(rejected('payment_term_unusable', 'Vybraná platební podmínka již není použitelná'));
        }),
      ),
  } satisfies PaymentTermsReader;
});

export interface LegalEntityReader {
  readonly get: Effect.Effect<{ readonly legalName: string }, InvoiceRejected | InvoiceUnavailable>;
}

export const legalEntityReader = Effect.fn('BillingDocuments.legalEntityReader')(function* makeLegalEntityReader(
  scope: OperationalScope,
) {
  const readRuntime = yield* ReadRuntime;
  return {
    get: Effect.gen(function* getLegalEntity() {
      if (scope.legalEntityId === undefined) {
        return yield* rejected('scope_mismatch', 'Chybí aktuální právní subjekt');
      }
      const legalEntityRef = yield* Schema.decodeEffect(LegalEntityRefSchema)({
        moduleId: 'core.identity',
        resourceId: scope.legalEntityId,
        resourceType: 'core.identity.legal-entity',
        tenantId: scope.tenantId,
      }).pipe(Effect.mapError((cause) => unavailable('Identitu právního subjektu nelze načíst', cause)));
      const result = yield* readRuntime
        .runRead({
          input: { legalEntityRef },
          principal: scope,
          registration: legalEntityDetailRead,
          transport: { correlationId: scope.correlationId },
        })
        .pipe(Effect.mapError((cause) => unavailable('Identitu právního subjektu nelze načíst', cause)));
      return result.status === 'active'
        ? { legalName: result.legalName }
        : yield* rejected('scope_mismatch', 'Právní subjekt není aktivní');
    }),
  } satisfies LegalEntityReader;
});
