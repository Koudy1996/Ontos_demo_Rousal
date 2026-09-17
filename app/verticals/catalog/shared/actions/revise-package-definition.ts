import { Schema } from 'effect';

import { PackageDefinitionSelectionRevisionSchema } from '../domain/catalog-selection-evidence.ts';
import {
  PackageDefinitionContentInputSchema,
  PackageDefinitionEvidenceRefsSchema,
  PackageDefinitionReasonSchema,
} from './package-definition-contract.ts';

export const RevisePackageDefinitionPayloadSchema = Schema.Struct({
  content: PackageDefinitionContentInputSchema,
  evidenceRefs: PackageDefinitionEvidenceRefsSchema,
  expectedCurrent: PackageDefinitionSelectionRevisionSchema,
  reason: PackageDefinitionReasonSchema,
});
export type RevisePackageDefinitionPayload = typeof RevisePackageDefinitionPayloadSchema.Type;
export { PackageDefinitionMutationResultSchema as RevisePackageDefinitionResultSchema } from './package-definition-contract.ts';
