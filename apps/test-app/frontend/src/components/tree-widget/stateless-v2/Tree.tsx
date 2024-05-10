/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedAsyncValue } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SvgFolder, SvgImodelHollow, SvgItem, SvgLayers, SvgModel } from "@itwin/itwinui-icons-react";
import { Flex, ProgressRadial, SearchBox, Text, ToggleSwitch } from "@itwin/itwinui-react";
import { ClassInfo, DefaultContentDisplayTypes, Descriptor, KeySet } from "@itwin/presentation-common";
import {
  PresentationInstanceFilter,
  PresentationInstanceFilterDialog,
  PresentationInstanceFilterInfo,
  PresentationInstanceFilterPropertiesSource,
} from "@itwin/presentation-components";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { createLimitingECSqlQueryExecutor, GenericInstanceFilter, HierarchyProvider, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import {
  HierarchyLevelConfiguration,
  PresentationHierarchyNode,
  SelectionMode,
  TreeRenderer,
  useUnifiedSelectionTree,
} from "@itwin/presentation-hierarchies-react";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import { MyAppFrontend } from "../../../api/MyAppFrontend";

type IModelAccess = LimitingECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector;

export function StatelessTreeV2(props: { imodel: IModelConnection; height: number; width: number }) {
  return <Tree {...props} />;
}

function Tree({ imodel, height, width }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();
  const [filter, setFilter] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    const schemas = MyAppFrontend.getSchemaContext(imodel);
    const schemaProvider = createECSchemaProvider(schemas);
    setIModelAccess({
      ...schemaProvider,
      ...createCachingECClassHierarchyInspector({ schemaProvider }),
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    });
  }, [imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      setIsFiltering(false);
      if (!imodelAccess) {
        return undefined;
      }
      if (filter !== "") {
        setIsFiltering(true);
        const paths = await ModelsTreeDefinition.createInstanceKeyPaths({
          imodelAccess,
          label: filter,
        });
        return paths;
      }
      return undefined;
    }, [imodelAccess, filter]),
  );

  useEffect(() => {
    setIsFiltering(false);
    if (!imodelAccess) {
      return;
    }

    setHierarchyProvider(
      new HierarchyProvider({
        imodelAccess,
        hierarchyDefinition: new ModelsTreeDefinition({ imodelAccess }),
        filtering: filteredPaths
          ? {
              paths: filteredPaths,
            }
          : undefined,
      }),
    );
  }, [imodelAccess, filteredPaths]);

  const { rootNodes, isLoading, getHierarchyLevelConfiguration, reloadTree, ...treeProps } = useUnifiedSelectionTree({
    imodelKey: imodel.key,
    sourceName: "StatelessTreeV2",
    hierarchyProvider,
  });

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  const toggleFormatter = () => {
    if (!hierarchyProvider) {
      return;
    }
    const newValue = !shouldUseCustomFormatter;
    hierarchyProvider.setFormatter(newValue ? customFormatter : undefined);
    setShouldUseCustomFormatter(newValue);
    reloadTree();
  };

  const [filteringOptions, setFilteringOptions] = useState<{ nodeId: string; options: HierarchyLevelConfiguration }>();
  const onFilterClick = useCallback(
    (nodeId: string) => {
      const options = getHierarchyLevelConfiguration(nodeId);
      setFilteringOptions(options ? { nodeId, options } : undefined);
    },
    [getHierarchyLevelConfiguration],
  );
  const propertiesSource = useMemo<(() => Promise<PresentationInstanceFilterPropertiesSource>) | undefined>(() => {
    if (!hierarchyProvider || !filteringOptions) {
      return undefined;
    }

    return async () => {
      const inputKeysIterator = hierarchyProvider.getNodeInstanceKeys({
        parentNode: filteringOptions.options.hierarchyNode,
      });
      const inputKeys = [];
      for await (const inputKey of inputKeysIterator) {
        inputKeys.push(inputKey);
      }
      if (inputKeys.length === 0) {
        throw new Error("Hierarchy level is empty - unable to create content descriptor.");
      }

      const descriptor = await Presentation.presentation.getContentDescriptor({
        imodel,
        rulesetOrId: {
          id: `Hierarchy level descriptor ruleset`,
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
        },
        displayType: DefaultContentDisplayTypes.PropertyPane,
        keys: new KeySet(inputKeys),
      });
      if (!descriptor) {
        throw new Error("Failed to create content descriptor");
      }

      return { descriptor, inputKeys };
    };
  }, [filteringOptions, imodel, hierarchyProvider]);

  const getInitialFilter = useMemo(() => {
    const currentFilter = filteringOptions?.options.currentFilter;
    if (!currentFilter) {
      return undefined;
    }

    return (descriptor: Descriptor) => fromGenericFilter(descriptor, currentFilter);
  }, [filteringOptions]);

  const renderContent = () => {
    if (rootNodes === undefined || isLoading || isFiltering) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <ProgressRadial size="large" />
        </Flex>
      );
    }

    if (rootNodes.length === 0 && filter) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted>There are no nodes matching filter text {filter}</Text>
        </Flex>
      );
    }

    return (
      <Flex.Item alignSelf="flex-start" style={{ width: "100%", overflow: "auto" }}>
        <TreeRenderer rootNodes={rootNodes} {...treeProps} onFilterClick={onFilterClick} getIcon={getIcon} selectionMode={SelectionMode.Extended} />
      </Flex.Item>
    );
  };

  return (
    <Flex flexDirection="column" style={{ width, height }}>
      <Flex style={{ width: "100%", padding: "0.5rem" }}>
        <SearchBox inputProps={{ value: filter, onChange: (e) => setFilter(e.currentTarget.value) }} />
        <ToggleSwitch onChange={toggleFormatter} checked={shouldUseCustomFormatter} />
      </Flex>
      {renderContent()}
      <PresentationInstanceFilterDialog
        imodel={imodel}
        isOpen={!!filteringOptions}
        onApply={(info) => {
          if (!filteringOptions) {
            return;
          }
          treeProps.setHierarchyLevelFilter(filteringOptions.nodeId, toGenericFilter(info));
          setFilteringOptions(undefined);
        }}
        onClose={() => {
          setFilteringOptions(undefined);
        }}
        propertiesSource={propertiesSource}
        initialFilter={getInitialFilter}
      />
    </Flex>
  );
}

type IPrimitiveValueFormatter = Parameters<typeof HierarchyProvider.prototype.setFormatter>[0];
const customFormatter: IPrimitiveValueFormatter = async (val) => {
  return `THIS_IS_FORMATTED_${val ? JSON.stringify(val.value) : ""}_THIS_IS_FORMATTED`;
};

function fromGenericFilter(descriptor: Descriptor, filter: GenericInstanceFilter): PresentationInstanceFilterInfo {
  const presentationFilter =
    GenericInstanceFilter.isFilterRuleGroup(filter.rules) && filter.rules.rules.length === 0
      ? undefined
      : PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
  return {
    filter: presentationFilter,
    usedClasses: (filter.filteredClassNames ?? [])
      .map((name) => descriptor.selectClasses.find((selectClass) => selectClass.selectClassInfo.name === name)?.selectClassInfo)
      .filter((classInfo): classInfo is ClassInfo => classInfo !== undefined),
  };
}

function toGenericFilter(filterInfo?: PresentationInstanceFilterInfo): GenericInstanceFilter | undefined {
  if (!filterInfo) {
    return undefined;
  }

  if (!filterInfo.filter) {
    return filterInfo.usedClasses.length > 0
      ? {
          propertyClassNames: [],
          relatedInstances: [],
          filteredClassNames: filterInfo.usedClasses.map((info) => info.name),
          rules: { operator: "and", rules: [] },
        }
      : undefined;
  }

  return PresentationInstanceFilter.toGenericInstanceFilter(filterInfo.filter, filterInfo.usedClasses);
}

function getIcon(node: PresentationHierarchyNode): ReactElement | undefined {
  if (node.extendedData?.imageId === undefined) {
    return undefined;
  }

  switch (node.extendedData.imageId) {
    case "icon-layers":
      return <SvgLayers />;
    case "icon-item":
      return <SvgItem />;
    case "icon-ec-class":
      return <SvgItem />;
    case "icon-imodel-hollow-2":
      return <SvgImodelHollow />;
    case "icon-folder":
      return <SvgFolder />;
    case "icon-model":
      return <SvgModel />;
  }

  return undefined;
}
