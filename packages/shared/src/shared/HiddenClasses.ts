/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "./Metadata.js";
import { parseFullClassName } from "./Utils.js";

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
  return collectHiddenClassesTreeNodes(props.schemaProvider, selectClass, "show");
}

async function collectHiddenClassesTreeNodes(
  schemaProvider: Pick<ECSchemaProvider, "getSchema">,
  parentClass: EC.Class,
  parentState: "show" | "hide",
): Promise<HiddenClassesTreeNode[]> {
  const derivedClassNamesBySchema = new Map<string, string[]>();
  for (const fullClassName of parentClass.getDerivedClassNames({ onlyDirect: true })) {
    const { schemaName, className } = parseFullClassName(fullClassName);
    let classNames = derivedClassNamesBySchema.get(schemaName);
    if (!classNames) {
      classNames = [];
      derivedClassNamesBySchema.set(schemaName, classNames);
    }
    classNames.push(className);
  }
  const derivedClasses = (
    await Promise.all(
      [...derivedClassNamesBySchema.entries()].map(async ([schemaName, classNames]) => {
        const schema = await schemaProvider.getSchema(schemaName);
        if (!schema) {
          throw new Error(`Schema "${schemaName}" not found.`);
        }
        return classNames.map((className) => {
          const ecClass = schema.getClass(className);
          if (!ecClass) {
            throw new Error(`Class "${className}" not found in schema "${schemaName}".`);
          }
          return { ecClass, schemaState: schema.isHidden ? ("hide" as const) : undefined };
        });
      }),
    )
  ).flat();

  const nodes = await Promise.all(
    derivedClasses.map(async ({ ecClass, schemaState }): Promise<ReadonlyArray<HiddenClassesTreeNode>> => {
      const classState = ecClass.isHidden === true ? "hide" : ecClass.isHidden === false ? "show" : undefined;
      const state = classState ?? schemaState;
      if (!state || state === parentState) {
        return collectHiddenClassesTreeNodes(schemaProvider, ecClass, parentState);
      }
      return [
        {
          fullName: ecClass.fullName,
          state,
          children: await collectHiddenClassesTreeNodes(schemaProvider, ecClass, state),
        },
      ];
    }),
  );
  return nodes.flat();
}
