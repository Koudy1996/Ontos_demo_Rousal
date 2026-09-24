import { tenantLegalEntityRlsPolicies } from '@app/core-runtime';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  IssuerSnapshotEncoded,
  PaymentTermSnapshotEncoded,
  RecipientAddressSelectionEncoded,
  RecipientSnapshotEncoded,
} from '../../shared/resources/invoice.ts';

export const billingDocumentsSchema = pgSchema('billing_documents');

export const invoices = billingDocumentsSchema.table.withRLS(
  'invoices',
  {
    commercialCurrency: text('commercial_currency').notNull(),
    commercialPriceBasis: text('commercial_price_basis').notNull(),
    commercialTotal: numeric('commercial_total', { precision: 14, scale: 2 }).notNull(),
    createdAt: text('created_at').notNull(),
    customerPartyId: uuid('customer_party_id').notNull(),
    description: text('description').notNull(),
    dueAt: text('due_at'),
    id: uuid('id').primaryKey(),
    invoiceNumber: text('invoice_number'),
    issuedAt: text('issued_at'),
    issuerSnapshot: jsonb('issuer_snapshot').$type<IssuerSnapshotEncoded>(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    paymentTermId: uuid('payment_term_id'),
    paymentTermSnapshot: jsonb('payment_term_snapshot').$type<PaymentTermSnapshotEncoded>(),
    recipientAddressSelection: jsonb('recipient_address_selection').$type<RecipientAddressSelectionEncoded>(),
    recipientSnapshot: jsonb('recipient_snapshot').$type<RecipientSnapshotEncoded>(),
    revision: integer('revision').notNull(),
    sourceAcceptedAt: text('source_accepted_at').notNull(),
    sourceJobId: uuid('source_job_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    status: text('status').$type<'DRAFT' | 'ISSUED'>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique('billing_documents_invoice_source_uk').on(table.tenantId, table.legalEntityId, table.sourceJobId),
    unique('billing_documents_invoice_number_uk').on(table.tenantId, table.legalEntityId, table.invoiceNumber),
    check('billing_documents_invoice_status_ck', sql`${table.status} in ('DRAFT', 'ISSUED')`),
    check('billing_documents_invoice_amount_ck', sql`${table.commercialTotal} >= 0`),
    check('billing_documents_invoice_currency_ck', sql`${table.commercialCurrency} ~ '^[A-Z]{3}$'`),
    check(
      'billing_documents_invoice_price_basis_ck',
      sql`${table.commercialPriceBasis} in ('INCLUDING_VAT', 'EXCLUDING_VAT')`,
    ),
    check('billing_documents_invoice_description_ck', sql`length(btrim(${table.description})) between 1 and 500`),
    check('billing_documents_invoice_revision_ck', sql`${table.revision} > 0`),
    check(
      'billing_documents_invoice_lifecycle_ck',
      sql`(${table.status} = 'DRAFT' and ${table.invoiceNumber} is null and ${table.issuedAt} is null and ${table.dueAt} is null and ${table.recipientSnapshot} is null and ${table.paymentTermSnapshot} is null and ${table.issuerSnapshot} is null) or (${table.status} = 'ISSUED' and ${table.invoiceNumber} is not null and ${table.issuedAt} is not null and ${table.dueAt} is not null and ${table.recipientSnapshot} is not null and ${table.paymentTermSnapshot} is not null and ${table.issuerSnapshot} is not null)`,
    ),
    ...tenantLegalEntityRlsPolicies('billing_documents_invoice_scope', table.tenantId, table.legalEntityId),
  ],
);

export const invoiceNumberCounters = billingDocumentsSchema.table.withRLS(
  'invoice_number_counters',
  {
    invoiceYear: integer('invoice_year').notNull(),
    lastNumber: integer('last_number').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.legalEntityId, table.invoiceYear] }),
    check('billing_documents_counter_year_ck', sql`${table.invoiceYear} between 1 and 9999`),
    check('billing_documents_counter_value_ck', sql`${table.lastNumber} between 1 and 999999`),
    ...tenantLegalEntityRlsPolicies('billing_documents_counter_scope', table.tenantId, table.legalEntityId),
  ],
);

export const gatewayAssertionRedemptions = billingDocumentsSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
