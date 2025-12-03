/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import RssParser from "rss-parser";
import { debounceTime, Subject } from "rxjs";
import { BeEvent, Guid, Id64String } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { SvgFolder, SvgGlobe, SvgImodelHollow, SvgItem, SvgModel } from "@itwin/itwinui-icons-react";
import { Flex, ProgressRadial, SearchBox, Text } from "@itwin/itwinui-react";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import {
  createHierarchyFilteringHelper,
  createIModelHierarchyProvider,
  createLimitingECSqlQueryExecutor,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
  GenericNodeKey,
  GetHierarchyNodesProps,
  HierarchyFilteringPath,
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeIdentifiersPath,
  HierarchyProvider,
  mergeProviders,
} from "@itwin/presentation-hierarchies";
import { PresentationHierarchyNode, StrataKitRootErrorRenderer, StrataKitTreeRenderer, useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import {
  createBisInstanceLabelSelectClauseFactory,
  createCachingECClassHierarchyInspector,
  ECSql,
  IInstanceLabelSelectClauseFactory,
  InstanceKey,
  IPrimitiveValueFormatter,
  Props,
} from "@itwin/presentation-shared";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { SampleRpcInterface } from "@test-app/common";
import { MyAppFrontend } from "../../api/MyAppFrontend";

type UseTreeProps = Props<typeof useUnifiedSelectionTree>;
type IModelAccess = Props<typeof createIModelHierarchyProvider>["imodelAccess"];

export function MultiDataSourceTree({ imodel, ...props }: { imodel: IModelConnection; height: number; width: number; treeLabel: string }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => setIModelAccess(createIModelAccess(imodel)), [imodel]);

  if (!imodelAccess) {
    return null;
  }

  return <Tree {...props} imodelAccess={imodelAccess} />;
}

function createIModelAccess(imodel: IModelConnection) {
  const schemas = MyAppFrontend.getSchemaContext(imodel);
  const schemaProvider = createECSchemaProvider(schemas);
  return {
    imodelKey: imodel.key,
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider }),
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}

const RSS_PROVIDER = createRssHierarchyProvider();

function Tree({ imodelAccess, height, width, treeLabel }: { imodelAccess: IModelAccess; height: number; width: number; treeLabel: string }) {
  const [filter, setFilter] = useState("");
  const [componentId] = useState(() => Guid.createValue());
  const getFilteredPaths = useMemo<UseTreeProps["getFilteredPaths"]>(() => {
    return async () => {
      if (!filter) {
        return undefined;
      }
      return Promise.all([
        getModelsHierarchyFilteringPaths({ imodelAccess, filter, componentId, componentName: "MultiDataSourceTree" }),
        RSS_PROVIDER.getFilteredPaths(filter),
      ]).then(([imodelPaths, rssPaths]) => [...imodelPaths, ...rssPaths]);
    };
  }, [filter, imodelAccess, componentId]);

  const unifiedSelectionContext = useUnifiedSelectionContext();
  if (!unifiedSelectionContext) {
    throw new Error("Unified selection context is not available");
  }

  const { isReloading, ...treeProps } = useUnifiedSelectionTree({
    selectionStorage: unifiedSelectionContext.storage,
    createSelectableForGenericNode: useCallback<NonNullable<Props<typeof useUnifiedSelectionTree>["createSelectableForGenericNode"]>>(
      (node, uniqueId) => ({
        identifier: node.key.source === "rss" ? node.key.id : uniqueId,
        data: node,
        async *loadInstanceKeys() {},
      }),
      [],
    ),
    sourceName: "MultiIModelTree",
    getHierarchyProvider: useCallback(
      () =>
        mergeProviders({
          providers: [
            createIModelHierarchyProvider({
              imodelAccess,
              hierarchyDefinition: createModelsHierarchyDefinition({ imodelAccess }),
            }),
            RSS_PROVIDER,
          ],
        }),
      [imodelAccess],
    ),
    getFilteredPaths,
    onHierarchyLoadError: (props) => {
      // eslint-disable-next-line no-console
      console.error(props.error);
    },
  });

  const renderContent = () => {
    if (treeProps.rootErrorRendererProps) {
      return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
    }
    if (!treeProps.treeRendererProps) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted> Loading </Text>
        </Flex>
      );
    }

    if (treeProps.treeRendererProps.rootNodes.length === 0 && filter) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted>There are no nodes matching filter text {filter}</Text>
        </Flex>
      );
    }

    return (
      <Flex.Item alignSelf="flex-start" style={{ width: "100%", overflow: "auto" }}>
        <StrataKitTreeRenderer {...treeProps.treeRendererProps} getDecorations={(node) => getIcon(node)} selectionMode={"extended"} treeLabel={treeLabel} />
      </Flex.Item>
    );
  };

  const renderLoadingOverlay = () => {
    if (treeProps.rootErrorRendererProps !== undefined || treeProps.treeRendererProps !== undefined || !isReloading) {
      return <></>;
    }
    return (
      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          height: "inherit",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            opacity: 0.5,
            pointerEvents: "none",
            width: "100%",
            height: "100%",
            backgroundColor: "var(--iui-color-background-backdrop)",
          }}
        />
        <ProgressRadial size="large" indeterminate />
      </div>
    );
  };

  return (
    <Flex flexDirection="column" style={{ width, height }}>
      <Flex style={{ width: "100%", padding: "0.5rem" }}>
        <DebouncedSearchBox onChange={setFilter} />
      </Flex>
      {renderContent()}
      {renderLoadingOverlay()}
    </Flex>
  );
}

type SearchBoxProps = ComponentPropsWithoutRef<typeof SearchBox>;

function DebouncedSearchBox({ onChange, ...props }: Omit<SearchBoxProps, "onChange"> & { onChange: (text: string) => void }) {
  const handleChange = useMemo(() => {
    return debounced(onChange, 500);
  }, [onChange]);

  return <SearchBox {...props} inputProps={{ ...props.inputProps, value: undefined, onChange: (e) => handleChange(e.currentTarget.value) }} />;
}

function debounced<TArgs>(callback: (args: TArgs) => void, delay: number) {
  const subject = new Subject<() => void>();
  subject.pipe(debounceTime(delay)).subscribe({
    next: (invoke) => invoke(),
  });

  return (args: TArgs) => {
    subject.next(() => {
      callback(args);
    });
  };
}

function createModelsHierarchyDefinition({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const labels = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
  const clauses = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labels });
  return createPredicateBasedHierarchyDefinition({
    classHierarchyInspector: imodelAccess,
    hierarchy: {
      rootNodes: async () => [
        {
          fullClassName: "BisCore.Subject",
          query: {
            ecsql: `
              SELECT ${await clauses.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { selector: await labels.createSelectClause({ classAlias: "this", className: "BisCore.Subject" }) },
                hasChildren: true,
                extendedData: {
                  nodeType: "root-subject",
                },
              })}
              FROM BisCore.Subject this
              WHERE this.ECInstanceId = 0x1
            `,
          },
        },
      ],
      childNodes: [
        {
          parentInstancesNodePredicate: "BisCore.Subject",
          definitions: async () => [
            {
              fullClassName: "BisCore.Model",
              query: {
                ecsql: `
                  SELECT ${await clauses.createSelectClause({
                    ecClassId: { selector: "this.ECClassId" },
                    ecInstanceId: { selector: "this.ECInstanceId" },
                    nodeLabel: { selector: await labels.createSelectClause({ classAlias: "this", className: "BisCore.Model" }) },
                    grouping: {
                      byClass: true,
                    },
                    extendedData: {
                      nodeType: "model",
                    },
                  })}
                  FROM BisCore.Model this
                `,
              },
            },
          ],
        },
        {
          parentInstancesNodePredicate: "BisCore.Model",
          definitions: async ({ parentNode }: DefineInstanceNodeChildHierarchyLevelProps) => [
            {
              fullClassName: "BisCore.Model",
              query: {
                ecsql: `
                  SELECT ${await clauses.createSelectClause({
                    ecClassId: { selector: "this.ECClassId" },
                    ecInstanceId: { selector: "this.ECInstanceId" },
                    nodeLabel: { selector: await labels.createSelectClause({ classAlias: "this", className: "BisCore.Model" }) },
                    grouping: {
                      byClass: true,
                    },
                    extendedData: {
                      nodeType: "model",
                    },
                  })}
                  FROM BisCore.Model this
                  WHERE this.ParentModel.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
                `,
              },
            },
          ],
        },
      ],
    },
    postProcessNode: async (node) => {
      if (HierarchyNode.isClassGroupingNode(node)) {
        return { ...node, extendedData: { nodeType: "model-class" } };
      }
      return node;
    },
  });
}
async function getModelsHierarchyFilteringPaths({
  imodelAccess,
  filter,
  componentId,
  componentName,
}: {
  imodelAccess: IModelAccess;
  filter: string;
  componentId: string;
  componentName: string;
}): Promise<HierarchyFilteringPath[]> {
  const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
  const [rootSubjectPath, modelPaths] = await Promise.all([
    getRootSubjectFilteredPath({ imodelAccess, filter, labelsFactory, componentId, componentName }),
    Array.fromAsync(getModelsFilteringPaths({ imodelAccess, filter, labelsFactory, componentId, componentName })),
  ]);
  return [...(rootSubjectPath ? [rootSubjectPath] : []), ...modelPaths];
}
async function* getModelsFilteringPaths({
  imodelAccess,
  filter,
  labelsFactory,
  componentId,
  componentName,
}: {
  imodelAccess: IModelAccess;
  filter: string;
  labelsFactory: IInstanceLabelSelectClauseFactory;
  componentId: string;
  componentName: string;
}): AsyncIterableIterator<HierarchyFilteringPath> {
  const whereClause = `${await labelsFactory.createSelectClause({
    classAlias: "m",
    className: "BisCore.Model",
    selectorsConcatenator: ECSql.createConcatenatedValueStringSelector,
  })} LIKE '%' || ? || '%' ESCAPE '\\'`;
  const modelsReader = imodelAccess.createQueryReader(
    {
      ctes: [
        `ModelsHierarchy(ECInstanceId, ParentId, Path) AS (
        SELECT
          m.ECInstanceId,
          m.ParentModel.Id,
          json_array(${ECSql.createInstanceKeySelector({ alias: "m" })})
        FROM BisCore.Model m
        WHERE ${whereClause}

        UNION ALL

        SELECT
          pm.ECInstanceId,
          pm.ParentModel.Id,
          json_insert(
            cm.Path,
            '$[#]', ${ECSql.createInstanceKeySelector({ alias: "pm" })}
          )
        FROM ModelsHierarchy cm
        JOIN BisCore.Model pm ON pm.ECInstanceId = cm.ParentId
      )`,
      ],
      ecsql: `
      SELECT mh.Path AS path
      FROM ModelsHierarchy mh
      WHERE mh.ParentId IS NULL
    `,
      bindings: [{ type: "string", value: filter.replace(/[%_\\]/g, "\\$&") }],
    },
    { restartToken: `${componentName}/${componentId}/models-paths` },
  );
  for await (const row of modelsReader) {
    const path = JSON.parse(row.path) as HierarchyNodeIdentifiersPath;
    yield {
      path: [
        { className: "BisCore.Subject", id: "0x1", imodelKey: imodelAccess.imodelKey },
        ...path.reverse().map((k) => ({ ...k, imodelKey: imodelAccess.imodelKey })),
      ],
      options: {
        reveal: true,
      },
    };
  }
}
async function getRootSubjectFilteredPath({
  imodelAccess,
  filter,
  labelsFactory,
  componentId,
  componentName,
}: {
  imodelAccess: IModelAccess;
  filter: string;
  labelsFactory: IInstanceLabelSelectClauseFactory;
  componentId: string;
  componentName: string;
}): Promise<HierarchyNodeIdentifiersPath | undefined> {
  const reader = imodelAccess.createQueryReader(
    {
      ecsql: `
      SELECT this.ECInstanceId AS id
      FROM BisCore.Subject this
      WHERE
        ${await labelsFactory.createSelectClause({ classAlias: "this", className: "BisCore.Subject", selectorsConcatenator: ECSql.createConcatenatedValueStringSelector })} LIKE '%' || ? || '%' ESCAPE '\\'
        AND this.ECInstanceId = 0x1
    `,
      bindings: [{ type: "string", value: filter.replace(/[%_\\]/g, "\\$&") }],
    },
    { restartToken: `${componentName}/${componentId}/subject-path` },
  );
  const row = (await reader.next()).value as { id: Id64String } | undefined;
  return row ? [{ className: "BisCore.Subject", id: row.id, imodelKey: imodelAccess.imodelKey }] : undefined;
}

function getIcon(node: PresentationHierarchyNode): ReactElement | undefined {
  switch (node.nodeData.extendedData?.nodeType) {
    case "root-subject":
      return <SvgImodelHollow />;
    case "model-class":
      return <SvgFolder />;
    case "model":
      return <SvgModel />;
    case "rss-root":
      return <SvgGlobe />;
    case "rss-item":
      return <SvgItem />;
  }
  return undefined;
}

function createRssHierarchyProvider(): HierarchyProvider & { getFilteredPaths: (filter: string) => Promise<HierarchyFilteringPath[]> } {
  let feedPromise: ReturnType<RssParser["parseURL"]> | undefined;
  async function getFeed() {
    if (!feedPromise) {
      // ideally we'd fetch straight from medium, but use our backend as means to avoid CORS
      feedPromise = SampleRpcInterface.getClient()
        .getRssFeed({ url: "https://medium.com/feed/itwinjs" })
        .then(async (xml) => new RssParser().parseString(xml));
    }
    const feed = await feedPromise;
    return feed;
  }

  let filter: HierarchyFilteringPath[] | undefined;
  return {
    hierarchyChanged: new BeEvent(),

    async getFilteredPaths(filterString: string): Promise<HierarchyFilteringPath[]> {
      const feed = await getFeed();
      if (!feed) {
        return [];
      }
      const paths = new Array<HierarchyNodeIdentifiersPath>();

      if ((feed.title ?? "<no title>").toLocaleLowerCase().includes(filterString.toLocaleLowerCase())) {
        paths.push([{ type: "generic", id: "rss-root", source: "rss" }]);
      }

      feed.items.forEach((item) => {
        if ((item.title ?? "<no title>").toLocaleLowerCase().includes(filterString.toLocaleLowerCase())) {
          paths.push([
            { type: "generic", id: "rss-root", source: "rss" },
            { type: "generic", id: `rss-${item.guid!}`, source: "rss" },
          ]);
        }
      });

      return paths.map((path) => ({ path, options: { reveal: true } }));
    },

    async *getNodes({ parentNode }: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode> {
      const feed = await getFeed();
      if (!feed) {
        return;
      }

      async function* generateNodes(): AsyncIterableIterator<HierarchyNode & { key: GenericNodeKey }> {
        if (!parentNode) {
          yield {
            key: { type: "generic", id: `rss-root`, source: "rss" },
            label: feed.title ?? "<no title>",
            parentKeys: [],
            children: feed.items.length > 0,
            extendedData: {
              nodeType: "rss-root",
            },
          } satisfies HierarchyNode;
          return;
        }
        if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "rss-root") {
          let count = 0;
          for (const item of feed.items) {
            yield {
              key: { type: "generic", id: `rss-${item.guid!}`, source: "rss" },
              label: item.title ?? "<no title>",
              parentKeys: [parentNode.key],
              children: false,
              extendedData: {
                nodeType: "rss-item",
              },
            } satisfies HierarchyNode;
            if (++count > 10) {
              return;
            }
          }
        }
      }
      const filteringHelper = !parentNode || HierarchyNode.isGeneric(parentNode) ? createHierarchyFilteringHelper(filter, parentNode) : undefined;

      if (!filteringHelper?.hasFilter) {
        yield* generateNodes();
        return;
      }

      const targetNodeKeys = filteringHelper.getChildNodeFilteringIdentifiers()!;
      for await (const node of generateNodes()) {
        if (targetNodeKeys.some((target) => HierarchyNodeIdentifier.equal(target, node.key))) {
          yield {
            ...node,
            ...filteringHelper.createChildNodeProps({ nodeKey: node.key, parentKeys: node.parentKeys }),
          };
        }
      }
    },

    async *getNodeInstanceKeys(_props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey> {},

    setFormatter(_formatter: IPrimitiveValueFormatter | undefined): void {},

    setHierarchyFilter(
      props:
        | {
            paths: HierarchyFilteringPath[];
          }
        | undefined,
    ): void {
      filter = props?.paths;
    },
  };
}
