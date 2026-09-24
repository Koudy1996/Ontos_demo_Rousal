import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Helmet } from '@modern-js/runtime/head';

/** The staff operations dashboard is private and excluded from indexing. */
const UltramodernRouteHead = () => {
  const { language, t } = useModernI18n();
  return (
    <Helmet htmlAttributes={{ lang: language ?? 'en' }}>
      <title>{t('operations-dashboard.pages.dashboard.title')}</title>
      <meta content={t('operations-dashboard.pages.dashboard.description')} name="description" />
      <meta content="noindex, nofollow" name="robots" />
    </Helmet>
  );
};

export { UltramodernRouteHead };
