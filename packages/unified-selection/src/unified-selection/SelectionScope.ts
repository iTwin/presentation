/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64Arg, Id64Array } from "@itwin/core-bentley";
import { ECSqlBinding, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryRow } from "@itwin/presentation-shared";
import { SelectableInstanceKey } from "./Selectable.js";
import { formIdBindings, genericExecuteQuery } from "./Utils.js";

/**
 * Available selection scopes.
 * @public
 */
type SelectionScopeIdentifier = "element" | "model" | "category" | "functional";

/**
 * Props for computing element selection.
 * @public
 */
export interface ElementSelectionScopeProps {
  /** Identifies this as either "element" or "functional" selection scope */
  id: "element" | "functional";
  /**
   * Specifies how far "up" we should walk to find the target element. When not specified or `0`,
   * the target element matches the request element. When set to `1`, the target element matches the direct parent element.
   * When set to `2`, the target element is parent of the parent element and so on. In all situations when this is `> 0`,
   * we're not walking further than the last existing element, for example when `ancestorLevel = 1` (direct parent
   * element is requested), but the request element doesn't have a parent, the request element is returned as the result.
   * A negative value would result in the top-most element to be returned.
   */
  ancestorLevel?: number;
}

/**
 * A union of types that can be used to define a selection scope.
 * @public
 * @since 1.4.0
 */
export type SelectionScope = ElementSelectionScopeProps | { id: SelectionScopeIdentifier } | SelectionScopeIdentifier;

/**
 * Props for `computeSelection`.
 * @public
 */
export interface ComputeSelectionProps {
  /** iModel query executor. */
  queryExecutor: ECSqlQueryExecutor;
  /** IDs of elements to compute selection for. */
  elementIds: Id64Arg;
  /** Selection scope to compute selection with. */
  scope: SelectionScope;
}

/**
 * Computes selection from given element IDs.
 * @public
 */
export async function* computeSelection(props: ComputeSelectionProps): AsyncIterableIterator<SelectableInstanceKey> {
  const { queryExecutor, elementIds, scope } = props;

  if (typeof scope === "string") {
    yield* computeSelection({ queryExecutor, elementIds, scope: { id: scope } });
    return;
  }

  const nonTransientIds: Id64Array = [];
  for (const id of Id64.iterable(elementIds)) {
    if (!Id64.isTransient(id)) {
      nonTransientIds.push(id);
    }
  }

  switch (scope.id) {
    case "element":
      yield* computeElementSelection(queryExecutor, nonTransientIds, (scope as ElementSelectionScopeProps).ancestorLevel ?? 0);
      return;
    case "category":
      yield* computeCategorySelection(queryExecutor, nonTransientIds);
      return;
    case "model":
      yield* computeModelSelection(queryExecutor, nonTransientIds);
      return;
    case "functional":
      yield* computeFunctionalElementSelection(queryExecutor, nonTransientIds, (scope as ElementSelectionScopeProps).ancestorLevel ?? 0);
      return;
  }
}

async function* computeElementSelection(
  queryExecutor: ECSqlQueryExecutor,
  elementIds: string[],
  ancestorLevel: number,
): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const recurseUntilRoot = ancestorLevel < 0;
  const ctes = [
    `
      AncestorElements(ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT ECInstanceId, ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, Parent.Id
        FROM BisCore.Element
        WHERE ${formIdBindings("ECInstanceId", elementIds, bindings)}
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, a.Depth - 1, pe.Parent.Id
        FROM AncestorElements a
        JOIN BisCore.Element pe ON pe.ECInstanceId = a.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      )
    `,
  ];
  const ecsql = `
    SELECT DISTINCT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName
    FROM AncestorElements
    WHERE ${recurseUntilRoot ? "" : "Depth = 0 OR"} ParentId IS NULL
  `;
  yield* executeQuery(queryExecutor, { ctes, ecsql, bindings });
}

async function* computeCategorySelection(queryExecutor: ECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const ecsql = [
    `
      SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
      FROM BisCore.Category c
      JOIN BisCore.GeometricElement2d ge ON ge.Category.Id = c.ECInstanceId
      WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
    `,
    `
      SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
      FROM BisCore.Category c
      JOIN BisCore.GeometricElement3d ge ON ge.Category.Id = c.ECInstanceId
      WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
    `,
  ].join(" UNION ALL ");
  yield* executeQuery(queryExecutor, { ecsql, bindings });
}

async function* computeModelSelection(queryExecutor: ECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const ecsql = `
    SELECT DISTINCT m.ECInstanceId, ec_classname(m.ECClassId, 's.c') AS ClassName
    FROM BisCore.Model m
    JOIN BisCore.Element e ON e.Model.Id = m.ECInstanceId
    WHERE ${formIdBindings("e.ECInstanceId", ids, bindings)}
  `;
  yield* executeQuery(queryExecutor, { ecsql, bindings });
}

async function* computeFunctionalElementSelection(
  queryExecutor: ECSqlQueryExecutor,
  ids: string[],
  ancestorLevel: number,
): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const recurseUntilRoot = ancestorLevel < 0;
  // cspell:disable
  const ctes = [
    `
      Elements2dOrNearestFunctionalElements(OriginalECInstanceId, OriginalECClassId, ECInstanceId, ECClassId, ParentId) AS (
        SELECT ECInstanceId, ECClassId, ECInstanceId, ECClassId, Parent.Id
        FROM BisCore.Element
        WHERE ${formIdBindings("ECInstanceId", ids, bindings)} AND ECClassId IS NOT (BisCore.GeometricElement3d)
        UNION ALL
        SELECT
          e2onfe.OriginalECInstanceId,
          e2onfe.OriginalECClassId,
          COALESCE(dgrfe.TargetECInstanceId, pe.ECInstanceId),
          COALESCE(dgrfe.TargetECClassId, pe.ECClassId),
          pe.Parent.Id
        FROM Elements2dOrNearestFunctionalElements e2onfe
        LEFT JOIN BisCore.Element pe ON pe.ECInstanceId = e2onfe.ParentId
        LEFT JOIN Functional.DrawingGraphicRepresentsFunctionalElement dgrfe ON dgrfe.SourceECInstanceId = e2onfe.ECInstanceId
        WHERE e2onfe.ECClassId IS NOT (Functional.FunctionalElement) AND (e2onfe.ParentId IS NOT NULL OR dgrfe.TargetECInstanceId IS NOT NULL)
      )
    `,
    `
      Element2dNearestFunctionalElements(OriginalECInstanceId, ECInstanceId, ECClassId) AS (
        SELECT OriginalECInstanceId, ECInstanceId, ECClassId
        FROM Elements2dOrNearestFunctionalElements
        WHERE ECClassId IS (Functional.FunctionalElement)
      )
    `,
    `
      Elements2dWithoutFunctionalElement(ECInstanceId, ECClassId) AS (
        SELECT e2wfe.OriginalECInstanceId, OriginalECClassId
        FROM Elements2dOrNearestFunctionalElements e2wfe
        LEFT JOIN Element2dNearestFunctionalElements e2nfe ON e2nfe.OriginalECInstanceId = e2wfe.OriginalECInstanceId
        WHERE e2wfe.ParentId IS NULL AND e2nfe.ECInstanceId IS NULL
      )
    `,
    `
      Elements2d(ECInstanceId, ECClassId) AS (
        SELECT ECInstanceId, ECClassId FROM Element2dNearestFunctionalElements
        UNION
        SELECT ECInstanceId, ECClassId FROM Elements2dWithoutFunctionalElement
      )
    `,
    `
      Element2dAncestorElements(ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT e.ECInstanceId, e.ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, e.Parent.Id
        FROM BisCore.Element e
        JOIN Elements2d e2d ON e2d.ECInstanceId = e.ECInstanceId
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, e2ae.Depth - 1, pe.Parent.Id
        FROM Element2dAncestorElements e2ae
        JOIN BisCore.Element pe ON pe.ECInstanceId = e2ae.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      )
    `,
    `
      Element3dAncestorElements(ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT ge.ECInstanceId, ge.ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, ge.Parent.Id
        FROM BisCore.GeometricElement3d ge
        WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, e3ae.Depth - 1, pe.Parent.Id
        FROM Element3dAncestorElements e3ae
        JOIN BisCore.Element pe ON pe.ECInstanceId = e3ae.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      )
    `,
    `
      Element3dAncestorRelatedFunctionalElement(ECInstanceId, ClassName) AS (
        SELECT
          COALESCE(peff.TargetECInstanceId, e3ae.ECInstanceId),
          ec_classname(COALESCE(peff.TargetECClassId, e3ae.ECClassId), 's.c')
        FROM Element3dAncestorElements e3ae
        LEFT JOIN Functional.PhysicalElementFulfillsFunction peff ON peff.SourceECInstanceId = e3ae.ECInstanceId
        WHERE ${recurseUntilRoot ? "" : "e3ae.Depth = 0 OR"} e3ae.ParentId IS NULL
      )
    `,
  ];
  const ecsql = [
    `
      SELECT DISTINCT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName
        FROM Element2dAncestorElements
       WHERE ${recurseUntilRoot ? "" : "Depth = 0 OR"} ParentId IS NULL
    `,
    `
      SELECT DISTINCT ECInstanceId, ClassName FROM Element3dAncestorRelatedFunctionalElement
    `,
  ].join(" UNION ");
  // cspell:enable
  yield* executeQuery(queryExecutor, { ctes, ecsql, bindings });
}

function formAncestorLevelBinding(ancestorLevel: number, bindings: ECSqlBinding[]) {
  bindings.push({ type: "int", value: ancestorLevel });
  return "?";
}

async function* executeQuery(queryExecutor: ECSqlQueryExecutor, query: ECSqlQueryDef): AsyncIterableIterator<SelectableInstanceKey> {
  yield* genericExecuteQuery(queryExecutor, query, (row: ECSqlQueryRow) => ({
    className: row.ClassName,
    id: row.ECInstanceId,
  }));
}
