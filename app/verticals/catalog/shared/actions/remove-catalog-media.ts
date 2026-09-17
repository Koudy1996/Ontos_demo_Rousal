import { CatalogMediaChangeResultSchema } from './catalog-media.ts';

export { RemoveCatalogMediaPayloadSchema } from './catalog-media.ts';
export const RemoveCatalogMediaResultSchema = CatalogMediaChangeResultSchema;
export type RemoveCatalogMediaResult = typeof RemoveCatalogMediaResultSchema.Type;
export type { RemoveCatalogMediaPayload } from './catalog-media.ts';
