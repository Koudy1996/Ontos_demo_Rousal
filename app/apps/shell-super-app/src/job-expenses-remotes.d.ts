declare module 'jobExpenses/PageExpenses' {
  import type { ComponentType } from 'react';
  import type { ResolvedModuleTarget } from '@app/shell-super-app/api';

  const PageExpenses: ComponentType<{
    readonly routeParams: Readonly<Record<string, string>>;
    readonly target: ResolvedModuleTarget;
  }>;
  export default PageExpenses;
}
