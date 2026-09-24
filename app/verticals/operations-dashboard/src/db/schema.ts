import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const operationsDashboardSchema = pgSchema('operations_dashboard');

/** Security infrastructure only; the dashboard owns no business persistence. */
export const gatewayAssertionRedemptions = operationsDashboardSchema.table(
  'gateway_assertion_redemptions',
  {
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuer: text('issuer').notNull(),
    jti: uuid('jti').notNull(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.audience, table.jti] })],
);
