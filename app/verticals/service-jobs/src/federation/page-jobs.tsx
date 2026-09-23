import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { serviceJobsI18nResources } from '../i18n/resources';
import JobsPage from '../routes/[lang]/jobs/page';

const JobsFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="service-jobs"
    fallbackLanguage="en"
    resources={serviceJobsI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <JobsPage />
  </FederatedI18nBoundary>
);

export default JobsFederatedPage;
