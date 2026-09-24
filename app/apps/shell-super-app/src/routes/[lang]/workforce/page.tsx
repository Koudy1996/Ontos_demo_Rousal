import { useLoaderData } from '@modern-js/plugin-tanstack/runtime';
import type { ModuleTargetPageModel } from '../modules/[moduleId]/page.data.ts';
import { ModuleTargetView } from '../modules/[moduleId]/page.tsx';

const PageConnector = () => {
  const initialModel: ModuleTargetPageModel = useLoaderData({ from: '/$lang/workforce', structuralSharing: false });
  return <ModuleTargetView initialModel={initialModel} />;
};
export default PageConnector;
