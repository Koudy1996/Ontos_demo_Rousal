import { Schema } from 'effect';

export class CatalogDatabaseConnectionError extends Schema.TaggedError<CatalogDatabaseConnectionError>()(
  'CatalogDatabaseConnectionError',
  { reason: Schema.String },
) {}
