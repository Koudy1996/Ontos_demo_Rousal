import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Helmet } from '@modern-js/runtime/head';

/** The staff billing screen is private and excluded from indexing. */
const UltramodernRouteHead = () => {
  const { language, t } = useModernI18n();
  return (
    <Helmet htmlAttributes={{ lang: language ?? 'en' }}>
      <title>{t('billing-documents.pages.invoices.title')}</title>
      <meta content={t('billing-documents.pages.invoices.description')} name="description" />
      <meta content="noindex, nofollow" name="robots" />
    </Helmet>
  );
};

export { UltramodernRouteHead };
