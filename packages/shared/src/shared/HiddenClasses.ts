/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom, from, groupBy, map, mergeMap, ReplaySubject, toArray } from "rxjs";
import { getClass } from "./Metadata.js";
import { parseFullClassName } from "./Utils.js";

import type { Observable } from "rxjs";
import type { EC, ECSchemaProvider, HiddenClassesTreeNode } from "./Metadata.js";

/**
 * Creates a tree of classes, derived from the given class, whose visibility is changed through `HiddenClass`
 * or `HiddenSchema` custom attributes. See `HiddenClassesTreeNode` for details on the tree structure. The
 * returned tree is frozen.
 *
 * The function traverses the whole derived classes' hierarchy of the given class, which may be expensive. It's
 * meant to be used by `ECSchemaProvider.getHiddenClassesTree` implementations, which are expected to cache the result.
 *
 * @throws Error if the selected class or any of its derived classes' schemas can't be found.
 * @public
 */
export async function createHiddenClassesTree(props: {
  /** Schema provider used to look up the selected class and its derived classes. */
  schemaProvider: Pick<ECSchemaProvider, "getSchema">;
  /** Full name of the class whose derived classes should be inspected. */
  selectClassName: EC.FullClassNameDotNotation;
}): Promise<HiddenClassesTreeNode[]> {
  const selectClass = await getClass(props.schemaProvider, props.selectClassName);
  return firstValueFrom(collectHiddenClassesTreeNodes(props.schemaProvider, selectClass, "show").pipe(toArray()));
}

function collectHiddenClassesTreeNodes(
  schemaProvider: Pick<ECSchemaProvider, "getSchema">,
  parentClass: EC.Class,
  parentState: "show" | "hide",
): Observable<HiddenClassesTreeNode> {
  return from(parentClass.getDerivedClassNames({ onlyDirect: true })).pipe(
    map(parseFullClassName),
    groupBy(({ schemaName }) => schemaName, {
      element: ({ className }) => className,
      connector: () => new ReplaySubject<string>(),
    }),
    mergeMap((classNames) =>
      from(schemaProvider.getSchema(classNames.key)).pipe(
        mergeMap((schema) => {
          if (!schema) {
            throw new Error(`Schema "${classNames.key}" not found.`);
          }
          return classNames.pipe(
            mergeMap((className) => {
              const ecClass = schema.getClass(className);
              if (!ecClass) {
                throw new Error(`Class "${className}" not found in schema "${classNames.key}".`);
              }
              const schemaState = schema.isHidden ? ("hide" as const) : undefined;
              const classState = ecClass.isHidden === true ? "hide" : ecClass.isHidden === false ? "show" : undefined;
              const effectiveState = classState ?? schemaState;
              if (!effectiveState || effectiveState === parentState) {
                return collectHiddenClassesTreeNodes(schemaProvider, ecClass, parentState);
              }
              return collectHiddenClassesTreeNodes(schemaProvider, ecClass, effectiveState).pipe(
                toArray(),
                map((children): HiddenClassesTreeNode => ({
                  fullName: ecClass.fullName,
                  state: effectiveState,
                  children,
                })),
              );
            }),
          );
        }),
      ),
    ),
  );
}
