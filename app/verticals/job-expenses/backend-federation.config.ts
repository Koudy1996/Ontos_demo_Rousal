import bffPackage from '@modern-js/plugin-bff/package.json' with { type: 'json' };
import effectPackage from 'effect/package.json' with { type: 'json' };

import { createModuleFederationConfig } from '@module-federation/modern-js-v3';

import { dependencies } from './package.json';

const moduleFederationConfig: Parameters<typeof createModuleFederationConfig>[0] = createModuleFederationConfig({
  dts: false,
  exposes: {
    './effect-api': './api/effect-api.ts',
  },
  filename: 'backendRemoteEntry.cjs',
  library: {
    type: 'commonjs-module',
  },
  name: 'verticalJobExpensesBackend',
  shared: {
    '@modern-js/plugin-bff': {
      requiredVersion: bffPackage.version,
      singleton: true,
      treeShaking: false,
    },
    '@module-federation/runtime': {
      requiredVersion: dependencies['@module-federation/runtime'],
      singleton: true,
      treeShaking: false,
    },
    effect: {
      requiredVersion: effectPackage.version,
      singleton: true,
      treeShaking: false,
    },
  },
});

export default moduleFederationConfig;
