import { assertI18nInstance } from '@modern-js/plugin-i18n/i18n';
import { defineRuntimeConfig } from '@modern-js/runtime';
import { createInstance } from 'i18next';

import csResource from '../locales/cs/translation.json' with { type: 'json' };
import enResource from '../locales/en/translation.json' with { type: 'json' };
import { operationsDashboardI18nResources } from './i18n/resources.ts';
import { ultramodernRouteNamespace } from './routes/ultramodern-route-metadata';

const i18nInstance = createInstance();
assertI18nInstance(i18nInstance);

const resources = {
  cs: { ...operationsDashboardI18nResources.cs, translation: csResource },
  en: { ...operationsDashboardI18nResources.en, translation: enResource },
} as const;

export default defineRuntimeConfig({
  i18n: {
    i18nInstance,
    initOptions: {
      defaultNS: ultramodernRouteNamespace,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      ns: [ultramodernRouteNamespace, 'translation'],
      resources,
      supportedLngs: ['en', 'cs'],
    },
  },

  router: {
    framework: 'tanstack',
  },
});
