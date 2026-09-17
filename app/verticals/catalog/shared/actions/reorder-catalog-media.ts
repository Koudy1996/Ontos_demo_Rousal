import { CatalogMediaChangeResultSchema } from './catalog-media.ts';

export { ReorderCatalogMediaPayloadSchema } from './catalog-media.ts';
export const ReorderCatalogMediaResultSchema = CatalogMediaChangeResultSchema;
export type ReorderCatalogMediaResult = typeof ReorderCatalogMediaResultSchema.Type;
export type { ReorderCatalogMediaPayload } from './catalog-media.ts';
