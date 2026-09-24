import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/',
  descriptionKey: 'job-expenses.seo.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'job.expenses.page.job-expenses-home',
    moduleKey: 'job.expenses',
    role: 'page',
  }),
  id: 'job-expenses-home',
  indexable: false,
  localisedPaths: {
    cs: '/',
    en: '/',
  },
  mfBoundaryId: 'verticalJobExpenses',
  moduleId: 'job.expenses',
  namespace: 'job-expenses',
  ownerAppId: 'job-expenses',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'job-expenses.title',
} as const;

export default routeMeta;
export { routeMeta };
