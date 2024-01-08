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
  IECSqlQueryExecutor,
  InstanceKey,
  InstanceNodesQueryDefinition,
  InstancesNodeKey,
  NodeSelectClauseColumnNames,
} from "@itwin/presentation-hierarchy-builder";
import { IECSqlReaderFactory } from "./QueryExecutor";

/**
 * Props for [[createHierarchyLevelDescriptor]].
 * @beta
 */
export interface CreateHierarchyLevelDescriptorProps<TIModel> {
  imodel: TIModel;
  parentNode: (Omit<HierarchyNode, "children"> & { key: InstancesNodeKey | string }) | undefined;
  hierarchyProvider: HierarchyProvider;
  descriptorBuilder: {
    getContentDescriptor: (requestOptions: ContentDescriptorRequestOptions<TIModel, KeySet, RulesetVariable>) => Promise<Descriptor | undefined>;
  };
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
export async function createHierarchyLevelDescriptor<TIModel extends IECSqlReaderFactory>(
  props: CreateHierarchyLevelDescriptorProps<TIModel>,
): Promise<Descriptor | undefined> {
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

  // FIXME:
  // if (descriptor) {
  //   descriptor.ruleset = ruleset;
  // }

  return descriptor;
}

function recursivelyGetInstanceKeys(
  parentNode: (Omit<HierarchyNode, "children"> & { key: InstancesNodeKey | string }) | undefined,
  hierarchyProvider: HierarchyProvider,
): Observable<InstanceKey> {
  // stream hierarchy level definitions
  const definitions: Observable<InstanceNodesQueryDefinition> = from(hierarchyProvider.hierarchyFactory.defineHierarchyLevel({ parentNode })).pipe(
    mergeAll(),
    filter((def): def is InstanceNodesQueryDefinition => HierarchyNodesDefinition.isInstanceNodesQuery(def)),
  );
  // split resulting instance keys by whether they or their children should be displayed at the hierarchy level
  const [visible, hidden] = partition(
    // pipe definitions to instance keys
    definitions.pipe(
      mergeMap((def) => hierarchyProvider.queryScheduler.scheduleSubscription(readInstanceKeys(hierarchyProvider.queryExecutor, def.query))),
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

function readInstanceKeys(executor: IECSqlQueryExecutor, nodesQuery: ECSqlQueryDef): Observable<{ key: InstanceKey; hide: boolean }> {
  const ecsql = `
    ${/* istanbul ignore next */ nodesQuery.ctes?.length ? `WITH RECURSIVE ${nodesQuery.ctes.join(", ")}` : ``}
    SELECT ${NodeSelectClauseColumnNames.FullClassName}, ${NodeSelectClauseColumnNames.ECInstanceId}, ${NodeSelectClauseColumnNames.HideNodeInHierarchy}
    FROM (
      ${nodesQuery.ecsql}
    )
  `;
  const reader = executor.createQueryReader(ecsql, nodesQuery.bindings, { rowFormat: "Indexes" });
  return from(reader).pipe(
    map((row) => ({
      key: {
        className: row[0],
        id: row[1],
      },
      hide: !!row[2],
    })),
  );
}
