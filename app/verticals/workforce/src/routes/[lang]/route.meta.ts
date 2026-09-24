import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/',
  descriptionKey: 'workforce.seo.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'workforce.planning.page.workforce-home',
    moduleKey: 'workforce.planning',
    role: 'page',
  }),
  id: 'workforce-home',
  indexable: false,
  localisedPaths: {
    cs: '/',
    en: '/',
  },
  mfBoundaryId: 'verticalWorkforce',
  moduleId: 'workforce.planning',
  namespace: 'workforce',
  ownerAppId: 'workforce',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'workforce.title',
} as const;

export default routeMeta;
export { routeMeta };
