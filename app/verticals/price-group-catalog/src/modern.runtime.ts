import type { I18nInstance } from '@modern-js/plugin-i18n/runtime';
import { defineRuntimeConfig } from '@modern-js/runtime';
import { createInstance } from 'i18next';

import csResource from '../locales/cs/price-group-catalog.json';
import enResource from '../locales/en/price-group-catalog.json';

const i18nInstance = createInstance();
const resources = {
  cs: { ['api']: csResource },
  en: { ['api']: enResource },
} as const;

export default defineRuntimeConfig({
  i18n: {
    i18nInstance: i18nInstance as I18nInstance,
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
