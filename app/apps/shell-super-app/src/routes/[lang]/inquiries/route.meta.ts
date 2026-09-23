import { defineSystemModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/inquiries',
  descriptionKey: 'shell.moduleTarget.seoDescription',
  entrypoint: defineSystemModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'shell-super-app.page.sales-inquiries-inquiries',
    moduleKey: 'shell-super-app',
    role: 'page',
  }),
  id: 'shell-sales-inquiries-inquiries',
  indexable: false,
  localisedPaths: {
    cs: '/inquiries',
    en: '/inquiries',
  },
  mfBoundaryId: 'shellSuperApp',
  namespace: 'shell',
  ownerAppId: 'shell-super-app',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'shell.moduleTarget.title',
} as const;

export default routeMeta;
export { routeMeta };
