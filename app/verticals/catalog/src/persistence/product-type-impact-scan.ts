import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ProductTypeImpactRule } from '../../shared/domain/product-type-impact.ts';
import { previewProductTypeImpact } from '../../shared/domain/product-type-impact.ts';
import {
  attributeValueSets,
  productTypeAssignments,
  productTypeRevisions,
  productTypes,
  productVariantAxes,
  productVariants,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class ProductTypeImpactScanIncomplete extends Schema.TaggedError<ProductTypeImpactScanIncomplete>()(
  'ProductTypeImpactScanIncomplete',
  { code: Schema.Literal('product_type_impact_scan_incomplete'), reason: Schema.String },
) {}

export interface OpenSelectionBasis {
  /** Issued by #479's owner-side Current selection reader, never by a browser payload. */
  readonly complete: true;
  readonly refs: readonly { readonly productId: string; readonly selectionId: string; readonly variantId: string }[];
  readonly revisionToken: string;
}

export interface ProductTypeImpactEvidence {
  readonly assignmentRevision: number;
  readonly axisRevisions: readonly { readonly attributeDefinitionId: string; readonly revision: number }[];
  readonly productId: string;
  readonly productRevision: number;
  readonly valueSetRevisions: readonly {
    readonly attributeDefinitionId: string;
    readonly revision: number;
    readonly state: string;
    readonly variantId: string | null;
  }[];
  readonly variantRevisions: readonly { readonly revision: number; readonly variantId: string }[];
}

export interface ProductTypeImpactSnapshot {
  readonly candidateRules: readonly ProductTypeImpactRule[] | null;
  readonly evidence: readonly ProductTypeImpactEvidence[];
  readonly openSelectionRefs: OpenSelectionBasis['refs'];
  readonly preview: ReturnType<typeof previewProductTypeImpact>;
  readonly productTypeId: string;
  readonly sourceRevision: number;
  readonly sourceRevisionId: string;
  readonly token: string;
}

const incomplete = (reason: string) =>
  new ProductTypeImpactScanIncomplete({ code: 'product_type_impact_scan_incomplete', reason });
const unavailable = (cause: unknown) => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};
const byId = (left: string, right: string) => left.localeCompare(right, 'en');
const append = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
};
const allowedIds = (rules: readonly ProductTypeImpactRule[] | null, level: ProductTypeImpactRule['level']) => {
  const ids = new Set<string>();
  for (const rule of rules ?? []) {
    if (rule.level === level) {
      ids.add(rule.attributeDefinitionId);
    }
  }
  return ids;
};
const variantValuesFor = (
  sets: readonly (typeof attributeValueSets.$inferSelect)[],
  productValues: readonly { readonly attributeDefinitionId: string; readonly valid: boolean }[],
  validity: ReadonlyMap<string, boolean>,
  productAllowed: ReadonlySet<string>,
  variantAllowed: ReadonlySet<string>,
) => {
  const values = [];
  for (const set of sets) {
    if (set.currentState === 'SET') {
      values.push({
        attributeDefinitionId: set.attributeDefinitionId,
        valid: validity.get(set.attributeValueSetId) === true,
      });
    }
  }
  const directIds = new Set(values.map((value) => value.attributeDefinitionId));
  for (const value of productValues) {
    if (
      productAllowed.has(value.attributeDefinitionId) &&
      variantAllowed.has(value.attributeDefinitionId) &&
      !directIds.has(value.attributeDefinitionId)
    ) {
      values.push(value);
    }
  }
  return values;
};

const assemblePopulation = (rows: {
  readonly assignments: readonly (typeof productTypeAssignments.$inferSelect)[];
  readonly axes: readonly (typeof productVariantAxes.$inferSelect)[];
  readonly candidateRules: readonly ProductTypeImpactRule[] | null;
  readonly products: readonly (typeof products.$inferSelect)[];
  readonly sets: readonly (typeof attributeValueSets.$inferSelect)[];
  readonly validity: ReadonlyMap<string, boolean>;
  readonly variants: readonly (typeof productVariants.$inferSelect)[];
}) => {
  const assignmentByProduct = new Map(rows.assignments.map((row) => [row.productId, row]));
  const axesByProduct = new Map<string, (typeof productVariantAxes.$inferSelect)[]>();
  const variantsByProduct = new Map<string, (typeof productVariants.$inferSelect)[]>();
  const setsByProduct = new Map<string, (typeof attributeValueSets.$inferSelect)[]>();
  const setsByVariant = new Map<string, (typeof attributeValueSets.$inferSelect)[]>();
  for (const axis of rows.axes) {
    append(axesByProduct, axis.productId, axis);
  }
  for (const variant of rows.variants) {
    append(variantsByProduct, variant.productId, variant);
  }
  for (const set of rows.sets) {
    append(setsByProduct, set.productId, set);
    if (set.variantId !== null) {
      append(setsByVariant, set.variantId, set);
    }
  }
  const evidence: ProductTypeImpactEvidence[] = [];
  const population = [];
  const productAllowed = allowedIds(rows.candidateRules, 'PRODUCT');
  const variantAllowed = allowedIds(rows.candidateRules, 'VARIANT');
  for (const product of rows.products.toSorted((a, b) => byId(a.productId, b.productId))) {
    const { productId } = product;
    const productAxes = axesByProduct.get(productId) ?? [];
    const productVariantRows = variantsByProduct.get(productId) ?? [];
    const productSets = setsByProduct.get(productId) ?? [];
    evidence.push({
      assignmentRevision: assignmentByProduct.get(productId)?.assignmentRevision ?? 0,
      axisRevisions: productAxes
        .map((axis) => ({ attributeDefinitionId: axis.attributeDefinitionId, revision: axis.axisRevision }))
        .toSorted((a, b) => byId(a.attributeDefinitionId, b.attributeDefinitionId)),
      productId,
      productRevision: product.currentRevision,
      valueSetRevisions: productSets
        .map((set) => ({
          attributeDefinitionId: set.attributeDefinitionId,
          revision: set.currentRevision,
          state: set.currentState,
          variantId: set.variantId,
        }))
        .toSorted((a, b) =>
          byId(`${a.variantId ?? ''}:${a.attributeDefinitionId}`, `${b.variantId ?? ''}:${b.attributeDefinitionId}`),
        ),
      variantRevisions: productVariantRows
        .map((variant) => ({ revision: variant.currentRevision, variantId: variant.variantId }))
        .toSorted((a, b) => byId(a.variantId, b.variantId)),
    });
    const values = [];
    for (const set of productSets) {
      if (set.variantId === null && set.currentState === 'SET') {
        values.push({
          attributeDefinitionId: set.attributeDefinitionId,
          valid: rows.validity.get(set.attributeValueSetId) === true,
        });
      }
    }
    const variantImpacts = [];
    for (const variant of productVariantRows) {
      variantImpacts.push({
        values: variantValuesFor(
          setsByVariant.get(variant.variantId) ?? [],
          values,
          rows.validity,
          productAllowed,
          variantAllowed,
        ),
        variantId: variant.variantId,
      });
    }
    population.push({
      productId,
      values,
      variantAxes: productAxes.map((axis) => axis.attributeDefinitionId),
      variants: variantImpacts,
    });
  }
  return { evidence, population };
};

/** Token binds the complete source population, candidate and #479 evidence, not just the Type revision. */
export const productTypeImpactRevisionToken = (
  input: Omit<ProductTypeImpactSnapshot, 'token'> & {
    readonly selectionRevisionToken: string;
  },
): string => {
  const hash = createHash('sha256');
  const write = (value: string) => {
    hash.update(`${Buffer.byteLength(value)}:`).update(value);
  };
  write('product-type-impact-v1');
  write(input.productTypeId);
  write(String(input.sourceRevision));
  write(input.sourceRevisionId);
  write(input.candidateRules === null ? 'REMOVED' : 'RULES');
  for (const rule of (input.candidateRules ?? []).toSorted((a, b) =>
    byId(`${a.level}:${a.attributeDefinitionId}`, `${b.level}:${b.attributeDefinitionId}`),
  )) {
    write(rule.level);
    write(rule.attributeDefinitionId);
    write(String(rule.required));
  }
  write(`evidence:${input.evidence.length}`);
  for (const row of input.evidence.toSorted((a, b) => byId(a.productId, b.productId))) {
    write(row.productId);
    write(String(row.productRevision));
    write(String(row.assignmentRevision));
    write(`axes:${row.axisRevisions.length}`);
    for (const axis of row.axisRevisions.toSorted((a, b) => byId(a.attributeDefinitionId, b.attributeDefinitionId))) {
      write(axis.attributeDefinitionId);
      write(String(axis.revision));
    }
    write(`sets:${row.valueSetRevisions.length}`);
    for (const set of row.valueSetRevisions.toSorted((a, b) =>
      byId(`${a.variantId ?? ''}:${a.attributeDefinitionId}`, `${b.variantId ?? ''}:${b.attributeDefinitionId}`),
    )) {
      write(set.variantId ?? 'PRODUCT');
      write(set.attributeDefinitionId);
      write(String(set.revision));
      write(set.state);
    }
    write(`variants:${row.variantRevisions.length}`);
    for (const variant of row.variantRevisions.toSorted((a, b) => byId(a.variantId, b.variantId))) {
      write(variant.variantId);
      write(String(variant.revision));
    }
  }
  write(`selections:${input.openSelectionRefs.length}`);
  for (const ref of input.openSelectionRefs.toSorted((a, b) => byId(a.selectionId, b.selectionId))) {
    write(ref.selectionId);
    write(ref.productId);
    write(ref.variantId);
  }
  write(`subjects:${input.preview.subjects.length}`);
  for (const subject of input.preview.subjects.toSorted((a, b) =>
    byId(`${a.productId}:${a.variantId ?? ''}`, `${b.productId}:${b.variantId ?? ''}`),
  )) {
    write(subject.productId);
    write(subject.variantId ?? 'PRODUCT');
    for (const field of [
      subject.missingRequired,
      subject.disallowedCurrentValues,
      subject.invalidCurrentValues,
      subject.affectedVariantAxes,
    ]) {
      write(`items:${field.length}`);
      for (const item of field.toSorted(byId)) {
        write(item);
      }
    }
  }
  write(input.selectionRevisionToken);
  return hash.digest('hex');
};

/** Owner-local scan. A missing #479 reader or unknown value validity cannot authorize revision. */
export const productTypeImpactScanForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  authoritativeBasis: {
    /** Must be read inside this same Core-owned transaction; absent until #479 provides a reader. */
    readonly openSelections?: OpenSelectionBasis;
    readonly valueSetValidity?: ReadonlyMap<string, boolean>;
  } = {},
) => ({
  scan: Effect.fn('ProductTypeImpactScan.scan')(function* scan(input: {
    readonly candidateRules: readonly ProductTypeImpactRule[] | null;
    readonly expectedCurrentRevision: number;
    readonly productTypeId: string;
  }) {
    if (authoritativeBasis.openSelections === undefined || authoritativeBasis.valueSetValidity === undefined) {
      return yield* incomplete('Authoritative value and open-selection readers are required');
    }
    const { tenantId } = scope;
    const [type] = yield* transaction
      .select({ revision: productTypes.currentRevision })
      .from(productTypes)
      .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, input.productTypeId)))
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (type === undefined || type.revision !== input.expectedCurrentRevision) {
      return yield* incomplete('Product Type Current revision is absent or changed');
    }
    const [revision] = yield* transaction
      .select({ id: productTypeRevisions.productTypeRevisionId })
      .from(productTypeRevisions)
      .where(
        and(
          eq(productTypeRevisions.tenantId, tenantId),
          eq(productTypeRevisions.productTypeId, input.productTypeId),
          eq(productTypeRevisions.revision, type.revision),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (revision === undefined) {
      return yield* incomplete('Current Product Type revision evidence is absent');
    }
    const assignments = yield* transaction
      .select()
      .from(productTypeAssignments)
      .where(
        and(
          eq(productTypeAssignments.tenantId, tenantId),
          eq(productTypeAssignments.productTypeId, input.productTypeId),
        ),
      )
      .pipe(Effect.mapError(unavailable));
    const ids = assignments.map((row) => row.productId).toSorted(byId);
    const productRows =
      ids.length === 0
        ? []
        : yield* transaction
            .select()
            .from(products)
            .where(and(eq(products.tenantId, tenantId), inArray(products.productId, ids)))
            .pipe(Effect.mapError(unavailable));
    if (productRows.length !== ids.length) {
      return yield* incomplete('Assigned Product population is inconsistent');
    }
    const variants =
      ids.length === 0
        ? []
        : yield* transaction
            .select()
            .from(productVariants)
            .where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.productId, ids)))
            .pipe(Effect.mapError(unavailable));
    const axes =
      ids.length === 0
        ? []
        : yield* transaction
            .select()
            .from(productVariantAxes)
            .where(and(eq(productVariantAxes.tenantId, tenantId), inArray(productVariantAxes.productId, ids)))
            .pipe(Effect.mapError(unavailable));
    const sets =
      ids.length === 0
        ? []
        : yield* transaction
            .select()
            .from(attributeValueSets)
            .where(and(eq(attributeValueSets.tenantId, tenantId), inArray(attributeValueSets.productId, ids)))
            .pipe(Effect.mapError(unavailable));
    const validity = authoritativeBasis.valueSetValidity;
    if (sets.some((set) => set.currentState === 'SET' && !validity.has(set.attributeValueSetId))) {
      return yield* incomplete('Current Attribute Value validity is unknown');
    }
    const selections = authoritativeBasis.openSelections;
    if (!selections.complete || selections.revisionToken.length === 0) {
      return yield* incomplete('Open Catalog Selection population is unknown');
    }
    const idSet = new Set(ids);
    if (selections.refs.some((ref) => !idSet.has(ref.productId))) {
      return yield* incomplete('Open Catalog Selection basis contains an unrelated Product');
    }
    const { evidence, population } = assemblePopulation({
      assignments,
      axes,
      candidateRules: input.candidateRules,
      products: productRows,
      sets,
      validity,
      variants,
    });
    const openSelectionRefs = selections.refs.toSorted((a, b) => byId(a.selectionId, b.selectionId));
    const base = {
      candidateRules: input.candidateRules,
      evidence,
      openSelectionRefs,
      preview: previewProductTypeImpact(population, input.candidateRules),
      productTypeId: input.productTypeId,
      sourceRevision: type.revision,
      sourceRevisionId: revision.id,
    };
    return {
      ...base,
      token: productTypeImpactRevisionToken({ ...base, selectionRevisionToken: selections.revisionToken }),
    } satisfies ProductTypeImpactSnapshot;
  }),
});
