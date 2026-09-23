import { ReadPolicyDenied, ReadHandlerNotFound, ReadHandlerUnavailable } from '@app/core-runtime';
import { getReadHandler } from '../../../../packages/core-runtime/src/reads/definition.ts';
import { Effect, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import { acceptedOfferHandoffRead } from '../../src/api/accepted-offer-handoff.read.ts';
import { SalesInquirySchema, InquiryUnavailable } from '../../shared/resources/sales-inquiry.ts';
import type { SalesInquiry } from '../../shared/resources/sales-inquiry.ts';
import type { InquiryPersistence } from '../../src/services/inquiry-persistence.service.ts';
import {
  AcceptedOfferHandoffRequestSchema,
  AcceptedOfferHandoffResponseSchema,
} from '../../shared/apis/accepted-offer-handoff.ts';

const tenantId = '30000000-0000-4000-8000-000000000001';
const legalEntityId = '40000000-0000-4000-8000-000000000001';
const source = Schema.decodeSync(SalesInquirySchema)({
  acceptance: { evidenceNote: 'Explicitly accepted by phone', method: 'PHONE' },
  acceptedAt: '2026-09-23T10:00:00.000Z',
  createdAt: '2026-09-23T08:00:00.000Z',
  declinedAt: null,
  declineReason: null,
  description: 'Vyklizení bytu',
  elevator: false,
  estimatedVolumeM3: '15',
  floor: 2,
  internalNote: 'Sales-private note',
  legalEntityId,
  location: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  objectType: 'APARTMENT',
  offer: {
    currency: 'CZK',
    disposal: '0',
    estimatedPersonHours: null,
    material: '0',
    other: '0',
    priceBasis: 'INCLUDING_VAT',
    total: '1200.10',
    transport: '200',
    work: '1000.10',
  },
  partyRef: {
    moduleId: 'party.registry',
    resourceId: '20000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party',
    tenantId,
  },
  ref: {
    moduleId: 'sales.inquiries',
    resourceId: '10000000-0000-4000-8000-000000000001',
    resourceType: 'sales.inquiries.sales-inquiry',
    tenantId,
  },
  requestedDate: null,
  revision: 4,
  sentAt: '2026-09-23T09:00:00.000Z',
  siteVisitAt: null,
  specialWaste: null,
  stage: 'ACCEPTED',
  updatedAt: '2026-09-23T10:00:00.000Z',
});
const scope = {
  authBindingId: '60000000-0000-4000-8000-000000000001',
  authContextRef: 'better-auth-session:handoff-test',
  authMethod: 'session',
  correlationId: 'handoff-test',
  legalEntityId,
  principalId: '50000000-0000-4000-8000-000000000001',
  tenantId,
} as const;
const read = (row: SalesInquiry, requestedTenant = tenantId, unavailable = false) => {
  const services: InquiryPersistence = {
    get: () =>
      unavailable
        ? Effect.fail(new InquiryUnavailable({ code: 'inquiry_unavailable', reason: 'Offline' }))
        : Effect.succeed(row),
    insert: Effect.succeed,
    list: () => Effect.succeed([]),
    save: Effect.succeed,
  };
  return getReadHandler(acceptedOfferHandoffRead)(
    Schema.decodeSync(AcceptedOfferHandoffRequestSchema)({ sourceRef: { ...source.ref, tenantId: requestedTenant } }),
    { readKey: acceptedOfferHandoffRead.descriptor.readKey, scope, services },
  );
};
it.effect('publishes only immutable accepted execution facts and exact commercial total', () =>
  Effect.gen(function* accepted() {
    const result = yield* read(source);
    const encoded = yield* Schema.encodeEffect(AcceptedOfferHandoffResponseSchema)(result.result);
    expect(encoded.sourceRef).toEqual(source.ref);
    expect(encoded.partyRef).toEqual(source.partyRef);
    expect(encoded.serviceLocation).toEqual(source.location);
    expect(encoded.commercialSummary).toEqual({ currency: 'CZK', priceBasis: 'INCLUDING_VAT', total: '1200.10' });
    expect(encoded.acceptedAt).toBe('2026-09-23T10:00:00.000Z');
    expect(encoded).not.toHaveProperty('internalNote');
    expect(encoded).not.toHaveProperty('offer');
  }),
);
it.effect('rejects a nonaccepted source and another tenant', () =>
  Effect.gen(function* rejected() {
    expect(Schema.is(ReadPolicyDenied)(yield* Effect.flip(read({ ...source, stage: 'OFFER_SENT' })))).toBe(true);
    expect(
      Schema.is(ReadHandlerNotFound)(yield* Effect.flip(read(source, '30000000-0000-4000-8000-000000000002'))),
    ).toBe(true);
  }),
);
it.effect('retains retryable owner storage failure', () =>
  Effect.gen(function* unavailable() {
    expect(Schema.is(ReadHandlerUnavailable)(yield* Effect.flip(read(source, tenantId, true)))).toBe(true);
  }),
);
