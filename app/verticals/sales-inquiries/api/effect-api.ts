import { salesInquiriesApi } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';

export const backendFederationContract = {
  compatibility: {
    build: ultramodernApiMarker.build,
    contractVersion: 'microvertical-server-effect-v1',
    nodeAdapterVersion: 'backend-mf-effect-v1',
    packageName: '@app/sales-inquiries',
    sourceRevision: ultramodernApiMarker.sourceRevision,
    unitId: ultramodernApiMarker.unitId,
  },
  executionSurfaces: ['node-mf-runtime'],
  exposes: ['./effect-api'],
  name: 'verticalSalesInquiriesBackend',
  openapiPath: '/sales-inquiries-api/openapi.json',
  readinessPath: '/sales-inquiries-api/sales-inquiries/readiness',
  role: 'microvertical-server',
  runtimeFramework: 'effect',
  strictEffectApproach: true,
} as const;

export { default, default as runtime } from './index.ts';
export {
  salesInquiriesApiContract as contract,
  salesInquiriesOperationContexts as operationContexts,
} from '../shared/api.ts';
export const api: unknown = salesInquiriesApi;
