import { SetCompositionMutationPayloadSchema, SetCompositionMutationResultSchema } from './set-composition-contract.ts';

export const CreateSetCompositionPayloadSchema = SetCompositionMutationPayloadSchema;
export type CreateSetCompositionPayload = typeof CreateSetCompositionPayloadSchema.Type;
export const CreateSetCompositionResultSchema = SetCompositionMutationResultSchema;
export type CreateSetCompositionResult = typeof CreateSetCompositionResultSchema.Type;
