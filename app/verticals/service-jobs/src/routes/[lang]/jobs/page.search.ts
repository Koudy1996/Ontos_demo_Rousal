import { Schema } from 'effect';
import { JobPageSearchSchema } from '../../../../shared/resources/service-job.ts';

export const validateSearch = Schema.toStandardSchemaV1(JobPageSearchSchema);
