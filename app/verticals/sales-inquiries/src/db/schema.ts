import { tenantLegalEntityRlsPolicies } from '@app/core-runtime';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InquiryDetails, SalesInquirySchema } from '../../shared/resources/sales-inquiry.ts';

export const salesInquiriesSchema = pgSchema('sales_inquiries');
export const inquiries = salesInquiriesSchema.table.withRLS(
  'inquiries',
  {
    acceptance: jsonb('acceptance').$type<(typeof SalesInquirySchema.Encoded)['acceptance']>(),
    acceptedAt: text('accepted_at'),
    createdAt: text('created_at').notNull(),
    declinedAt: text('declined_at'),
    declineReason: text('decline_reason'),
    description: text('description').notNull(),
    elevator: boolean('elevator'),
    estimatedVolumeM3: text('estimated_volume_m3'),
    floor: integer('floor'),
    id: uuid('id').primaryKey(),
    internalNote: text('internal_note').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    location: jsonb('service_location').$type<InquiryDetails['location']>().notNull(),
    objectType: text('object_type').$type<InquiryDetails['objectType']>().notNull(),
    offer: jsonb('service_offer').$type<(typeof SalesInquirySchema.Encoded)['offer']>(),
    partyId: uuid('party_id').notNull(),
    requestedDate: text('requested_date'),
    revision: integer('revision').notNull(),
    sentAt: text('sent_at'),
    siteVisitAt: text('site_visit_at'),
    specialWaste: text('special_waste'),
    stage: text('stage').$type<(typeof SalesInquirySchema.Type)['stage']>().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique('inquiries_tenant_legal_entity_id').on(table.tenantId, table.legalEntityId, table.id),
    index('inquiries_scope_stage').on(table.tenantId, table.legalEntityId, table.stage),
    check('inquiries_revision_positive', sql`${table.revision} > 0`),
    check(
      'inquiries_stage_valid',
      sql`${table.stage} IN ('NEW','SITE_VISIT','PRICING','OFFER_SENT','ACCEPTED','DECLINED')`,
    ),
    check(
      'inquiries_offer_sent',
      sql`${table.stage} NOT IN ('OFFER_SENT','ACCEPTED','DECLINED') OR (${table.offer} IS NOT NULL AND ${table.sentAt} IS NOT NULL)`,
    ),
    check(
      'inquiries_acceptance_present',
      sql`${table.stage} <> 'ACCEPTED' OR (${table.acceptance} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL)`,
    ),
    ...tenantLegalEntityRlsPolicies('inquiries_scope', table.tenantId, table.legalEntityId),
  ],
);

// Authentication replay evidence is deployment-wide infrastructure, never business identity.
export const gatewayAssertionRedemptions = salesInquiriesSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
