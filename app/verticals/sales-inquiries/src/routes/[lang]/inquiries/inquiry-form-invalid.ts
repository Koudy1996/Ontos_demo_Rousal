import { Data } from 'effect';
import type { Schema } from 'effect';

export class InquiryFormInvalid extends Data.TaggedError('InquiryFormInvalid')<{
  readonly cause: Schema.SchemaError;
}> {}
export const formInvalid = (cause: Schema.SchemaError) => new InquiryFormInvalid({ cause });
