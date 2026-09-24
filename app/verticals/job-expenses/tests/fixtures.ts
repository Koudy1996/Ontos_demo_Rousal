import { ServiceJobSchema } from '@app/service-jobs/resources/service-job';
import { Schema } from 'effect';
import { JobExpenseSchema } from '../shared/resources/job-expense.ts';

export const principal = {
  authBindingId: '10000000-0000-4000-8000-000000000001',
  authContextRef: 'better-auth-session:job-expenses-test',
  authMethod: 'session',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  principalId: '20000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;
const acceptedAt = '2026-09-22T10:00:00.000Z';

export const jobFixture = (
  id = '60000000-0000-4000-8000-000000000001',
  priceBasis: 'EXCLUDING_VAT' | 'INCLUDING_VAT' = 'EXCLUDING_VAT',
  total = '20000.00',
  status: 'COMPLETED' | 'NEW' = 'NEW',
) =>
  Schema.decodeSync(ServiceJobSchema)({
    acceptance: { evidenceNote: 'Customer confirmed', method: 'PHONE' },
    acceptedAt,
    checklist: { accessChecked: false, cleared: false, handedOver: false, wasteRemoved: false },
    commercialSummary: { currency: 'CZK', priceBasis, total },
    completedAt: status === 'COMPLETED' ? '2026-09-23T16:00:00.000Z' : null,
    createdAt: acceptedAt,
    executionNote: '',
    expectedDurationMinutes: null,
    legalEntityId: principal.legalEntityId,
    partyRef: {
      moduleId: 'party.registry',
      resourceId: '50000000-0000-4000-8000-000000000001',
      resourceType: 'party.registry.party',
      tenantId: principal.tenantId,
    },
    ref: {
      moduleId: 'service.jobs',
      resourceId: id,
      resourceType: 'service.jobs.service-job',
      tenantId: principal.tenantId,
    },
    revision: 1,
    scheduledStartAt: null,
    serviceLocation: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
    serviceScope: {
      description: 'Vyklizení 2+1',
      elevator: false,
      estimatedVolumeM3: '15',
      floor: 2,
      objectType: 'APARTMENT',
      specialWaste: null,
    },
    sourceRef: {
      moduleId: 'sales.inquiries',
      resourceId: id,
      resourceType: 'sales.inquiries.sales-inquiry',
      tenantId: principal.tenantId,
    },
    sourceRevision: 5,
    startedAt: null,
    status,
    updatedAt: acceptedAt,
  });

export const expenseFixture = (
  id = '70000000-0000-4000-8000-000000000001',
  status: 'RECORDED' | 'VOIDED' = 'RECORDED',
) =>
  Schema.decodeSync(JobExpenseSchema)({
    amountCzk: '4500.00',
    category: 'WORK',
    costBasis: 'EXCLUDING_VAT',
    createdAt: '2026-09-24T08:00:00.000Z',
    currency: 'CZK',
    description: 'Práce dvou pracovníků',
    incurredOn: '2026-09-24',
    legalEntityId: principal.legalEntityId,
    ref: {
      moduleId: 'job.expenses',
      resourceId: id,
      resourceType: 'job.expenses.job-expense',
      tenantId: principal.tenantId,
    },
    revision: status === 'VOIDED' ? 2 : 1,
    serviceJobRef: jobFixture().ref,
    status,
    updatedAt: '2026-09-24T08:00:00.000Z',
    voidedAt: status === 'VOIDED' ? '2026-09-24T09:00:00.000Z' : null,
    voidReason: status === 'VOIDED' ? 'Chybný záznam' : null,
  });
