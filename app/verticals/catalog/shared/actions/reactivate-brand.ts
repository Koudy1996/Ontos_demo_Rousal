import { BrandMutationResultSchema } from './brand-mutations.ts';

export { ReactivateBrandPayloadSchema } from './brand-mutations.ts';
export type { ReactivateBrandPayload } from './brand-mutations.ts';
export const ReactivateBrandResultSchema = BrandMutationResultSchema;
export type ReactivateBrandResult = typeof ReactivateBrandResultSchema.Type;
