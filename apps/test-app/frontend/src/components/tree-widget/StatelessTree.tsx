/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { debounceTime, Subject } from "rxjs";
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
import { createLimitingECSqlQueryExecutor, GenericInstanceFilter, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { HierarchyLevelDetails, PresentationHierarchyNode, TreeRenderer, useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector, ECClassHierarchyInspector, ECSchemaProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { MyAppFrontend } from "../../api/MyAppFrontend";

type IModelAccess = LimitingECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector;
type UseTreeProps = Parameters<typeof useUnifiedSelectionTree>[0];

export function StatelessTreeV2({ imodel, ...props }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => {
    const schemas = MyAppFrontend.getSchemaContext(imodel);
    const schemaProvider = createECSchemaProvider(schemas);
    setIModelAccess({
      ...schemaProvider,
      ...createCachingECClassHierarchyInspector({ schemaProvider }),
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    });
  }, [imodel]);

  if (!imodelAccess) {
    return null;
  }

  return <Tree {...props} imodel={imodel} imodelAccess={imodelAccess} />;
}

function Tree({ imodel, imodelAccess, height, width }: { imodel: IModelConnection; imodelAccess: IModelAccess; height: number; width: number }) {
  const [filter, setFilter] = useState("");

  const getFilteredPaths = useMemo<UseTreeProps["getFilteredPaths"]>(() => {
    return async ({ imodelAccess: filterIModelAccess }) => {
      if (!filter) {
        return undefined;
      }
      return ModelsTreeDefinition.createInstanceKeyPaths({
        imodelAccess: filterIModelAccess,
        label: filter,
      });
    };
  }, [filter]);

  const {
    rootNodes,
    isLoading,
    reloadTree: _,
    setFormatter,
    ...treeProps
  } = useUnifiedSelectionTree({
    imodelKey: imodel.key,
    sourceName: "StatelessTreeV2",
    imodelAccess,
    getFilteredPaths,
    getHierarchyDefinition,
    onPerformanceMeasured: (action, duration) => {
      // eslint-disable-next-line no-console
      console.log(`Stateless-tree-${action}, Duration: ${duration}ms`);
    },
  });

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  const toggleFormatter = () => {
    const newValue = !shouldUseCustomFormatter;
    setShouldUseCustomFormatter(newValue);
    setFormatter(newValue ? customFormatter : undefined);
  };

  const { getHierarchyLevelDetails } = treeProps;
  const [filteringOptions, setFilteringOptions] = useState<{ nodeId: string | undefined; hierarchyLevelDetails: HierarchyLevelDetails }>();
  const onFilterClick = useCallback(
    (nodeId: string | undefined) => {
      const hierarchyLevelDetails = getHierarchyLevelDetails(nodeId);
      setFilteringOptions(hierarchyLevelDetails ? { nodeId, hierarchyLevelDetails } : undefined);
    },
    [getHierarchyLevelDetails],
  );
  const propertiesSource = useMemo<(() => Promise<PresentationInstanceFilterPropertiesSource>) | undefined>(() => {
    if (!filteringOptions) {
      return undefined;
    }

    return async () => {
      const inputKeysIterator = filteringOptions.hierarchyLevelDetails.getInstanceKeysIterator();
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
  }, [filteringOptions, imodel]);

  const getInitialFilter = useMemo(() => {
    const currentFilter = filteringOptions?.hierarchyLevelDetails.instanceFilter;
    if (!currentFilter) {
      return undefined;
    }

    return (descriptor: Descriptor) => fromGenericFilter(descriptor, currentFilter);
  }, [filteringOptions]);

  const renderContent = () => {
    if (rootNodes && rootNodes.length === 0 && filter) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted>There are no nodes matching filter text {filter}</Text>
        </Flex>
      );
    }

    return (
      <Flex.Item alignSelf="flex-start" style={{ width: "100%", overflow: "auto" }}>
        <TreeRenderer rootNodes={rootNodes ?? []} {...treeProps} onFilterClick={onFilterClick} getIcon={getIcon} selectionMode={"extended"} />
      </Flex.Item>
    );
  };

  const renderLoadingOverlay = () => {
    if (rootNodes !== undefined && !isLoading) {
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
        <ToggleSwitch onChange={toggleFormatter} checked={shouldUseCustomFormatter} />
      </Flex>
      {renderContent()}
      {renderLoadingOverlay()}
      <PresentationInstanceFilterDialog
        imodel={imodel}
        isOpen={!!filteringOptions}
        onApply={(info) => {
          if (!filteringOptions) {
            return;
          }
          treeProps.getHierarchyLevelDetails(filteringOptions.nodeId)?.setInstanceFilter(toGenericFilter(info));
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

function getHierarchyDefinition(props: Parameters<UseTreeProps["getHierarchyDefinition"]>[0]) {
  return new ModelsTreeDefinition(props);
}

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
