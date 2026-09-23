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
  name: 'verticalSalesInquiriesBackend',
  nodeAdapterVersion: 'backend-mf-effect-v1',
  openapiPath: '/sales-inquiries-api/openapi.json',
  readinessPath: '/sales-inquiries-api/sales-inquiries/readiness',
  role: 'microvertical-server',
  runtimeFramework: 'effect',
  strictEffectApproach: true,
} as const;

export { default, default as runtime } from './index.ts';
export {
  salesInquiriesApi as api,
  salesInquiriesApiContract as contract,
  salesInquiriesOperationContexts as operationContexts,
} from '../shared/api.ts';
