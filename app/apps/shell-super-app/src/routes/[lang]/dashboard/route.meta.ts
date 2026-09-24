import { defineSystemModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/dashboard',
  descriptionKey: 'shell.moduleTarget.seoDescription',
  entrypoint: defineSystemModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'shell-super-app.page.operations-dashboard-dashboard',
    moduleKey: 'shell-super-app',
    role: 'page',
  }),
  id: 'shell-operations-dashboard-dashboard',
  indexable: false,
  localisedPaths: {
    cs: '/dashboard',
    en: '/dashboard',
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
