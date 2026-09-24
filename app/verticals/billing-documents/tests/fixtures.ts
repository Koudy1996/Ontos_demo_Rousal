import { PaymentTermDefinitionSchema } from '@app/payment-term-catalog-contracts/payment-term';
import { ServiceJobSchema } from '@app/service-jobs/resources/service-job';
import { DateTime, Schema } from 'effect';
import { InvoiceSchema } from '../shared/resources/invoice.ts';

const partyModuleId = 'party.registry';
const jobDescription = 'Vyklizení bytu 2+1';

export const principal = {
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;

export const jobFixture = (
  status: 'COMPLETED' | 'IN_PROGRESS' | 'NEW' | 'PLANNED' = 'COMPLETED',
  priceBasis: 'EXCLUDING_VAT' | 'INCLUDING_VAT' = 'INCLUDING_VAT',
) =>
  Schema.decodeSync(ServiceJobSchema)({
    acceptance: { evidenceNote: 'Zákazník potvrdil nabídku', method: 'PHONE' },
    acceptedAt: '2026-09-22T10:00:00.000Z',
    checklist: { accessChecked: true, cleared: true, handedOver: true, wasteRemoved: true },
    commercialSummary: { currency: 'CZK', priceBasis, total: '20000.00' },
    completedAt: status === 'COMPLETED' ? '2026-09-23T16:00:00.000Z' : null,
    createdAt: '2026-09-22T10:00:00.000Z',
    executionNote: '',
    expectedDurationMinutes: 240,
    legalEntityId: principal.legalEntityId,
    partyRef: {
      moduleId: partyModuleId,
      resourceId: '50000000-0000-4000-8000-000000000001',
      resourceType: 'party.registry.party',
      tenantId: principal.tenantId,
    },
    ref: {
      moduleId: 'service.jobs',
      resourceId: '60000000-0000-4000-8000-000000000001',
      resourceType: 'service.jobs.service-job',
      tenantId: principal.tenantId,
    },
    revision: 5,
    scheduledStartAt: '2026-09-23T08:00:00.000Z',
    serviceLocation: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
    serviceScope: {
      description: jobDescription,
      elevator: false,
      estimatedVolumeM3: '15',
      floor: 2,
      objectType: 'APARTMENT',
      specialWaste: null,
    },
    sourceRef: {
      moduleId: 'sales.inquiries',
      resourceId: '61000000-0000-4000-8000-000000000001',
      resourceType: 'sales.inquiries.sales-inquiry',
      tenantId: principal.tenantId,
    },
    sourceRevision: 5,
    startedAt: status === 'IN_PROGRESS' || status === 'COMPLETED' ? '2026-09-23T08:00:00.000Z' : null,
    status,
    updatedAt: '2026-09-23T16:00:00.000Z',
  });

export const paymentTermFixture = () => {
  const provenance = {
    actionInvocationId: 'payment-term-test-action',
    actorPrincipalId: 'payment-term-test-actor',
    at: '2026-09-01T08:00:00.000Z',
    reason: 'Demo platební podmínka',
  };
  return Schema.decodeSync(PaymentTermDefinitionSchema)({
    code: 'NET_14',
    compatibilityId: 'customer-payment-terms.v1',
    compatibleWith: ['customer-payment-terms.v1'],
    created: provenance,
    definitionRevisionId: '80000000-0000-4000-8000-000000000001',
    description: 'Splatnost 14 kalendářních dní',
    lifecycle: { effectiveFrom: '2026-09-01T08:00:00.000Z', effectiveTo: null, state: 'ACTIVE' },
    metadataRevision: 1,
    name: '14 dní',
    paymentTermRef: {
      moduleId: 'payment.term-catalog',
      resourceId: '81000000-0000-4000-8000-000000000001',
      resourceType: 'payment.term-catalog.payment-term',
      tenantId: principal.tenantId,
    },
    retired: null,
    semanticFingerprint: '0'.repeat(64),
    semanticRevisionId: '82000000-0000-4000-8000-000000000001',
    semantics: {
      calculationRuleVersion: 1,
      calendarRule: 'CALENDAR_DAYS_UTC',
      days: 14,
      dueDateAnchor: 'INVOICE_ISSUED_AT',
      kind: 'NET_DAYS',
    },
    updated: provenance,
  });
};

export const invoiceFixture = (status: 'DRAFT' | 'ISSUED' = 'DRAFT') => {
  const job = jobFixture();
  const term = paymentTermFixture();
  const address = {
    addressLine1: 'Masarykova 10',
    addressLine2: null,
    city: 'Ostrava',
    countryCode: 'CZ',
    postalCode: '70200',
    region: null,
  } as const;
  const contactPointRef = {
    moduleId: partyModuleId,
    resourceId: '83000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party-contact-point',
    tenantId: principal.tenantId,
  } as const;
  return Schema.decodeSync(InvoiceSchema)({
    commercialSnapshot: {
      currency: 'CZK',
      priceBasis: 'INCLUDING_VAT',
      sourceAcceptedAt: DateTime.formatIso(job.acceptedAt),
      sourceRevision: job.revision,
      total: job.commercialSummary.total,
    },
    createdAt: '2026-09-24T08:00:00.000Z',
    customerPartyRef: job.partyRef,
    description: jobDescription,
    dueAt: status === 'ISSUED' ? '2026-10-08T09:00:00.000Z' : null,
    invoiceNumber: status === 'ISSUED' ? '2026-000001' : null,
    issuedAt: status === 'ISSUED' ? '2026-09-24T09:00:00.000Z' : null,
    issuerSnapshot: status === 'ISSUED' ? { legalEntityId: principal.legalEntityId, legalName: 'Vyklízení SOS' } : null,
    legalEntityId: principal.legalEntityId,
    paymentTermRef: term.paymentTermRef,
    paymentTermSnapshot:
      status === 'ISSUED'
        ? {
            code: term.code,
            name: term.name,
            paymentTermRef: term.paymentTermRef,
            semanticRevisionId: term.semanticRevisionId,
            semantics: term.semantics,
          }
        : null,
    recipientAddressSelection: { contactPointRef, kind: 'PARTY_CONTACT_POINT' },
    recipientSnapshot:
      status === 'ISSUED'
        ? {
            address,
            addressEvidence: { contactPointRef, contactPointRevision: 3, purposeRevision: 2 },
            displayName: 'Novák s.r.o.',
            officialIdentifiers: [
              {
                identifierType: 'ICO',
                normalizedValue: '12345678',
                officialIdentifierRef: {
                  moduleId: partyModuleId,
                  resourceId: 'official-ico',
                  resourceType: 'party.registry.party-official-identifier',
                  tenantId: principal.tenantId,
                },
              },
              {
                identifierType: 'CZ_DIC',
                normalizedValue: 'CZ12345678',
                officialIdentifierRef: {
                  moduleId: partyModuleId,
                  resourceId: 'official-dic',
                  resourceType: 'party.registry.party-official-identifier',
                  tenantId: principal.tenantId,
                },
              },
            ],
            partyRef: job.partyRef,
            partyRevision: 7,
          }
        : null,
    ref: {
      moduleId: 'billing.documents',
      resourceId: status === 'ISSUED' ? '84000000-0000-4000-8000-000000000002' : '84000000-0000-4000-8000-000000000001',
      resourceType: 'billing.documents.invoice',
      tenantId: principal.tenantId,
    },
    revision: status === 'ISSUED' ? 2 : 1,
    sourceJobRef: job.ref,
    status,
    updatedAt: status === 'ISSUED' ? '2026-09-24T09:00:00.000Z' : '2026-09-24T08:00:00.000Z',
  });
};

export const draftSupportFixture = () => {
  const invoice = invoiceFixture();
  const selection = invoice.recipientAddressSelection;
  if (selection === null || selection.kind !== 'PARTY_CONTACT_POINT') {
    throw new Error('fixture address missing');
  }
  return {
    billingAddresses: [
      {
        address: {
          addressLine1: 'Masarykova 10',
          addressLine2: null,
          city: 'Ostrava',
          countryCode: 'CZ',
          postalCode: '70200',
          region: null,
        },
        contactPointRef: selection.contactPointRef,
        contactPointRevision: 3,
        preferred: true,
        purposeRevision: 2,
      },
    ],
    invoice,
    issuerLegalName: 'SOS vyklízení',
    paymentTerms: [paymentTermFixture()],
    recipientDisplayName: 'Novák s.r.o.',
    sourceJobDisplayName: jobDescription,
  } as const;
};
