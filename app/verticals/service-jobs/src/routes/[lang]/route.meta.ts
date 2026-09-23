import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/',
  descriptionKey: 'service-jobs.seo.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'service.jobs.page.service-jobs-home',
    moduleKey: 'service.jobs',
    role: 'page',
  }),
  id: 'service-jobs-home',
  indexable: false,
  localisedPaths: {
    cs: '/',
    en: '/',
  },
  mfBoundaryId: 'verticalServiceJobs',
  moduleId: 'service.jobs',
  namespace: 'service-jobs',
  ownerAppId: 'service-jobs',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'service-jobs.title',
} as const;

export default routeMeta;
export { routeMeta };
