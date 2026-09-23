import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/jobs',
  descriptionKey: 'service-jobs.pages.jobs.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'service.jobs.page.jobs',
    moduleKey: 'service.jobs',
    role: 'page',
  }),
  id: 'service-jobs-jobs',
  indexable: false,
  localisedPaths: {
    cs: '/jobs',
    en: '/jobs',
  },
  mfBoundaryId: 'verticalServiceJobs',
  moduleId: 'service.jobs',
  namespace: 'service-jobs',
  ownerAppId: 'service-jobs',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'service-jobs.pages.jobs.title',
} as const;

export default routeMeta;
export { routeMeta };
