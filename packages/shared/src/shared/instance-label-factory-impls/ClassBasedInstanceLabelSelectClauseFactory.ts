/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRawPropertyValueSelector } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { createDefaultInstanceLabelSelectClauseFactory } from "./DefaultInstanceLabelSelectClauseFactory.js";

import type {
  CreateInstanceLabelSelectClauseProps,
  IInstanceLabelSelectClauseFactory,
} from "../InstanceLabelSelectClauseFactory.js";
import type { EC, ECClassHierarchyInspector } from "../Metadata.js";

/**
 * An association of a class and an instance label select clause factory method.
 * @public
 */
export interface ClassBasedLabelSelectClause {
  /** Full class name */
  className: EC.FullClassName;
  /** A factory method to create an instance label select clause */
  clause: (props: CreateInstanceLabelSelectClauseProps) => Promise<string>;
}

/**
 * Props for `createClassBasedInstanceLabelSelectClauseFactory`.
 * @public
 */
export interface ClassBasedInstanceLabelSelectClauseFactoryProps {
  /** Access to ECClass hierarchy in the iModel. */
  classHierarchyInspector: ECClassHierarchyInspector;

  /**
   * A prioritized list of instance label selectors associated to classes they should be applied to.
   *
   * Because the list may contain clauses for classes in the same class hierarchy, and the factory
   * handles them in given order, the order of clauses should be from the most specific class to the
   * most general one.
   */
  clauses: ClassBasedLabelSelectClause[];

  /**
   * A fallback label clause factory for when class-based factory doesn't produce a label.
   * Defaults to the result of `createDefaultInstanceLabelSelectClauseFactory`.
   */
  defaultClauseFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Creates an instance label select clause based on its class.
 * @public
 */
export function createClassBasedInstanceLabelSelectClauseFactory(
  props: ClassBasedInstanceLabelSelectClauseFactoryProps,
): IInstanceLabelSelectClauseFactory {
  const { classHierarchyInspector, clauses: labelClausesByClass } = props;
  const defaultClauseFactory = props.defaultClauseFactory ?? createDefaultInstanceLabelSelectClauseFactory();
  async function getLabelClausesForClass(queryClassName: EC.FullClassName) {
    const matchingLabelClauses = await Promise.all(
      labelClausesByClass.map(async (entry) => {
        if (await classHierarchyInspector.classDerivesFrom(entry.className, queryClassName)) {
          // label selector is intended for a more specific class than we're selecting from - need to include it
          // as query results (on polymorphic select) are going to include more specific class instances too
          return entry;
        }
        if (await classHierarchyInspector.classDerivesFrom(queryClassName, entry.className)) {
          // label selector is intended for a base class of what query is selecting - need to include it as
          // we want base class label selectors to apply to subclass instances
          return entry;
        }
        return undefined;
      }),
    );
    function filterNotUndefined<T>(x: T | undefined): x is T {
      return !!x;
    }
    return matchingLabelClauses.filter(filterNotUndefined);
  }
  return {
    async createSelectClause(clauseProps: CreateInstanceLabelSelectClauseProps): Promise<string> {
      if (labelClausesByClass.length === 0) {
        return defaultClauseFactory.createSelectClause(clauseProps);
      }

      const labelClausePromises = clauseProps.className
        ? await getLabelClausesForClass(clauseProps.className)
        : labelClausesByClass;
      if (labelClausePromises.length === 0) {
        return defaultClauseFactory.createSelectClause(clauseProps);
      }

      const labelClauses = await Promise.all(
        labelClausePromises.map(async ({ className, clause }) => ({ className, clause: await clause(clauseProps) })),
      );

      return `COALESCE(
        ${labelClauses
          .map(({ className, clause }) =>
            `
              IIF(
                ${createRawPropertyValueSelector(clauseProps.classAlias, "ECClassId")} IS (${className}),
                ${clause.trim()},
                NULL
              )
            `.trim(),
          )
          .join(", ")},
        ${await defaultClauseFactory.createSelectClause(clauseProps)}
      )`;
    },
  };
}
