import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/inquiries',
  descriptionKey: 'sales-inquiries.pages.inquiries.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'sales.inquiries.page.inquiries',
    moduleKey: 'sales.inquiries',
    role: 'page',
  }),
  id: 'sales-inquiries-inquiries',
  indexable: false,
  localisedPaths: {
    cs: '/inquiries',
    en: '/inquiries',
  },
  mfBoundaryId: 'verticalSalesInquiries',
  moduleId: 'sales.inquiries',
  namespace: 'sales-inquiries',
  ownerAppId: 'sales-inquiries',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'sales-inquiries.pages.inquiries.title',
} as const;

export default routeMeta;
export { routeMeta };
