import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Helmet } from '@modern-js/runtime/head';

/** All current staff job routes are private and excluded from indexing. */
const UltramodernRouteHead = () => {
  const { language, t } = useModernI18n();
  return (
    <Helmet htmlAttributes={{ lang: language ?? 'en' }}>
      <title>{t('service-jobs.pages.jobs.title')}</title>
      <meta content={t('service-jobs.pages.jobs.description')} name="description" />
      <meta content="noindex, nofollow" name="robots" />
    </Helmet>
  );
};

export { UltramodernRouteHead };
