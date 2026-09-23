import { Schema } from 'effect';

export const validateSearch = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  }),
);
