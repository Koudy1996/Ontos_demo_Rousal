import { CatalogMediaChangeResultSchema } from './catalog-media.ts';

export { AssignCatalogMediaPayloadSchema } from './catalog-media.ts';
export const AssignCatalogMediaResultSchema = CatalogMediaChangeResultSchema;
export type AssignCatalogMediaResult = typeof AssignCatalogMediaResultSchema.Type;
export type { AssignCatalogMediaPayload } from './catalog-media.ts';
