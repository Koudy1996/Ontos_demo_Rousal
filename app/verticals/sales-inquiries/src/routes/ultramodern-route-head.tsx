import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Helmet } from '@modern-js/runtime/head';

/** All current staff inquiry routes are private and excluded from indexing. */
const UltramodernRouteHead = () => {
  const { language, t } = useModernI18n();
  return (
    <Helmet htmlAttributes={{ lang: language ?? 'en' }}>
      <title>{t('sales-inquiries.pages.inquiries.title')}</title>
      <meta content={t('sales-inquiries.pages.inquiries.description')} name="description" />
      <meta content="noindex, nofollow" name="robots" />
    </Helmet>
  );
};

export { UltramodernRouteHead };
