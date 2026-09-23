import { tenantLegalEntityRlsPolicies } from '@app/core-runtime';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { ServiceJobSchema } from '../../shared/resources/service-job.ts';

type EncodedJob = typeof ServiceJobSchema.Encoded;
export const serviceJobsSchema = pgSchema('service_jobs');
export const jobs = serviceJobsSchema.table.withRLS(
  'jobs',
  {
    acceptance: jsonb('acceptance').$type<EncodedJob['acceptance']>().notNull(),
    acceptedAt: text('accepted_at').notNull(),
    checklist: jsonb('checklist').$type<EncodedJob['checklist']>().notNull(),
    commercialSummary: jsonb('commercial_summary').$type<EncodedJob['commercialSummary']>().notNull(),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    executionNote: text('execution_note').notNull(),
    expectedDurationMinutes: integer('expected_duration_minutes'),
    id: uuid('id').primaryKey(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    partyId: uuid('party_id').notNull(),
    revision: integer('revision').notNull(),
    scheduledStartAt: text('scheduled_start_at'),
    serviceLocation: jsonb('service_location').$type<EncodedJob['serviceLocation']>().notNull(),
    serviceScope: jsonb('service_scope').$type<EncodedJob['serviceScope']>().notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    startedAt: text('started_at'),
    status: text('status').$type<EncodedJob['status']>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique('jobs_source_once').on(table.tenantId, table.legalEntityId, table.sourceId),
    index('jobs_scope_status_schedule').on(table.tenantId, table.legalEntityId, table.status, table.scheduledStartAt),
    check('jobs_revision_positive', sql`${table.revision} > 0 AND ${table.sourceRevision} > 0`),
    check('jobs_status_valid', sql`${table.status} IN ('NEW','PLANNED','IN_PROGRESS','COMPLETED')`),
    check('jobs_schedule_present', sql`${table.status} = 'NEW' OR ${table.scheduledStartAt} IS NOT NULL`),
    check(
      'jobs_started_present',
      sql`(${table.status} IN ('NEW','PLANNED') AND ${table.startedAt} IS NULL) OR (${table.status} IN ('IN_PROGRESS','COMPLETED') AND ${table.startedAt} IS NOT NULL)`,
    ),
    check('jobs_completed_present', sql`(${table.status} = 'COMPLETED') = (${table.completedAt} IS NOT NULL)`),
    check(
      'jobs_duration_valid',
      sql`${table.expectedDurationMinutes} IS NULL OR ${table.expectedDurationMinutes} BETWEEN 1 AND 10080`,
    ),
    ...tenantLegalEntityRlsPolicies('jobs_scope', table.tenantId, table.legalEntityId),
  ],
);

export const gatewayAssertionRedemptions = serviceJobsSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
