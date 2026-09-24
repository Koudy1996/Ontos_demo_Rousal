import { ReadRuntime } from '@app/core-runtime';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { DateTime, Effect, Option, Result } from 'effect';
import { expect, it } from 'effect-rstest';
import { createActionCollector } from '../../../../packages/core-runtime/src/actions/collector.ts';
import { getActionHandler } from '../../../../packages/core-runtime/src/actions/definition.ts';
import { issueInvoiceAction } from '../../src/actions/issue-invoice.action.ts';
import { updateInvoiceDraftAction } from '../../src/actions/update-invoice-draft.action.ts';
import type { InvoiceServices } from '../../src/services/invoice-services.service.ts';
import { BillingOwnerGatewayCredentialService } from '../../shared/domain/owner-gateway-credential.ts';
import { InvoiceRejected } from '../../shared/resources/invoice-rejected.ts';
import type { Invoice } from '../../shared/resources/invoice.ts';
import { invoiceFixture, jobFixture, paymentTermFixture, principal } from '../fixtures.ts';

const required = <Value>(value: Value | null | undefined): Value => {
  if (value === null || value === undefined) {
    throw new Error('Expected fixture value');
  }
  return value;
};

const scope = {
  authMethod: 'system' as const,
  correlationId: 'billing-action-test',
  legalEntityId: principal.legalEntityId,
  principalId: '40000000-0000-4000-8000-000000000002',
  tenantId: principal.tenantId,
};

const makeServices = (
  options: {
    readonly draft?: Invoice;
    readonly paymentTermFailure?: InvoiceRejected;
    readonly withSelectedAddress?: boolean;
  } = {},
) => {
  let stored = options.draft ?? invoiceFixture();
  let currentDisplayName = 'Novák s.r.o.';
  let currentPaymentTerm = paymentTermFixture();
  const selected = required(stored.recipientAddressSelection);
  if (selected.kind !== 'PARTY_CONTACT_POINT') {
    throw new Error('Expected Party-backed fixture address');
  }
  const address = {
    addressLine1: 'Masarykova 10',
    addressLine2: null,
    city: 'Ostrava',
    countryCode: 'CZ' as const,
    postalCode: '70200',
    region: null,
  };
  const billingAddress = {
    address,
    contactPointRef: selected.contactPointRef,
    contactPointRevision: 3,
    preferred: true,
    purposeRevision: 2,
  };
  const services = {
    get: () => Effect.succeed(stored),
    getBySourceJob: () => Effect.succeed(Option.none<Invoice>()),
    insert: (invoice: Invoice) => {
      stored = invoice;
      return Effect.succeed(invoice);
    },
    issue: (invoice: Invoice) => {
      stored = { ...invoice, invoiceNumber: '2026-000001' };
      return Effect.succeed(stored);
    },
    jobs: {
      get: () => Effect.succeed(jobFixture()),
      listCompleted: () => Effect.succeed({ items: [jobFixture()], nextCursor: null }),
    },
    legalEntity: { get: Effect.succeed({ legalName: 'SOS vyklízení' }) },
    legalEntityId: stored.legalEntityId,
    list: () => Effect.succeed({ items: [stored], nextCursor: null }),
    party: {
      billingContext: () =>
        Effect.succeed({
          billingAddresses: options.withSelectedAddress === false ? [] : [billingAddress],
          displayName: currentDisplayName,
          partyRef: stored.customerPartyRef,
          partyRevision: 7,
          snapshot: ({ address: snapshotAddress, evidence }) => ({
            address: snapshotAddress,
            addressEvidence: evidence,
            displayName: currentDisplayName,
            officialIdentifiers: [],
            partyRef: stored.customerPartyRef,
            partyRevision: 7,
          }),
        }),
    },
    paymentTerms: {
      current: Effect.succeed([currentPaymentTerm]),
      resolve: () =>
        options.paymentTermFailure === undefined
          ? Effect.succeed(currentPaymentTerm)
          : Effect.fail(options.paymentTermFailure),
    },
    saveDraft: (invoice: Invoice) => {
      stored = invoice;
      return Effect.succeed(invoice);
    },
  } satisfies InvoiceServices;
  return {
    changeCurrentSources: () => {
      currentDisplayName = 'Později přejmenovaná firma';
      currentPaymentTerm = { ...currentPaymentTerm, code: 'NET_30', name: '30 dní' };
    },
    getStored: () => stored,
    services,
  };
};

const issueContext = (services: InvoiceServices) => {
  const collector = createActionCollector(
    issueInvoiceAction.descriptor.domainEvents,
    'billing.documents',
    issueInvoiceAction.descriptor.accessEvidencePolicy,
    issueInvoiceAction.descriptor.auditEvidenceSchema,
  );
  return {
    actionInvocationId: '85000000-0000-4000-8000-000000000010',
    addDomainEvent: collector.addDomainEvent,
    addOutboxMessage: collector.addOutboxMessage,
    recordAuditEvidence: collector.recordAuditEvidence,
    recordDataAccess: collector.recordDataAccess,
    scope,
    services,
  };
};

const updateContext = (services: InvoiceServices) => {
  const collector = createActionCollector(
    updateInvoiceDraftAction.descriptor.domainEvents,
    'billing.documents',
    updateInvoiceDraftAction.descriptor.accessEvidencePolicy,
    updateInvoiceDraftAction.descriptor.auditEvidenceSchema,
  );
  return {
    actionInvocationId: '85000000-0000-4000-8000-000000000011',
    addDomainEvent: collector.addDomainEvent,
    addOutboxMessage: collector.addOutboxMessage,
    recordAuditEvidence: collector.recordAuditEvidence,
    recordDataAccess: collector.recordDataAccess,
    scope,
    services,
  };
};

const issuePayload = (invoice: Invoice) => ({ expectedRevision: invoice.revision, invoiceRef: invoice.ref });

const provideHandlerRequirements = <Success, Failure>(
  effect: Effect.Effect<
    Success,
    Failure,
    BillingOwnerGatewayCredentialService | GatewayPrincipalVerifierConfiguration | ReadRuntime
  >,
) =>
  effect.pipe(
    Effect.provideService(BillingOwnerGatewayCredentialService, {
      issue: () => Effect.die('Owner gateway is not used by a handler with injected services'),
    }),
    Effect.provideService(GatewayPrincipalVerifierConfiguration, {
      configuration: Effect.die('Gateway verifier is not used by a handler with injected services'),
    }),
    Effect.provideService(ReadRuntime, { runRead: () => Effect.die('Read runtime is not used by injected services') }),
  );

it.effect('rejects Issue when the selected Party address ended before issuing', () =>
  Effect.gen(function* endedAddress() {
    const draft = invoiceFixture();
    const { services } = makeServices({ draft, withSelectedAddress: false });
    const result = yield* Effect.result(
      provideHandlerRequirements(getActionHandler(issueInvoiceAction)(issuePayload(draft), issueContext(services))),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ code: 'address_not_current' });
    }
  }),
);

it.effect('rejects Issue when the selected Payment Term is no longer usable', () =>
  Effect.gen(function* retiredTerm() {
    const draft = invoiceFixture();
    const { services } = makeServices({
      draft,
      paymentTermFailure: new InvoiceRejected({
        code: 'payment_term_unusable',
        reason: 'Platební podmínka byla ukončena',
      }),
    });
    const result = yield* Effect.result(
      provideHandlerRequirements(getActionHandler(issueInvoiceAction)(issuePayload(draft), issueContext(services))),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ code: 'payment_term_unusable' });
    }
  }),
);

it.effect('rejects EXCLUDING_VAT Issue without inventing a Tax result', () =>
  Effect.gen(function* missingTaxDecision() {
    const draft = invoiceFixture();
    const exclusiveDraft: Invoice = {
      ...draft,
      commercialSnapshot: { ...draft.commercialSnapshot, priceBasis: 'EXCLUDING_VAT' },
    };
    const { services } = makeServices({ draft: exclusiveDraft });
    const result = yield* Effect.result(
      provideHandlerRequirements(
        getActionHandler(issueInvoiceAction)(issuePayload(exclusiveDraft), issueContext(services)),
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ code: 'tax_data_required' });
    }
  }),
);

it.effect('stores recipient and Payment Term snapshots that survive later Current-source changes', () =>
  Effect.gen(function* historicalSnapshot() {
    const draft = invoiceFixture();
    const harness = makeServices({ draft });
    const issuedResult = yield* provideHandlerRequirements(
      getActionHandler(issueInvoiceAction)(issuePayload(draft), issueContext(harness.services)),
    );
    if (!('status' in issuedResult)) {
      return yield* Effect.die('Issue unexpectedly returned a committed domain rejection');
    }
    const issued = issuedResult;
    expect(issued.status).toBe('ISSUED');
    expect(issued.recipientSnapshot?.displayName).toBe('Novák s.r.o.');
    expect(issued.paymentTermSnapshot).toMatchObject({ code: 'NET_14', name: '14 dní' });
    expect(issued.dueAt).not.toBeNull();

    harness.changeCurrentSources();
    const stored = harness.getStored();
    expect(stored.recipientSnapshot?.displayName).toBe('Novák s.r.o.');
    expect(stored.paymentTermSnapshot).toMatchObject({ code: 'NET_14', name: '14 dní' });
    expect(DateTime.formatIso(required(stored.dueAt))).toBe(DateTime.formatIso(required(issued.dueAt)));
  }),
);

it.effect('keeps an issued Invoice immutable through the update Action', () =>
  Effect.gen(function* immutableAfterIssue() {
    const issued = invoiceFixture('ISSUED');
    const { services } = makeServices({ draft: issued });
    const result = yield* Effect.result(
      provideHandlerRequirements(
        getActionHandler(updateInvoiceDraftAction)(
          {
            description: 'Pokus o změnu',
            expectedRevision: issued.revision,
            invoiceRef: issued.ref,
            paymentTermRef: issued.paymentTermRef,
            recipientAddressSelection: issued.recipientAddressSelection,
          },
          updateContext(services),
        ),
      ),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ code: 'invoice_not_draft' });
    }
  }),
);
