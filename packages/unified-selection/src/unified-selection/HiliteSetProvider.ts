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
   * @param selection Selection to get hilite set for.
   */
  public async getHiliteSet(selection: Selectables): Promise<HiliteSet> {
    const models: string[] = [];
    const subCategories: string[] = [];
    const elements: string[] = [];

    const iterator = this.getHiliteSetIterator(selection);
    for await (const set of iterator) {
      models.push(...set.models);
      subCategories.push(...set.subCategories);
      elements.push(...set.elements);
    }

    return {
      models,
      subCategories,
      elements,
    };
  }

  /**
   * Get hilite set iterator for supplied `Selectables`.
   */
  public async *getHiliteSetIterator(selection: Selectables): AsyncIterableIterator<HiliteSet> {
    // Map between element ID types and EC instance IDs
    const keysByType = new Map<InstanceIdType, string[]>();

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

    yield {
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
    const cachedType = this._classRelationCache.get(key.className.replace(".", ":"));
    if (cachedType) {
      return cachedType;
    }

    const keyClass = await this.getClass(key.className);
    if (!keyClass) {
      this._classRelationCache.set(key.className, "unknown");
      return "unknown";
    }

    return (
      (await this.checkType(key, keyClass, "BisCore", "Subject", "subject")) ??
      (await this.checkType(key, keyClass, "BisCore", "Model", "model")) ??
      (await this.checkType(key, keyClass, "BisCore", "Category", "category")) ??
      (await this.checkType(key, keyClass, "BisCore", "SubCategory", "subCategory")) ??
      (await this.checkType(key, keyClass, "Functional", "FunctionalElement", "functionalElement")) ??
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

    const bindings: ECSqlBinding[] = [];
    const query = `WITH RECURSIVE
                    ChildSubjects (ECInstanceId, JsonProperties) AS (
                      SELECT ECInstanceId, JsonProperties FROM BisCore.Subject WHERE ${this.formBindings("ECInstanceId", subjectKeys, bindings)}
                      UNION ALL
                      SELECT r.ECInstanceId, r.JsonProperties FROM ChildSubjects s
                        JOIN BisCore.Subject r ON r.Parent.Id = s.ECInstanceId
                    ),
                    Models (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.Model s
                      WHERE ${this.formBindings("ECInstanceId", modelKeys, bindings)}
                    )
                    SELECT r.ECInstanceId as \`ECInstanceId\` FROM ChildSubjects s
                      JOIN BisCore.PhysicalPartition r
                        ON r.Parent.Id = s.ECInstanceId
                        OR json_extract(s.JsonProperties,'$.Subject.Model.TargetPartition') = printf('0x%x', r.ECInstanceId)
                    UNION
                    SELECT ECInstanceId FROM Models;`;

    return this.executeQuery(query, bindings);
  }

  private async getHilitedSubCategories(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const subCategoryKeys = map.get("subCategory") ?? [];
    const categoryKeys = map.get("category") ?? [];

    if (subCategoryKeys.length === 0 && categoryKeys.length === 0) {
      return [];
    }

    const bindings: ECSqlBinding[] = [];
    const query = `WITH
                    CategorySubCategories (ECInstanceId) AS (
                      SELECT r.TargetECInstanceId as \`ECInstanceId\` FROM BisCore.Category s
                        JOIN BisCore.CategoryOwnsSubCategories r ON r.SourceECInstanceId = s.ECInstanceId
                      WHERE r.TargetECClassId IS (BisCore.SubCategory) AND ${this.formBindings("s.ECInstanceId", categoryKeys, bindings)}
                    ),
                    SubCategories (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.SubCategory s
                      WHERE ${this.formBindings("s.ECInstanceId", subCategoryKeys, bindings)}
                    )
                   SELECT ECInstanceId FROM CategorySubCategories
                   UNION
                   SELECT ECInstanceId FROM SubCategories;`;

    return this.executeQuery(query, bindings);
  }

  private async getHilitedElements(map: Map<InstanceIdType, string[]>): Promise<string[]> {
    const groupInformationElementKeys = map.get("groupInformationElement") ?? [];
    const geometricElementKeys = map.get("geometricElement") ?? [];
    const functionalElements = map.get("functionalElement") ?? [];
    const elementKeys = map.get("element") ?? [];
    const hasFunctionalElements = functionalElements.length !== 0;

    if (groupInformationElementKeys.length === 0 && geometricElementKeys.length === 0 && elementKeys.length === 0 && !hasFunctionalElements) {
      return [];
    }

    const bindings: ECSqlBinding[] = [];
    const query = `WITH RECURSIVE
                    ${hasFunctionalElements ? this.getHilitedFunctionalElementsQuery(functionalElements, bindings) : ""}
                    GroupMembers (ECInstanceId, ECClassId) AS (
                      SELECT TargetECInstanceId, TargetECClassId FROM BisCore.ElementGroupsMembers
                      WHERE ${this.formBindings("ECInstanceId", groupInformationElementKeys, bindings)}
                    ),
                    GroupGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM GroupMembers
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM GroupGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    ),
                    ElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.Element WHERE ${this.formBindings("ECInstanceId", elementKeys, bindings)}
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM ElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    ),
                    GeometricElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.GeometricElement WHERE ${this.formBindings("ECInstanceId", geometricElementKeys, bindings)}
                      UNION ALL
                      SELECT r.TargetECInstanceId, r.TargetECClassId FROM GeometricElementGeometricElements s
                        JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
                    )
                   ${
                     hasFunctionalElements
                       ? `
                   SELECT ECInstanceId FROM FunctionalElementChildGeometricElements WHERE ECClassId IS (BisCore.GeometricElement)
                   UNION
                   `
                       : ``
                   }
                   SELECT ECInstanceId FROM GeometricElementGeometricElements WHERE ECClassId IS (BisCore.GeometricElement)
                   UNION
                   SELECT ECInstanceId FROM GroupGeometricElements WHERE ECClassId IS (BisCore.GeometricElement)
                   UNION
                   SELECT ECInstanceId FROM ElementGeometricElements WHERE ECClassId IS (BisCore.GeometricElement);`;

    return this.executeQuery(query, bindings);
  }

  private getHilitedFunctionalElementsQuery(functionalElements: string[], bindings: ECSqlBinding[]): string {
    return `ChildFunctionalElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM Functional.FunctionalElement WHERE ${this.formBindings("ECInstanceId", functionalElements, bindings)}
              UNION ALL
              SELECT r.ECInstanceId, r.ECClassId FROM ChildFunctionalElements s
                JOIN Functional.FunctionalElement r ON r.Parent.Id = s.ECInstanceId
            ),
            PhysicalElements (ECInstanceId, ECClassId) AS (
              SELECT r.SourceECInstanceId, r.SourceECClassId FROM ChildFunctionalElements s
                JOIN Functional.PhysicalElementFulfillsFunction r ON r.TargetECInstanceId = s.ECInstanceId
            ),
            DrawingGraphicElements (ECInstanceId, ECClassId) AS (
              SELECT r.SourceECInstanceId, r.SourceECClassId FROM ChildFunctionalElements s
                JOIN Functional.DrawingGraphicRepresentsFunctionalElement r ON r.TargetECInstanceId = s.ECInstanceId
            ),
            PhysicalElementGeometricElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM PhysicalElements
              UNION ALL
              SELECT r.TargetECInstanceId, r.TargetECClassId FROM PhysicalElementGeometricElements s
                JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
            ),
            DrawingGraphicElementGeometricElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM DrawingGraphicElements
              UNION ALL
              SELECT r.TargetECInstanceId, r.TargetECClassId FROM DrawingGraphicElementGeometricElements s
                JOIN BisCore.ElementOwnsChildElements r ON r.SourceECInstanceId = s.ECInstanceId
            ),
            FunctionalElementChildGeometricElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM PhysicalElementGeometricElements
              UNION
              SELECT ECInstanceId, ECClassId FROM DrawingGraphicElementGeometricElements
            ),`;
  }

  private formBindings(property: string, ids: string[], bindings: ECSqlBinding[]): string {
    if (ids.length > 1000) {
      bindings.push({ type: "idset", value: ids });
      return `InVirtualSet(?, ${property})`;
    }

    if (ids.length === 0) {
      return `${property} IN (-1)`;
    }

    ids.forEach((id) => bindings.push({ type: "id", value: id }));
    return `${property} IN (${ids.map(() => "?").join(",")})`;
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
