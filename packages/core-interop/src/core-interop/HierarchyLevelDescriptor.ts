/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, from, map, merge, mergeAll, mergeMap, Observable, partition, reduce, shareReplay } from "rxjs";
import { ContentDescriptorRequestOptions, DefaultContentDisplayTypes, Descriptor, KeySet, Ruleset, RulesetVariable } from "@itwin/presentation-common";
import {
  ECSqlQueryDef,
  HierarchyNode,
  HierarchyNodesDefinition,
  HierarchyProvider,
  Id64String,
  InstanceKey,
  InstanceNodesQueryDefinition,
  InstancesNodeKey,
  NodeSelectClauseColumnNames,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchy-builder";
import { ICoreECSqlReaderFactory } from "./QueryExecutor";

/**
 * Props for [[createHierarchyLevelDescriptor]].
 * @beta
 */
export interface CreateHierarchyLevelDescriptorProps<TIModel extends ICoreECSqlReaderFactory> {
  /**
   * An iModel to use for creating the descriptor. Typically, this is either [IModelDb]($core-backend)
   * or [IModelConnection]($core-frontend).
   *
   * @note The iModel should match the query executor used by given `hierarchyProvider` prop.
   */
  imodel: TIModel;

  /** The parent node to create hierarchy level descriptor for. */
  parentNode: Omit<NonGroupingHierarchyNode, "children"> | undefined;

  /**
   * `HierarchyProvider` that was used to create `parentNode`. The provider is used to get child hierarchy level
   * definition and schedule queries needed to calculate the descriptor.
   */
  hierarchyProvider: HierarchyProvider;

  /**
   * An `itwinjs-core` that knows how to create a content descriptor. Generally this is either [PresentationManager]($presentation-backend)
   * (accessed through `Presentation.getManager()` on the backend) or [PresentationManager]($presentation-frontend) (accessed through
   * `Presentation.presentation` on the frontend).
   */
  descriptorBuilder: {
    getContentDescriptor: (requestOptions: ContentDescriptorRequestOptions<TIModel, KeySet, RulesetVariable>) => Promise<Descriptor | undefined>;
  };
}

/**
 * Result of [[createHierarchyLevelDescriptor]].
 * @beta
 */
export interface CreateHierarchyLevelDescriptorResult {
  /** Child hierarchy level [[Descriptor]]. */
  descriptor: Descriptor;
  /** Input keys used to create [[Descriptor]]. */
  inputKeys: KeySet;
}

/**
 * Creates a [[Descriptor]] for the child hierarchy level based on given parent node and hierarchy definitions factory. The descriptor
 * contains metadata about the hierarchy level and can be used to create a filtering dialog.
 *
 * @note This is a short term solution until we have a way to create a filtering dialog from something besides a [[Descriptor]], which
 * requires a Presentation backend.
 *
 * @beta
 */
export async function createHierarchyLevelDescriptor<TIModel extends ICoreECSqlReaderFactory>(
  props: CreateHierarchyLevelDescriptorProps<TIModel>,
): Promise<CreateHierarchyLevelDescriptorResult | undefined> {
  // convert instance keys stream into a KeySet
  const keys = new KeySet();
  await recursivelyGetInstanceKeys(props.parentNode, props.hierarchyProvider).forEach((key) => keys.add(key));

  const ruleset: Ruleset = {
    id: `Hierarchy level descriptor ruleset: ${props.parentNode ? props.parentNode.label : "<root>"}`,
    rules: [
      {
        ruleType: "Content",
        specifications: [
          {
            specType: "SelectedNodeInstances",
          },
        ],
      },
    ],
  };

  const descriptor = await props.descriptorBuilder.getContentDescriptor({
    imodel: props.imodel,
    rulesetOrId: ruleset,
    keys,
    displayType: DefaultContentDisplayTypes.PropertyPane,
  });
  return descriptor ? { descriptor: new Descriptor({ ...descriptor, ruleset }), inputKeys: keys } : undefined;
}

function recursivelyGetInstanceKeys(
  parentNode: (Omit<HierarchyNode, "children"> & { key: InstancesNodeKey | string }) | undefined,
  hierarchyProvider: HierarchyProvider,
): Observable<InstanceKey> {
  // stream hierarchy level definitions
  const definitions: Observable<InstanceNodesQueryDefinition> = from(hierarchyProvider.hierarchyDefinition.defineHierarchyLevel({ parentNode })).pipe(
    mergeAll(),
    filter((def): def is InstanceNodesQueryDefinition => HierarchyNodesDefinition.isInstanceNodesQuery(def)),
  );
  // split resulting instance keys by whether they or their children should be displayed at the hierarchy level
  const [visible, hidden] = partition(
    // pipe definitions to instance keys
    definitions.pipe(
      mergeMap((def) => readInstanceKeys(hierarchyProvider, def.query)),
      shareReplay(),
    ),
    ({ hide }) => !hide,
  );
  return merge(
    // immediately return keys of visible instances
    visible.pipe(map(({ key }) => key)),
    // return child node keys of hidden instances
    hidden.pipe(
      // handling similar to `createHideNodesInHierarchyOperator` in `presentation-hierarchy-builder` package - first
      // merge all keys by class
      reduce<{ key: InstanceKey; hide: boolean }, InstanceClassMergeMap>((acc, { key }) => {
        addToMergeMap(acc, key);
        return acc;
      }, new Map()),
      // then, for each class, create a temp node
      map(
        (merged): Array<Omit<HierarchyNode, "children"> & { key: InstancesNodeKey }> =>
          [...merged.entries()].map(([className, ids]) => ({
            key: {
              type: "instances",
              instanceKeys: ids.map((id) => ({ className, id })),
            },
            parentKeys: [],
            label: "",
          })),
      ),
      mergeAll(),
      // then, for each node of different class, request child instance keys
      mergeMap((hiddenNode) => recursivelyGetInstanceKeys(hiddenNode, hierarchyProvider)),
    ),
  );
}

type InstanceClassMergeMap = Map<string, Id64String[]>;
function addToMergeMap(list: InstanceClassMergeMap, key: InstanceKey) {
  let ids = list.get(key.className);
  if (!ids) {
    ids = [];
    list.set(key.className, ids);
  }
  ids.push(key.id);
}

function readInstanceKeys(hierarchyProvider: HierarchyProvider, nodesQuery: ECSqlQueryDef): Observable<{ key: InstanceKey; hide: boolean }> {
  const ecsql = `
    SELECT ${NodeSelectClauseColumnNames.FullClassName}, ${NodeSelectClauseColumnNames.ECInstanceId}, ${NodeSelectClauseColumnNames.HideNodeInHierarchy}
    FROM (
      ${nodesQuery.ecsql}
    )
  `;
  return from(hierarchyProvider.queryScheduler.schedule({ ...nodesQuery, ecsql }, { rowFormat: "Indexes" })).pipe(
    map((row) => ({
      key: {
        className: row[0],
        id: row[1],
      },
      hide: !!row[2],
    })),
  );
}
