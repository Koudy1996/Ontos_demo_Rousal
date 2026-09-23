import { inquiryClientOptions } from './inquiry-client-options.ts';
import { formInvalid } from './inquiry-form-invalid.ts';
import { Effect, Schema } from 'effect';
import {
  InquiryDetailsSchema,
  InquiryTransitionSchema,
  OfferDraftSchema,
  InquiryIdSchema,
  AcceptanceSchema,
} from '../../../../shared/resources/sales-inquiry.ts';
import type { InquiryParty, SalesInquirySchema } from '../../../../shared/resources/sales-inquiry.ts';
import { executeCreateInquiry } from '../../../api/create-inquiry-action-client.ts';
import { executeUpdateInquiryDetails } from '../../../api/update-inquiry-details-action-client.ts';
import { executeUpdateOfferDraft } from '../../../api/update-offer-draft-action-client.ts';
import { executeTransitionInquiry } from '../../../api/transition-inquiry-action-client.ts';
import { withPartyRead } from './inquiries-effects.ts';

import { text, nullable, visitInstant } from './inquiry-form-fields.tsx';

type SalesInquiry = typeof SalesInquirySchema.Encoded;
interface DetailsCommandInput {
  readonly creating: boolean;
  readonly data: FormData;
  readonly party: InquiryParty | null;
  readonly selected: SalesInquiry | null;
}
export const detailsCommand = Effect.fn('Inquiries.detailsCommand')(function* detailsCommand(
  { creating, data, party, selected }: DetailsCommandInput,
  key: string,
) {
  const partyRef = party?.partyRef ?? selected?.partyRef;
  const details = yield* Schema.decodeUnknownEffect(InquiryDetailsSchema)({
    description: text(data, 'description'),
    elevator: text(data, 'elevator') === '' ? null : text(data, 'elevator') === 'yes',
    estimatedVolumeM3: nullable(data, 'estimatedVolumeM3'),
    floor: text(data, 'floor') === '' ? null : Number(text(data, 'floor')),
    internalNote: text(data, 'internalNote'),
    location: {
      addressLine: text(data, 'addressLine'),
      city: text(data, 'city'),
      countryCode: text(data, 'countryCode').toUpperCase(),
      postalCode: text(data, 'postalCode'),
    },
    objectType: text(data, 'objectType'),
    partyRef,
    requestedDate: nullable(data, 'requestedDate'),
    siteVisitAt: visitInstant(data),
    specialWaste: nullable(data, 'specialWaste'),
  }).pipe(Effect.mapError(formInvalid));
  if (selected !== null && !creating) {
    const id = yield* Schema.decodeEffect(InquiryIdSchema)(selected.ref.resourceId).pipe(Effect.mapError(formInvalid));
    return yield* withPartyRead(
      executeUpdateInquiryDetails({ details, expectedRevision: selected.revision, id }, key, {
        ...inquiryClientOptions(),
        idempotencyKey: key,
      }),
    );
  }
  return yield* withPartyRead(executeCreateInquiry(details, key, { ...inquiryClientOptions(), idempotencyKey: key }));
});
interface TransitionInput {
  readonly data: FormData | undefined;
  readonly next: 'SITE_VISIT' | 'PRICING' | 'OFFER_SENT' | 'ACCEPTED' | 'DECLINED';
  readonly selected: SalesInquiry;
}
export const transitionCommand = Effect.fn('Inquiries.transitionCommand')(function* transitionCommand(
  { data, next, selected }: TransitionInput,
  key: string,
) {
  const id = yield* Schema.decodeEffect(InquiryIdSchema)(selected.ref.resourceId).pipe(Effect.mapError(formInvalid));
  const base = { expectedRevision: selected.revision, id };
  if (next === 'ACCEPTED') {
    const acceptance = yield* Schema.decodeUnknownEffect(AcceptanceSchema)({
      evidenceNote: data === undefined ? '' : text(data, 'evidenceNote'),
      method: data === undefined ? '' : text(data, 'method'),
    }).pipe(Effect.mapError(formInvalid));
    return yield* executeTransitionInquiry({ ...base, transition: { acceptance, stage: next } }, key, {
      ...inquiryClientOptions(),
      idempotencyKey: key,
    });
  }
  if (next === 'SITE_VISIT') {
    const transition = yield* Schema.decodeEffect(InquiryTransitionSchema)({
      siteVisitAt: data === undefined ? null : visitInstant(data),
      stage: next,
    }).pipe(Effect.mapError(formInvalid));
    return yield* executeTransitionInquiry({ ...base, transition }, key, {
      ...inquiryClientOptions(),
      idempotencyKey: key,
    });
  }
  if (next === 'DECLINED') {
    const transition = yield* Schema.decodeEffect(InquiryTransitionSchema)({
      reason: data === undefined ? null : nullable(data, 'declineReason'),
      stage: next,
    }).pipe(Effect.mapError(formInvalid));
    return yield* executeTransitionInquiry({ ...base, transition }, key, {
      ...inquiryClientOptions(),
      idempotencyKey: key,
    });
  }
  return yield* executeTransitionInquiry({ ...base, transition: { stage: next } }, key, {
    ...inquiryClientOptions(),
    idempotencyKey: key,
  });
});
const decimal = (data: FormData, name: string) => text(data, name).replace(',', '.');
export const offerCommand = Effect.fn('Inquiries.offerCommand')(function* offerCommand(
  selected: SalesInquiry,
  data: FormData,
  key: string,
) {
  const id = yield* Schema.decodeEffect(InquiryIdSchema)(selected.ref.resourceId).pipe(Effect.mapError(formInvalid));
  const offer = yield* Schema.decodeUnknownEffect(OfferDraftSchema)({
    currency: 'CZK',
    disposal: decimal(data, 'disposal'),
    estimatedPersonHours: decimal(data, 'estimatedPersonHours') || null,
    material: decimal(data, 'material'),
    other: decimal(data, 'other'),
    priceBasis: text(data, 'priceBasis'),
    transport: decimal(data, 'transport'),
    work: decimal(data, 'work'),
  }).pipe(Effect.mapError(formInvalid));
  return yield* executeUpdateOfferDraft({ expectedRevision: selected.revision, id, offer }, key, {
    ...inquiryClientOptions(),
    idempotencyKey: key,
  });
});
