declare module 'salesInquiries/PageInquiries' {
  import type { ComponentType } from 'react';
  import type { ResolvedModuleTarget } from '@app/shell-super-app/api';
  const Page: ComponentType<{
    readonly routeParams: Readonly<Record<string, string>>;
    readonly target: ResolvedModuleTarget;
  }>;
  export default Page;
}
