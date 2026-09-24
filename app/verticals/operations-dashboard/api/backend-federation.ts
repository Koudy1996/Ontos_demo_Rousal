import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';

export const backendFederationContract = {
  compatibility: {
    build: ultramodernApiMarker.build,
    contractVersion: 'microvertical-server-effect-v1',
    nodeAdapterVersion: 'backend-mf-effect-v1',
    packageName: ultramodernApiMarker.packageName,
    sourceRevision: ultramodernApiMarker.sourceRevision,
    unitId: ultramodernApiMarker.unitId,
  },
  contractVersion: 'microvertical-server-effect-v1',
  executionSurfaces: ['node-mf-runtime'],
  exposes: ['./effect-api'],
  name: 'verticalOperationsDashboardBackend',
  nodeAdapterVersion: 'backend-mf-effect-v1',
  openapiPath: '/operations-dashboard-api/openapi.json',
  readinessPath: '/operations-dashboard-api/operations-dashboard/readiness',
  role: 'microvertical-server',
  runtimeFramework: 'effect',
  strictEffectApproach: true,
} as const;

export { default, default as runtime } from './index.ts';
export {
  operationsDashboardApi as api,
  operationsDashboardApiContract as contract,
  operationsDashboardOperationContexts as operationContexts,
} from '../shared/api.ts';
