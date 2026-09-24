import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/',
  descriptionKey: 'billing-documents.seo.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'authenticated_principal' },
    entrypointKey: 'billing.documents.page.billing-documents-home',
    moduleKey: 'billing.documents',
    role: 'page',
  }),
  id: 'billing-documents-home',
  indexable: false,
  localisedPaths: {
    cs: '/',
    en: '/',
  },
  mfBoundaryId: 'verticalBillingDocuments',
  moduleId: 'billing.documents',
  namespace: 'billing-documents',
  ownerAppId: 'billing-documents',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'billing-documents.title',
} as const;

export default routeMeta;
export { routeMeta };
