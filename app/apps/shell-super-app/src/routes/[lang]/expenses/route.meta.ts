import { defineSystemModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/expenses',
  descriptionKey: 'shell.moduleTarget.seoDescription',
  entrypoint: defineSystemModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'shell-super-app.page.job-expenses-expenses',
    moduleKey: 'shell-super-app',
    role: 'page',
  }),
  id: 'shell-job-expenses-expenses',
  indexable: false,
  localisedPaths: {
    cs: '/expenses',
    en: '/expenses',
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
