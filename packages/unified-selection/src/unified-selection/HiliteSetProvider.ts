/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { ECClass, IMetadataProvider, parseFullClassName } from "./queries/ECMetadata";
import { ECSqlBinding, formIdBindings, IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "./Selectable";

/**
 * A set of model, subcategory and element ids that can be used for specifying hilite.
 * @see https://www.itwinjs.org/reference/core-frontend/selectionset/hiliteset/
 * @beta
 */
export interface HiliteSet {
  models: string[];
  subCategories: string[];
  elements: string[];
}

/**
 * Props for creating a `HiliteSetProvider` instance.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface HiliteSetProviderProps {
  queryExecutor: IECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

/**
 * Defines return value of `createHiliteSetProvider`.
 *
 * @beta Used in public API as a return value. Not expected to be created / extended by package
 * consumers, may be supplemented with required attributes any time.
 */
export interface HiliteSetProvider {
  /** Get the current hilite set iterator for the specified imodel */
  getHiliteSet(props: { selectables: Selectables }): AsyncIterableIterator<HiliteSet>;
}

/**
 * Creates a hilite set provider that returns a `HiliteSet` for given selectables.
 * @beta
 */
export function createHiliteSetProvider(props: HiliteSetProviderProps): HiliteSetProvider {
  return new HiliteSetProviderImpl(props);
}

class HiliteSetProviderImpl implements HiliteSetProvider {
  private _queryExecutor: IECSqlQueryExecutor;
  private _metadataProvider: IMetadataProvider;
  // Map between a class name and its type
  private _classRelationCache: Map<string, InstanceIdType>;

  constructor(props: HiliteSetProviderProps) {
    this._queryExecutor = props.queryExecutor;
    this._metadataProvider = props.metadataProvider;
    this._classRelationCache = new Map<string, InstanceIdType>();
  }

  /**
   * Get hilite set iterator for supplied `Selectables`.
   */
  public async *getHiliteSet({ selectables }: { selectables: Selectables }): AsyncIterableIterator<HiliteSet> {
    // Map between element ID types and EC instance IDs
    const keysByType = new Map<InstanceIdType, string[]>();

    for (const entry of selectables.instanceKeys) {
      for (const key of entry[1]) {
        await this.addKeyByType({ className: entry[0], id: key }, keysByType);
      }
    }

    for (const entry of selectables.custom) {
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
      map.set(keyType, array);
    }

    array.push(key.id);
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
                      SELECT ECInstanceId, JsonProperties FROM BisCore.Subject WHERE ${formIdBindings("ECInstanceId", subjectKeys, bindings)}
                      UNION ALL
                      SELECT r.ECInstanceId, r.JsonProperties FROM ChildSubjects s
                        JOIN BisCore.Subject r ON r.Parent.Id = s.ECInstanceId
                    ),
                    Models (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.Model s
                      WHERE ${formIdBindings("ECInstanceId", modelKeys, bindings)}
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
                      SELECT r.ECInstanceId as \`ECInstanceId\` FROM BisCore.Category s
                        JOIN BisCore.SubCategory r ON r.Parent.Id = s.ECInstanceId
                      WHERE ${formIdBindings("s.ECInstanceId", categoryKeys, bindings)}
                    ),
                    SubCategories (ECInstanceId) AS (
                      SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.SubCategory s
                      WHERE ${formIdBindings("s.ECInstanceId", subCategoryKeys, bindings)}
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
                      WHERE ${formIdBindings("SourceECInstanceId", groupInformationElementKeys, bindings)}
                    ),
                    GroupGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM GroupMembers
                      UNION ALL
                      SELECT r.ECInstanceId, r.ECClassId FROM GroupGeometricElements s
                        JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
                    ),
                    ElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.Element WHERE ${formIdBindings("ECInstanceId", elementKeys, bindings)}
                      UNION ALL
                      SELECT r.ECInstanceId, r.ECClassId FROM ElementGeometricElements s
                        JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
                    ),
                    GeometricElementGeometricElements (ECInstanceId, ECClassId) AS (
                      SELECT ECInstanceId, ECClassId FROM BisCore.GeometricElement WHERE ${formIdBindings("ECInstanceId", geometricElementKeys, bindings)}
                      UNION ALL
                      SELECT r.ECInstanceId, r.ECClassId FROM GeometricElementGeometricElements s
                        JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
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
              SELECT ECInstanceId, ECClassId FROM Functional.FunctionalElement WHERE ${formIdBindings("ECInstanceId", functionalElements, bindings)}
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
              SELECT r.ECInstanceId, r.ECClassId FROM PhysicalElementGeometricElements s
                JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
            ),
            DrawingGraphicElementGeometricElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM DrawingGraphicElements
              UNION ALL
              SELECT r.ECInstanceId, r.ECClassId FROM DrawingGraphicElementGeometricElements s
                JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
            ),
            FunctionalElementChildGeometricElements (ECInstanceId, ECClassId) AS (
              SELECT ECInstanceId, ECClassId FROM PhysicalElementGeometricElements
              UNION
              SELECT ECInstanceId, ECClassId FROM DrawingGraphicElementGeometricElements
            ),`;
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
