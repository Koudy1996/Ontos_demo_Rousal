import {
  PackageOptionTransitionPayloadSchema,
  PackageOptionTransitionResultSchema,
} from './package-option-contract.ts';

export const RetirePackageOptionPayloadSchema = PackageOptionTransitionPayloadSchema;
export type RetirePackageOptionPayload = typeof RetirePackageOptionPayloadSchema.Type;
export const RetirePackageOptionResultSchema = PackageOptionTransitionResultSchema;
