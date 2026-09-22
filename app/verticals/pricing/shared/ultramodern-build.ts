import { withUltramodernBuildIdentity } from '@app/shared-contracts/ultramodern-build';

declare const ULTRAMODERN_BUILD_MARKER: string;
declare const ULTRAMODERN_SOURCE_REVISION: string;

const generatedBuildArtifact = {
  deliveryUnit: {
    appId: 'pricing',
    build: '472426e9fbfd8da9',
    buildMarker: '472426e9fbfd8da9',
    deployProfile: 'cloudflare-ssr-mf-effect-v1',
    kind: 'microvertical-delivery-unit',
    packageName: '@app/pricing',
    schemaVersion: 1,
    sourceRevision: 'workspace',
    unitId: 'app/pricing',
    version: '0.1.0',
  },
  kind: 'ultramodern-build-artifact',
  schemaVersion: 1,
  surfaces: {
    api: {
      appId: 'pricing',
      build: '472426e9fbfd8da9',
      buildMarker: '472426e9fbfd8da9',
      deployProfile: 'cloudflare-ssr-mf-effect-v1',
      kind: 'microvertical-delivery-unit',
      packageName: '@app/pricing',
      schemaVersion: 1,
      sourceRevision: 'workspace',
      surface: 'api',
      unitId: 'app/pricing',
      version: '0.1.0',
    },
    ui: {
      appId: 'pricing',
      build: '472426e9fbfd8da9',
      buildMarker: '472426e9fbfd8da9',
      deployProfile: 'cloudflare-ssr-mf-effect-v1',
      kind: 'microvertical-delivery-unit',
      packageName: '@app/pricing',
      schemaVersion: 1,
      sourceRevision: 'workspace',
      surface: 'ui',
      unitId: 'app/pricing',
      version: '0.1.0',
    },
  },
} as const;

const readInjectedBuildValue = (read: () => string, fallback: string): string => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

const buildArtifact = withUltramodernBuildIdentity(
  generatedBuildArtifact,
  readInjectedBuildValue(() => ULTRAMODERN_BUILD_MARKER, generatedBuildArtifact.deliveryUnit.buildMarker),
  readInjectedBuildValue(() => ULTRAMODERN_SOURCE_REVISION, generatedBuildArtifact.deliveryUnit.sourceRevision),
);

export const ultramodernApiMarker = buildArtifact.surfaces.api;
