import { tenantLegalEntityRlsPolicies } from '@app/core-runtime';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { WorkerSchema, AbsenceSchema } from '../../shared/resources/worker.ts';

type Worker = typeof WorkerSchema.Encoded;
export const workforceSchema = pgSchema('workforce');
export const workers = workforceSchema.table.withRLS(
  'workers',
  {
    agreementType: text('agreement_type').$type<Worker['agreementType']>().notNull(),
    agreementValidFrom: date('agreement_valid_from').notNull(),
    agreementValidTo: date('agreement_valid_to'),
    createdAt: text('created_at').notNull(),
    displayName: text('display_name').notNull(),
    id: uuid('id').primaryKey(),
    internalHourlyCostCzk: numeric('internal_hourly_cost_czk', { precision: 14, scale: 2 }),
    legalEntityId: uuid('legal_entity_id').notNull(),
    phone: text('phone'),
    position: text('position'),
    revision: integer('revision').notNull(),
    status: text('status').$type<Worker['status']>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique('workers_scope_identity').on(table.tenantId, table.legalEntityId, table.id),
    check('workers_name_valid', sql`length(trim(${table.displayName})) > 0 AND length(${table.displayName}) <= 500`),
    check('workers_status_valid', sql`${table.status} IN ('ACTIVE','INACTIVE')`),
    check(
      'workers_agreement_valid',
      sql`${table.agreementType} IN ('EMPLOYMENT','DPP','DPC','CONTRACTOR') AND (${table.agreementValidTo} IS NULL OR ${table.agreementValidTo} >= ${table.agreementValidFrom})`,
    ),
    check('workers_cost_valid', sql`${table.internalHourlyCostCzk} IS NULL OR ${table.internalHourlyCostCzk} >= 0`),
    check('workers_revision_positive', sql`${table.revision} > 0`),
    ...tenantLegalEntityRlsPolicies('workers_scope', table.tenantId, table.legalEntityId),
  ],
);
export const absences = workforceSchema.table.withRLS(
  'absences',
  {
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    id: uuid('id').primaryKey(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    reason: text('reason').$type<(typeof AbsenceSchema.Encoded)['reason']>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    workerId: uuid('worker_id').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.legalEntityId, table.workerId],
      foreignColumns: [workers.tenantId, workers.legalEntityId, workers.id],
      name: 'absence_worker_scope',
    }),
    check('absence_dates_valid', sql`${table.dateTo} >= ${table.dateFrom}`),
    check('absence_reason_valid', sql`${table.reason} IN ('VACATION','SICK','OTHER')`),
    ...tenantLegalEntityRlsPolicies('absences_scope', table.tenantId, table.legalEntityId),
  ],
);
export const assignments = workforceSchema.table.withRLS(
  'assignments',
  {
    createdAt: text('created_at').notNull(),
    jobId: uuid('job_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    workerId: uuid('worker_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.legalEntityId, table.workerId, table.jobId] }),
    foreignKey({
      columns: [table.tenantId, table.legalEntityId, table.workerId],
      foreignColumns: [workers.tenantId, workers.legalEntityId, workers.id],
      name: 'assignment_worker_scope',
    }),
    ...tenantLegalEntityRlsPolicies('assignments_scope', table.tenantId, table.legalEntityId),
  ],
);
export const gatewayAssertionRedemptions = workforceSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
