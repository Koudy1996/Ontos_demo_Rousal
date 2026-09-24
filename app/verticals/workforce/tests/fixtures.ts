import { ServiceJobSchema } from '@app/service-jobs/resources/service-job';
import { Schema } from 'effect';
import { WorkerSchema } from '../shared/resources/worker.ts';

const fixtureTime = '2026-09-23T08:00:00.000Z';

export const principal = {
  authBindingId: '10000000-0000-4000-8000-000000000001',
  authContextRef: 'better-auth-session:workforce-test',
  authMethod: 'session',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  principalId: '20000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;
export const profile = {
  agreementType: 'DPP',
  agreementValidFrom: '2026-01-01',
  agreementValidTo: null,
  displayName: 'Petr Novák',
  internalHourlyCostCzk: '180.00',
  phone: '+420777123456',
  position: 'Řidič',
} as const;
export const workerFixture = (id = '50000000-0000-4000-8000-000000000001') =>
  Schema.decodeSync(WorkerSchema)({
    ...profile,
    createdAt: fixtureTime,
    legalEntityId: principal.legalEntityId,
    ref: {
      moduleId: 'workforce.planning',
      resourceId: id,
      resourceType: 'workforce.planning.worker',
      tenantId: principal.tenantId,
    },
    revision: 1,
    status: 'ACTIVE',
    updatedAt: fixtureTime,
  });
export const jobFixture = (id: string, start = '2026-10-10T06:00:00.000Z', minutes: number | null = 240) =>
  Schema.decodeSync(ServiceJobSchema)({
    acceptance: { evidenceNote: 'Customer confirmed', method: 'PHONE' },
    acceptedAt: '2026-09-22T10:00:00.000Z',
    checklist: { accessChecked: false, cleared: false, handedOver: false, wasteRemoved: false },
    commercialSummary: { currency: 'CZK', priceBasis: 'EXCLUDING_VAT', total: '17300.00' },
    completedAt: null,
    createdAt: fixtureTime,
    executionNote: '',
    expectedDurationMinutes: minutes,
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
    scheduledStartAt: start,
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
    status: 'PLANNED',
    updatedAt: fixtureTime,
  });
