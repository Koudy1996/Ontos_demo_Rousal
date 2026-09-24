import { FederatedI18nBoundary } from '@modern-js/plugin-i18n/runtime';
import { jobExpensesI18nResources } from '../i18n/resources';
import { ExpensesPage } from '../routes/[lang]/expenses/page';

const ExpensesFederatedPage = () => (
  <FederatedI18nBoundary
    defaultNamespace="job-expenses"
    fallbackLanguage="en"
    resources={jobExpensesI18nResources}
    supportedLanguages={['en', 'cs']}
  >
    <ExpensesPage />
  </FederatedI18nBoundary>
);

export default ExpensesFederatedPage;
