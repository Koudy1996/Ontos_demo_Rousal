import { Link, useModernI18n } from '@modern-js/plugin-i18n/runtime';

const JobExpensesHome = () => {
  const { t } = useModernI18n();
  return <Link to="/expenses">{t('job-expenses.demo.title')}</Link>;
};
export default JobExpensesHome;
