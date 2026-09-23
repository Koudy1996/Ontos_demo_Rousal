import { TransitionInquiryActionConflictProblemSchema } from '../../shared/apis/transition-inquiry-action.ts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, rstest, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';
import InquiriesPage from '../../src/routes/[lang]/inquiries/page.tsx';
import { SalesInquirySchema } from '../../shared/resources/sales-inquiry.ts';
import {
  InquiryListAuthenticationProblemSchema,
  InquiryListForbiddenProblemSchema,
  InquiryListUnavailableProblemSchema,
} from '../../shared/apis/inquiry-list.ts';
import { CreateInquiryActionCommitIndeterminateProblemSchema } from '../../shared/apis/create-inquiry-action.ts';
import { InquiryDetailNotFoundProblemSchema } from '../../shared/apis/inquiry-detail.ts';

const mocks = rstest.hoisted(() => ({
  executeCreateInquiry: rstest.fn(),
  executeInquiryCommitStatus: rstest.fn(),
  executeInquiryDetail: rstest.fn(),
  executeInquiryList: rstest.fn(),
  executePartyDisplay: rstest.fn(),
  executePartySelection: rstest.fn(),
  executeTransitionInquiry: rstest.fn(),
  executeUpdateInquiryDetails: rstest.fn(),
  executeUpdateOfferDraft: rstest.fn(),
}));
rstest.mock('../../src/api/inquiry-list-client.ts', () => ({ executeInquiryList: mocks.executeInquiryList }));
rstest.mock('../../src/api/inquiry-detail-client.ts', () => ({ executeInquiryDetail: mocks.executeInquiryDetail }));
rstest.mock('../../src/api/party-selection-client.ts', () => ({ executePartySelection: mocks.executePartySelection }));
rstest.mock('../../src/api/party-display-client.ts', () => ({ executePartyDisplay: mocks.executePartyDisplay }));
rstest.mock('../../src/api/inquiry-commit-status-client.ts', () => ({
  executeInquiryCommitStatus: mocks.executeInquiryCommitStatus,
}));
rstest.mock('../../src/api/create-inquiry-action-client.ts', () => ({
  executeCreateInquiry: mocks.executeCreateInquiry,
}));
rstest.mock('../../src/api/update-inquiry-details-action-client.ts', () => ({
  executeUpdateInquiryDetails: mocks.executeUpdateInquiryDetails,
}));
rstest.mock('../../src/api/update-offer-draft-action-client.ts', () => ({
  executeUpdateOfferDraft: mocks.executeUpdateOfferDraft,
}));
rstest.mock('../../src/api/transition-inquiry-action-client.ts', () => ({
  executeTransitionInquiry: mocks.executeTransitionInquiry,
}));
rstest.mock('../../src/api/dependency-read-gateway.ts', () => ({
  dependencyReadGateway: { invoke: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect },
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  useModernI18n: () => ({ t: (key: string) => key.replace('sales-inquiries.demo.', '') }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));
const inquiry = Schema.decodeSync(SalesInquirySchema)({
  acceptance: null,
  acceptedAt: null,
  createdAt: '2026-09-23T08:00:00.000Z',
  declinedAt: null,
  declineReason: null,
  description: 'Vyklizení bytu',
  elevator: false,
  estimatedVolumeM3: null,
  floor: 2,
  internalNote: '',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  location: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  objectType: 'APARTMENT',
  offer: null,
  partyRef: {
    moduleId: 'party.registry',
    resourceId: '20000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party',
    tenantId: '30000000-0000-4000-8000-000000000001',
  },
  ref: {
    moduleId: 'sales.inquiries',
    resourceId: '10000000-0000-4000-8000-000000000001',
    resourceType: 'sales.inquiries.sales-inquiry',
    tenantId: '30000000-0000-4000-8000-000000000001',
  },
  requestedDate: null,
  revision: 1,
  sentAt: null,
  siteVisitAt: '2026-09-24T08:00:00.000Z',
  specialWaste: null,
  stage: 'NEW',
  updatedAt: '2026-09-23T08:00:00.000Z',
});
const contact = { archived: false, partyRef: inquiry.partyRef, partyType: 'PERSON', title: 'Jan Novák' };
beforeEach(() => {
  rstest.stubGlobal('ULTRAMODERN_SALES_INQUIRIES_API_BASE_URL', '/sales-inquiries-api');
  mocks.executeInquiryList.mockReturnValue(Effect.succeed({ items: [inquiry] }));
  mocks.executePartyDisplay.mockReturnValue(Effect.succeed(contact));
  mocks.executeInquiryDetail.mockReturnValue(Effect.succeed(inquiry));
  mocks.executePartySelection.mockReturnValue(Effect.succeed([contact]));
  mocks.executeCreateInquiry.mockReturnValue(Effect.succeed(inquiry));
  mocks.executeUpdateInquiryDetails.mockReturnValue(Effect.succeed({ ...inquiry, revision: 2 }));
});
afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});
it.live('renders responsive list and opens service details through the generated read', () =>
  Effect.gen(function* componentScenario1() {
    const view = render(<InquiriesPage />);
    expect(yield* Effect.promise(() => screen.findByText('Jan Novák'))).toBeTruthy();
    expect(view.container.querySelector('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'))).toBeTruthy();
    expect(screen.getByText('2026-09-24 10:00')).toBeTruthy();
    expect(mocks.executeInquiryDetail).toHaveBeenCalledWith({ id: inquiry.ref.resourceId }, expect.any(String), {
      baseUrl: '/sales-inquiries-api',
    });
    expect(screen.getByRole('button', { name: 'startPricing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'edit' })).toBeTruthy();
  }),
);
it.live('shows loading and empty states', () =>
  Effect.gen(function* componentScenario2() {
    mocks.executeInquiryList.mockReturnValue(Effect.never);
    const view = render(<InquiriesPage />);
    expect(screen.getByText('loading')).toBeTruthy();
    view.unmount();
    mocks.executeInquiryList.mockReturnValue(Effect.succeed({ items: [] }));
    render(<InquiriesPage />);
    expect(yield* Effect.promise(() => screen.findByText('empty'))).toBeTruthy();
  }),
);
it.live.each([
  {
    failure: InquiryListAuthenticationProblemSchema.make({
      detail: 'Authentication',
      status: 401,
      title: 'Authentication',
      type: 'https://ontos.dev/test',
    }),
    kind: 'authentication',
  },
  {
    failure: InquiryListForbiddenProblemSchema.make({
      detail: 'Denied',
      status: 403,
      title: 'Denied',
      type: 'https://ontos.dev/test',
    }),
    kind: 'forbidden',
  },
  {
    failure: InquiryListUnavailableProblemSchema.make({
      detail: 'Offline',
      retryable: true,
      status: 503,
      title: 'Offline',
      type: 'https://ontos.dev/test',
    }),
    kind: 'unavailable',
  },
])('keeps the %s failure visible with a refresh action', ({ failure, kind }) =>
  Effect.gen(function* componentScenario3() {
    mocks.executeInquiryList.mockReturnValue(Effect.fail(failure));
    render(<InquiriesPage />);
    expect((yield* Effect.promise(() => screen.findByRole('alert'))).textContent).toContain(`error.${kind}`);
    expect(screen.getByRole('button', { name: 'refresh' })).toBeTruthy();
  }),
);
it.live('shows not found instead of opening a missing inquiry', () =>
  Effect.gen(function* componentScenario4() {
    mocks.executeInquiryDetail.mockReturnValue(
      Effect.fail(
        InquiryDetailNotFoundProblemSchema.make({
          detail: 'Missing',
          status: 404,
          title: 'Missing',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<InquiriesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    expect(yield* Effect.promise(() => screen.findByText('error.notFound'))).toBeTruthy();
  }),
);
it.live('searches existing contacts and keeps creation disabled until one is selected', () =>
  Effect.gen(function* componentScenario5() {
    render(<InquiriesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'new' })));
    expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(/contactSearch/u), { target: { value: 'Novák' } });
    fireEvent.submit(
      yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(
        screen.getByLabelText(/contactSearch/u).closest('form'),
      ),
    );
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'Jan Novák' })));
    expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(false);
    yield* Effect.promise(() =>
      waitFor(() =>
        expect(mocks.executePartySelection).toHaveBeenCalledWith({ query: 'Novák' }, expect.any(String), {
          baseUrl: '/sales-inquiries-api',
        }),
      ),
    );
  }),
);
const fillCreation = () =>
  Effect.gen(function* fillCreationEffect() {
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'new' })));
    fireEvent.change(screen.getByLabelText(/contactSearch/u), { target: { value: 'Novák' } });
    fireEvent.submit(
      yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(
        screen.getByLabelText(/contactSearch/u).closest('form'),
      ),
    );
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'Jan Novák' })));
    for (const { label, value } of [
      { label: 'addressLine', value: 'Dlouhá 12' },
      { label: 'city', value: 'Praha' },
      { label: 'postalCode', value: '11000' },
      { label: 'description', value: 'Vyklizení' },
    ]) {
      fireEvent.change(screen.getByLabelText(new RegExp(label, 'u')), { target: { value } });
    }
    fireEvent.submit(
      yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(
        screen.getByRole('button', { name: 'save' }).closest('form'),
      ),
    );
  });
it.live('disables commands while a mutation is pending', () =>
  Effect.gen(function* componentScenario6() {
    mocks.executeCreateInquiry.mockReturnValue(Effect.never);
    render(<InquiriesPage />);
    yield* fillCreation();
    expect(yield* Effect.promise(() => screen.findByText('saving'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'new' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.executeCreateInquiry).toHaveBeenCalledTimes(1);
  }),
);
it.live('resolves an uncertain commit through the generated recovery read without resending creation', () =>
  Effect.gen(function* componentScenario7() {
    mocks.executeCreateInquiry.mockReturnValue(
      Effect.fail(
        CreateInquiryActionCommitIndeterminateProblemSchema.make({
          detail: 'Uncertain',
          invocationId: inquiry.ref.resourceId,
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Uncertain',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    mocks.executeInquiryCommitStatus.mockReturnValue(Effect.succeed({ retryCommand: false, state: 'COMMITTED' }));
    render(<InquiriesPage />);
    yield* fillCreation();
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'resolve' })));
    expect(yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'))).toBeTruthy();
    expect(mocks.executeCreateInquiry).toHaveBeenCalledTimes(1);
    expect(mocks.executeInquiryCommitStatus).toHaveBeenCalledTimes(1);
  }),
);
it.live('filters the inquiry list through its governed stage contract', () =>
  Effect.gen(function* componentScenario8() {
    render(<InquiriesPage />);
    yield* Effect.promise(() => screen.findByText('Jan Novák'));
    fireEvent.click(screen.getByRole('combobox', { name: 'stage.label' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('option', { name: 'stage.PRICING' })));
    yield* Effect.promise(() =>
      waitFor(() =>
        expect(mocks.executeInquiryList).toHaveBeenLastCalledWith({ stage: 'PRICING' }, expect.any(String), {
          baseUrl: '/sales-inquiries-api',
        }),
      ),
    );
  }),
);

it.live('retries a proven OPEN invocation with the same retained command key', () =>
  Effect.gen(function* retryOpen() {
    mocks.executeCreateInquiry.mockReturnValue(
      Effect.fail(
        CreateInquiryActionCommitIndeterminateProblemSchema.make({
          detail: 'Uncertain',
          invocationId: inquiry.ref.resourceId,
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Uncertain',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    mocks.executeInquiryCommitStatus.mockReturnValue(Effect.succeed({ retryCommand: true, state: 'OPEN' }));
    render(<InquiriesPage />);
    yield* fillCreation();
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'resolve' })));
    const retry = yield* Effect.promise(() => screen.findByRole('button', { name: 'retry' }));
    expect(mocks.executeCreateInquiry).toHaveBeenCalledTimes(1);
    const originalOptions = mocks.executeCreateInquiry.mock.calls[0]?.[2];
    mocks.executeCreateInquiry.mockReturnValue(Effect.succeed(inquiry));
    fireEvent.click(retry);
    yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'));
    expect(mocks.executeCreateInquiry.mock.calls[1]?.[2]).toEqual(originalOptions);
    expect(originalOptions).toEqual(expect.objectContaining({ idempotencyKey: expect.any(String) }));
  }),
);
it.live('retains the key after a response decoding failure', () =>
  Effect.gen(function* retryUndecodableResponse() {
    const decodeFailure = yield* Schema.decodeUnknownEffect(Schema.String)(42).pipe(Effect.flip);
    mocks.executeCreateInquiry.mockReturnValue(Effect.fail(decodeFailure));
    render(<InquiriesPage />);
    yield* fillCreation();
    const retry = yield* Effect.promise(() => screen.findByRole('button', { name: 'retry' }));
    const originalOptions = mocks.executeCreateInquiry.mock.calls[0]?.[2];
    mocks.executeCreateInquiry.mockReturnValue(Effect.succeed(inquiry));
    fireEvent.click(retry);
    yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'));
    expect(mocks.executeCreateInquiry).toHaveBeenCalledTimes(2);
    expect(mocks.executeCreateInquiry.mock.calls[1]?.[2]).toEqual(originalOptions);
  }),
);
it.live('refreshes a conflicting open detail before the next command', () =>
  Effect.gen(function* refreshConflict() {
    mocks.executeTransitionInquiry.mockReturnValue(
      Effect.fail(
        TransitionInquiryActionConflictProblemSchema.make({
          code: 'revision_conflict',
          detail: 'Stale',
          status: 409,
          title: 'Conflict',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<InquiriesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'startPricing' })));
    yield* Effect.promise(() => screen.findByRole('alert'));
    mocks.executeInquiryDetail.mockReturnValue(Effect.succeed({ ...inquiry, revision: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeInquiryDetail).toHaveBeenCalledTimes(2)));
    mocks.executeTransitionInquiry.mockReturnValue(Effect.succeed({ ...inquiry, revision: 3, stage: 'PRICING' }));
    fireEvent.click(screen.getByRole('button', { name: 'startPricing' }));
    yield* Effect.promise(() =>
      waitFor(() =>
        expect(mocks.executeTransitionInquiry).toHaveBeenLastCalledWith(
          expect.objectContaining({ expectedRevision: 2 }),
          expect.any(String),
          expect.anything(),
        ),
      ),
    );
  }),
);
