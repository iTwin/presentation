/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { ECSqlBinding, formIdBindings, IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { SelectableInstanceKey } from "./Selectable";

/** Available selection scopes.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export type SelectionScope = "element" | "model" | "category" | "functional";

/**
 * Props for computing element selection.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface ElementSelectionScopeProps {
  /** Identifies this as the "element" selection scope */
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
 * Props for computing selection using a selection scope.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export type SelectionScopeProps = ElementSelectionScopeProps | { id: SelectionScope } | SelectionScope;

/**
 * Props for `computeSelection`.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface ComputeSelectionProps {
  queryExecutor: IECSqlQueryExecutor;
  elementIds: string[];
  scope: SelectionScopeProps;
}

/**
 * Computes selection from given element ID's.
 * @param queryExecutor iModel query executor.
 * @param elementIds ID's of elements to compute selection for.
 * @param scope Selection scope to compute selection with.
 * @beta
 */
export async function* computeSelection(props: ComputeSelectionProps): AsyncIterableIterator<SelectableInstanceKey> {
  const { queryExecutor, elementIds, scope } = props;

  if (typeof scope === "string") {
    yield* computeSelection({ queryExecutor, elementIds, scope: { id: scope } });
    return;
  }

  const nonTransientKeys = elementIds.filter((key) => !Id64.isTransient(key));

  switch (scope.id) {
    case "element":
      yield* computeElementSelection(queryExecutor, nonTransientKeys, (scope as ElementSelectionScopeProps).ancestorLevel ?? 0);
      return;
    case "category":
      yield* computeCategorySelection(queryExecutor, nonTransientKeys);
      return;
    case "model":
      yield* computeModelSelection(queryExecutor, nonTransientKeys);
      return;
    case "functional":
      yield* computeFunctionalElementSelection(queryExecutor, nonTransientKeys, (scope as ElementSelectionScopeProps).ancestorLevel ?? 0);
      return;
  }
}

async function* computeElementSelection(
  queryExecutor: IECSqlQueryExecutor,
  elementIds: string[],
  ancestorLevel: number,
): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const recurseUntilRoot = ancestorLevel < 0;
  const query = `
    WITH RECURSIVE
      AncestorElements (ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT ECInstanceId, ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, Parent.Id
        FROM BisCore.Element
        WHERE ${formIdBindings("ECInstanceId", elementIds, bindings)}
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, a.Depth - 1, pe.Parent.Id FROM AncestorElements a
          JOIN BisCore.Element pe ON pe.ECInstanceId = a.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      )
      SELECT DISTINCT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName FROM AncestorElements
      WHERE ${recurseUntilRoot ? "" : "Depth = 0 OR"} ParentId IS NULL;`;

  yield* executeQuery(queryExecutor, query, bindings);
}

async function* computeCategorySelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const query = `
    SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
    FROM BisCore.Category c JOIN BisCore.GeometricElement2d ge ON ge.Category.Id = c.ECInstanceId
    WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
    UNION ALL
    SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
    FROM BisCore.Category c JOIN BisCore.GeometricElement3d ge ON ge.Category.Id = c.ECInstanceId
    WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)};`;

  yield* executeQuery(queryExecutor, query, bindings);
}

async function* computeModelSelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const query = `
    SELECT DISTINCT m.ECInstanceId, ec_classname(m.ECClassId, 's.c') AS ClassName
    FROM BisCore.Model m JOIN BisCore.Element e ON e.Model.Id = m.ECInstanceId
    WHERE ${formIdBindings("e.ECInstanceId", ids, bindings)};`;

  yield* executeQuery(queryExecutor, query, bindings);
}

async function* computeFunctionalElementSelection(
  queryExecutor: IECSqlQueryExecutor,
  ids: string[],
  ancestorLevel: number,
): AsyncIterableIterator<SelectableInstanceKey> {
  const bindings: ECSqlBinding[] = [];
  const recurseUntilRoot = ancestorLevel < 0;
  const query = `
    WITH RECURSIVE
      Non3dElementsOrNearestFunctionalElements (OriginalECInstanceId, OriginalECClassId, ECInstanceId, ECClassId, ParentId) AS (
        SELECT ECInstanceId, ECClassId, ECInstanceId, ECClassId, Parent.Id
        FROM BisCore.Element
        WHERE ${formIdBindings("ECInstanceId", ids, bindings)} AND ECClassId IS NOT (BisCore.GeometricElement3d)
        UNION ALL
        SELECT
          n3eonfe.OriginalECInstanceId,
          n3eonfe.OriginalECClassId,
          COALESCE(dgrfe.TargetECInstanceId, pe.ECInstanceId),
          COALESCE(dgrfe.TargetECClassId, pe.ECClassId),
          pe.Parent.Id
        FROM Non3dElementsOrNearestFunctionalElements n3eonfe
          LEFT JOIN BisCore.Element pe ON pe.ECInstanceId = n3eonfe.ParentId
          LEFT JOIN Functional.DrawingGraphicRepresentsFunctionalElement dgrfe ON dgrfe.SourceECInstanceId = n3eonfe.ECInstanceId
        WHERE n3eonfe.ECClassId IS NOT (Functional.FunctionalElement) AND (n3eonfe.ParentId IS NOT NULL OR dgrfe.TargetECInstanceId IS NOT NULL)
      ),
      Non3dElementNearestFunctionalElements (OriginalECInstanceId, ECInstanceId, ECClassId) AS (
        SELECT OriginalECInstanceId, ECInstanceId, ECClassId
        FROM Non3dElementsOrNearestFunctionalElements
        WHERE ECClassId IS (Functional.FunctionalElement)
      ),
      Non3dElementsWithoutFunctionalElement (ECInstanceId, ECClassId) AS (
        SELECT n3ewfe.OriginalECInstanceId, OriginalECClassId
        FROM Non3dElementsOrNearestFunctionalElements n3ewfe
          LEFT JOIN Non3dElementNearestFunctionalElements n3enfe ON n3enfe.OriginalECInstanceId = n3ewfe.OriginalECInstanceId
        WHERE n3ewfe.ParentId IS NULL AND n3enfe.ECInstanceId IS NULL
      ),
      Non3dElements (ECInstanceId, ECClassId) AS (
        SELECT ECInstanceId, ECClassId FROM Non3dElementNearestFunctionalElements
        UNION
        SELECT ECInstanceId, ECClassId FROM Non3dElementsWithoutFunctionalElement
      ),
      Non3dElementAncestorElements (ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT e.ECInstanceId, e.ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, e.Parent.Id
        FROM BisCore.Element e
          JOIN Non3dElements n3e ON n3e.ECInstanceId = e.ECInstanceId
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, n3eae.Depth - 1, pe.Parent.Id
        FROM Non3dElementAncestorElements n3eae
          JOIN BisCore.Element pe ON pe.ECInstanceId = n3eae.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      ),
      Element3dAncestorElements (ECInstanceId, ECClassId, Depth, ParentId) AS (
        SELECT ge.ECInstanceId, ge.ECClassId, ${formAncestorLevelBinding(ancestorLevel, bindings)}, ge.Parent.Id
        FROM BisCore.GeometricElement3d ge
        WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
        UNION ALL
        SELECT pe.ECInstanceId, pe.ECClassId, e3ae.Depth - 1, pe.Parent.Id
        FROM Element3dAncestorElements e3ae
          JOIN BisCore.Element pe ON pe.ECInstanceId = e3ae.ParentId
        WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
      ),
      Element3dAncestorRelatedFunctionalElement (ECInstanceId, ClassName) AS (
        SELECT
          COALESCE(peff.TargetECInstanceId, e3ae.ECInstanceId),
          ec_classname(COALESCE(peff.TargetECClassId, e3ae.ECClassId), 's.c')
        FROM Element3dAncestorElements e3ae
          LEFT JOIN Functional.PhysicalElementFulfillsFunction peff ON peff.SourceECInstanceId = e3ae.ECInstanceId
        WHERE ${recurseUntilRoot ? "" : "e3ae.Depth = 0 OR"} e3ae.ParentId IS NULL
      )
      SELECT DISTINCT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName
      FROM Non3dElementAncestorElements
      WHERE ${recurseUntilRoot ? "" : "Depth = 0 OR"} ParentId IS NULL
      UNION ALL
      SELECT DISTINCT ECInstanceId, ClassName FROM Element3dAncestorRelatedFunctionalElement;`;

  yield* executeQuery(queryExecutor, query, bindings);
}

function formAncestorLevelBinding(ancestorLevel: number, bindings: ECSqlBinding[]) {
  bindings.push({ type: "int", value: ancestorLevel });
  return "?";
}

async function* executeQuery(queryExecutor: IECSqlQueryExecutor, query: string, bindings?: ECSqlBinding[]): AsyncIterableIterator<SelectableInstanceKey> {
  const reader = queryExecutor.createQueryReader(query, bindings);

  for await (const row of reader) {
    yield { className: row.ClassName, id: row.ECInstanceId };
  }
}
