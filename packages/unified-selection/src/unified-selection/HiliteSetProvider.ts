/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { ECClass, IMetadataProvider, parseFullClassName } from "./queries/ECMetadata";
import { ECSqlBinding, IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "./Selectable";

/**
 * A set of model, subcategory and element ids that can be used for specifying hilite.
 * @public
 */
export interface HiliteSet {
  models: string[];
  subCategories: string[];
  elements: string[];
}

/**
 * Props for creating a `HiliteSetProvider` instance.
 * @public
 */
export interface HiliteSetProviderProps {
  queryExecutor: IECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

/**
 * ECSQL based provider which determines what `HiliteSet`
 * should be hilited based on the supplied `Selectables`.
 * @public
 */
export class HiliteSetProvider {
  private _queryExecutor: IECSqlQueryExecutor;
  private _metadataProvider: IMetadataProvider;
  // Map between a class name and its type
  private _classRelationCache: Map<string, InstanceIdType>;
  private _hasFunctionalSchema?: boolean;

  private constructor(props: HiliteSetProviderProps) {
    this._queryExecutor = props.queryExecutor;
    this._metadataProvider = props.metadataProvider;
    this._classRelationCache = new Map<string, InstanceIdType>();
  }

  /**
   * Create a hilite set provider.
   */
  public static create(props: HiliteSetProviderProps) {
    return new HiliteSetProvider(props);
  }

  /**
   * Get hilite set for supplied `Selectables`.
   */
  public async getHiliteSet(selection: Selectables): Promise<HiliteSet> {
    // Map between element ID types and EC instance IDs
    const keysByType = new Map<InstanceIdType, string[]>();
    if (!this._hasFunctionalSchema) {
      try {
        this._hasFunctionalSchema = !!(await this._metadataProvider.getSchema("Functional"));
      } catch {
        this._hasFunctionalSchema = false;
      }
    }

    for (const entry of selection.instanceKeys) {
      for (const key of entry[1]) {
        await this.addKeyByType({ className: entry[0], id: key }, keysByType);
      }
    }

    for (const entry of selection.custom) {
      for await (const key of entry[1].loadInstanceKeys()) {
        await this.addKeyByType(key, keysByType);
      }
    }

    return {
      models: await this.getHilitedModels(keysByType),
      subCategories: await this.getHilitedSubCategories(keysByType),
      elements: await this.getHilitedElements(keysByType),
    };
  }

  private async addKeyByType(key: SelectableInstanceKey, map: Map<string, string[]>) {
    const keyType = await this.getType(key);
    let array = map.get(keyType);
    if (!array) {
      array = [];
    }

    array.push(key.id);
    map.set(keyType, array);
  }

  private async getType(key: SelectableInstanceKey): Promise<InstanceIdType> {
    const cachedType = this._classRelationCache.get(key.className);
    if (cachedType) {
      return cachedType;
    }

    const keyClass = await this.getClass(key.className);
    if (!keyClass) {
      return "unknown";
    }

    if (this._hasFunctionalSchema) {
      const functionalType = await this.checkType(key, keyClass, "Functional", "FunctionalElement", "functionalElement");
      if (functionalType) {
        return functionalType;
      }
    }

    return (
      (await this.checkType(key, keyClass, "BisCore", "Subject", "subject")) ??
      (await this.checkType(key, keyClass, "BisCore", "Model", "model")) ??
      (await this.checkType(key, keyClass, "BisCore", "Category", "category")) ??
      (await this.checkType(key, keyClass, "BisCore", "SubCategory", "subCategory")) ??
      (await this.checkType(key, keyClass, "BisCore", "GroupInformationElement", "groupInformationElement")) ??
      (await this.checkType(key, keyClass, "BisCore", "GeometricElement", "geometricElement")) ??
      (await this.checkType(key, keyClass, "BisCore", "Element", "element")) ??
      "unknown"
    );
  }

  private async checkType(key: SelectableInstanceKey, keyClass: ECClass, schemaName: string, className: string, type: InstanceIdType) {
    if (await keyClass.is(className, schemaName)) {
      this._classRelationCache.set(key.className, type);
      return type;
    }
    return undefined;
  }

  private async getHilitedModels(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const modelKeys = map.get("model") ?? [];
    const subjectKeys = map.get("subject") ?? [];

    if (modelKeys.length === 0 && subjectKeys.length === 0) {
      return [];
    }

    const bindings: ECSqlBinding[] = [
      { type: "idset", value: subjectKeys },
      { type: "idset", value: modelKeys },
    ];
    const query = `WITH RECURSIVE
                    ChildSubjects (ECInstanceId) AS (
                      SELECT ECInstanceId FROM BisCore.Subject WHERE InVirtualSet(?, ECInstanceId)
                      UNION ALL
                      SELECT r.TargetECInstanceId FROM ChildSubjects s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.Subject)
                    ),
                    Models (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.Model s
                      WHERE InVirtualSet(?, ECInstanceId)
                    )
                    SELECT r.TargetECInstanceId as \`ECInstanceId\` FROM ChildSubjects s
                      JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.PhysicalPartition)
                    UNION
                    SELECT DISTINCT ECInstanceId FROM Models;`;

    return this.executeQuery(query, bindings);
  }

  private async getHilitedSubCategories(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const subCategoryKeys = map.get("subCategory") ?? [];
    const categoryKeys = map.get("category") ?? [];

    if (subCategoryKeys.length === 0 && categoryKeys.length === 0) {
      return [];
    }

    const bindings: ECSqlBinding[] = [
      { type: "idset", value: categoryKeys },
      { type: "idset", value: subCategoryKeys },
    ];
    const query = `WITH
                    CategorySubCategories (ECInstanceId) AS (
                      SELECT r.TargetECInstanceId as \`ECInstanceId\` FROM BisCore.Category s
                        JOIN BisCore.CategoryOwnsSubCategories r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.SubCategory) AND InVirtualSet(?, s.ECInstanceId)
                    ),
                    SubCategories (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.SubCategory s
                      WHERE InVirtualSet(?, s.ECInstanceId)
                    )
                   SELECT DISTINCT ECInstanceId FROM CategorySubCategories
                   UNION
                   SELECT DISTINCT ECInstanceId FROM SubCategories;`;

    return this.executeQuery(query, bindings);
  }

  private async getHilitedElements(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const groupInformationElementKeys = map.get("groupInformationElement") ?? [];
    let geometricElementKeySet = new Set(map.get("geometricElement") ?? []);
    const elementKeys = map.get("element") ?? [];

    if (this._hasFunctionalSchema) {
      const functionalGeometricElements = new Set(await this.getHilitedFunctionalElements(map));
      geometricElementKeySet = new Set([...geometricElementKeySet, ...functionalGeometricElements]);
    }

    const geometricElementKeys = Array.from(geometricElementKeySet);

    if (groupInformationElementKeys.length === 0 && geometricElementKeys.length === 0 && elementKeys.length === 0) {
      return [];
    }

    const bindings: ECSqlBinding[] = [
      { type: "idset", value: groupInformationElementKeys },
      { type: "idset", value: elementKeys },
      { type: "idset", value: geometricElementKeys },
    ];
    const query = `WITH RECURSIVE
                    GroupMembers (ECInstanceId, ECClassId) AS (
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM BisCore.GroupInformationElement s
                        JOIN BisCore.ElementGroupsMembers r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE InVirtualSet(?, s.ECInstanceId)
                    ),
                    GroupGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM GroupMembers
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM GroupGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    ),
                    ElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.Element WHERE InVirtualSet(?, ECInstanceId)
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM ElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    ),
                    MergedElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.GeometricElement WHERE InVirtualSet(?, ECInstanceId)
                      UNION
                      SELECT ECInstanceId, ECClassId FROM GroupGeometricElements WHERE ECClassId IS (BisCore.GeometricElement)
                      UNION
                      SELECT ECInstanceId, ECClassId FROM ElementGeometricElements WHERE ECClassId IS (BisCore.GeometricElement)
                    ),
                    GeometricElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM MergedElements
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM GeometricElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    )
                   SELECT DISTINCT ECInstanceId FROM GeometricElementGeometricElements
                   WHERE ECClassId IS (BisCore.GeometricElement);`;

    return this.executeQuery(query, bindings);
  }

  private async getHilitedFunctionalElements(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const functionalElements = map.get("functionalElement") ?? [];

    if (functionalElements.length === 0) {
      return [];
    }

    const bindings: ECSqlBinding[] = [{ type: "idset", value: functionalElements }];
    const query = `WITH RECURSIVE
                    ChildFunctionalElements (ECInstanceId) AS (
                      SELECT ECInstanceId FROM Functional.FunctionalElement WHERE InVirtualSet(?, ECInstanceId)
                      UNION ALL
                      SELECT r.TargetECInstanceId FROM ChildFunctionalElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (Functional.FunctionalElement)
                    ),
                    PhysicalElements (ECInstanceId) AS (
                      SELECT r.SourceECInstanceId FROM ChildFunctionalElements s
                        JOIN Functional.PhysicalElementFulfillsFunction r ON r.TargetECInstanceId = s.ECInstanceId
                    ),
                    DrawingGraphicElements (ECInstanceId) AS (
                      SELECT r.SourceECInstanceId FROM ChildFunctionalElements s
                        JOIN Functional.DrawingGraphicRepresentsFunctionalElement r ON r.TargetECInstanceId = s.ECInstanceId
                    ),
                    PhysicalElementGeometricElements (ECInstanceId) AS (
                      SELECT ECInstanceId FROM PhysicalElements
                      UNION ALL
                      SELECT r.TargetECInstanceId FROM PhysicalElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.GeometricElement)
                    ),
                    DrawingGraphicElementGeometricElements (ECInstanceId) AS (
                      SELECT ECInstanceId FROM DrawingGraphicElements
                      UNION ALL
                      SELECT r.TargetECInstanceId FROM DrawingGraphicElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.GeometricElement)
                    )
                   SELECT DISTINCT ECInstanceId FROM PhysicalElementGeometricElements
                   UNION
                   SELECT DISTINCT ECInstanceId FROM DrawingGraphicElementGeometricElements;`;

    return this.executeQuery(query, bindings);
  }

  private async executeQuery(query: string, bindings?: ECSqlBinding[]): Promise<string[]> {
    const elements: string[] = [];
    const reader = this._queryExecutor.createQueryReader(query, bindings);

    for await (const row of reader) {
      elements.push(row.ECInstanceId);
    }
    return elements;
  }

  private async getClass(fullClassName: string): Promise<ECClass | undefined> {
    const { schemaName, className } = parseFullClassName(fullClassName);
    const schema = await this._metadataProvider.getSchema(schemaName);
    if (!schema) {
      return undefined;
    }
    const schemaClass = await schema.getClass(className);
    if (!schemaClass) {
      return undefined;
    }
    return schemaClass;
  }
}

type InstanceIdType =
  | "subject"
  | "model"
  | "category"
  | "subCategory"
  | "functionalElement"
  | "groupInformationElement"
  | "geometricElement"
  | "element"
  | "unknown";
