import { Link, useModernI18n } from '@modern-js/plugin-i18n/runtime';

const ServiceJobsHome = () => {
  const { t } = useModernI18n();
  return <Link to="/jobs">{t('service-jobs.demo.title')}</Link>;
};
export default ServiceJobsHome;
