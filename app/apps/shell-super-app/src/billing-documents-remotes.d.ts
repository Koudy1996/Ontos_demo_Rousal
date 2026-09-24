declare module 'billingDocuments/PageInvoices' {
  import type { ComponentType } from 'react';
  import type { ResolvedModuleTarget } from '@app/shell-super-app/api';

  const PageInvoices: ComponentType<{
    readonly routeParams: Readonly<Record<string, string>>;
    readonly target: ResolvedModuleTarget;
  }>;
  export default PageInvoices;
}
