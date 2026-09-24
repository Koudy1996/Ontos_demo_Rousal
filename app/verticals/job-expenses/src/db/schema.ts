import { tenantLegalEntityRlsPolicies } from '@app/core-runtime';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { JobExpenseSchema } from '../../shared/resources/job-expense.ts';

type Expense = typeof JobExpenseSchema.Encoded;
export const jobExpensesSchema = pgSchema('job_expenses');

export const jobExpenses = jobExpensesSchema.table.withRLS(
  'job_expenses',
  {
    amountCzk: numeric('amount_czk', { precision: 14, scale: 2 }).notNull(),
    category: text('category').$type<Expense['category']>().notNull(),
    costBasis: text('cost_basis').$type<Expense['costBasis']>().notNull(),
    createdAt: text('created_at').notNull(),
    currency: text('currency').$type<Expense['currency']>().notNull(),
    description: text('description').notNull(),
    id: uuid('id').primaryKey(),
    incurredOn: date('incurred_on').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    revision: integer('revision').notNull(),
    serviceJobId: uuid('service_job_id').notNull(),
    status: text('status').$type<Expense['status']>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    updatedAt: text('updated_at').notNull(),
    voidedAt: text('voided_at'),
    voidReason: text('void_reason'),
  },
  (table) => [
    unique('job_expenses_scope_identity').on(table.tenantId, table.legalEntityId, table.id),
    check('job_expenses_amount_positive', sql`${table.amountCzk} > 0`),
    check('job_expenses_category_valid', sql`${table.category} IN ('WORK','TRANSPORT','DISPOSAL','MATERIAL','OTHER')`),
    check(
      'job_expenses_description_valid',
      sql`length(trim(${table.description})) > 0 AND length(${table.description}) <= 500`,
    ),
    check('job_expenses_currency_valid', sql`${table.currency} = 'CZK'`),
    check('job_expenses_cost_basis_valid', sql`${table.costBasis} = 'EXCLUDING_VAT'`),
    check('job_expenses_status_valid', sql`${table.status} IN ('RECORDED','VOIDED')`),
    check('job_expenses_revision_positive', sql`${table.revision} > 0`),
    check(
      'job_expenses_void_state_valid',
      sql`(${table.status} = 'RECORDED' AND ${table.voidedAt} IS NULL AND ${table.voidReason} IS NULL) OR (${table.status} = 'VOIDED' AND ${table.voidedAt} IS NOT NULL AND length(trim(${table.voidReason})) > 0 AND length(${table.voidReason}) <= 500)`,
    ),
    ...tenantLegalEntityRlsPolicies('job_expenses_scope', table.tenantId, table.legalEntityId),
  ],
);

export const gatewayAssertionRedemptions = jobExpensesSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
