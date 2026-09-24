import { jobExpensesApi } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';

export const backendFederationContract = {
  compatibility: {
    build: ultramodernApiMarker.build,
    contractVersion: 'microvertical-server-effect-v1',
    nodeAdapterVersion: 'backend-mf-effect-v1',
    packageName: '@app/job-expenses',
    sourceRevision: ultramodernApiMarker.sourceRevision,
    unitId: ultramodernApiMarker.unitId,
  },
  executionSurfaces: ['node-mf-runtime'],
  exposes: ['./effect-api'],
  name: 'verticalJobExpensesBackend',
  openapiPath: '/job-expenses-api/openapi.json',
  readinessPath: '/job-expenses-api/job-expenses/readiness',
  role: 'microvertical-server',
  runtimeFramework: 'effect',
  strictEffectApproach: true,
} as const;

export { default, default as runtime } from './index.ts';
export {
  jobExpensesApiContract as contract,
  jobExpensesOperationContexts as operationContexts,
} from '../shared/api.ts';
export const api: unknown = jobExpensesApi;
