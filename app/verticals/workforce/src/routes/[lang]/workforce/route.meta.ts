import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/workforce',
  descriptionKey: 'workforce.pages.workforce.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'workforce.planning.page.workforce',
    moduleKey: 'workforce.planning',
    role: 'page',
  }),
  id: 'workforce-workforce',
  indexable: false,
  localisedPaths: {
    cs: '/workforce',
    en: '/workforce',
  },
  mfBoundaryId: 'verticalWorkforce',
  moduleId: 'workforce.planning',
  namespace: 'workforce',
  ownerAppId: 'workforce',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'workforce.pages.workforce.title',
} as const;

export default routeMeta;
export { routeMeta };
