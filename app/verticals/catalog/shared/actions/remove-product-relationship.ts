import { ProductRelationshipMutationResultSchema } from './product-relationship-mutations.ts';

export { RemoveProductRelationshipPayloadSchema } from './product-relationship-mutations.ts';
export const RemoveProductRelationshipResultSchema = ProductRelationshipMutationResultSchema;
export type RemoveProductRelationshipResult = typeof RemoveProductRelationshipResultSchema.Type;
export type { RemoveProductRelationshipPayload } from './product-relationship-mutations.ts';
