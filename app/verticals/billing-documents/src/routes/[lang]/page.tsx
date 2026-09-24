import { Link, useModernI18n } from '@modern-js/plugin-i18n/runtime';

import { ultramodernUiMarker } from '../../ultramodern-build';
import { UltramodernRouteHead } from '../ultramodern-route-head';

const BillingDocumentsHome = () => {
  const { t } = useModernI18n();
  return (
    <main>
      <UltramodernRouteHead />
      <Link to="/invoices">{t('billing-documents.demo.title')}</Link>
      <p
        className="billingdocuments:sr-only"
        data-build-marker={ultramodernUiMarker.build}
        data-testid="ultramodern-ui-marker"
      >
        {ultramodernUiMarker.appId}:{ultramodernUiMarker.version}
      </p>
    </main>
  );
};
export default BillingDocumentsHome;
