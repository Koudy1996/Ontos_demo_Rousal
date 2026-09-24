import { loader as loadModuleTarget } from '../modules/[moduleId]/page.data.ts';

interface ShellPageLoaderArguments {
  readonly request: Request;
}

export const loader = ({ request }: ShellPageLoaderArguments) =>
  loadModuleTarget({
    params: {
      entrypointKey: 'billing.documents.page.invoices',
      moduleId: 'billing.documents',
    },
    request,
  });
