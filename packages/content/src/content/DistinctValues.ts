/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, distinct, finalize, from, map, mergeAll, mergeMap } from "rxjs";
import {
  createIModelInstanceLabelSelectClauseFactory,
  eachValueFrom,
  ECSql,
  getClass,
  parseInstanceLabel,
} from "@itwin/presentation-shared";
import { mergeBindings, stableStringify } from "./InternalUtils.js";
import { buildTargetScopedQuery, classifyRelationshipClasses, resolveFieldSelector } from "./query/BaseQuery.js";
import { QUERY_CONCURRENCY } from "./query/QueryConcurrency.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  EC,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
  IInstanceLabelSelectClauseFactory,
  NavigationValue,
  Value,
} from "@itwin/presentation-shared";
import type { ContentValueFilter } from "./Content.js";
import type { ContentTarget, InstanceFilterExpression } from "./ContentTarget.js";
import type { CalculatedField, PropertyField } from "./model/Field.js";
import type { PrimaryClassScope } from "./query/BaseQuery.js";

/**
 * Alias assigned to the class joined to resolve a navigation value's target instance. Carries no
 * `ECSQL_PREFIX`, so it can never collide with the prefixed aliases `buildTargetScopedQuery` assigns
 * to relationship-path steps.
 */
const NAVIGATION_TARGET_ALIAS = "navTarget";

/**
 * Alias assigned to the inner distinct-ids derived table a navigation field's query wraps (see
 * `buildNavigationValuesQuery`). Carries no `ECSQL_PREFIX` for the same reason as
 * {@link NAVIGATION_TARGET_ALIAS}.
 */
const NAVIGATION_IDS_ALIAS = "navIds";

/**
 * Props for `getDistinctFieldValues`.
 *
 * @public
 */
interface GetDistinctFieldValuesProps {
  /**
   * Access to the iModel for running ECSQL queries and accessing schema metadata.
   */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;

  /**
   * The field to get distinct values for. Its `primaryClassNames` — the concrete class(es) the field
   * was resolved to have access from — determine what gets queried. They are grouped into the fewest
   * queries possible: classes sharing a base class the field stays resolvable from collapse into one
   * query against that base, restricted back to exactly those classes. Results across groups are
   * merged and de-duplicated. There is no separate content-target argument; the field alone
   * determines what gets queried.
   */
  field: PropertyField | CalculatedField;

  /**
   * Optional filters (restricts which rows contribute distinct values). A filter must apply to every
   * one of `field.primaryClassNames`, so its field must be resolvable from the base class(es) those
   * collapse to — otherwise this throws.
   */
  filters?: ContentValueFilter[];

  /**
   * Optional further scoping of which instances contribute values, applied uniformly across every
   * class in `field.primaryClassNames`.
   *
   * Note: this does *not* automatically track whatever `instanceIds`/`instanceFilter` scoping was
   * used to build the descriptor `field` came from — if the descriptor was scoped to specific
   * instances, the same scoping must be supplied here explicitly, or this call will consider every
   * instance of `field.primaryClassNames`, not just the ones the descriptor was built from.
   */
  instanceFiltering?: {
    /** Instance IDs to scope to. When omitted, all instances of each queried class are considered. */
    ids?: Id64String[];
    /** An ECSQL filter predicate to further restrict which instances are in scope. */
    filter?: InstanceFilterExpression;
  };

  /**
   * Used to select labels for navigation fields' target instances. Ignored for non-navigation fields.
   * Defaults to `createIModelInstanceLabelSelectClauseFactory({ imodelAccess })`.
   */
  labelsFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Builds a single `SELECT DISTINCT <field selector>` query for `getDistinctFieldValues`.
 *
 * Scoping to exactly the field's resolved classes is the caller's job, expressed via
 * `primaryClassScope` (see `buildTargetScopedQuery`).
 */
export async function buildDistinctValuesQuery(props: {
  schemaProvider: ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
  labelsFactory: IInstanceLabelSelectClauseFactory;
  primaryClassScope: PrimaryClassScope;
}): Promise<ECSqlQueryDef> {
  const { schemaProvider, target, field, primaryClassScope } = props;
  const filters = props.filters ?? [];

  if (field.type.kind === "array" || field.type.kind === "struct") {
    throw new Error(`Getting distinct values for ${field.type.kind} fields is not supported.`);
  }

  const navigationTargetClassName = field.type.kind === "navigation" ? field.type.targetClassName : undefined;
  const fieldPath = field.kind === "property" ? field.pathFromTarget : undefined;
  const parts = await buildTargetScopedQuery({
    schemaProvider,
    target,
    paths: fieldPath ? [fieldPath] : [],
    filters,
    primaryClassScope,
  });

  const relationshipPropertyClasses =
    field.kind === "property" && field.pathFromTarget.length > 0
      ? await classifyRelationshipClasses(schemaProvider, [field.propertyClassName])
      : new Set<EC.FullClassNameDotNotation>();

  const resolved = resolveFieldSelector({
    field,
    relatedClassAliases: parts.relatedClassAliases,
    isRelationshipClass: (className) => relationshipPropertyClasses.has(className),
  });

  const bindings: Record<string, ECSqlBinding> = { ...parts.bindings };
  mergeBindings(bindings, resolved.bindings);

  const innerSelector = navigationTargetClassName ? `${resolved.selector}.[Id] AS [id]` : resolved.selector;
  const innerEcsql = `SELECT DISTINCT ${innerSelector} ${parts.from} ${parts.joins}${parts.where ? ` ${parts.where}` : ""}`;

  if (!navigationTargetClassName) {
    return { ecsql: innerEcsql, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
  }

  const ecsql = await buildNavigationValuesQuery({
    innerEcsql,
    targetClassName: navigationTargetClassName,
    labelsFactory: props.labelsFactory,
  });
  return { ecsql, ...(Object.keys(bindings).length > 0 ? { bindings } : undefined) };
}

/**
 * Wraps `innerEcsql` (a `SELECT DISTINCT <id> AS [id] ...` query) as a derived table and left-joins its
 * distinct ids to the navigation target class — polymorphically (no `ONLY`), so a subclass instance
 * resolves, and outer, so an id with no matching instance (e.g. a dangling reference) still contributes
 * its row rather than being silently dropped; `rowValueToNavigationValue` then surfaces such a row the
 * same way as a `NULL` navigation value — as `undefined` — since `ec_classname` comes back `NULL` too.
 */
async function buildNavigationValuesQuery(props: {
  innerEcsql: string;
  targetClassName: EC.FullClassNameDotNotation;
  labelsFactory: IInstanceLabelSelectClauseFactory;
}): Promise<string> {
  const labelSelector = await props.labelsFactory.createSelectClause({
    classAlias: NAVIGATION_TARGET_ALIAS,
    className: props.targetClassName,
  });
  return `
    SELECT [${NAVIGATION_IDS_ALIAS}].[id], ec_classname([${NAVIGATION_TARGET_ALIAS}].[ECClassId], 's.c'), ${labelSelector}
    FROM (${props.innerEcsql}) [${NAVIGATION_IDS_ALIAS}]
    LEFT JOIN ${ECSql.createClassSelector(props.targetClassName)} [${NAVIGATION_TARGET_ALIAS}] ON [${NAVIGATION_TARGET_ALIAS}].[ECInstanceId] = [${NAVIGATION_IDS_ALIAS}].[id]
  `;
}

/**
 * Converts a query row's raw column value to the public `Value` shape. The only case needing
 * conversion is a whole point column, which the query reader returns with uppercase coordinate
 * members (`{ X, Y[, Z] }`) — the public `Point2dValue` / `Point3dValue` shapes use lowercase.
 *
 * Only property fields are considered: a calculated field's declared type doesn't constrain its row
 * shape (its selector is an arbitrary scalar expression), so keying the conversion off a declared
 * point type there would turn a scalar row value into `{ x: undefined, y: undefined }`.
 */
function rowValueToValue(field: PropertyField | CalculatedField, raw: unknown): Value {
  if (
    raw !== undefined &&
    field.kind === "property" &&
    field.type.kind === "primitive" &&
    (field.type.type === "Point2d" || field.type.type === "Point3d")
  ) {
    const coords = raw as Record<string, number>;
    return field.type.type === "Point3d" ? { x: coords.X, y: coords.Y, z: coords.Z } : { x: coords.X, y: coords.Y };
  }
  return raw as Value;
}

/**
 * Converts a navigation field's query row to a `DistinctNavigationValue`. A SQL-NULL navigation value
 * carries no target instance, so it's yielded as `undefined` — the same plain `Value` any other field
 * yields for a NULL.
 */
function rowValueToNavigationValue(props: { row: ECSqlQueryRow }): Value | undefined {
  const { row } = props;
  const id = row[0] as Id64String | undefined;
  const className = row[1] as EC.FullClassNameDotNotation | undefined;
  if (id === undefined || className === undefined) {
    return undefined;
  }
  return { key: { className, id }, label: parseInstanceLabel(row[2] as string | undefined) };
}

/**
 * Streams a single content target's `SELECT DISTINCT` results, releasing the
 * underlying query reader when the returned observable is unsubscribed (including on early consumer
 * cancellation).
 */
function streamTargetDistinctValues(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  target: ContentTarget;
  field: PropertyField | CalculatedField;
  filters?: ContentValueFilter[];
  labelsFactory: IInstanceLabelSelectClauseFactory;
  primaryClassScope: PrimaryClassScope;
}): Observable<Value> {
  const { imodelAccess, target, field, filters, labelsFactory, primaryClassScope } = props;
  const isNavigationField = field.type.kind === "navigation";
  return from(
    buildDistinctValuesQuery({
      schemaProvider: imodelAccess,
      target,
      field,
      filters,
      labelsFactory,
      primaryClassScope,
    }),
  ).pipe(
    mergeMap((query) => {
      const reader = imodelAccess.createQueryReader(query, { rowFormat: "Indexes" });
      // Calling `return()` on the iterator cancels the query execution on the backend and frees up resources.
      return from(reader).pipe(finalize(() => void reader.return?.(undefined)));
    }),
    map((row): Value => (isNavigationField ? rowValueToNavigationValue({ row }) : rowValueToValue(field, row[0]))),
  );
}

/**
 * The class(es) that must resolve `field`'s own column — i.e. the classes a query's `FROM`
 * class must be, or derive from, for the field to be addressable at all:
 * - a direct property field's anchor is its declaring class (`propertyClassName`);
 * - a related property field's anchor is its relationship path's first-step source class — the
 *   primary-side class the path is declared from, not the (possibly narrower, data-resolved) classes
 *   in `primaryClassNames`;
 * - a calculated field has no declaring class, so its whole `primaryClassNames` list stands in as
 *   the anchor set (a query class must derive from *any* one of them).
 */
function getFieldAnchors(field: PropertyField | CalculatedField): EC.FullClassNameDotNotation[] {
  if (field.kind === "calculated") {
    return field.primaryClassNames;
  }
  return [field.pathFromTarget.length > 0 ? field.pathFromTarget[0].sourceClassName : field.propertyClassName];
}

/** A short, human-readable identifier for a field, used in error messages. */
function describeField(field: PropertyField | CalculatedField): string {
  return field.kind === "calculated"
    ? `calculated field "${field.id}"`
    : `property "${field.propertyClassName}.${field.propertyName}"`;
}

/** Whether `derivedClassName` is, or derives from, at least one of `candidateBaseClassNames`. */
async function classDerivesFromAny(
  schemaProvider: ECSchemaProvider,
  derivedClassName: EC.FullClassNameDotNotation,
  candidateBaseClassNames: EC.FullClassNameDotNotation[],
): Promise<boolean> {
  for (const candidate of candidateBaseClassNames) {
    if (await schemaProvider.classDerivesFrom(derivedClassName, candidate)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates that every filter in `filters` can be evaluated by every query that will run — each
 * query's `FROM` class must be, or derive from, at least one of the filter field's own anchor classes
 * (see `getFieldAnchors`).
 *
 * A filter is meant to narrow *all* of the selected field's primary classes uniformly. Each anchor is
 * a class those primary classes share, so a filter that does not resolve from an anchor does not
 * apply to all of the classes behind it — filtering on a subclass-declared property while selecting a
 * base-declared one, say. Rejecting that here, before any query runs, turns what would otherwise be
 * an opaque backend "no such property" ECSQL error into a clear one.
 *
 * @throws if a filter's field cannot be evaluated from one of `anchorClassNames`.
 */
export async function validateFilterApplicability(props: {
  schemaProvider: ECSchemaProvider;
  anchorClassNames: EC.FullClassNameDotNotation[];
  filters: ContentValueFilter[];
}): Promise<void> {
  const { schemaProvider, anchorClassNames, filters } = props;
  for (const filter of filters) {
    const filterAnchors = getFieldAnchors(filter.field);
    for (const anchorClassName of anchorClassNames) {
      if (!(await classDerivesFromAny(schemaProvider, anchorClassName, filterAnchors))) {
        throw new Error(
          `Cannot apply filter on ${describeField(filter.field)}: it is not accessible from "${anchorClassName}", which the selected field's values are queried from.`,
        );
      }
    }
  }
}

/**
 * One distinct-values query: the class to put in `FROM`, and how rows are kept scoped to exactly the
 * resolved classes it stands in for.
 */
interface DistinctValuesQueryAnchor {
  /** The class to put in `FROM`. */
  anchorClassName: EC.FullClassNameDotNotation;
  scope: PrimaryClassScope;
}

/**
 * One group forming during `resolveQueryAnchors`: the resolved classes assigned to it so far, and
 * `path` — the ancestors, from its *current* anchor upward to the field's accessibility limit, that
 * every one of `classNames` is proven to derive from. `path[0]` is the anchor itself.
 */
interface QueryAnchorGroup {
  classNames: EC.FullClassNameDotNotation[];
  path: EC.FullClassNameDotNotation[];
}

/**
 * Splits `field.primaryClassNames` into the fewest groups that can each be served by a single query,
 * and picks the `FROM` class for each. Filters play no part here — they are checked against the
 * resulting anchors afterwards, by `validateFilterApplicability`.
 *
 * A **calculated field** short-circuits all of this: it has no declaring class, so it is resolved for
 * `primaryClassNames` as a set and its expression is only known to be valid against those exact
 * classes. There is nothing to look up and nothing to collapse — each resolved class simply gets its
 * own exactly-scoped query, without touching the schema provider at all.
 *
 * Otherwise, builds each resolved class's accessible ancestor path (see `buildAccessiblePath`), then
 * folds the paths together: a class joins the first existing group whose path its own path meets, and
 * both are trimmed to start at that meeting point; a class meeting no group starts one of its own.
 * Because every path runs from its class up to the field's accessibility limit, two paths that meet at
 * all are identical from the meeting point upward — so a group's path stays a single chain, and
 * trimming it can only move the anchor *up* (to something less specific) as more classes join.
 *
 * That also makes "first group that matches" the optimal choice rather than merely a convenient one:
 * group paths are pairwise disjoint (a path only becomes a new group when it met none of the existing
 * ones), so a path can never meet two groups and there is no better grouping to miss.
 *
 * @throws if a resolved class cannot resolve the field's own column even from itself — no ancestor
 * could help, so this reports it here rather than letting the backend fail with an opaque
 * "no such property" ECSQL error.
 */
async function resolveQueryAnchors(props: {
  schemaProvider: ECSchemaProvider;
  field: PropertyField | CalculatedField;
}): Promise<DistinctValuesQueryAnchor[]> {
  const { schemaProvider, field } = props;
  if (field.kind === "calculated") {
    return field.primaryClassNames.map((anchorClassName) => ({ anchorClassName, scope: { kind: "exact" } }));
  }

  const anchors = getFieldAnchors(field);
  const paths = await Promise.all(
    field.primaryClassNames.map(async (className) => buildAccessiblePath(schemaProvider, className, anchors)),
  );

  const groups: QueryAnchorGroup[] = [];
  paths.forEach((path, index) => {
    const className = field.primaryClassNames[index];
    if (path.length === 0) {
      throw new Error(
        `Cannot get distinct values for ${describeField(field)}: it is not accessible from "${className}", one of the classes it was resolved for.`,
      );
    }
    const existingGroup = groups.find((group) => path.some((name) => group.path.includes(name)));
    if (!existingGroup) {
      groups.push({ classNames: [className], path });
      return;
    }
    const meetingPoint = path.find((name) => existingGroup.path.includes(name))!;
    existingGroup.path = existingGroup.path.slice(existingGroup.path.indexOf(meetingPoint));
    existingGroup.classNames.push(className);
  });

  return groups.map(({ classNames, path }) => ({
    anchorClassName: path[0],
    scope: classNames.length === 1 ? { kind: "exact" } : { kind: "restricted", classNames },
  }));
}

/**
 * `className` and its ancestors, nearest first, stopping as soon as one no longer reaches `anchors` —
 * i.e. the classes that are legal `FROM` candidates for `className`. Empty when not even `className`
 * itself reaches one.
 *
 * Accessibility is asked of the schema provider rather than read off the `baseClass` chain, because a
 * mixin-declared anchor never appears among its implementers' base classes. It is monotonic going up:
 * if a class does not reach an anchor, no ancestor of it can either — an ancestor that did would have
 * passed that reach down. So the first failure ends the walk.
 */
async function buildAccessiblePath(
  schemaProvider: ECSchemaProvider,
  className: EC.FullClassNameDotNotation,
  anchors: EC.FullClassNameDotNotation[],
): Promise<EC.FullClassNameDotNotation[]> {
  const path: EC.FullClassNameDotNotation[] = [];
  let current: EC.Class | undefined = await getClass(schemaProvider, className);
  while (current && (await classDerivesFromAny(schemaProvider, current.fullName, anchors))) {
    path.push(current.fullName);
    current = current.baseClass;
  }
  return path;
}

/**
 * Gets distinct raw values for a single field, scoped to exactly the class(es) it was resolved to
 * have access from (`field.primaryClassNames`).
 *
 * The field itself carries the join path from a queried class to the property (for a related
 * property field), so resolved content sources — and a caller-supplied content target — are not
 * needed: this builds and executes `SELECT DISTINCT <field selector>` directly from the field's own
 * metadata.
 *
 * The resolved classes are grouped into the fewest queries that can serve them: classes sharing a
 * base class the field stays resolvable from are queried together against that base, with an
 * `ECClassId IS (...)` predicate keeping rows restricted to exactly them (so a sibling a `forkField`
 * carve or instance scoping excluded can't reappear). Classes with no such shared base get a query of
 * their own. Results are merged and de-duplicated.
 *
 * Every filter in `filters` is then validated against the classes those queries run from — before any
 * of them executes — and an inapplicable one throws.
 *
 * @public
 */
export function getDistinctFieldValues(props: GetDistinctFieldValuesProps): AsyncIterable<Value> {
  const { imodelAccess, field, filters, instanceFiltering } = props;
  const labelsFactory = props.labelsFactory ?? createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
  const isNavigation = field.type.kind === "navigation";
  const makeTarget = (primaryClass: EC.FullClassNameDotNotation): ContentTarget => ({
    primaryClass,
    ...(instanceFiltering?.ids ? { instanceIds: instanceFiltering.ids } : undefined),
    ...(instanceFiltering?.filter ? { instanceFilter: instanceFiltering.filter } : undefined),
  });
  return {
    [Symbol.asyncIterator]: (): AsyncIterableIterator<Value> => {
      const values = defer(async () => {
        const anchors = await resolveQueryAnchors({ schemaProvider: imodelAccess, field });
        await validateFilterApplicability({
          schemaProvider: imodelAccess,
          anchorClassNames: anchors.map((anchor) => anchor.anchorClassName),
          filters: filters ?? [],
        });
        return anchors;
      }).pipe(
        mergeAll(),
        mergeMap(
          (anchor) =>
            streamTargetDistinctValues({
              imodelAccess,
              target: makeTarget(anchor.anchorClassName),
              field,
              filters,
              labelsFactory,
              primaryClassScope: anchor.scope,
            }),
          QUERY_CONCURRENCY,
        ),
        distinct((value): string | undefined => {
          if (value === undefined) {
            return undefined;
          }
          return isNavigation ? (value as NavigationValue).key.id : stableStringify(value);
        }),
      );
      return eachValueFrom(values);
    },
  };
}
