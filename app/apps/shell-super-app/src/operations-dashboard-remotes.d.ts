declare module 'operationsDashboard/PageDashboard' {
  import type { ComponentType } from 'react';
  import type { ResolvedModuleTarget } from '@app/shell-super-app/api';

  const PageDashboard: ComponentType<{
    readonly routeParams: Readonly<Record<string, string>>;
    readonly target: ResolvedModuleTarget;
  }>;
  export default PageDashboard;
}
