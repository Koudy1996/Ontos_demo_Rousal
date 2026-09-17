import { ProductRelationshipMutationResultSchema } from './product-relationship-mutations.ts';

export { CreateProductRelationshipPayloadSchema } from './product-relationship-mutations.ts';
export const CreateProductRelationshipResultSchema = ProductRelationshipMutationResultSchema;
export type CreateProductRelationshipResult = typeof CreateProductRelationshipResultSchema.Type;
export type { CreateProductRelationshipPayload } from './product-relationship-mutations.ts';
