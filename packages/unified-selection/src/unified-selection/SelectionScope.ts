/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding, formIdBindings, IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { SelectableInstanceKey } from "./Selectable";

/**
 * Data structure that describes a selection scope.
 * @beta
 */
export interface SelectionScope {
  /** Unique ID of the selection scope */
  id: string;
  /** Label */
  label: string;
  /** Description */
  description?: string;
}

/**
 * Props for computing element selection.
 * @internal
 */
export interface ElementSelectionScopeProps {
  /** Identifies this as the "element" selection scope */
  id: "element";
  /**
   * Specifies how far "up" we should walk to find the target element. When not specified or `0`,
   * the target element matches the request element. When `1`, the target element matches the direct parent element.
   * When `2`, the target element is parent of the parent element and so on. In all situations when this is `> 0`,
   * we're not walking further than the last existing element, for example when `ancestorLevel = 1` (direct parent
   * element is requested), but the request element doesn't have a parent, the request element is returned as the result.
   */
  ancestorLevel?: number;
}

/**
 * Props for computing selection using a selection scope.
 * @internal
 */
export type SelectionScopeProps = ElementSelectionScopeProps | { id: string } | string;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace SelectionScope {
  /**
   * Gets available selection scopes.
   */
  export function getSelectionScopes(): SelectionScope[] {
    const createSelectionScope = (scopeId: string, label: string, description: string): SelectionScope => ({
      id: scopeId,
      label,
      description,
    });
    return [
      createSelectionScope("element", "Element", "Select the picked element"),
      createSelectionScope("assembly", "Assembly", "Select parent of the picked element"),
      createSelectionScope("top-assembly", "Top Assembly", "Select the topmost parent of the picked element"),
      // WIP: temporarily comment-out "category" and "model" scopes since we can't hilite contents of them fast enough
      // createSelectionScope("category", "Category", "Select all elements in the picked element's category"),
      // createSelectionScope("model", "Model", "Select all elements in the picked element's model"),
    ];
  }

  /**
   * Computes selection from given element ID's.
   * @param queryExecutor iModel query executor.
   * @param elementIds ID's of elements to compute selection for.
   * @param scope Selection scope to compute selection with.
   */
  export async function* computeSelection(
    queryExecutor: IECSqlQueryExecutor,
    elementIds: string[],
    scope: SelectionScopeProps,
  ): AsyncIterableIterator<SelectableInstanceKey> {
    if (typeof scope === "string") {
      yield* computeSelection(queryExecutor, elementIds, { id: scope });
      return;
    }

    const nonTransientKeys = elementIds.filter((key) => !isTransient(key));

    switch (scope.id) {
      case "element":
        yield* computeElementSelection(queryExecutor, nonTransientKeys, (scope as ElementSelectionScopeProps).ancestorLevel ?? 0);
        return;
      case "assembly":
        yield* computeElementSelection(queryExecutor, nonTransientKeys, 1);
        return;
      case "top-assembly":
        yield* computeElementSelection(queryExecutor, nonTransientKeys, -1);
        return;
      case "category":
        yield* computeCategorySelection(queryExecutor, nonTransientKeys);
        return;
      case "model":
        yield* computeModelSelection(queryExecutor, nonTransientKeys);
        return;
      case "functional":
      case "functional-element":
        yield* computeFunctionalElementSelection(queryExecutor, nonTransientKeys);
        return;
      case "functional-assembly":
        yield* computeFunctionalAssemblySelection(queryExecutor, nonTransientKeys);
        return;
      case "functional-top-assembly":
        yield* computeFunctionalTopAssemblySelection(queryExecutor, nonTransientKeys);
        return;
    }
    throw new Error(`Invalid argument ${scope.id}`);
  }

  async function* computeElementSelection(
    queryExecutor: IECSqlQueryExecutor,
    elementIds: string[],
    ancestorLevel: number,
  ): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [{ type: "int", value: ancestorLevel }];
    const recurseUntilRoot = ancestorLevel < 0;
    const query = `WITH RECURSIVE
                    Elements (ECInstanceId, ECClassId, Depth, ParentId) AS (
                      SELECT ECInstanceId, ECClassId, ?, Parent.Id FROM BisCore.Element WHERE ${formIdBindings("ECInstanceId", elementIds, bindings)}
                      UNION ALL
                      SELECT r.ECInstanceId, r.ECClassId, e.Depth - 1, r.Parent.Id FROM Elements e
                        JOIN BisCore.Element r ON r.ECInstanceId = e.ParentId
                      WHERE ${recurseUntilRoot ? "" : "Depth > 0 AND"} ParentId IS NOT NULL
                    )
                    SELECT DISTINCT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName FROM Elements
                    WHERE ${recurseUntilRoot ? "" : "Depth = 0 OR"} ParentId IS NULL;`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  async function* computeCategorySelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [];
    const query = `SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
                   FROM BisCore.Category c JOIN BisCore.GeometricElement2d g ON g.Category.Id = c.ECInstanceId
                   WHERE ${formIdBindings("g.ECInstanceId", ids, bindings)}
                   UNION ALL
                   SELECT DISTINCT c.ECInstanceId, ec_classname(c.ECClassId, 's.c') AS ClassName
                   FROM BisCore.Category c JOIN BisCore.GeometricElement3d g ON g.Category.Id = c.ECInstanceId
                   WHERE ${formIdBindings("g.ECInstanceId", ids, bindings)};`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  async function* computeModelSelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [];
    const query = `SELECT DISTINCT m.ECInstanceId, ec_classname(m.ECClassId, 's.c') AS ClassName
                   FROM BisCore.Model m JOIN BisCore.Element e ON e.Model.Id = m.ECInstanceId
                   WHERE ${formIdBindings("e.ECInstanceId", ids, bindings)};`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  async function* computeFunctionalElementSelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [];
    const query = `WITH RECURSIVE
                    ${getNearestFunctionalElementQuery(ids, bindings)}
                    Element3dRelatedFunctionalElement (ECInstanceId, ECClassId, FunctionalECInstanceId, FunctionalECClassId) AS (
                      SELECT ge.ECInstanceId, ge.ECClassId, r.TargetECInstanceId, r.TargetECClassId FROM BisCore.GeometricElement3d ge
                        LEFT JOIN Functional.PhysicalElementFulfillsFunction r ON r.SourceECInstanceId = ge.ECInstanceId
                      WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
                    )
                    SELECT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName FROM MergedElements
                    UNION ALL
                    SELECT ECInstanceId, ec_classname(ECClassId, 's.c') AS ClassName FROM Element3dRelatedFunctionalElement WHERE FunctionalECInstanceId IS NULL
                    UNION ALL
                    SELECT FunctionalECInstanceId AS ECInstanceId, ec_classname(FunctionalECClassId, 's.c') AS ClassName FROM Element3dRelatedFunctionalElement WHERE FunctionalECInstanceId IS NOT NULL;`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  async function* computeFunctionalAssemblySelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [];
    const query = `WITH RECURSIVE
                    ${getNearestFunctionalElementQuery(ids, bindings)}
                    Element3dAssemblyElements (ECInstanceId, ClassName) AS (
                      SELECT
                        COALESCE(r1.TargetECInstanceId, pe.ECInstanceId, r2.TargetECInstanceId, ge.ECInstanceId),
                        ec_classname(COALESCE(r1.TargetECClassId, pe.ECClassId, r2.TargetECClassId, ge.ECClassId), 's.c')
                      FROM BisCore.GeometricElement3d AS ge
                        LEFT JOIN BisCore.Element pe ON pe.ECInstanceId = ge.Parent.Id
                        LEFT JOIN Functional.PhysicalElementFulfillsFunction r1 ON r1.SourceECInstanceId = pe.ECInstanceId
                        LEFT JOIN Functional.PhysicalElementFulfillsFunction r2 ON r2.SourceECInstanceId = ge.ECInstanceId
                      WHERE ${formIdBindings("ge.ECInstanceId", ids, bindings)}
                    )
                    SELECT ECInstanceId, ClassName FROM Element3dAssemblyElements
                    UNION
                    SELECT COALESCE(pe.ECInstanceId, me.ECInstanceId) AS ECInstanceId, ec_classname(COALESCE(pe.ECClassId, me.ECClassId), 's.c') AS ClassName
                    FROM MergedElements AS me
                      LEFT JOIN BisCore.Element e ON e.ECInstanceId = me.ECInstanceId
                      LEFT JOIN BisCore.Element pe ON pe.ECInstanceId = e.Parent.Id;`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  async function* computeFunctionalTopAssemblySelection(queryExecutor: IECSqlQueryExecutor, ids: string[]): AsyncIterableIterator<SelectableInstanceKey> {
    const bindings: ECSqlBinding[] = [];
    const query = `WITH RECURSIVE
                    ${getNearestFunctionalElementQuery(ids, bindings)}
                    Element2dTopAssemblyElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM MergedElements
                      UNION ALL
                      SELECT pe.ECInstanceId, pe.ECClassId
                      FROM Element2dTopAssemblyElements AS metae
                        JOIN BisCore.Element e ON e.ECInstanceId = metae.ECInstanceId
                        JOIN BisCore.Element pe ON pe.ECInstanceId = e.Parent.Id
                    ),
                    Element2dTopAssemblyRelatedFunctionalElements (ECInstanceId, ClassName) AS (
                      SELECT COALESCE(r.TargetECInstanceId, metae.ECInstanceId), ec_classname(COALESCE(r.TargetECClassId, metae.ECClassId), 's.c')
                      FROM Element2dTopAssemblyElements metae
                        LEFT JOIN Functional.PhysicalElementFulfillsFunction r ON r.SourceECInstanceId = metae.ECInstanceId
                    ),
                    Element3dTopAssemblyElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.GeometricElement3d WHERE ${formIdBindings("ECInstanceId", ids, bindings)}
                      UNION ALL
                      SELECT pe.ECInstanceId, pe.ECClassId
                      FROM Element3dTopAssemblyElements AS etae
                        JOIN BisCore.Element e ON e.ECInstanceId = etae.ECInstanceId
                        JOIN BisCore.Element pe ON pe.ECInstanceId = e.Parent.Id
                    ),
                    Element3dTopAssemblyRelatedFunctionalElements (ECInstanceId, ClassName) AS (
                      SELECT COALESCE(r.TargetECInstanceId, etae.ECInstanceId), ec_classname(COALESCE(r.TargetECClassId, etae.ECClassId), 's.c')
                      FROM Element3dTopAssemblyElements etae
                        JOIN BisCore.Element e ON e.ECInstanceId = etae.ECInstanceId
                        LEFT JOIN Functional.PhysicalElementFulfillsFunction r ON r.SourceECInstanceId = etae.ECInstanceId
                      WHERE e.Parent.Id IS NULL
                    )
                    SELECT * FROM Element2dTopAssemblyRelatedFunctionalElements
                    UNION
                    SELECT * FROM Element3dTopAssemblyRelatedFunctionalElements;`;

    yield* executeQuery(queryExecutor, query, bindings);
  }

  function getNearestFunctionalElementQuery(ids: string[], bindings: ECSqlBinding[]): string {
    return `Element2dNearestFunctionalElement (OriginalECInstanceId, OriginalECClassId, ECInstanceId, ECClassId, ParentId) AS (
              SELECT ECInstanceId, ECClassId, ECInstanceId, ECClassId, Parent.Id FROM BisCore.GeometricElement2d WHERE ${formIdBindings("ECInstanceId", ids, bindings)}
              UNION ALL
              SELECT e.OriginalECInstanceId, e.OriginalECClassId, COALESCE(r.TargetECInstanceId, ge.ECInstanceId), COALESCE(r.TargetECClassId, ge.ECClassId), ge.Parent.Id
              FROM Element2dNearestFunctionalElement e
                LEFT JOIN BisCore.Element ge ON ge.ECInstanceId = e.ParentId
                LEFT JOIN Functional.DrawingGraphicRepresentsFunctionalElement r ON r.SourceECInstanceId = e.ECInstanceId
              WHERE e.ECClassId IS NOT (Functional.FunctionalElement) AND (e.ParentId IS NOT NULL OR r.TargetECInstanceId IS NOT NULL)
            ),
            FoundNearestFunctionalElements (OriginalECInstanceId, ECInstanceId, ECClassId) AS (
              SELECT OriginalECInstanceId, ECInstanceId, ECClassId
              FROM Element2dNearestFunctionalElement
              WHERE ECClassId IS (Functional.FunctionalElement)
            ),
            ElementsWithoutFunctionalElement (ECInstanceId, ECClassId) AS (
              SELECT e.OriginalECInstanceId, OriginalECClassId
              FROM Element2dNearestFunctionalElement e
                LEFT JOIN FoundNearestFunctionalElements f ON f.OriginalECInstanceId = e.OriginalECInstanceId
              WHERE e.ParentId IS NULL AND f.ECInstanceId IS NULL
            ),
            MergedElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM FoundNearestFunctionalElements
              UNION
              SELECT ECInstanceId, ECClassId FROM ElementsWithoutFunctionalElement
            ),`;
  }

  function isTransient(id: string): boolean {
    // A transient Id is of the format "0xffffffxxxxxxxxxx" where the leading 6 digits indicate an invalid briefcase Id.
    return 18 === id.length && id.startsWith("0xffffff");
  }

  async function* executeQuery(queryExecutor: IECSqlQueryExecutor, query: string, bindings?: ECSqlBinding[]): AsyncIterableIterator<SelectableInstanceKey> {
    const reader = queryExecutor.createQueryReader(query, bindings);

    for await (const row of reader) {
      yield { className: row.ClassName, id: row.ECInstanceId };
    }
  }
}
