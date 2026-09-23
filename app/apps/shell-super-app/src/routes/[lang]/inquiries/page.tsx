import { useLoaderData } from '@modern-js/plugin-tanstack/runtime';

import type { ModuleTargetPageModel } from '../modules/[moduleId]/page.data.ts';
import { ModuleTargetView } from '../modules/[moduleId]/page.tsx';

const InquiriesPage = () => {
  const initialModel: ModuleTargetPageModel = useLoaderData({
    from: '/$lang/inquiries',
    structuralSharing: false,
  });
  return <ModuleTargetView initialModel={initialModel} />;
};

export default InquiriesPage;
