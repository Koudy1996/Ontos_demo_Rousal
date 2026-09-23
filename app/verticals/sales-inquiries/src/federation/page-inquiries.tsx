import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { salesInquiriesI18nResources } from '../i18n/resources';
import InquiriesPage from '../routes/[lang]/inquiries/page';

const InquiriesFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="sales-inquiries"
    fallbackLanguage="en"
    resources={salesInquiriesI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <InquiriesPage />
  </FederatedI18nBoundary>
);

export default InquiriesFederatedPage;
