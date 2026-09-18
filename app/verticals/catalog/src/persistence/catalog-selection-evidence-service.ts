import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect } from 'effect';

import type { CatalogSelectionCurrentFacts } from '../../shared/domain/catalog-selection-assessment.ts';
import { assessCatalogSelection } from '../../shared/domain/catalog-selection-assessment.ts';
import type {
  CatalogSelection,
  CatalogSelectionBasisRole,
  CatalogSelectionEvidence,
} from '../../shared/domain/catalog-selection-evidence.ts';
import type {
  CatalogSelectionInjectedOwnerEvidence,
  CatalogSelectionOwnerAssessmentResult,
  CatalogSelectionUnverifiableOwnerEvidence,
} from '../../shared/domain/catalog-selection-owner-contract.ts';
import { catalogSelectionInjectedOwnerEvidenceResult } from '../../shared/domain/catalog-selection-owner-contract.ts';
import type { CatalogSelectionPurpose } from '../../shared/domain/catalog-selection-purpose.ts';
import { selectSmallestCompleteCatalogSelectionBasis } from '../../shared/domain/catalog-selection-purpose.ts';
import type { CatalogSelectionValidityAttestation } from '../../shared/domain/catalog-selection-validity.ts';
import {
  catalogSelectionValidityAttestationFor,
  catalogSelectionValidityCovers,
} from '../../shared/domain/catalog-selection-validity.ts';
import { catalogSelectionCurrentBasisForScope } from './catalog-selection-current-basis.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export interface CatalogSelectionEvidenceRequest {
  /** Trusted instant the caller needs the assessment for; defaults to the owner read instant. */
  readonly at?: CatalogSelectionEvidence['assessedAt'];
  readonly purpose: CatalogSelectionPurpose;
  readonly selection: CatalogSelection;
  readonly validUntil?: CatalogSelectionEvidence['validUntil'];
}

export interface CatalogSelectionEvidenceAssemblyInput {
  readonly current: CatalogSelectionCurrentFacts;
  readonly injectedOwnerEvidence?: CatalogSelectionInjectedOwnerEvidence | undefined;
  readonly purpose: CatalogSelectionPurpose;
  readonly requestedAt?: CatalogSelectionEvidence['assessedAt'] | undefined;
  readonly selection: CatalogSelection;
  readonly validUntil?: CatalogSelectionEvidence['validUntil'] | undefined;
}

/**
 * The single Catalog-owned assembly output. `evidence` is the owner decision; it never contains a
 * foreign price, approval, availability, or transport payload. `ownerEvidence` preserves injected
 * external-owner data for the exact request; it is never folded into the Catalog basis.
 */
export interface CatalogSelectionEvidenceAssembly {
  readonly evidence: CatalogSelectionEvidence;
  readonly missingRoles: readonly CatalogSelectionBasisRole[];
  readonly ownerEvidence?: CatalogSelectionInjectedOwnerEvidence | CatalogSelectionUnverifiableOwnerEvidence;
  readonly validity?: CatalogSelectionValidityAttestation;
}

export interface CatalogSelectionEvidenceServiceResult {
  readonly evidence: CatalogSelectionOwnerAssessmentResult;
  readonly missingRoles: readonly CatalogSelectionBasisRole[];
  readonly ownerEvidence?: CatalogSelectionInjectedOwnerEvidence | CatalogSelectionUnverifiableOwnerEvidence;
  readonly validity?: CatalogSelectionValidityAttestation;
}

const unavailableAssembly = (reason: string): CatalogSelectionEvidenceServiceResult => ({
  evidence: { kind: 'UNAVAILABLE', reason },
  missingRoles: [],
});

interface CatalogSelectionEvidenceAssemblyDraft {
  evidence: CatalogSelectionEvidence;
  missingRoles: readonly CatalogSelectionBasisRole[];
  ownerEvidence?: CatalogSelectionInjectedOwnerEvidence | CatalogSelectionUnverifiableOwnerEvidence;
  validity?: CatalogSelectionValidityAttestation;
}

/**
 * Pure composition over one owner Current read: assess, then narrow to the smallest complete basis
 * for the purpose. A VALID decision whose deciding roles are incomplete is downgraded to
 * INDETERMINATE naming the missing roles; a materially proven INVALID is never masked. A validity
 * attestation is minted only from the resulting fresh VALID decision and only while it covers the
 * requested instant; a timestamp, cache, or event can never become the guarantee.
 */
export const assembleCatalogSelectionEvidence = (
  input: CatalogSelectionEvidenceAssemblyInput,
): CatalogSelectionEvidenceAssembly => {
  const { current, injectedOwnerEvidence, purpose, requestedAt, selection, validUntil } = input;
  const assessed = assessCatalogSelection({ assessedAt: current.assessedAt, current, purpose, selection });
  const minimalisation = selectSmallestCompleteCatalogSelectionBasis({ basis: assessed.basis, purpose, selection });

  let evidence: CatalogSelectionEvidence = assessed;
  if (minimalisation.status === 'COMPLETE') {
    evidence = { ...assessed, basis: minimalisation.basis };
  } else if (assessed.status === 'VALID') {
    evidence = {
      assessedAt: assessed.assessedAt,
      basis: assessed.basis,
      purpose,
      reason: `Smallest complete Catalog basis is missing deciding roles: ${minimalisation.missingRoles.join(', ')}`,
      selection,
      status: 'INDETERMINATE',
    };
  }

  const ownerEvidence =
    injectedOwnerEvidence === undefined
      ? undefined
      : catalogSelectionInjectedOwnerEvidenceResult(
          { owner: injectedOwnerEvidence.owner, purpose, selection },
          injectedOwnerEvidence,
        );

  const minted =
    evidence.status === 'VALID' ? catalogSelectionValidityAttestationFor({ evidence, purpose, validUntil }) : undefined;
  const at = requestedAt ?? current.assessedAt;
  const validity =
    minted !== undefined && catalogSelectionValidityCovers(minted, { at, purpose, selection }) ? minted : undefined;

  const assembly: CatalogSelectionEvidenceAssemblyDraft = {
    evidence,
    missingRoles: minimalisation.status === 'INCOMPLETE' ? minimalisation.missingRoles : [],
  };
  if (ownerEvidence !== undefined) {
    assembly.ownerEvidence = ownerEvidence;
  }
  if (validity !== undefined) {
    assembly.validity = validity;
  }
  return assembly;
};

/**
 * The one Catalog entry point for issuing selection evidence. It composes the owner Current read,
 * the pure assessment, and the purpose minimalisation; it reads no foreign owner and treats no
 * cache, event, or timestamp as validity. An unavailable owner read is a typed operational
 * outcome, never a reused earlier VALID.
 */
export const catalogSelectionEvidenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  injectedOwnerEvidence?: CatalogSelectionInjectedOwnerEvidence,
) => ({
  assess: Effect.fn('CatalogSelectionEvidence.assess')(function* assess(
    input: CatalogSelectionEvidenceRequest,
  ): Effect.fn.Return<CatalogSelectionEvidenceServiceResult> {
    const { at, purpose, selection, validUntil } = input;
    return yield* catalogSelectionCurrentBasisForScope(transaction, scope)
      .read({ purpose, selection })
      .pipe(
        Effect.map((current) =>
          assembleCatalogSelectionEvidence({
            current,
            injectedOwnerEvidence,
            purpose,
            requestedAt: at,
            selection,
            validUntil,
          }),
        ),
        Effect.catchTag('CatalogPersistenceUnavailable', () =>
          Effect.succeed(unavailableAssembly('Catalog Current basis is temporarily unavailable')),
        ),
      );
  }),
});
