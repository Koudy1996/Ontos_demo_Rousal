import { Schema } from 'effect';

import { PackageDefinitionSelectionRevisionSchema } from '../domain/catalog-selection-evidence.ts';
import {
  PackageDefinitionEvidenceRefsSchema,
  PackageDefinitionReasonSchema,
  PackageDefinitionMutationResultSchema,
} from './package-definition-contract.ts';

export const RetirePackageDefinitionPayloadSchema = Schema.Struct({
  evidenceRefs: PackageDefinitionEvidenceRefsSchema,
  expectedCurrent: PackageDefinitionSelectionRevisionSchema,
  reason: PackageDefinitionReasonSchema,
});
export type RetirePackageDefinitionPayload = typeof RetirePackageDefinitionPayloadSchema.Type;
export const RetirePackageDefinitionResultSchema = PackageDefinitionMutationResultSchema;
export type RetirePackageDefinitionResult = typeof RetirePackageDefinitionResultSchema.Type;
