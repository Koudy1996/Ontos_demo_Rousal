import { Link, useModernI18n } from '@modern-js/plugin-i18n/runtime';

const WorkforceHome = () => {
  const { t } = useModernI18n();
  return <Link to="/workforce">{t('workforce.demo.title')}</Link>;
};
export default WorkforceHome;
