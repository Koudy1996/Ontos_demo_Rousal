import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/',
  descriptionKey: 'sales-inquiries.seo.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'sales.inquiries.page.sales-inquiries-home',
    moduleKey: 'sales.inquiries',
    role: 'page',
  }),
  id: 'sales-inquiries-home',
  indexable: false,
  localisedPaths: {
    cs: '/',
    en: '/',
  },
  mfBoundaryId: 'verticalSalesInquiries',
  moduleId: 'sales.inquiries',
  namespace: 'sales-inquiries',
  ownerAppId: 'sales-inquiries',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'sales-inquiries.title',
} as const;

export default routeMeta;
export { routeMeta };
