/** Product category facts are independent of navigation, pricing, and saleability. */
export interface CategoryKey {
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface DirectCategoryAssignment {
  readonly categoryRef: CategoryKey;
  readonly productRef: CategoryKey;
}

export interface CategoryParent {
  readonly categoryRef: CategoryKey;
  readonly parentRef?: CategoryKey;
}

export interface ClassificationRevision {
  readonly assignments: number;
  readonly hierarchy: number;
}

export interface AncestorClassification {
  readonly ancestorRef: CategoryKey;
  readonly viaDirectCategories: ReadonlyArray<CategoryKey>;
}

export type ClassificationResult =
  | {
      readonly status: 'AVAILABLE';
      readonly revision: ClassificationRevision;
      readonly directCategories: ReadonlyArray<CategoryKey>;
      readonly ancestors: ReadonlyArray<AncestorClassification>;
    }
  | { readonly status: 'UNAVAILABLE' };

export type AssignmentResult =
  | {
      readonly status: 'ADDED' | 'UNCHANGED' | 'REMOVED';
      readonly assignments: ReadonlyArray<DirectCategoryAssignment>;
    }
  | { readonly status: 'TENANT_MISMATCH' };

const keyOf = (ref: CategoryKey): string => `${ref.tenantId}:${ref.resourceId}`;
const sameRef = (left: CategoryKey, right: CategoryKey): boolean =>
  left.tenantId === right.tenantId && left.resourceId === right.resourceId;

/** Adds one explicit link. Neither order nor a primary category is recorded. */
export const addDirectCategory = (
  assignments: ReadonlyArray<DirectCategoryAssignment>,
  productRef: CategoryKey,
  categoryRef: CategoryKey,
): AssignmentResult => {
  if (productRef.tenantId !== categoryRef.tenantId) return { status: 'TENANT_MISMATCH' };
  if (
    assignments.some(
      ({ productRef: owner, categoryRef: category }) => sameRef(owner, productRef) && sameRef(category, categoryRef),
    )
  ) {
    return { assignments, status: 'UNCHANGED' };
  }
  return { assignments: [...assignments, { categoryRef, productRef }], status: 'ADDED' };
};

/** Removes only the named link; a Product can remain unclassified. */
export const removeDirectCategory = (
  assignments: ReadonlyArray<DirectCategoryAssignment>,
  productRef: CategoryKey,
  categoryRef: CategoryKey,
): AssignmentResult => {
  if (productRef.tenantId !== categoryRef.tenantId) return { status: 'TENANT_MISMATCH' };
  const remaining = assignments.filter(
    ({ productRef: owner, categoryRef: category }) => !(sameRef(owner, productRef) && sameRef(category, categoryRef)),
  );
  return { assignments: remaining, status: remaining.length === assignments.length ? 'UNCHANGED' : 'REMOVED' };
};

/** Caller supplies one authoritative revision-paired snapshot; missing data is not an empty set. */
export const deriveClassification = (
  productRef: CategoryKey,
  assignments: ReadonlyArray<DirectCategoryAssignment> | undefined,
  hierarchy: ReadonlyArray<CategoryParent> | undefined,
  revision: ClassificationRevision | undefined,
): ClassificationResult => {
  if (assignments === undefined || hierarchy === undefined || revision === undefined) return { status: 'UNAVAILABLE' };
  const direct = assignments
    .filter(({ productRef: owner }) => sameRef(owner, productRef))
    .map(({ categoryRef }) => categoryRef);
  const parentByCategory = new Map(hierarchy.map(({ categoryRef, parentRef }) => [keyOf(categoryRef), parentRef]));
  if (
    direct.some(
      (categoryRef) => categoryRef.tenantId !== productRef.tenantId || !parentByCategory.has(keyOf(categoryRef)),
    ) ||
    hierarchy.some(
      ({ categoryRef, parentRef }) =>
        categoryRef.tenantId !== productRef.tenantId ||
        (parentRef !== undefined &&
          (parentRef.tenantId !== productRef.tenantId || !parentByCategory.has(keyOf(parentRef)))),
    )
  )
    return { status: 'UNAVAILABLE' };
  const ancestors = new Map<string, { ancestorRef: CategoryKey; viaDirectCategories: CategoryKey[] }>();
  for (const source of direct) {
    const visited = new Set<string>([keyOf(source)]);
    let parent = parentByCategory.get(keyOf(source));
    while (parent !== undefined) {
      const key = keyOf(parent);
      if (visited.has(key)) return { status: 'UNAVAILABLE' };
      visited.add(key);
      const classification = ancestors.get(key);
      if (classification === undefined) ancestors.set(key, { ancestorRef: parent, viaDirectCategories: [source] });
      else if (!classification.viaDirectCategories.some((existing) => sameRef(existing, source)))
        classification.viaDirectCategories.push(source);
      parent = parentByCategory.get(key);
    }
  }
  return { ancestors: [...ancestors.values()], directCategories: direct, revision, status: 'AVAILABLE' };
};

/** A direct rule does not accept merely derived ancestry; a subtree rule can. */
export const matchesCategory = (
  classification: ClassificationResult,
  categoryRef: CategoryKey,
  mode: 'DIRECT' | 'SUBTREE',
): boolean | undefined => {
  if (classification.status === 'UNAVAILABLE') return undefined;
  if (classification.directCategories.some((direct) => sameRef(direct, categoryRef))) return true;
  return mode === 'SUBTREE' && classification.ancestors.some(({ ancestorRef }) => sameRef(ancestorRef, categoryRef));
};
