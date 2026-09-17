import { SetCompositionMutationPayloadSchema, SetCompositionMutationResultSchema } from './set-composition-contract.ts';

export const ReviseSetCompositionPayloadSchema = SetCompositionMutationPayloadSchema;
export type ReviseSetCompositionPayload = typeof ReviseSetCompositionPayloadSchema.Type;
export const ReviseSetCompositionResultSchema = SetCompositionMutationResultSchema;
export type ReviseSetCompositionResult = typeof ReviseSetCompositionResultSchema.Type;
