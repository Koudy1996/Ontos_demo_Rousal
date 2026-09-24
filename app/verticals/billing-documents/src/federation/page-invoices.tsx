import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { billingDocumentsI18nResources } from '../i18n/resources';
import { InvoicesPage } from '../routes/[lang]/invoices/page';

const InvoicesFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="billing-documents"
    fallbackLanguage="en"
    resources={billingDocumentsI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <InvoicesPage />
  </FederatedI18nBoundary>
);

export default InvoicesFederatedPage;
