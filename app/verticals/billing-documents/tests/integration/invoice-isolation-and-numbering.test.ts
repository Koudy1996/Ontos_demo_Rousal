import { loadDatabaseConnectionPair, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { DateTime, Effect, Layer, Redacted, Result, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import type { Invoice } from '../../shared/resources/invoice.ts';
import { InvoiceRefSchema } from '../../shared/resources/invoice.ts';
import { invoiceNumberCounters, invoices } from '../../src/db/schema.ts';
import { invoicePersistenceService } from '../../src/services/invoice-persistence.service.ts';
import { invoiceFixture, paymentTermFixture, principal } from '../fixtures.ts';

const layer = Layer.unwrap(
  loadDatabaseConnectionPair().pipe(
    Effect.map((configuration) =>
      PgClient.layer({ maxConnections: 5, url: Redacted.make(configuration.admin.connectionString) }),
    ),
  ),
);
const scope = Effect.map(
  Schema.decodeEffect(TrustedPrincipalContextSchema)({
    authBindingId: '10000000-0000-4000-8000-000000000001',
    authContextRef: 'better-auth-session:billing-documents-test',
    authMethod: 'session',
    legalEntityId: principal.legalEntityId,
    principalId: '20000000-0000-4000-8000-000000000001',
    tenantId: principal.tenantId,
  }),
  (value) => ({ ...value, correlationId: 'billing-documents-db-test' }),
);

const makeDraft = (invoiceId: string, sourceJobId: string): Invoice => ({
  ...invoiceFixture(),
  ref: Schema.decodeSync(InvoiceRefSchema)({ ...invoiceFixture().ref, resourceId: invoiceId }),
  sourceJobRef: Schema.decodeSync(ServiceJobRefSchema)({ ...invoiceFixture().sourceJobRef, resourceId: sourceJobId }),
});
const readyToIssue = (draft: Invoice): Invoice => {
  const term = paymentTermFixture();
  const selection = draft.recipientAddressSelection;
  if (selection === null || selection.kind !== 'PARTY_CONTACT_POINT') {
    throw new Error('fixture address missing');
  }
  const issuedAt = DateTime.makeUnsafe('2098-09-24T09:00:00.000Z');
  return {
    ...draft,
    dueAt: DateTime.makeUnsafe('2098-10-08T09:00:00.000Z'),
    issuedAt,
    issuerSnapshot: { legalEntityId: draft.legalEntityId, legalName: 'Vyklízení SOS' },
    paymentTermSnapshot: {
      code: term.code,
      name: term.name,
      paymentTermRef: term.paymentTermRef,
      semanticRevisionId: term.semanticRevisionId,
      semantics: term.semantics,
    },
    recipientSnapshot: {
      address: {
        addressLine1: 'Masarykova 10',
        addressLine2: null,
        city: 'Ostrava',
        countryCode: 'CZ',
        postalCode: '70200',
        region: null,
      },
      addressEvidence: { contactPointRef: selection.contactPointRef, contactPointRevision: 3, purposeRevision: 2 },
      displayName: 'Novák s.r.o.',
      officialIdentifiers: [
        {
          identifierType: 'ICO',
          normalizedValue: '12345678',
          officialIdentifierRef: {
            moduleId: 'party.registry',
            resourceId: 'official-ico',
            resourceType: 'party.registry.party-official-identifier',
            tenantId: draft.ref.tenantId,
          },
        },
      ],
      partyRef: draft.customerPartyRef,
      partyRevision: 7,
    },
    revision: 2,
    status: 'ISSUED',
    updatedAt: issuedAt,
  };
};

const first = makeDraft('86000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
const second = makeDraft('86000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002');
const duplicate = makeDraft('86000000-0000-4000-8000-000000000003', first.sourceJobRef.resourceId);
const fixtureIds = [first.ref.resourceId, second.ref.resourceId, duplicate.ref.resourceId];

it.layer(layer, { excludeTestServices: true })('Billing Documents persistence', (suite) => {
  suite.effect('enforces one Invoice per completed Job even across different action ids', () =>
    Effect.gen(function* uniqueSourceJob() {
      const database = yield* makeWithDefaults({});
      const currentScope = yield* scope;
      yield* Effect.acquireUseRelease(
        Effect.void,
        () =>
          database.transaction(
            Effect.fn(function* duplicateInsert(transaction) {
              const store = yield* invoicePersistenceService(transaction, currentScope);
              yield* store.insert(first);
              const result = yield* Effect.result(store.insert(duplicate));
              expect(Result.isFailure(result)).toBe(true);
              expect(Result.isFailure(result) ? result.failure : undefined).toMatchObject({
                code: 'invoice_already_exists',
              });
            }),
          ),
        () => database.delete(invoices).where(inArray(invoices.id, fixtureIds)).pipe(Effect.orDie),
      );
    }),
  );

  suite.effect('assigns distinct sequential numbers to concurrent Issues', () =>
    Effect.gen(function* concurrentIssue() {
      const database = yield* makeWithDefaults({});
      const currentScope = yield* scope;
      const issue = (draft: Invoice) =>
        database.transaction(
          Effect.fn(function* issueInTransaction(transaction) {
            const store = yield* invoicePersistenceService(transaction, currentScope);
            return yield* store.issue(readyToIssue(draft), 1, 2098);
          }),
        );
      yield* Effect.acquireUseRelease(
        database.transaction(
          Effect.fn(function* seed(transaction) {
            const store = yield* invoicePersistenceService(transaction, currentScope);
            yield* store.insert(first);
            yield* store.insert(second);
          }),
        ),
        () =>
          Effect.gen(function* verifyNumbers() {
            const results = yield* Effect.all([issue(first), issue(second)], { concurrency: 2 });
            const numbers = new Set<string | null>();
            let allIssued = true;
            for (const invoice of results) {
              numbers.add(invoice.invoiceNumber);
              allIssued &&= invoice.status === 'ISSUED';
            }
            expect(numbers.size).toBe(2);
            expect(allIssued).toBe(true);
          }),
        () =>
          Effect.all(
            [
              database.delete(invoices).where(inArray(invoices.id, fixtureIds)),
              database
                .delete(invoiceNumberCounters)
                .where(
                  and(
                    eq(invoiceNumberCounters.tenantId, principal.tenantId),
                    eq(invoiceNumberCounters.legalEntityId, principal.legalEntityId),
                    eq(invoiceNumberCounters.invoiceYear, 2098),
                  ),
                ),
            ],
            { discard: true },
          ).pipe(Effect.orDie),
      );
    }),
  );

  suite.effect('forces Tenant and Legal Entity isolation and denies runtime DELETE', () =>
    Effect.gen(function* forcedIsolation() {
      const database = yield* makeWithDefaults({});
      const currentScope = yield* scope;
      yield* Effect.acquireUseRelease(
        database.transaction(
          Effect.fn(function* seed(transaction) {
            const store = yield* invoicePersistenceService(transaction, currentScope);
            yield* store.insert(first);
          }),
        ),
        () =>
          database.transaction(
            Effect.fn(function* inspect(transaction) {
              yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
              yield* transaction.execute(
                sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id','40000000-0000-4000-8000-000000000002',true)`,
              );
              expect(yield* transaction.select().from(invoices).where(eq(invoices.id, first.ref.resourceId))).toEqual(
                [],
              );
              yield* transaction.execute(
                sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id',${principal.legalEntityId},true)`,
              );
              expect(
                yield* transaction.select().from(invoices).where(eq(invoices.id, first.ref.resourceId)),
              ).toHaveLength(1);
              const grants = yield* transaction.execute<{ allowed: boolean }>(
                sql`select has_table_privilege(current_user, 'billing_documents.invoices', 'DELETE') as allowed`,
                'objects',
              );
              expect(grants[0]?.allowed).toBe(false);
            }),
          ),
        () => database.delete(invoices).where(inArray(invoices.id, fixtureIds)).pipe(Effect.orDie),
      );
    }),
  );
});
