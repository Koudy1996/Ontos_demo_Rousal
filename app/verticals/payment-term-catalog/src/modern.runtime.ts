import { defineRuntimeConfig } from '@modern-js/runtime';
import { assertI18nInstance } from '@modern-js/plugin-i18n/i18n';
import { createInstance } from 'i18next';

/* jscpd:ignore-start -- API-only runtime configuration intentionally follows the generated locale bootstrap contract. */
import csResource from '../locales/cs/payment-term-catalog.json';
import enResource from '../locales/en/payment-term-catalog.json';

const i18nInstance = createInstance();
assertI18nInstance(i18nInstance);
const resources = {
  cs: { api: csResource },
  en: { api: enResource },
} as const;

export default defineRuntimeConfig({
  i18n: {
    i18nInstance,
    initOptions: {
      defaultNS: 'api',
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      ns: ['api', 'translation'],
      resources,
      supportedLngs: ['en', 'cs'],
    },
  },
  router: {
    framework: 'tanstack',
  },
});
/* jscpd:ignore-end */
