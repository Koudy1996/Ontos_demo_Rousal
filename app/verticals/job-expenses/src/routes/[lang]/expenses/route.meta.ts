import { defineTenantModuleEntrypoint } from '@app/core-runtime';

const routeMeta = {
  canonicalPath: '/expenses',
  descriptionKey: 'job-expenses.pages.expenses.description',
  entrypoint: defineTenantModuleEntrypoint({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'module.access' },
    entrypointKey: 'job.expenses.page.expenses',
    moduleKey: 'job.expenses',
    role: 'page',
  }),
  id: 'job-expenses-expenses',
  indexable: false,
  localisedPaths: {
    cs: '/expenses',
    en: '/expenses',
  },
  mfBoundaryId: 'verticalJobExpenses',
  moduleId: 'job.expenses',
  namespace: 'job-expenses',
  ownerAppId: 'job-expenses',
  public: false,
  publicSurface: 'private-app-screen',
  titleKey: 'job-expenses.pages.expenses.title',
} as const;

export default routeMeta;
export { routeMeta };
