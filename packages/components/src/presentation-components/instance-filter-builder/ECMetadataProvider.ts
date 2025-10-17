/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { compareStrings, Guid, GuidString, Id64, Id64String, LRUDictionary } from "@itwin/core-bentley";
import { ECSqlReader, QueryBinder, QueryOptions, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

/* c8 ignore start */

/** @internal */
export class ECClassInfo {
  constructor(
    public readonly id: Id64String,
    public readonly name: string,
    public readonly label: string,
    private _baseClasses: Set<Id64String>,
    private _derivedClasses: Set<Id64String>,
  ) {}

  public get baseClassIds(): Array<Id64String> {
    return Array.from(this._baseClasses);
  }
  public get derivedClassIds(): Array<Id64String> {
    return Array.from(this._derivedClasses);
  }

  public isBaseOf(idOrInfo: Id64String | ECClassInfo): boolean {
    if (typeof idOrInfo === "string") {
      return idOrInfo === this.id || this._derivedClasses.has(idOrInfo);
    }
    return idOrInfo.id === this.id || this._derivedClasses.has(idOrInfo.id);
  }

  public isDerivedFrom(idOrInfo: Id64String | ECClassInfo): boolean {
    if (typeof idOrInfo === "string") {
      return idOrInfo === this.id || this._baseClasses.has(idOrInfo);
    }
    return idOrInfo.id === this.id || this._baseClasses.has(idOrInfo.id);
  }
}

/** @internal */
export class ECMetadataProvider {
  private _classInfoCache = new LRUDictionary<CacheKey, ECClassInfo>(50, compareKeys);
  #componentId: GuidString;
  #componentName: string;
  constructor(private _queryReaderFactory: (ecsql: string, params?: QueryBinder, config?: QueryOptions) => ECSqlReader) {
    this.#componentId = Guid.createValue();
    this.#componentName = "ECMetadataProvider";
  }

  public async getECClassInfo(idOrFullName: Id64String | string): Promise<ECClassInfo | undefined>;
  public async getECClassInfo(schemaName: string, className: string): Promise<ECClassInfo | undefined>;
  public async getECClassInfo(idNameOrSchema: Id64String | string, className?: string): Promise<ECClassInfo | undefined> {
    // load class info using class id
    if (Id64.isId64(idNameOrSchema)) {
      return this.getClassInfoById(idNameOrSchema);
    }

    // load class info using class full name: <schemaName>:<className>
    const fullName = className ? `${idNameOrSchema}:${className}` : idNameOrSchema;
    return this.getClassInfoByFullName(fullName);
  }

  private async getClassInfoById(id: Id64String): Promise<ECClassInfo | undefined> {
    let classInfo = this._classInfoCache.get({ id, name: "" });
    if (!classInfo) {
      const classQuery = `
        ${classQueryBase}
        WHERE classDef.ECInstanceId = :id
      `;
      classInfo = await this.createECClassInfo(
        this._queryReaderFactory(classQuery, QueryBinder.from({ id }), {
          rowFormat: QueryRowFormat.UseJsPropertyNames,
          restartToken: `${this.#componentName}/${this.#componentId}/class-by-id`,
        }),
      );
      classInfo && this._classInfoCache.set({ id: classInfo.id, name: classInfo.name }, classInfo);
    }
    return classInfo;
  }

  private async getClassInfoByFullName(name: string): Promise<ECClassInfo | undefined> {
    let classInfo = this._classInfoCache.get({ id: "", name });
    if (!classInfo) {
      const classQuery = `
        ${classQueryBase}
        WHERE classDef.Name = :className AND schemaDef.Name = :schemaName
      `;
      const [schemaName, className] = this.splitFullClassName(name);
      classInfo = await this.createECClassInfo(
        this._queryReaderFactory(classQuery, QueryBinder.from({ schemaName, className }), {
          rowFormat: QueryRowFormat.UseJsPropertyNames,
          restartToken: `${this.#componentName}/${this.#componentId}/class-by-name`,
        }),
      );
      classInfo && this._classInfoCache.set({ id: classInfo.id, name: classInfo.name }, classInfo);
    }
    return classInfo;
  }

  private async createECClassInfo(reader: ECSqlReader) {
    while (await reader.step()) {
      const classHierarchy = await this.queryClassHierarchyInfo(reader.current.id);
      return new ECClassInfo(reader.current.id, reader.current.name, reader.current.label, classHierarchy.baseClasses, classHierarchy.derivedClasses);
    }
    return undefined;
  }

  private async queryClassHierarchyInfo(id: Id64String): Promise<{ baseClasses: Set<Id64String>; derivedClasses: Set<Id64String> }> {
    const classHierarchyQuery = `
      SELECT chc.TargetECInstanceId baseId, chc.SourceECInstanceId derivedId
      FROM meta.ClassHasAllBaseClasses chc
      WHERE chc.SourceECInstanceId = :id OR chc.TargetECInstanceId = :id
    `;

    const hierarchy = { baseClasses: new Set<Id64String>(), derivedClasses: new Set<Id64String>() };
    const reader = this._queryReaderFactory(classHierarchyQuery, QueryBinder.from({ id }), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
      restartToken: `${this.#componentName}/${this.#componentId}/class-hierarchy`,
    });
    while (await reader.step()) {
      if (reader.current.baseId === id) {
        hierarchy.derivedClasses.add(reader.current.derivedId);
      }
      if (reader.current.derivedId === id) {
        hierarchy.baseClasses.add(reader.current.baseId);
      }
    }
    return hierarchy;
  }

  private splitFullClassName(fullName: string): [string, string] {
    const [schemaName, className] = fullName.split(fullName.includes(".") ? "." : ":");
    return [schemaName, className];
  }
}

const classQueryBase = `
  SELECT classDef.ECInstanceId id, (schemaDef.Name || ':' || classDef.Name) name, COALESCE(classDef.DisplayLabel, classDef.name) label
  FROM meta.ECClassDef classDef
  JOIN meta.ECSchemaDef schemaDef ON classDef.Schema.Id = schemaDef.ECInstanceId
`;

const metadataProviders = new Map<string, ECMetadataProvider>();
/** @internal */
export function getIModelMetadataProvider(imodel: IModelConnection) {
  let metadataProvider = metadataProviders.get(imodel.key);
  if (!metadataProvider) {
    metadataProvider = new ECMetadataProvider((ecsql: string, params?: QueryBinder, config?: QueryOptions) => imodel.createQueryReader(ecsql, params, config));
    metadataProviders.set(imodel.key, metadataProvider);
    /* c8 ignore next 3 */
    imodel.onClose.addOnce(() => {
      metadataProviders.delete(imodel.key);
    });
  }
  return metadataProvider;
}

interface CacheKey {
  id: Id64String;
  name: string;
}

function compareKeys(lhs: CacheKey, rhs: CacheKey) {
  if (lhs.id.length !== 0 && rhs.id.length !== 0) {
    return compareStrings(lhs.id, rhs.id);
  }
  return compareStrings(lhs.name, rhs.name);
}
