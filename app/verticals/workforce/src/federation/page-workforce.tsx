import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { workforceI18nResources } from '../i18n/resources';
import WorkforcePage from '../routes/[lang]/workforce/page';

const WorkforceFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="workforce"
    fallbackLanguage="en"
    resources={workforceI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <WorkforcePage />
  </FederatedI18nBoundary>
);

export default WorkforceFederatedPage;
