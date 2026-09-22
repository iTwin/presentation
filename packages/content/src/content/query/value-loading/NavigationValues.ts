/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, finalize, from, map, mergeMap, of, toArray } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { ECSql, parseInstanceLabel } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, getOrCreate } from "../../InternalUtils.js";
import { QUERY_CONCURRENCY } from "../QueryConcurrency.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  EC,
  ECSchemaProvider,
  ECSqlQueryExecutor,
  IInstanceLabelSelectClauseFactory,
  NavigationValue,
  Value,
  ValueDescriptor,
} from "@itwin/presentation-shared";
import type { ContentDefinition } from "../../definition-building/BuildContentDefinition.js";
import type { GroupValues } from "./RowDecoder.js";

/** Alias of the navigation target class a lookup query selects from. */
const TARGET_ALIAS = `${ECSQL_PREFIX}nav_target`;

/** Alias and binding name of the `IdSet` a lookup query restricts its target class by. */
const TARGET_IDS = `${ECSQL_PREFIX}nav_ids`;

/**
 * Replaces the navigation target ids a page's stitched values carry with fully loaded
 * `NavigationValue`s. Mutates the given selector-value maps in place. They are built per page by
 * `stitchPlans` and consumed once, so no caller observes the intermediate id form.
 */
export type NavigationValuePopulator = (rows: ReadonlyArray<GroupValues["selectorValues"]>) => Observable<void>;

/**
 * Builds a page-scoped populator that loads every navigation target a page references and swaps the
 * raw target ids the row decoder produced for `NavigationValue`s carrying the target's actual class
 * and label. Returns `undefined` when no selector carries navigation values, so callers can skip the
 * step entirely.
 *
 * Targets are looked up by the navigation property's declared target class rather than joined into the
 * value queries themselves: a page may reference the same target many times, and an item may carry many
 * navigation properties across several related instances, which would multiply the joins those queries
 * already spend against the SQLite join-table limit.
 *
 * An id with no matching instance (e.g. a dangling reference) resolves to `undefined`, the same way a
 * NULL navigation value does.
 */
export function createNavigationValuePopulator(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  selectors: ContentDefinition["selectors"];
  labelsFactory: IInstanceLabelSelectClauseFactory;
}): NavigationValuePopulator | undefined {
  const { imodelAccess, selectors, labelsFactory } = props;
  const mappers = Object.values(selectors)
    .map((selector) => ({
      selectorId: selector.id,
      mapValue: selector.kind === "property" ? createNavigationValueMapper(selector.type) : undefined,
    }))
    .filter((entry): entry is { selectorId: string; mapValue: NavigationValueMapper } => !!entry.mapValue);
  if (mappers.length === 0) {
    return undefined;
  }

  const loadTargets = createTargetLoader({ imodelAccess, labelsFactory });
  return (rows) =>
    defer(() => {
      const requestedIds = new Map<EC.FullClassNameDotNotation, Set<Id64String>>();
      const collect: MapNavigationValue = ({ id, targetClassName }) => {
        getOrCreate({ map: requestedIds, key: targetClassName, createFunc: () => new Set() }).add(id);
        return undefined;
      };
      for (const row of rows) {
        for (const { selectorId, mapValue } of mappers) {
          for (const value of row.get(selectorId) ?? []) {
            mapValue(value, collect);
          }
        }
      }
      if (requestedIds.size === 0) {
        return of(undefined);
      }
      return loadTargets(requestedIds).pipe(
        map((targets) => {
          const resolve: MapNavigationValue = ({ id, targetClassName }) => targets.get(targetClassName)?.get(id);
          for (const row of rows) {
            for (const { selectorId, mapValue } of mappers) {
              const values = row.get(selectorId);
              if (values) {
                // `map` keeps the array length, so values stay aligned with the path's related instances.
                row.set(
                  selectorId,
                  values.map((value) => mapValue(value, resolve)),
                );
              }
            }
          }
        }),
      );
    });
}

/** Maps one navigation target reference onto the value that should take its place. */
type MapNavigationValue = (props: { id: Id64String; targetClassName: EC.FullClassNameDotNotation }) => Value;

/**
 * Applies `mapTarget` to every navigation target reference within a decoded value, returning the value with
 * the mapped results substituted in place. Struct and array values are copied rather than mutated.
 */
type NavigationValueMapper = (value: Value, mapTarget: MapNavigationValue) => Value;

/**
 * Compiles a {@link NavigationValueMapper} for a value type, or returns `undefined` when the type
 * carries no navigation values anywhere — which doubles as the test for whether a selector needs
 * navigation loading at all. Compiling once per selector keeps the per-value traversal from re-walking
 * type metadata for every array element.
 */
function createNavigationValueMapper(type: ValueDescriptor): NavigationValueMapper | undefined {
  switch (type.kind) {
    case "navigation":
      return (value, mapTarget) => {
        if (value === undefined) {
          return undefined;
        }
        assert(typeof value === "string", "Expected a decoded navigation value to be a target instance id.");
        return mapTarget({ id: value, targetClassName: type.targetClassName });
      };
    case "array": {
      const mapElement = createNavigationValueMapper(type.elementType);
      if (!mapElement) {
        return undefined;
      }
      return (value, mapTarget) => {
        if (value === undefined) {
          return undefined;
        }
        assert(Array.isArray(value), "Expected a decoded array value.");
        return value.map((element) => mapElement(element, mapTarget));
      };
    }
    case "struct": {
      const members = type.members
        .map((member) => ({ name: member.name, mapMember: createNavigationValueMapper(member.type) }))
        .filter((member): member is { name: string; mapMember: NavigationValueMapper } => !!member.mapMember);
      if (members.length === 0) {
        return undefined;
      }
      return (value, mapTarget) => {
        if (value === undefined) {
          return undefined;
        }
        assert(typeof value === "object" && !Array.isArray(value), "Expected a decoded struct value.");
        const result: Record<string, Value> = { ...(value as Record<string, Value>) };
        for (const { name, mapMember } of members) {
          // The decoder omits members the instance didn't supply, so only present ones are mapped.
          if (name in result) {
            result[name] = mapMember(result[name], mapTarget);
          }
        }
        return result;
      };
    }
    case "primitive":
      return undefined;
  }
}

type NavigationTargets = Map<EC.FullClassNameDotNotation, Map<Id64String, NavigationValue>>;

/**
 * Creates a loader that resolves navigation target ids into `NavigationValue`s, caching each target
 * class's label select clause for the lifetime of the content provider.
 */
function createTargetLoader(props: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  labelsFactory: IInstanceLabelSelectClauseFactory;
}): (requestedIds: Map<EC.FullClassNameDotNotation, Set<Id64String>>) => Observable<NavigationTargets> {
  const { imodelAccess, labelsFactory } = props;
  const labelSelectors = new Map<EC.FullClassNameDotNotation, Promise<string>>();
  const getLabelSelector = async (className: EC.FullClassNameDotNotation) =>
    getOrCreate({
      map: labelSelectors,
      key: className,
      createFunc: async () => labelsFactory.createSelectClause({ classAlias: TARGET_ALIAS, className }),
    });

  return (requestedIds) =>
    from(requestedIds).pipe(
      mergeMap(
        ([className, ids]) =>
          from(getLabelSelector(className)).pipe(
            mergeMap((labelSelector) => readTargets({ imodelAccess, className, labelSelector, ids })),
            map((targets) => ({ className, targets })),
          ),
        QUERY_CONCURRENCY,
      ),
      toArray(),
      map((results) => new Map(results.map(({ className, targets }) => [className, targets]))),
    );
}

/**
 * Runs one target class's lookup query. The class is selected polymorphically, so an id pointing at a
 * subclass instance resolves and reports that subclass rather than the navigation property's declared
 * target constraint.
 */
function readTargets(props: {
  imodelAccess: ECSqlQueryExecutor;
  className: EC.FullClassNameDotNotation;
  labelSelector: string;
  ids: Set<Id64String>;
}): Observable<Map<Id64String, NavigationValue>> {
  const { imodelAccess, className, labelSelector, ids } = props;
  return defer(() => {
    const reader = imodelAccess.createQueryReader(
      {
        ecsql: `
          SELECT [${TARGET_ALIAS}].[ECInstanceId], ec_classname([${TARGET_ALIAS}].[ECClassId], 's.c'), ${labelSelector}
          FROM ${ECSql.createClassSelector(className)} [${TARGET_ALIAS}]
          JOIN IdSet(:${TARGET_IDS}) [${TARGET_IDS}] ON [${TARGET_IDS}].[id] = [${TARGET_ALIAS}].[ECInstanceId]
        `,
        bindings: { [TARGET_IDS]: { type: "idset", value: [...ids] } },
      },
      { rowFormat: "Indexes" },
    );
    return from(reader).pipe(
      toArray(),
      // Calling `return()` on the iterator cancels the query on the backend and frees its resources.
      finalize(() => void reader.return?.(undefined)),
      map((rows) => {
        const targets = new Map<Id64String, NavigationValue>();
        for (const row of rows) {
          const id = row[0] as Id64String;
          targets.set(id, {
            key: { className: row[1] as EC.FullClassNameDotNotation, id },
            label: parseInstanceLabel(row[2] as string | undefined),
          });
        }
        return targets;
      }),
    );
  });
}
