import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/dashboard',
  descriptionKey: 'operations-dashboard.pages.dashboard.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'operations.dashboard.page.dashboard',
    moduleKey: 'operations.dashboard',
    role: 'page',
  }),
  id: 'operations-dashboard-dashboard',
  indexable: false,
  localisedPaths: {
    cs: '/dashboard',
    en: '/dashboard',
  },
  mfBoundaryId: 'verticalOperationsDashboard',
  moduleId: 'operations.dashboard',
  namespace: 'operations-dashboard',
  ownerAppId: 'operations-dashboard',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'operations-dashboard.pages.dashboard.title',
} as const;

export default routeMeta;
export { routeMeta };
