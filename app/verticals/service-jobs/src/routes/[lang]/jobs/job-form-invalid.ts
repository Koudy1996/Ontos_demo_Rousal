import { Data } from 'effect';
import type { Schema } from 'effect';

export class JobFormInvalid extends Data.TaggedError('JobFormInvalid')<{
  readonly cause: Schema.SchemaError;
}> {}
export const formInvalid = (cause: Schema.SchemaError) => new JobFormInvalid({ cause });
