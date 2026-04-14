/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRawPropertyValueSelector } from "../ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { createClassBasedInstanceLabelSelectClauseFactory } from "./ClassBasedInstanceLabelSelectClauseFactory.js";
import { concatenate, createECInstanceIdSuffixSelectors } from "./Utils.js";

import type { IInstanceLabelSelectClauseFactory } from "../InstanceLabelSelectClauseFactory.js";
import type { ECClassHierarchyInspector } from "../Metadata.js";
import type { ClassBasedLabelSelectClause } from "./ClassBasedInstanceLabelSelectClauseFactory.js";

/**
 * Props for `createBisInstanceLabelSelectClauseFactory`.
 * @public
 */
interface BisInstanceLabelSelectClauseFactoryProps {
  classHierarchyInspector: ECClassHierarchyInspector;
}

/**
 * Creates a label select clause according to BIS instance label rules.
 * @see https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides
 * @public
 */
export function createBisInstanceLabelSelectClauseFactory(
  props: BisInstanceLabelSelectClauseFactoryProps,
): IInstanceLabelSelectClauseFactory {
  const clauses: ClassBasedLabelSelectClause[] = [];
  const factory = createClassBasedInstanceLabelSelectClauseFactory({
    classHierarchyInspector: props.classHierarchyInspector,
    clauses,
  });
  clauses.push(
    {
      className: "BisCore.GeometricElement",
      clause: async ({ classAlias, ...rest }) => `
        COALESCE(
          ${createRawPropertyValueSelector(classAlias, "CodeValue")},
          ${concatenate(
            rest,
            [
              { selector: createRawPropertyValueSelector(classAlias, "UserLabel") },
              ...createECInstanceIdSuffixSelectors(classAlias),
            ],
            `${createRawPropertyValueSelector(classAlias, "UserLabel")} IS NOT NULL`,
          )}
        )
      `,
    },
    {
      className: "BisCore.Element",
      clause: async ({ classAlias }) => `
        COALESCE(
          ${createRawPropertyValueSelector(classAlias, "UserLabel")},
          ${createRawPropertyValueSelector(classAlias, "CodeValue")}
        )
      `,
    },
    {
      className: "BisCore.Model",
      clause: async ({ classAlias, ...rest }) => `(
        SELECT ${await factory.createSelectClause({ ...rest, classAlias: "e", className: "BisCore.Element" })}
        FROM [bis].[Element] AS [e]
        WHERE [e].[ECInstanceId] = ${createRawPropertyValueSelector(classAlias, "ModeledElement", "Id")}
      )`,
    },
  );
  return factory;
}
