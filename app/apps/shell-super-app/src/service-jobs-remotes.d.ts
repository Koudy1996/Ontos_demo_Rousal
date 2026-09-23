declare module 'serviceJobs/PageJobs' {
  import type { ComponentType } from 'react';
  import type { ResolvedModuleTarget } from '@app/shell-super-app/api';

  const PageJobs: ComponentType<{
    readonly routeParams: Readonly<Record<string, string>>;
    readonly target: ResolvedModuleTarget;
  }>;
  export default PageJobs;
}
