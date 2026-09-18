import { Schema } from 'effect';

/** A definite Product-local axis write rejection; no selection was changed. */
export class VariantAxisWriteConflict extends Schema.TaggedError<VariantAxisWriteConflict>()(
  'VariantAxisWriteConflict',
  {
    code: Schema.Literal('variant_axis_write_conflict'),
    conflict: Schema.Literals([
      'NOT_FOUND',
      'REVISION',
      'DEFINITION',
      'TYPE_RULE',
      'ACTIVE_SELECTION',
      'INVALID_INPUT',
    ]),
    reason: Schema.String,
  },
) {}
