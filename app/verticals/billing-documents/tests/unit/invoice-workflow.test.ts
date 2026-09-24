import { DateTime, Effect, Result, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import { CreateInvoiceDraftPayloadSchema } from '../../shared/actions/create-invoice-draft.ts';
import { InvoiceAddressSchema } from '../../shared/resources/invoice.ts';
import { calculateInvoiceDueAt } from '../../src/domain/due-date.ts';
import {
  isUsableCurrentContactAssertion,
  isUsableCurrentIdentifierAssertion,
} from '../../src/services/owner-readers.service.ts';
import { assertCompleted, assertSourceUnchanged } from '../../src/actions/invoice-action-support.ts';
import { invoiceFixture, jobFixture } from '../fixtures.ts';

it.effect('accepts only a completed Service Job and preserves its accepted commercial handoff', () =>
  Effect.gen(function* completedJob() {
    const job = jobFixture('COMPLETED');
    yield* assertCompleted(job);
    yield* assertSourceUnchanged(invoiceFixture(), job);
    expect(invoiceFixture().commercialSnapshot).toMatchObject({
      currency: 'CZK',
      priceBasis: 'INCLUDING_VAT',
      sourceRevision: 5,
      total: '20000.00',
    });
  }),
);

for (const status of ['NEW', 'PLANNED', 'IN_PROGRESS'] as const) {
  it.effect(`rejects a ${status} Service Job`, () =>
    Effect.gen(function* nonCompletedJob() {
      const result = yield* Effect.result(assertCompleted(jobFixture(status)));
      expect(Result.isFailure(result)).toBe(true);
      expect(Result.isFailure(result) ? result.failure : undefined).toMatchObject({ code: 'job_not_completed' });
    }),
  );
}

it.effect('rejects a changed source Job before Issue', () =>
  Effect.gen(function* changedJob() {
    const changed = {
      ...jobFixture(),
      commercialSummary: { currency: 'CZK', priceBasis: 'INCLUDING_VAT', total: '21000.00' },
    } as const;
    const result = yield* Effect.result(assertSourceUnchanged(invoiceFixture(), changed));
    expect(Result.isFailure(result)).toBe(true);
    expect(Result.isFailure(result) ? result.failure : undefined).toMatchObject({ code: 'source_job_changed' });
  }),
);

it.effect('calculates IMMEDIATE and NET_DAYS due dates from the server Issue instant', () =>
  Effect.gen(function* dueDates() {
    const issuedAt = DateTime.makeUnsafe('2026-10-01T10:30:00.000Z');
    expect(
      DateTime.formatIso(
        yield* calculateInvoiceDueAt(issuedAt, {
          calculationRuleVersion: 1,
          calendarRule: 'NOT_APPLICABLE',
          kind: 'IMMEDIATE',
        }),
      ),
    ).toBe('2026-10-01T10:30:00.000Z');
    expect(
      DateTime.formatIso(
        yield* calculateInvoiceDueAt(issuedAt, {
          calculationRuleVersion: 1,
          calendarRule: 'CALENDAR_DAYS_UTC',
          days: 14,
          dueDateAnchor: 'INVOICE_ISSUED_AT',
          kind: 'NET_DAYS',
        }),
      ),
    ).toBe('2026-10-15T10:30:00.000Z');
  }),
);

it('does not let the browser submit amount, currency, price basis, completion, number, or Issue time', () => {
  const result = Schema.decodeUnknownResult(CreateInvoiceDraftPayloadSchema)(
    {
      amount: '1.00',
      completed: true,
      currency: 'EUR',
      invoiceNumber: 'forged',
      issuedAt: '2026-01-01T00:00:00.000Z',
      priceBasis: 'INCLUDING_VAT',
      sourceJobRef: jobFixture().ref,
    },
    { onExcessProperty: 'error' },
  );
  expect(Result.isFailure(result)).toBe(true);
});

it('rejects a country-only billing address and accepts a usable structured address', () => {
  const countryOnly = {
    addressLine1: null,
    addressLine2: null,
    city: null,
    countryCode: 'CZ',
    postalCode: null,
    region: null,
  } as const;
  expect(Result.isFailure(Schema.decodeResult(InvoiceAddressSchema)(countryOnly))).toBe(true);
  expect(
    Result.isSuccess(
      Schema.decodeResult(InvoiceAddressSchema)({
        ...countryOnly,
        addressLine1: 'Jiná 5',
        city: 'Brno',
      }),
    ),
  ).toBe(true);
});

it('excludes future, ended, and rejected Party assertions from the Issue snapshot', () => {
  const at = DateTime.makeUnsafe('2026-09-24T10:00:00.000Z');
  const currentContact = {
    current: true,
    state: 'ACTIVE',
    validFrom: DateTime.makeUnsafe('2026-09-01T00:00:00.000Z'),
    validTo: null,
    verification: { state: 'UNVERIFIED' },
  } as const;
  expect(isUsableCurrentContactAssertion(currentContact, at)).toBe(true);
  expect(
    isUsableCurrentContactAssertion(
      { ...currentContact, validTo: DateTime.makeUnsafe('2026-10-01T00:00:00.000Z') },
      at,
    ),
  ).toBe(true);
  expect(
    isUsableCurrentContactAssertion(
      { ...currentContact, validTo: DateTime.makeUnsafe('2026-09-24T10:00:00.000Z') },
      at,
    ),
  ).toBe(false);
  expect(
    isUsableCurrentContactAssertion(
      { ...currentContact, validFrom: DateTime.makeUnsafe('2026-10-01T00:00:00.000Z') },
      at,
    ),
  ).toBe(false);
  expect(isUsableCurrentContactAssertion({ ...currentContact, verification: { state: 'REJECTED' } }, at)).toBe(false);

  const identifier = {
    state: 'ACTIVE',
    validFrom: '2026-09-01T00:00:00.000Z',
    validTo: null,
    verification: 'VERIFIED',
  } as const;
  expect(isUsableCurrentIdentifierAssertion(identifier, at)).toBe(true);
  expect(isUsableCurrentIdentifierAssertion({ ...identifier, validTo: '2026-10-01T00:00:00.000Z' }, at)).toBe(true);
  expect(isUsableCurrentIdentifierAssertion({ ...identifier, validTo: '2026-09-24T10:00:00.000Z' }, at)).toBe(false);
  expect(isUsableCurrentIdentifierAssertion({ ...identifier, validFrom: '2026-10-01T00:00:00.000Z' }, at)).toBe(false);
  expect(isUsableCurrentIdentifierAssertion({ ...identifier, verification: 'REJECTED' }, at)).toBe(false);
});
