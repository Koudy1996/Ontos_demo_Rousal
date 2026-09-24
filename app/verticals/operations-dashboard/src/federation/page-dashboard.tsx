import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { operationsDashboardI18nResources } from '../i18n/resources';
import { DashboardPage } from '../routes/[lang]/dashboard/page';

const DashboardFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="operations-dashboard"
    fallbackLanguage="en"
    resources={operationsDashboardI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <DashboardPage />
  </FederatedI18nBoundary>
);

export default DashboardFederatedPage;
