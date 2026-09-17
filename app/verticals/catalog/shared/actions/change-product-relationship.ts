import { ProductRelationshipMutationResultSchema } from './product-relationship-mutations.ts';

export { ChangeProductRelationshipPayloadSchema } from './product-relationship-mutations.ts';
export const ChangeProductRelationshipResultSchema = ProductRelationshipMutationResultSchema;
export type ChangeProductRelationshipResult = typeof ChangeProductRelationshipResultSchema.Type;
export type { ChangeProductRelationshipPayload } from './product-relationship-mutations.ts';
