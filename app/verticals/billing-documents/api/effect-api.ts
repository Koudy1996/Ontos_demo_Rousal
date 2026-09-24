import { billingDocumentsApi } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';

export const backendFederationContract = {
  compatibility: {
    build: ultramodernApiMarker.build,
    contractVersion: 'microvertical-server-effect-v1',
    nodeAdapterVersion: 'backend-mf-effect-v1',
    packageName: '@app/billing-documents',
    sourceRevision: ultramodernApiMarker.sourceRevision,
    unitId: ultramodernApiMarker.unitId,
  },
  executionSurfaces: ['node-mf-runtime'],
  exposes: ['./effect-api'],
  name: 'verticalBillingDocumentsBackend',
  openapiPath: '/billing-documents-api/openapi.json',
  readinessPath: '/billing-documents-api/billing-documents/readiness',
  role: 'microvertical-server',
  runtimeFramework: 'effect',
  strictEffectApproach: true,
} as const;

export { default, default as runtime } from './index.ts';
export {
  billingDocumentsApiContract as contract,
  billingDocumentsOperationContexts as operationContexts,
} from '../shared/api.ts';
export const api: unknown = billingDocumentsApi;
