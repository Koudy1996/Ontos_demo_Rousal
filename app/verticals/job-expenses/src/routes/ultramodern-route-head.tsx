import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Helmet } from '@modern-js/runtime/head';

/** The staff expense screen is private and excluded from indexing. */
const UltramodernRouteHead = () => {
  const { language, t } = useModernI18n();
  return (
    <Helmet htmlAttributes={{ lang: language ?? 'en' }}>
      <title>{t('job-expenses.pages.expenses.title')}</title>
      <meta content={t('job-expenses.pages.expenses.description')} name="description" />
      <meta content="noindex, nofollow" name="robots" />
    </Helmet>
  );
};

export { UltramodernRouteHead };
