/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, filter, firstValueFrom, forkJoin, from, map, mergeMap, reduce, shareReplay } from "rxjs";
import { assert, Guid, Id64 } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { eachValueFrom, type ECSchemaProvider, type ECSqlBinding } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { catchBeSQLiteInterrupts } from "../../shared/TreeErrors.js";
import {
  createHiddenClassesWhereClauseFactory,
  createWhereClause,
  getOrCreate,
  mergeWithDefaults,
} from "../../shared/Utils.js";
import { defaultHierarchyConfiguration } from "./ModelsTreeDefinition.js";

import type { Observable } from "rxjs";
import type { Id64Arg, Id64Array, Id64Set, Id64String } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { BaseIdsProvider } from "../../shared/idsProviders/BaseIdsProvider.js";
import type { ModelId, SubjectId } from "../../shared/Types.js";
import type { ModelsTreeHierarchyConfiguration, ModelsTreeSearchPath } from "./ModelsTreeDefinition.js";

/**
 * Data access and configuration for a models-tree ID provider.
 * @internal
 */
interface ModelsTreeIdsProviderProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  /** Hierarchy options. Omitted properties use the defaults of `ModelsTreeHierarchyConfiguration`. */
  hierarchyConfig?: Pick<ModelsTreeHierarchyConfiguration, "elements" | "subjects" | "models">;
  /** Base provider using the same element class and exclusions as `hierarchyConfig`. */
  baseIdsProvider: BaseIdsProvider;
}

interface SubjectInfo {
  parentSubjectId: Id64String | undefined;
  hideInHierarchy: boolean;
  childSubjectIds: Id64Set;
  childModelIds: Id64Set;
}

interface ModelInfo {
  parentSubjectIds: Id64Set;
  hideInHierarchy: boolean;
}

/**
 * Provides subject and model IDs and search paths for model tree hierarchies.
 * @internal
 */
export interface ModelsTreeIdsProvider extends BaseIdsProvider {
  /** Returns subjects containing eligible models and their ancestors, including subjects hidden in the hierarchy. */
  getParentSubjectIds(): Promise<Id64Array>;
  /** Returns child subject IDs for the supplied parents, skipping hidden subjects to find their visible descendants. */
  getChildSubjectIds(parentSubjectIds: Id64Arg): Promise<Id64Array>;
  /** Returns model IDs belonging to the supplied subjects and their hidden descendants, stopping at visible subjects. */
  getChildSubjectModelIds(parentSubjectIds: Id64Arg): Promise<Id64Array>;
  /** Returns IDs of models that are queried by tree definition, but should be hidden from the final hierarchy. */
  getHiddenModelIds(): Promise<Set<ModelId>>;
  /** Returns the root-to-subject path, omitting hidden subjects and applying the configured root and empty-model filters. */
  createSubjectInstanceKeysPath(targetSubjectId: Id64String): Promise<ModelsTreeSearchPath>;
  /**
   * Yields each subject path leading to the specified model, excluding the model itself.
   * Yields no paths if the model is excluded or is not associated with a subject.
   */
  createUpToModelInstanceKeyPaths(modelId: Id64String): AsyncIterableIterator<ModelsTreeSearchPath>;
  /**
   * Yields paths to models containing top-level, non-excluded elements in the specified category, excluding sub-models.
   * Paths include the model but not the category. Yields no paths if no eligible models exist.
   */
  getSearchPathsUpToRootCategory(categoryId: Id64String): AsyncIterableIterator<ModelsTreeSearchPath>;
}

/**
 * Creates an ID provider for model tree hierarchies using the supplied hierarchy configuration.
 * @internal
 */
export function createModelsTreeIdsProvider({
  imodelAccess,
  hierarchyConfig: configOverrides,
  baseIdsProvider,
}: ModelsTreeIdsProviderProps): ModelsTreeIdsProvider {
  const hierarchyConfig = mergeWithDefaults({ defaults: defaultHierarchyConfiguration, overrides: configOverrides });
  const cachedData: {
    subjectInfos: Observable<Map<SubjectId, SubjectInfo>> | undefined;
    modelInfos: Observable<Map<ModelId, ModelInfo>> | undefined;
    parentSubjectIds: Observable<Id64Array> | undefined;
    hiddenModelIds: Observable<Set<ModelId>> | undefined;
    upToModelInstanceKeyPaths: Map<ModelId, Observable<ModelsTreeSearchPath>>;
  } = {
    parentSubjectIds: undefined,
    subjectInfos: undefined,
    modelInfos: undefined,
    hiddenModelIds: undefined,
    upToModelInstanceKeyPaths: new Map(),
  };
  const componentId = Guid.createValue();
  const componentName = "ModelsTreeIdsProvider";

  async function createModelElementsFilter(
    modelAlias: string,
  ): Promise<{ clause?: string; bindings?: ECSqlBinding[] }> {
    if (hierarchyConfig.models.withoutElements === "include") {
      return {};
    }
    if (baseIdsProvider.elementModelCategoriesLoaded()) {
      return {
        clause: `${modelAlias}.ECInstanceId IN (SELECT id FROM IdSet(?))`,
        bindings: [{ type: "idset", value: await baseIdsProvider.getAllModels() }],
      };
    }
    const createElementVisibilityClause = await createHiddenClassesWhereClauseFactory({
      schemaProvider: imodelAccess,
      className: hierarchyConfig.elements.baseClass,
    });
    return {
      clause: `EXISTS (
        SELECT 1 FROM ${hierarchyConfig.elements.baseClass} e
        ${createWhereClause({ conditions: [`e.Model.Id = ${modelAlias}.ECInstanceId`, createElementVisibilityClause("e")] })}
      )`,
    };
  }

  function querySubjects(): Observable<{
    id: SubjectId;
    parentId?: SubjectId;
    targetPartitionId?: ModelId;
    hideInHierarchy: boolean;
  }> {
    return from(createModelElementsFilter("m")).pipe(
      mergeMap((elementsFilter) => {
        const subjectsQuery = `
        SELECT
          s.ECInstanceId id,
          s.Parent.Id parentId,
          (
            SELECT m.ECInstanceId
            FROM ${CLASS_NAMES.GeometricModel3d} m
            ${createWhereClause({
              conditions: [
                "m.ECInstanceId = HexToId(json_extract(s.JsonProperties, '$.Subject.Model.TargetPartition'))",
                "NOT m.IsPrivate",
                "NOT m.IsTemplate",
                elementsFilter.clause,
              ],
            })}
          ) targetPartitionId,
          CASE
            WHEN (
              json_extract(s.JsonProperties, '$.Subject.Job.Bridge') IS NOT NULL
              OR json_extract(s.JsonProperties, '$.Subject.Model.Type') = 'Hierarchy'
            ) THEN 1
            ELSE 0
          END hideInHierarchy
        FROM bis.Subject s
      `;
        return imodelAccess.createQueryReader(
          { ecsql: subjectsQuery, bindings: elementsFilter.bindings },
          {
            rowFormat: "ECSqlPropertyNames",
            limit: "unbounded",
            restartToken: `${componentName}/${componentId}/subjects`,
          },
        );
      }),
      catchBeSQLiteInterrupts,
      map((row) => {
        return {
          id: row.id,
          parentId: row.parentId,
          targetPartitionId: row.targetPartitionId,
          hideInHierarchy: !!row.hideInHierarchy,
        };
      }),
    );
  }

  function queryModels(): Observable<{ id: ModelId; parentId: SubjectId; hideInHierarchy: boolean }> {
    return defer(async () => createModelElementsFilter("m")).pipe(
      mergeMap((elementsFilter) => {
        const modelsQuery = `
          SELECT
            p.ECInstanceId id,
            p.Parent.Id parentId,
            CASE
              WHEN (
                json_extract(p.JsonProperties, '$.PhysicalPartition.Model.Content') IS NOT NULL
                OR json_extract(p.JsonProperties, '$.GraphicalPartition3d.Model.Content') IS NOT NULL
              ) THEN 1
              ELSE 0
            END hideInHierarchy
          FROM ${CLASS_NAMES.InformationPartitionElement} p
          INNER JOIN ${CLASS_NAMES.GeometricModel3d} m ON m.ModeledElement.Id = p.ECInstanceId
          ${createWhereClause({ conditions: ["NOT m.IsPrivate", "NOT m.IsTemplate", elementsFilter.clause] })}
        `;
        return imodelAccess.createQueryReader(
          { ecsql: modelsQuery, bindings: elementsFilter.bindings },
          {
            rowFormat: "ECSqlPropertyNames",
            limit: "unbounded",
            restartToken: `${componentName}/${componentId}/models`,
          },
        );
      }),
      catchBeSQLiteInterrupts,
      map((row) => {
        return { id: row.id, parentId: row.parentId, hideInHierarchy: !!row.hideInHierarchy };
      }),
    );
  }

  function getModelInfos() {
    cachedData.modelInfos ??= queryModels().pipe(
      reduce((acc, model) => {
        const entry = getOrCreate({
          map: acc,
          key: model.id,
          createFunc: () => ({ parentSubjectIds: new Set<SubjectId>(), hideInHierarchy: model.hideInHierarchy }),
        });
        entry.parentSubjectIds.add(model.parentId);
        return acc;
      }, new Map<ModelId, ModelInfo>()),
      shareReplay(),
    );
    return cachedData.modelInfos;
  }

  function getSubjectInfos() {
    cachedData.subjectInfos ??= forkJoin({
      subjectInfos: querySubjects().pipe(
        reduce((acc, subject) => {
          const subjectInfo: SubjectInfo = {
            parentSubjectId: subject.parentId,
            hideInHierarchy: subject.hideInHierarchy,
            childSubjectIds: new Set(),
            childModelIds: new Set(),
          };
          if (subject.targetPartitionId) {
            subjectInfo.childModelIds.add(subject.targetPartitionId);
          }
          acc.set(subject.id, subjectInfo);
          return acc;
        }, new Map<SubjectId, SubjectInfo>()),
        map((subjectInfos) => {
          for (const [subjectId, { parentSubjectId: parentSubjectId }] of subjectInfos) {
            if (parentSubjectId) {
              const parentSubjectInfo = subjectInfos.get(parentSubjectId);
              assert(!!parentSubjectInfo);
              parentSubjectInfo.childSubjectIds.add(subjectId);
            }
          }
          return subjectInfos;
        }),
      ),
      modelInfos: getModelInfos(),
    }).pipe(
      map(({ subjectInfos, modelInfos }) => {
        for (const [modelId, { parentSubjectIds }] of modelInfos) {
          for (const subjectId of parentSubjectIds) {
            const subjectInfo = subjectInfos.get(subjectId);
            assert(!!subjectInfo);
            subjectInfo.childModelIds.add(modelId);
          }
        }
        return subjectInfos;
      }),
      shareReplay(),
    );
    return cachedData.subjectInfos;
  }
  function addModelsFromExistingSubject({
    subjectId,
    subjectInfos,
    modelIds,
  }: {
    subjectId: Id64String;
    subjectInfos: Map<SubjectId, SubjectInfo>;
    modelIds: ModelId[];
  }) {
    const subjectInfo = subjectInfos.get(subjectId);
    if (!subjectInfo) {
      return;
    }
    for (const modelId of subjectInfo.childModelIds) {
      modelIds.push(modelId);
    }
  }
  function subjectHasNestedModels({
    subjectId,
    subjectInfos,
  }: {
    subjectId: SubjectId;
    subjectInfos: Map<SubjectId, SubjectInfo>;
  }): boolean {
    const subjectInfo = subjectInfos.get(subjectId);
    if (!subjectInfo) {
      return false;
    }
    if (subjectInfo.childModelIds.size > 0) {
      return true;
    }
    for (const childSubjectId of subjectInfo.childSubjectIds) {
      if (subjectHasNestedModels({ subjectId: childSubjectId, subjectInfos })) {
        return true;
      }
    }
    return false;
  }
  function createSubjectInstanceKeysPath(targetSubjectId: Id64String): Observable<ModelsTreeSearchPath> {
    return getSubjectInfos().pipe(
      map((subjectInfos) => {
        const result: ModelsTreeSearchPath = [];
        if (
          hierarchyConfig.models.withoutElements === "exclude" &&
          !subjectHasNestedModels({ subjectId: targetSubjectId, subjectInfos })
        ) {
          return result;
        }
        let currParentId: SubjectId | undefined = targetSubjectId;
        while (currParentId) {
          if (hierarchyConfig.subjects.root === "exclude" && currParentId === IModel.rootSubjectId) {
            break;
          }
          const parentInfo = subjectInfos.get(currParentId);
          if (!parentInfo?.hideInHierarchy) {
            result.push({ className: CLASS_NAMES.Subject, id: currParentId });
          }
          currParentId = parentInfo?.parentSubjectId;
        }
        return result.reverse();
      }),
    );
  }
  function createUpToModelInstanceKeyPaths(modelId: Id64String): Observable<ModelsTreeSearchPath> {
    return getOrCreate({
      map: cachedData.upToModelInstanceKeyPaths,
      key: modelId,
      createFunc: () =>
        getSubjectInfos().pipe(
          mergeMap((subjectInfos) => subjectInfos.entries()),
          filter(([_, subjectInfo]) => subjectInfo.childModelIds.has(modelId)),
          mergeMap(([modelSubjectId]) => createSubjectInstanceKeysPath(modelSubjectId)),
          shareReplay(),
        ),
    });
  }
  return {
    ...baseIdsProvider,
    async getHiddenModelIds(): Promise<Set<ModelId>> {
      cachedData.hiddenModelIds ??= getModelInfos().pipe(
        map((modelInfos) => {
          const ids = new Set<ModelId>();
          for (const [modelId, { hideInHierarchy }] of modelInfos) {
            if (hideInHierarchy) {
              ids.add(modelId);
            }
          }
          return ids;
        }),
        shareReplay(),
      );
      return firstValueFrom(cachedData.hiddenModelIds);
    },
    async getParentSubjectIds(): Promise<Id64Array> {
      cachedData.parentSubjectIds ??= getSubjectInfos().pipe(
        map((subjectInfos) => {
          const parentSubjectIds = new Set<SubjectId>();
          for (const [subjectId, subjectInfo] of subjectInfos) {
            if (subjectInfo.childModelIds.size > 0) {
              parentSubjectIds.add(subjectId);
              let currParentId = subjectInfo.parentSubjectId;
              while (currParentId) {
                parentSubjectIds.add(currParentId);
                currParentId = subjectInfos.get(currParentId)?.parentSubjectId;
              }
            }
          }
          return [...parentSubjectIds];
        }),
        shareReplay(),
      );
      return firstValueFrom(cachedData.parentSubjectIds);
    },
    async getChildSubjectIds(parentSubjectIds: Id64Arg): Promise<Id64Array> {
      return firstValueFrom(
        getSubjectInfos().pipe(
          map((subjectInfos) => {
            const childSubjectIds = new Array<SubjectId>();
            for (const subjectId of Id64.iterable(parentSubjectIds)) {
              forEachChildSubject(subjectInfos, subjectId, (childSubjectId, childSubjectInfo) => {
                if (!childSubjectInfo.hideInHierarchy) {
                  childSubjectIds.push(childSubjectId);
                  return "break";
                }
                return "continue";
              });
            }
            return childSubjectIds;
          }),
        ),
      );
    },
    async getChildSubjectModelIds(parentSubjectIds: Id64Arg): Promise<Id64Array> {
      return firstValueFrom(
        getSubjectInfos().pipe(
          map((subjectInfos) => {
            const hiddenSubjectIds = new Array<SubjectId>();
            for (const subjectId of Id64.iterable(parentSubjectIds)) {
              forEachChildSubject(subjectInfos, subjectId, (childSubjectId, childSubjectInfo) => {
                if (childSubjectInfo.hideInHierarchy) {
                  hiddenSubjectIds.push(childSubjectId);
                  return "continue";
                }
                return "break";
              });
            }
            const modelIds = new Array<ModelId>();

            for (const subjectId of Id64.iterable(parentSubjectIds)) {
              addModelsFromExistingSubject({ subjectId, subjectInfos, modelIds });
            }

            for (const subjectId of hiddenSubjectIds) {
              addModelsFromExistingSubject({ subjectId, subjectInfos, modelIds });
            }
            return modelIds;
          }),
        ),
      );
    },
    createSubjectInstanceKeysPath: async (props) => firstValueFrom(createSubjectInstanceKeysPath(props)),
    createUpToModelInstanceKeyPaths: (modelId) => eachValueFrom(createUpToModelInstanceKeyPaths(modelId)),
    getSearchPathsUpToRootCategory(categoryId: Id64String): AsyncIterableIterator<ModelsTreeSearchPath> {
      return eachValueFrom(
        from(
          baseIdsProvider.getModels({
            categoryId,
            excludeSubModels: true,
            includeOnlyTopMostElementCategory: true,
            excludeIfOnlyExcludedClasses: true,
          }),
        ).pipe(
          mergeMap((categoryModelId) =>
            createUpToModelInstanceKeyPaths(categoryModelId).pipe(
              map((modelPath) => [...modelPath, { className: CLASS_NAMES.GeometricModel3d, id: categoryModelId }]),
            ),
          ),
        ),
      );
    },
  };
}

function forEachChildSubject(
  subjectInfos: Map<SubjectId, SubjectInfo>,
  parentSubject: SubjectId | SubjectInfo,
  cb: (childSubjectId: SubjectId, childSubjectInfo: SubjectInfo) => "break" | "continue",
) {
  const parentSubjectInfo = typeof parentSubject === "string" ? subjectInfos.get(parentSubject) : parentSubject;
  if (!parentSubjectInfo) {
    return;
  }
  for (const childSubjectId of parentSubjectInfo.childSubjectIds) {
    const childSubjectInfo = subjectInfos.get(childSubjectId)!;
    if (cb(childSubjectId, childSubjectInfo) === "break") {
      continue;
    }
    forEachChildSubject(subjectInfos, childSubjectInfo, cb);
  }
}
