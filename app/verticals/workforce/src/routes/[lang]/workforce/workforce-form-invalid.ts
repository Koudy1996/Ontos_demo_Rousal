import { Schema } from 'effect';

export class WorkforceFormInvalid extends Schema.TaggedError<WorkforceFormInvalid>()('WorkforceFormInvalid', {
  cause: Schema.Unknown,
}) {}
export const formInvalid = (cause: unknown) => new WorkforceFormInvalid({ cause });
