import { fileURLToPath } from 'node:url';
import { defineConfig } from '@modern-js/app-tools';
import { getBuildConfigEnvironment, withBuildConfigEnvironment } from '@modern-js/app-tools-extensions/config';
import { bffPlugin } from '@modern-js/plugin-bff-build-extensions';
import { i18nPlugin } from '@modern-js/plugin-i18n';
import { tanstackRouterPlugin } from '@modern-js/plugin-tanstack';
import { presetUltramodern, ultramodernAppTools } from '@modern-js/ultramodern-app-tools';
import { moduleFederationPlugin } from '@module-federation/modern-js-v3';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { withZephyr } from 'zephyr-rspack-plugin';
import {
  createModernBuildContext,
  createModernConfig,
  createZephyrRspackPlugin,
  installGlobalRequire,
} from '../../packages/shared-contracts/tooling/modern-config.ts';
import { ultramodernLocalisedUrls } from './src/routes/ultramodern-route-metadata.ts';

installGlobalRequire(import.meta.url);
const appId = 'service-jobs';
const bffPrefix = '/service-jobs-api';
const cloudflareWorkerName = 'app-service-jobs';
const build = createModernBuildContext({
  appId,
  cloudflarePublicUrlEnvironmentVariable: 'ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS',
  cloudflareWorkerName,
  defaultPort: 4110,
  getBuildConfigEnvironment,
  portEnvironmentVariable: 'VERTICAL_SERVICE_JOBS_PORT',
});
const resolveApiBaseUrl = () => {
  const publicUrl = build.envValue('ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS');
  if (publicUrl !== undefined) {
    return new URL(bffPrefix, publicUrl).href;
  }
  if (build.cloudflareDeployEnabled) {
    throw new Error('Service Jobs deployment requires ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS.');
  }
  return `http://localhost:${build.port}${bffPrefix}`;
};
const config = createModernConfig({
  appId,
  bffPrefix,
  build,
  chunkLoadingGlobal: '__ULTRAMODERN_VERTICAL_SERVICE_JOBS_LOADED_CHUNKS__',
  cloudflareWorkerName,
  moduleUrl: import.meta.url,
  plugins: [
    ultramodernAppTools(),
    tanstackRouterPlugin(),
    i18nPlugin({
      backend: { enabled: true, loadPath: '/locales/{{lng}}/{{ns}}.json' },
      localeDetection: {
        fallbackLanguage: 'en',
        ignoreRedirectRoutes: [
          '/@mf-types',
          '/assets',
          '/bundles',
          bffPrefix,
          '/locales',
          '/mf-manifest.json',
          '/mf-stats.json',
          '/remoteEntry.js',
          '/robots.txt',
          '/site.webmanifest',
          '/sitemap.xml',
          '/static',
          '/zephyr-manifest.json',
        ],
        languages: ['en', 'cs'],
        localePathRedirect: true,
        localisedUrls: ultramodernLocalisedUrls,
      },
      reactI18next: false,
    }),
    bffPlugin(),
    moduleFederationPlugin({ configPath: fileURLToPath(new URL('module-federation.config.ts', import.meta.url)) }),
    createZephyrRspackPlugin({
      configure: () => withBuildConfigEnvironment('ZE_FAIL_BUILD', 'true', withZephyr()),
      readToken: () => build.envValue('ZE_CI_TOKEN'),
    }),
  ],
  rsdoctorEnabled: build.getBuildBoolean('ULTRAMODERN_RSDOCTOR'),
  uniqueName: 'verticalServiceJobs',
});
export default defineConfig(
  presetUltramodern(
    {
      ...config,
      bff: {
        ...config.bff,
        effect: {
          ...config.bff.effect,
          entry: './api/index',
          strictEffectApproach: true,
        },
        runtimeFramework: 'effect',
      },
      builderPlugins: [pluginTailwindcss()],
      source: {
        ...config.source,
        entriesDir: 'src',
        globalVars: {
          ...config.source?.globalVars,
          ULTRAMODERN_SERVICE_JOBS_API_BASE_URL: resolveApiBaseUrl(),
        },
      },
    },
    {
      appId,
      deliveryUnit: { buildMarker: '36eece9daae1ace2', unitId: 'app/service-jobs', version: '0.1.0' },
    },
  ),
);
