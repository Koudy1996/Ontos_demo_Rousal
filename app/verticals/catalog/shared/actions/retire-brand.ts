import { BrandMutationResultSchema } from './brand-mutations.ts';

export { RetireBrandPayloadSchema } from './brand-mutations.ts';
export type { RetireBrandPayload } from './brand-mutations.ts';
export const RetireBrandResultSchema = BrandMutationResultSchema;
export type RetireBrandResult = typeof RetireBrandResultSchema.Type;
