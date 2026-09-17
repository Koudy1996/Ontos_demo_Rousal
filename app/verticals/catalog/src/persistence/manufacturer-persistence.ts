import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import type { Option } from 'effect';

import type {
  ChangeProductManufacturerPayload,
  RemoveProductManufacturerPayload,
  SetProductManufacturerPayload,
} from '../../shared/actions/manufacturer-mutations.ts';
import type { ManufacturerRelationHistory, ManufacturerSubject } from '../../shared/domain/manufacturer-relation.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
interface MutationEvidence {
  readonly actionInvocationId: string;
  readonly principalId: string;
}
type MutationInput<Payload> = MutationEvidence & { readonly payload: Payload };

/** A revision conflict is distinct from an unknown or unverified external owner. */
export const ManufacturerMutationOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('applied', {
    relationId: Schema.String.check(Schema.isUUID()).pipe(Schema.brand('CatalogManufacturerRelationId')),
    revision: Schema.Int,
  }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Int }),
  Schema.TaggedStruct('identity_conflict', {}),
  Schema.TaggedStruct('invalid_change', {}),
]);
export type ManufacturerMutationOutcome = typeof ManufacturerMutationOutcomeSchema.Type;

export class ManufacturerPersistenceUnavailable extends Schema.TaggedError<ManufacturerPersistenceUnavailable>()(
  'ManufacturerPersistenceUnavailable',
  {
    code: Schema.Literal('manufacturer_persistence_unavailable'),
    reason: Schema.String,
  },
) {}

export interface ManufacturerPersistence {
  /** Compare expectedRevision and append an immutable correction in the same scoped transaction. */
  readonly change: (
    input: MutationInput<ChangeProductManufacturerPayload>,
  ) => Effect.Effect<ManufacturerMutationOutcome, ManufacturerPersistenceUnavailable>;
  /** Read the ordered, complete relation history under the same trusted Tenant scope. */
  readonly history: (
    relationId: string,
    subject: ManufacturerSubject,
  ) => Effect.Effect<Option.Option<ManufacturerRelationHistory>, ManufacturerPersistenceUnavailable>;
  /** Compare expectedRevision and append a retraction; never delete earlier evidence. */
  readonly remove: (
    input: MutationInput<RemoveProductManufacturerPayload>,
  ) => Effect.Effect<ManufacturerMutationOutcome, ManufacturerPersistenceUnavailable>;
  /** Create revision 1 only when the relation ID and subject have no competing current assertion. */
  readonly set: (
    input: MutationInput<SetProductManufacturerPayload>,
  ) => Effect.Effect<ManufacturerMutationOutcome, ManufacturerPersistenceUnavailable>;
}

const unavailable = () =>
  new ManufacturerPersistenceUnavailable({
    code: 'manufacturer_persistence_unavailable',
    reason: 'Tenant-scoped manufacturer storage and authoritative Party or Legal Entity verification are unavailable',
  });

/**
 * Core must supply a transaction with verified Tenant scope. The eventual implementation must
 * verify the target through its public owner boundary, then perform CAS and history append in
 * this transaction. Reference syntax and matching Tenant IDs do not prove owner existence.
 */
export const manufacturerPersistenceForScope = (
  _transaction: ScopedTransaction,
  _scope: OperationalScope,
): ManufacturerPersistence => {
  const failClosed = () => Effect.fail(unavailable());
  return { change: failClosed, history: failClosed, remove: failClosed, set: failClosed };
};
