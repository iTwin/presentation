/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { EMPTY, filter, forkJoin, from, map, merge, mergeMap, Observable, scan, shareReplay, Subject, toArray } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { ECClass, IMetadataProvider, parseFullClassName } from "./queries/ECMetadata";
import { ECSqlBinding, IECSqlQueryExecutor } from "./queries/ECSqlCore";
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
  private _classRelationCache: Map<string, InstanceIdType | Promise<InstanceIdType>>;

  constructor(props: HiliteSetProviderProps) {
    this._queryExecutor = props.queryExecutor;
    this._metadataProvider = props.metadataProvider;
    this._classRelationCache = new Map();
  }

  /**
   * Get hilite set iterator for supplied `Selectables`.
   */
  public getHiliteSet(props: { selectables: Selectables }): AsyncIterableIterator<HiliteSet> {
    const obs = this.getHiliteSetObservable(props);
    return eachValueFrom(obs);
  }

  /**
   * Returns a "hot" observable of hilite sets.
   */
  private getHiliteSetObservable({ selectables }: { selectables: Selectables }): Subject<HiliteSet> {
    const instancesByType = this.getInstancesByType(selectables);
    const observables: { [key in keyof HiliteSet]?: Observable<string> } = {
      models: this.getHilitedModels(instancesByType),
      subCategories: this.getHilitedSubCategories(instancesByType),
      elements: this.getHilitedElements(instancesByType),
    };

    let hiliteSet: HiliteSet = { models: [], subCategories: [], elements: [] };
    let lastEmitTime = performance.now();
    const subject = new Subject<HiliteSet>();
    const subscriptions = (["models", "subCategories", "elements"] as const).map((key) =>
      observables[key]!.subscribe({
        next(val) {
          hiliteSet[key].push(val);
          if (performance.now() - lastEmitTime < 20) {
            return;
          }
          subject.next(hiliteSet);
          hiliteSet = { models: [], subCategories: [], elements: [] };
          lastEmitTime = performance.now();
        },
        complete() {
          observables[key] = undefined;
          if (observables.models || observables.subCategories || observables.elements) {
            return;
          }
          // Emit last batch before completing the observable.
          if (hiliteSet.elements.length || hiliteSet.models.length || hiliteSet.subCategories.length) {
            subject.next(hiliteSet);
          }
          subject.complete();
        },
        error(err) {
          subscriptions.forEach((x) => x.unsubscribe());
          subscriptions.length = 0;
          subject.error(err);
        },
      }),
    );

    return subject;
  }

  private async getType(key: SelectableInstanceKey): Promise<InstanceIdType> {
    const cachedType = this._classRelationCache.get(key.className.replace(".", ":"));
    if (cachedType) {
      return cachedType;
    }

    const promise = this.getTypeImpl(key).then((res) => {
      // Update the cache with the result of the promise.
      this._classRelationCache.set(key.className, res);
      return res;
    });

    // Add the promise to cache to prevent `getTypeImpl` being called multiple times.
    this._classRelationCache.set(key.className, promise);
    return promise;
  }

  private async getTypeImpl(key: SelectableInstanceKey): Promise<InstanceIdType> {
    const keyClass = await this.getClass(key.className);
    return (
      (keyClass &&
        ((await this.checkType(keyClass, "BisCore", "Subject", "subject")) ??
          (await this.checkType(keyClass, "BisCore", "Model", "model")) ??
          (await this.checkType(keyClass, "BisCore", "Category", "category")) ??
          (await this.checkType(keyClass, "BisCore", "SubCategory", "subCategory")) ??
          (await this.checkType(keyClass, "Functional", "FunctionalElement", "functionalElement")) ??
          (await this.checkType(keyClass, "BisCore", "GroupInformationElement", "groupInformationElement")) ??
          (await this.checkType(keyClass, "BisCore", "GeometricElement", "geometricElement")) ??
          (await this.checkType(keyClass, "BisCore", "Element", "element")))) ??
      "unknown"
    );
  }

  private async checkType(keyClass: ECClass, schemaName: string, className: string, type: InstanceIdType) {
    return (await keyClass.is(className, schemaName)) ? type : undefined;
  }

  private getInstancesByType(selectables: Selectables): InstancesByType {
    const keyTypeObs = merge(
      from(selectables.custom.values()).pipe(mergeMap((selectable) => selectable.loadInstanceKeys())),
      from(selectables.instanceKeys).pipe(mergeMap(([className, idSet]) => from(idSet).pipe(map((id) => ({ className, id }))))),
    ).pipe(
      // Get types for each instance key
      mergeMap((instanceKey) => from(this.getType(instanceKey)).pipe(map((instanceIdType) => ({ instanceId: instanceKey.id, instanceIdType })))),
      // Cache the results
      shareReplay(),
    );

    return Object.fromEntries(
      INSTANCE_TYPES.map((type) => [
        type,
        keyTypeObs.pipe(
          filter(({ instanceIdType }) => instanceIdType === type),
          map(({ instanceId }) => instanceId),
          unique(),
        ),
      ]),
    ) as InstancesByType;
  }

  private getHilitedModels(instancesByType: InstancesByType): Observable<string> {
    return forkJoin({
      modelKeys: instancesByType.model.pipe(toArray()),
      subjectKeys: instancesByType.subject.pipe(toArray()),
    }).pipe(
      mergeMap(({ modelKeys, subjectKeys }) => {
        if (!modelKeys.length && !subjectKeys.length) {
          return EMPTY;
        }

        const bindings: ECSqlBinding[] = [];
        const query = `
          WITH RECURSIVE
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
          SELECT ECInstanceId FROM Models;
        `;
        return from(this._queryExecutor.createQueryReader(query, bindings));
      }),
      map((row) => row.ECInstanceId),
    );
  }

  private getHilitedSubCategories(instancesByType: InstancesByType): Observable<string> {
    return forkJoin({
      subCategoryKeys: instancesByType.subCategory.pipe(toArray()),
      categoryKeys: instancesByType.category.pipe(toArray()),
    }).pipe(
      mergeMap(({ subCategoryKeys, categoryKeys }) => {
        if (!subCategoryKeys.length && !categoryKeys.length) {
          return EMPTY;
        }

        const bindings: ECSqlBinding[] = [];
        const query = `
          WITH
          CategorySubCategories (ECInstanceId) AS (
            SELECT r.ECInstanceId as \`ECInstanceId\` FROM BisCore.Category s
              JOIN BisCore.SubCategory r ON r.Parent.Id = s.ECInstanceId
            WHERE ${this.formBindings("s.ECInstanceId", categoryKeys, bindings)}
          ),
          SubCategories (ECInstanceId) AS (
            SELECT s.ECInstanceId as \`ECInstanceId\` FROM BisCore.SubCategory s
            WHERE ${this.formBindings("s.ECInstanceId", subCategoryKeys, bindings)}
          )
          SELECT ECInstanceId FROM CategorySubCategories
          UNION
          SELECT ECInstanceId FROM SubCategories;`;
        return from(this._queryExecutor.createQueryReader(query, bindings));
      }),
      map((row) => row.ECInstanceId),
    );
  }

  private getHilitedElements(instancesByType: InstancesByType): Observable<string> {
    return forkJoin({
      groupInformationElementKeys: instancesByType.groupInformationElement.pipe(toArray()),
      geometricElementKeys: instancesByType.geometricElement.pipe(toArray()),
      functionalElements: instancesByType.functionalElement.pipe(toArray()),
      elementKeys: instancesByType.element.pipe(toArray()),
    }).pipe(
      mergeMap(({ groupInformationElementKeys, geometricElementKeys, functionalElements, elementKeys }) => {
        const hasFunctionalElements = !!functionalElements.length;
        if (!groupInformationElementKeys.length && !geometricElementKeys.length && !elementKeys.length && !hasFunctionalElements) {
          return EMPTY;
        }

        const bindings: ECSqlBinding[] = [];
        const query = `
          WITH RECURSIVE
          ${hasFunctionalElements ? this.getHilitedFunctionalElementsQuery(functionalElements, bindings) : ""}
          GroupMembers (ECInstanceId, ECClassId) AS (
            SELECT TargetECInstanceId, TargetECClassId FROM BisCore.ElementGroupsMembers
            WHERE ${this.formBindings("SourceECInstanceId", groupInformationElementKeys, bindings)}
          ),
          GroupGeometricElements (ECInstanceId, ECClassId) AS (
            SELECT ECInstanceId, ECClassId FROM GroupMembers
            UNION ALL
            SELECT r.ECInstanceId, r.ECClassId FROM GroupGeometricElements s
              JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
          ),
          ElementGeometricElements (ECInstanceId, ECClassId) AS (
            SELECT ECInstanceId, ECClassId FROM BisCore.Element WHERE ${this.formBindings("ECInstanceId", elementKeys, bindings)}
            UNION ALL
            SELECT r.ECInstanceId, r.ECClassId FROM ElementGeometricElements s
              JOIN BisCore.Element r ON r.Parent.Id = s.ECInstanceId
          ),
          GeometricElementGeometricElements (ECInstanceId, ECClassId) AS (
            SELECT ECInstanceId, ECClassId FROM BisCore.GeometricElement WHERE ${this.formBindings("ECInstanceId", geometricElementKeys, bindings)}
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
          SELECT ECInstanceId FROM ElementGeometricElements WHERE ECClassId IS (BisCore.GeometricElement);
        `;
        return from(this._queryExecutor.createQueryReader(query, bindings));
      }),
      map((row) => row.ECInstanceId as string),
    );
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

  private formBindings(property: string, ids: string[], bindings: ECSqlBinding[]): string {
    if (ids.length > 1000) {
      bindings.push({ type: "idset", value: ids });
      return `InVirtualSet(?, ${property})`;
    }

    if (ids.length === 0) {
      return `FALSE`;
    }

    ids.forEach((id) => bindings.push({ type: "id", value: id }));
    return `${property} IN (${ids.map(() => "?").join(",")})`;
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

const INSTANCE_TYPES = [
  "subject",
  "model",
  "category",
  "subCategory",
  "functionalElement",
  "groupInformationElement",
  "geometricElement",
  "element",
  "unknown",
] as const;

type InstanceIdType = (typeof INSTANCE_TYPES)[number];

type InstancesByType = {
  [idType in InstanceIdType]: Observable<string>;
};

function unique<T>() {
  return function (obs: Observable<T>): Observable<T> {
    return obs.pipe(
      scan(
        (acc, val) => {
          if (acc.set.has(val)) {
            delete acc.val;
            return acc;
          }

          acc.set.add(val);
          acc.val = val;
          return acc;
        },
        { set: new Set<T>() } as { set: Set<T>; val?: T },
      ),
      map(({ val }) => val),
      filter((x): x is T => !!x),
    );
  };
}
