import type { TransitionInquiryPayloadSchema } from '../../shared/actions/transition-inquiry.ts';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { Predicate, DateTime, Effect, Option, Layer } from 'effect';
import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { expect, it } from 'effect-rstest';
import { createInquiryAction } from '../../src/actions/create-inquiry.action.ts';
import { updateInquiryDetailsAction } from '../../src/actions/update-inquiry-details.action.ts';
import { updateOfferDraftAction } from '../../src/actions/update-offer-draft.action.ts';
import { transitionInquiryAction } from '../../src/actions/transition-inquiry.action.ts';
import { InquiryRejected, InquiryUnavailable } from '../../shared/resources/sales-inquiry.ts';
import type { InquiryDetailsSchema, OfferDraftSchema, SalesInquiry } from '../../shared/resources/sales-inquiry.ts';
import type { InquiryPersistence } from '../../src/services/inquiry-persistence.service.ts';
import type { InquiryPartyReader } from '../../src/services/party-read.service.ts';

const principal = {
  authBindingId: '10000000-0000-4000-8000-000000000001',
  authContextRef: 'better-auth-session:inquiries-test',
  authMethod: 'session',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  principalId: '20000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;
const details: typeof InquiryDetailsSchema.Encoded = {
  description: 'Vyklizení bytu 2+1',
  elevator: false,
  estimatedVolumeM3: '15',
  floor: 2,
  internalNote: 'Zavolat před příjezdem',
  location: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  objectType: 'APARTMENT',
  partyRef: {
    moduleId: 'party.registry',
    resourceId: '50000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party',
    tenantId: principal.tenantId,
  },
  requestedDate: null,
  siteVisitAt: null,
  specialWaste: null,
};
const offer: typeof OfferDraftSchema.Encoded = {
  currency: 'CZK',
  disposal: '100',
  estimatedPersonHours: '12.5',
  material: '0',
  other: '9.99',
  priceBasis: 'INCLUDING_VAT',
  transport: '0.20',
  work: '0.10',
};
const transport = (idempotencyKey: string) => ({ correlationId: 'inquiries-test', idempotencyKey });
const missing = () => new InquiryRejected({ code: 'not_found', reason: 'Missing' });
const transitionPayload = (
  stage: 'PRICING' | 'OFFER_SENT' | 'SITE_VISIT' | 'ACCEPTED' | 'DECLINED',
): (typeof TransitionInquiryPayloadSchema.Encoded)['transition'] => {
  if (stage === 'ACCEPTED') {
    return { acceptance: { evidenceNote: 'Jan Novák výslovně přijal nabídku po telefonu', method: 'PHONE' }, stage };
  }
  if (stage === 'DECLINED') {
    return { reason: 'Cena', stage };
  }
  if (stage === 'SITE_VISIT') {
    return { siteVisitAt: '2026-09-24T10:00:00.000Z', stage };
  }
  return { stage };
};
const filterInquiries = (rows: ReadonlyMap<string, SalesInquiry>, stage: SalesInquiry['stage'] | null) =>
  [...rows.values()].filter((row) => stage === null || row.stage === stage);
const setup = (
  options: {
    readonly archived?: boolean;
    readonly denied?: boolean;
    readonly unavailableParty?: boolean;
    readonly uncertain?: boolean;
  } = {},
) =>
  Effect.gen(function* setupWorkflow() {
    const rows = new Map<string, SalesInquiry>();
    let partyReads = 0;
    const persistence: InquiryPersistence = {
      get: (id) =>
        Effect.suspend(() => {
          const row = rows.get(id);
          return row === undefined ? Effect.fail(missing()) : Effect.succeed(row);
        }),
      insert: (row) =>
        Effect.sync(() => {
          rows.set(row.ref.resourceId, row);
          return row;
        }),
      list: (stage) => Effect.sync(() => filterInquiries(rows, stage)),
      save: (row, revision) =>
        Effect.suspend(() => {
          const current = rows.get(row.ref.resourceId);
          if (current === undefined) {
            return Effect.fail(missing());
          }
          if (current.revision !== revision || row.revision !== revision + 1) {
            return Effect.fail(new InquiryRejected({ code: 'revision_conflict', reason: 'Stale' }));
          }
          rows.set(row.ref.resourceId, row);
          return Effect.succeed(row);
        }),
    };
    const party: InquiryPartyReader = {
      read: (ref) =>
        Effect.suspend(() => {
          partyReads += 1;
          return options.unavailableParty === true
            ? Effect.fail(new InquiryUnavailable({ code: 'inquiry_unavailable', reason: 'Offline' }))
            : Effect.succeed({
                archived: options.archived === true,
                partyRef: { ...ref, resourceId: '50000000-0000-4000-8000-000000000002' },
                partyType: 'PERSON',
                title: 'Jan Novák',
              });
        }),
      search: () => Effect.succeed([]),
    };
    const harnessOptions = {
      actionPermission: options.denied === true ? ('denied' as const) : ('allowed' as const),
      services: [
        bindActionTestServices(createInquiryAction, { ...persistence, party }),
        bindActionTestServices(updateInquiryDetailsAction, { ...persistence, party }),
        bindActionTestServices(updateOfferDraftAction, persistence),
        bindActionTestServices(transitionInquiryAction, persistence),
      ],
    };
    const harness = yield* makeActionTestHarness(
      options.uncertain === true ? { ...harnessOptions, commitAcknowledgement: 'indeterminate-once' } : harnessOptions,
    );
    const create = () =>
      harness.runtime.runAction({
        payload: details,
        principal,
        registration: createInquiryAction,
        transport: transport('create'),
      });
    const transition = (row: SalesInquiry, stage: 'PRICING' | 'OFFER_SENT' | 'SITE_VISIT' | 'ACCEPTED' | 'DECLINED') =>
      harness.runtime.runAction({
        payload: {
          expectedRevision: row.revision,
          id: row.ref.resourceId,
          transition: transitionPayload(stage),
        },
        principal,
        registration: transitionInquiryAction,
        transport: transport(`transition-${row.revision}-${stage}`),
      });
    const price = (row: SalesInquiry, draft: typeof OfferDraftSchema.Encoded = offer) =>
      harness.runtime.runAction({
        payload: { expectedRevision: row.revision, id: row.ref.resourceId, offer: draft },
        principal,
        registration: updateOfferDraftAction,
        transport: transport(`offer-${row.revision}`),
      });
    return { create, harness, partyReads: () => partyReads, price, rows, transition };
  });

const acceptedWorkflowScenario = Effect.gen(function* acceptedWorkflow() {
  const test = yield* setup();
  const created = yield* test.create();
  expect(created.partyRef.resourceId).toBe('50000000-0000-4000-8000-000000000002');
  expect(created.stage).toBe('NEW');
  expect(created.legalEntityId).toBe(principal.legalEntityId);
  const visit = yield* test.transition(created, 'SITE_VISIT');
  expect(Option.match(visit.siteVisitAt, { onNone: () => null, onSome: DateTime.formatIso })).toBe(
    '2026-09-24T10:00:00.000Z',
  );
  const pricing = yield* test.transition(visit, 'PRICING');
  const priced = yield* test.price(pricing);
  expect(Option.getOrThrow(priced.offer).total).toBe('110.29');
  expect(Option.getOrThrow(priced.offer).priceBasis).toBe('INCLUDING_VAT');
  const sent = yield* test.transition(priced, 'OFFER_SENT');
  expect(Option.isSome(sent.sentAt)).toBe(true);
  const accepted = yield* test.transition(sent, 'ACCEPTED');
  expect(Option.isSome(accepted.acceptedAt)).toBe(true);
  expect(Option.getOrThrow(accepted.acceptance).method).toBe('PHONE');
  expect(test.partyReads()).toBe(1);
  expect(test.rows.size).toBe(1);
  expect(test.harness.snapshot().committed.every((entry) => entry.evidence.domainEvents.length === 0)).toBe(true);
  expect(test.harness.snapshot().committed.every((entry) => entry.evidence.dataAccessEvents.length === 1)).toBe(true);
  expect(test.harness.snapshot().committed[0]?.evidence.dataAccessEvents[0]).toMatchObject({
    resultCount: 1,
    targetModuleKey: 'party.registry',
    targetResourceId: created.partyRef.resourceId,
  });
});

const frozenWorkflowScenario = Effect.gen(function* frozenWorkflow() {
  const test = yield* setup();
  const created = yield* test.create();
  expect(yield* test.price(created).pipe(Effect.flip)).toMatchObject({ code: 'commercial_frozen' });
  const pricing = yield* test.transition(created, 'PRICING');
  expect(yield* test.transition(pricing, 'OFFER_SENT').pipe(Effect.flip)).toMatchObject({ code: 'offer_required' });
  const priced = yield* test.price(pricing);
  const sent = yield* test.transition(priced, 'OFFER_SENT');
  expect(yield* test.price(sent).pipe(Effect.flip)).toMatchObject({ code: 'commercial_frozen' });
  expect(
    yield* test.harness.runtime
      .runAction({
        payload: { details, expectedRevision: sent.revision, id: sent.ref.resourceId },
        principal,
        registration: updateInquiryDetailsAction,
        transport: transport('frozen-details'),
      })
      .pipe(Effect.flip),
  ).toMatchObject({ code: 'commercial_frozen' });
  const declined = yield* test.transition(sent, 'DECLINED');
  expect(declined.declinedAt).not.toBeNull();
  expect(Option.getOrNull(declined.declineReason)).toBe('Cena');
  expect(yield* test.transition(declined, 'ACCEPTED').pipe(Effect.flip)).toMatchObject({
    code: 'invalid_transition',
  });
});

const retriesAndValidationScenario = Effect.gen(function* retriesAndValidation() {
  const test = yield* setup();
  const created = yield* test.create();
  expect(Predicate.isTagged(yield* test.create().pipe(Effect.flip), 'ActionAlreadyCommitted')).toBe(true);
  expect(test.rows.size).toBe(1);
  expect(test.partyReads()).toBe(1);
  const pricing = yield* test.transition(created, 'PRICING');
  expect(
    yield* test.harness.runtime
      .runAction({
        payload: { expectedRevision: 1, id: pricing.ref.resourceId, offer },
        principal,
        registration: updateOfferDraftAction,
        transport: transport('stale'),
      })
      .pipe(Effect.flip),
  ).toMatchObject({ code: 'revision_conflict' });
  const sent = yield* test.transition(yield* test.price(pricing), 'OFFER_SENT');
  expect(
    Predicate.isTagged(
      yield* test.harness.runtime
        .runAction({
          payload: {
            expectedRevision: sent.revision,
            id: sent.ref.resourceId,
            transition: { acceptance: { evidenceNote: ' ', method: 'PHONE' }, stage: 'ACCEPTED' },
          },
          principal,
          registration: transitionInquiryAction,
          transport: transport('no-evidence'),
        })
        .pipe(Effect.flip),
      'ActionPayloadValidationError',
    ),
  ).toBe(true);
  expect(test.rows.get(sent.ref.resourceId)?.stage).toBe('OFFER_SENT');
});

const failureIsolationScenario = Effect.gen(function* failureIsolation() {
  const denied = yield* setup({ denied: true });
  expect(Predicate.isTagged(yield* denied.create().pipe(Effect.flip), 'ActionPermissionDenied')).toBe(true);
  expect(denied.partyReads()).toBe(0);
  expect(denied.rows.size).toBe(0);
  const archived = yield* setup({ archived: true });
  expect(yield* archived.create().pipe(Effect.flip)).toMatchObject({ code: 'party_invalid' });
  expect(archived.rows.size).toBe(0);
  const unavailable = yield* setup({ unavailableParty: true });
  expect(Predicate.isTagged(yield* unavailable.create().pipe(Effect.flip), 'InquiryUnavailable')).toBe(true);
  expect(unavailable.rows.size).toBe(0);
});

const uncertainCommitScenario = Effect.gen(function* uncertainCommit() {
  const test = yield* setup({ uncertain: true });
  expect(Predicate.isTagged(yield* test.create().pipe(Effect.flip), 'ActionCommitIndeterminate')).toBe(true);
  expect(Predicate.isTagged(yield* test.create().pipe(Effect.flip), 'ActionAlreadyCommitted')).toBe(true);
  expect(test.partyReads()).toBe(1);
  expect(test.rows.size).toBe(1);
});

const updateBeforeSendScenario = Effect.gen(function* updateBeforeSend() {
  const test = yield* setup();
  const created = yield* test.harness.runtime.runAction({
    payload: { ...details, description: '' },
    principal,
    registration: createInquiryAction,
    transport: transport('minimal-create'),
  });
  expect(created.description).toBe('');
  const changed = yield* test.harness.runtime.runAction({
    payload: {
      details: {
        ...details,
        description: 'Upravená poptávka',
        location: { ...details.location, addressLine: 'Nová 25' },
      },
      expectedRevision: created.revision,
      id: created.ref.resourceId,
    },
    principal,
    registration: updateInquiryDetailsAction,
    transport: transport('update-before-send'),
  });
  expect(changed.revision).toBe(2);
  expect(changed.location.addressLine).toBe('Nová 25');
  expect(changed.partyRef).toEqual(created.partyRef);
  const evidence = test.harness.snapshot().committed.at(-1)?.evidence.dataAccessEvents;
  expect(evidence).toHaveLength(2);
  expect(evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ targetModuleKey: 'sales.inquiries', targetResourceId: created.ref.resourceId }),
      expect.objectContaining({ targetModuleKey: 'party.registry', targetResourceId: created.partyRef.resourceId }),
    ]),
  );
});

it.layer(
  Layer.succeed(GatewayPrincipalVerifierConfiguration, {
    configuration: Effect.die('Party test services must replace credential verification'),
  }),
)('Sales inquiry workflow', (suite) => {
  suite.effect(
    'creates from canonical Party and commits an exact-price accepted offer without customer or job writes',
    () => acceptedWorkflowScenario,
  );
  suite.effect(
    'supports direct pricing and decline; refuses every change after the offer is sent',
    () => frozenWorkflowScenario,
  );
  suite.effect(
    'preserves idempotency and rejects stale revisions and empty acceptance evidence',
    () => retriesAndValidationScenario,
  );
  suite.effect(
    'fails closed before persistence for denial, archived Party, and unavailable identity provider',
    () => failureIsolationScenario,
  );
  suite.effect('returns commit uncertainty without executing the create a second time', () => uncertainCommitScenario);

  suite.effect(
    'allows optional description and records both invariant reads for pre-send editing',
    () => updateBeforeSendScenario,
  );
});
