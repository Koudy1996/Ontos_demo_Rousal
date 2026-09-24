import pluginI18nPackage from '@modern-js/plugin-i18n/package.json' with { type: 'json' };
import runtimePackage from '@modern-js/runtime/package.json' with { type: 'json' };
import reactPackage from 'react/package.json' with { type: 'json' };
import reactDomPackage from 'react-dom/package.json' with { type: 'json' };
import { resolveEffectTsgoCompiler } from '@modern-js/app-tools-extensions/config';
import { createModuleFederationConfig } from '@module-federation/modern-js-v3';

import { dependencies } from './package.json';
import { createSharedRuntimeConfig } from '../../module-federation.shared.ts';

const tsgoCompilerInstance = resolveEffectTsgoCompiler({ from: import.meta.url });

const moduleFederationConfig: Parameters<typeof createModuleFederationConfig>[0] = createModuleFederationConfig({
  bridge: {
    enableBridgeRouter: false,
  },
  dts: {
    displayErrorInTerminal: true,
    generateTypes: {
      compilerInstance: tsgoCompilerInstance,
    },
    tsConfigPath: './tsconfig.mf-types.json',
  },
  exposes: {
    './PageInvoices': './src/federation-entry.tsx',
  },
  filename: 'remoteEntry.js',
  name: 'verticalBillingDocuments',
  shared: createSharedRuntimeConfig({
    '@modern-js/plugin-i18n/runtime': pluginI18nPackage.version,
    '@modern-js/runtime': runtimePackage.version,
    '@tanstack/react-router': dependencies['@tanstack/react-router'],
    react: reactPackage.version,
    'react-dom': reactDomPackage.version,
  }),
});

export default moduleFederationConfig;
