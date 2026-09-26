import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CreatePartyPayloadSchema } from '@app/party-registry/api';
import {
  createPartyWithAuthorization,
  loadPartiesClientWithAuthorization,
  executePartyMatchDecisionWithAuthorization,
  executeDuplicateCandidateDetailWithAuthorization,
  resolveDuplicateCandidateCreateWithAuthorization,
} from '@app/party-registry/api/client';
import { issueApiKeyGatewayContext } from '@app/shared-contracts/server/gateway-context-api-key';
import { executeCreateWorkerWithAuthorization, executeWorkerListWithAuthorization } from '@app/workforce/api/client';
import { WorkerProfileSchema } from '@app/workforce/resources/worker';
import { Config, Console, Effect, Option, Redacted, Schedule, Schema } from 'effect';

const initializationErrorFields = { reason: Schema.String };
const InitializationErrorSchema = Schema.TaggedStruct('ErpDemoInitializationError', initializationErrorFields);
export const ErpDemoInitializationError = Schema.TaggedError<typeof InitializationErrorSchema.Type>()(
  'ErpDemoInitializationError',
  initializationErrorFields,
);

export const DEMO_CUSTOMER_NAME = 'Jan Novák - Demo zákazník';
export const DEMO_WORKER_NAME = 'Petr Dvořák';
const partyAudience = 'party-registry';
const legalEntityId = '71000000-0000-4000-8000-000000000010';

const localEndpoint = (key: string, fallback: string) =>
  Config.string(key).pipe(
    Config.withDefault(fallback),
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(Schema.URLFromString)(value).pipe(
        Effect.flatMap((url) =>
          url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            ? Effect.succeed(value)
            : Effect.fail(new ErpDemoInitializationError({ reason: `${key} must be a local HTTP endpoint` })),
        ),
      ),
    ),
  );

// Public owner clients keep bootstrap on the same authorization and Action path as the UI.
// A fresh capability is issued for every call, including each projection polling attempt.
export const initializeErpDemo = Effect.gen(function* initializeErpDemoEffect() {
  const shellUrl = yield* localEndpoint('ONTOS_SHELL_GATEWAY_BASE_URL', 'http://localhost:3020/shell-super-app-api');
  const partyUrl = yield* localEndpoint('ONTOS_PARTY_REGISTRY_API_URL', 'http://localhost:4102/party-registry-api');
  const workforceUrl = yield* localEndpoint('ONTOS_WORKFORCE_API_URL', 'http://localhost:4111/workforce-api');
  const apiKey = yield* Config.redacted('ONTOS_BILLING_DOCUMENTS_GATEWAY_API_KEY').pipe(
    Config.withDefault(Redacted.make('ontos_demo_billing_documents_local_key_v1')),
  );
  const authorize = (audience: string) =>
    Effect.gen(function* authorizeEffect() {
      const correlationId = yield* Effect.sync(randomUUID);
      const response = yield* issueApiKeyGatewayContext(
        { audience, legalEntityId },
        { apiKey, baseUrl: shellUrl, requestCorrelation: correlationId },
      );
      return { correlationId, credential: `Bearer ${response.token}` };
    });
  const findCustomer = authorize(partyAudience).pipe(
    Effect.flatMap(({ correlationId, credential }) =>
      loadPartiesClientWithAuthorization({ query: DEMO_CUSTOMER_NAME }, credential, correlationId, {
        baseUrl: partyUrl,
      }),
    ),
    Effect.map((parties) => parties.find(({ archived, title }) => title === DEMO_CUSTOMER_NAME && !archived)),
  );
  if ((yield* findCustomer) === undefined) {
    const payload = yield* Schema.decodeUnknownEffect(CreatePartyPayloadSchema)({
      candidate: {
        displayName: DEMO_CUSTOMER_NAME,
        evidenceRefs: ['local-erp-demo:customer:v1'],
        officialIdentifiers: [],
        partyType: 'PERSON',
        provenance: { method: 'LOCAL_DEMO', source: 'local-erp-demo' },
        subjectEvidence: [
          {
            basis: 'DIRECT_INTERACTION',
            evidenceRef: 'local-erp-demo:customer:v1',
            kind: 'ACTOR_ATTESTATION',
            observedSubject: 'PERSON',
            statement: 'Fiktivní zákazník pro lokální ukázku zakázky, potvrzený demo operátorem.',
            subjectKey: 'local-erp-demo:jan-novak:v1',
          },
        ],
        validFrom: '2020-01-01T00:00:00.000Z',
      },
    });
    const { correlationId, credential } = yield* authorize(partyAudience);
    const caseRef = yield* createPartyWithAuthorization(payload, credential, {
      baseUrl: partyUrl,
      correlationId,
      idempotencyKey: 'ontos-local-erp-demo-customer-v1',
    }).pipe(
      Effect.map((result) => (result.outcome === 'AMBIGUOUS' ? result.caseRef : null)),
      Effect.catchTag('PartyCommandAlreadyCommittedProblem', (error) =>
        authorize(partyAudience).pipe(
          Effect.flatMap((auth) =>
            executePartyMatchDecisionWithAuthorization(
              { actionInvocationId: error.invocationId },
              auth.credential,
              auth.correlationId,
              { baseUrl: partyUrl },
            ),
          ),
          Effect.map((decision) => decision.caseRef),
        ),
      ),
    );
    if (caseRef !== null) {
      const auth = yield* authorize(partyAudience);
      const detail = yield* executeDuplicateCandidateDetailWithAuthorization(
        { caseRef },
        auth.credential,
        auth.correlationId,
        { baseUrl: partyUrl },
      );
      if (detail.lifecycleState !== 'RESOLVED') {
        if (detail.candidateParties.length > 0 || detail.candidate.displayName !== DEMO_CUSTOMER_NAME) {
          return yield* new ErpDemoInitializationError({
            reason: 'Demo customer has existing identity candidates; manual review required',
          });
        }
        // A person without an official identifier requires the normal recorded identity review.
        const reviewAuth = yield* authorize(partyAudience);
        yield* resolveDuplicateCandidateCreateWithAuthorization(
          {
            caseRef,
            expectedRevision: detail.revision,
            reason: 'Potvrzení nové fiktivní osoby pro lokální ERP demo; žádní existující kandidáti.',
          },
          reviewAuth.credential,
          {
            baseUrl: partyUrl,
            correlationId: reviewAuth.correlationId,
            idempotencyKey: 'ontos-local-erp-demo-customer-review-v1',
          },
        ).pipe(Effect.catchTag('PartyCommandAlreadyCommittedProblem', () => Effect.void));
      }
    }
  }
  // A committed Action may precede the asynchronous search projection (including after a restart).
  const customer = yield* findCustomer.pipe(
    Effect.flatMap((party) =>
      party === undefined
        ? Effect.fail(
            new ErpDemoInitializationError({
              reason: 'Demo customer is not searchable; check the Party Registry outbox worker',
            }),
          )
        : Effect.succeed(party),
    ),
    Effect.retry({
      schedule: Schedule.spaced('1 second'),
      times: 30,
      while: Schema.is(ErpDemoInitializationError),
    }),
  );
  const listWorkers = authorize('workforce').pipe(
    Effect.flatMap(({ correlationId, credential }) =>
      executeWorkerListWithAuthorization({}, credential, correlationId, { baseUrl: workforceUrl }),
    ),
  );
  const workers = yield* listWorkers;
  if (!workers.items.some(({ displayName }) => displayName === DEMO_WORKER_NAME)) {
    const payload = yield* Schema.decodeUnknownEffect(WorkerProfileSchema)({
      agreementType: 'EMPLOYMENT',
      agreementValidFrom: '2020-01-01',
      agreementValidTo: null,
      displayName: DEMO_WORKER_NAME,
      internalHourlyCostCzk: '250',
      phone: null,
      position: 'Pracovník vyklízení',
    });
    const { correlationId, credential } = yield* authorize('workforce');
    yield* executeCreateWorkerWithAuthorization(payload, credential, correlationId, {
      baseUrl: workforceUrl,
      idempotencyKey: 'ontos-local-erp-demo-worker-v1',
    }).pipe(Effect.catchTag('CreateWorkerActionAlreadyCommittedProblem', () => Effect.void));
  }
  const worker = (yield* listWorkers).items.find(({ displayName }) => displayName === DEMO_WORKER_NAME);
  if (
    worker === undefined ||
    worker.status !== 'ACTIVE' ||
    worker.agreementType !== 'EMPLOYMENT' ||
    worker.agreementValidFrom > '2020-01-01' ||
    Option.isSome(worker.agreementValidTo)
  ) {
    return yield* new ErpDemoInitializationError({
      reason: 'Demo worker is missing, inactive or has a changed agreement',
    });
  }
  return { customer, worker };
});

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const succeeded = await Effect.runPromise(
    initializeErpDemo.pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Console.error(
            Schema.is(ErpDemoInitializationError)(error)
              ? error.reason
              : `ERP demo initialization failed (${error._tag}); check local authorization and service logs.`,
          ).pipe(Effect.as(false)),
        onSuccess: ({ customer, worker }) =>
          Console.log(`ERP demo ready: ${customer.title}; ${worker.displayName}.`).pipe(Effect.as(true)),
      }),
    ),
  );
  if (!succeeded) {
    process.exitCode = 1;
  }
}
