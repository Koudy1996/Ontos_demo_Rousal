import { Schema } from 'effect';

export class DashboardDependencyUnavailable extends Schema.TaggedError<DashboardDependencyUnavailable>()(
  'DashboardDependencyUnavailable',
  { reason: Schema.String },
) {}
