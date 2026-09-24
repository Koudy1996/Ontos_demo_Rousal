import { Schema } from 'effect';

export class JobExpensesFormInvalid extends Schema.TaggedError<JobExpensesFormInvalid>()('JobExpensesFormInvalid', {
  reason: Schema.String,
}) {}

export const formInvalid = (cause: unknown) =>
  Object.defineProperty(new JobExpensesFormInvalid({ reason: 'Invalid expense form' }), 'cause', {
    enumerable: false,
    value: cause,
  });
