import {
  PackageOptionTransitionPayloadSchema,
  PackageOptionTransitionResultSchema,
} from './package-option-contract.ts';

export const ActivatePackageOptionPayloadSchema = PackageOptionTransitionPayloadSchema;
export type ActivatePackageOptionPayload = typeof ActivatePackageOptionPayloadSchema.Type;
export const ActivatePackageOptionResultSchema = PackageOptionTransitionResultSchema;
export type ActivatePackageOptionResult = typeof ActivatePackageOptionResultSchema.Type;
