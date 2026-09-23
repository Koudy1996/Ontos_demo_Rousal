import csResource from '../../locales/cs/sales-inquiries.json';
import enResource from '../../locales/en/sales-inquiries.json';
import { ultramodernRouteNamespace } from '../routes/ultramodern-route-metadata.ts';

export const salesInquiriesI18nResources = {
  cs: { [ultramodernRouteNamespace]: csResource },
  en: { [ultramodernRouteNamespace]: enResource },
} as const;
