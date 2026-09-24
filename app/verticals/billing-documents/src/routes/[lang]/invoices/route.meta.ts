import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/invoices',
  descriptionKey: 'billing-documents.pages.invoices.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'billing.documents.page.invoices',
    moduleKey: 'billing.documents',
    role: 'page',
  }),
  id: 'billing-documents-invoices',
  indexable: false,
  localisedPaths: {
    cs: '/invoices',
    en: '/invoices',
  },
  mfBoundaryId: 'verticalBillingDocuments',
  moduleId: 'billing.documents',
  namespace: 'billing-documents',
  ownerAppId: 'billing-documents',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'billing-documents.pages.invoices.title',
} as const;

export default routeMeta;
export { routeMeta };
