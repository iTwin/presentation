/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback, useEffect, useMemo, useState } from "react";
import { debounceTime, Subject } from "rxjs";
import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Button, Flex, ProgressRadial, SearchBox, Text, ToggleSwitch } from "@itwin/itwinui-react";
import { ClassInfo, DefaultContentDisplayTypes, Descriptor, InstanceKey, KeySet } from "@itwin/presentation-common";
import {
  PresentationInstanceFilter,
  PresentationInstanceFilterDialog,
  PresentationInstanceFilterInfo,
  PresentationInstanceFilterPropertiesSource,
} from "@itwin/presentation-components";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey, registerTxnListeners } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { createLimitingECSqlQueryExecutor, GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import {
  FilterAction,
  HierarchyLevelDetails,
  PresentationHierarchyNode,
  RootErrorRenderer,
  TreeRenderer,
  useIModelUnifiedSelectionTree,
} from "@itwin/presentation-hierarchies-react";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector, IPrimitiveValueFormatter, Props } from "@itwin/presentation-shared";
import { Selectable, Selectables } from "@itwin/unified-selection";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { Icon } from "@stratakit/foundations";
import { MyAppFrontend } from "../../api/MyAppFrontend";

type UseIModelTreeProps = Props<typeof useIModelUnifiedSelectionTree>;
type IModelAccess = UseIModelTreeProps["imodelAccess"];

export function StatelessTreeV2({ imodel, ...props }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => {
    const schemas = MyAppFrontend.getSchemaContext(imodel);
    const schemaProvider = createECSchemaProvider(schemas);
    setIModelAccess({
      imodelKey: imodel.key,
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

  const getFilteredPaths = useMemo<UseIModelTreeProps["getFilteredPaths"]>(() => {
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

  const [imodelChanged] = useState(new BeEvent<() => void>());
  useEffect(() => {
    if (imodel.isBriefcaseConnection()) {
      return registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
    }
    return undefined;
  }, [imodel, imodelChanged]);

  const unifiedSelectionContext = useUnifiedSelectionContext();
  if (!unifiedSelectionContext) {
    throw new Error("Unified selection context is not available");
  }

  const { isReloading, setFormatter, reloadTree, getHierarchyLevelDetails, ...treeProps } = useIModelUnifiedSelectionTree({
    selectionStorage: unifiedSelectionContext.storage,
    sourceName: "StatelessTreeV2",
    imodelAccess,
    imodelChanged,
    getFilteredPaths,
    getHierarchyDefinition,
    onPerformanceMeasured: (action, duration) => {
      // eslint-disable-next-line no-console
      console.log(`Stateless-tree-${action}, Duration: ${duration}ms`);
    },
  });

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  const toggleFormatter = useCallback(() => {
    const newValue = !shouldUseCustomFormatter;
    setShouldUseCustomFormatter(newValue);
    setFormatter(newValue ? customFormatter : undefined);
  }, [shouldUseCustomFormatter, setFormatter]);

  const [filteringOptions, setFilteringOptions] = useState<HierarchyLevelDetails>();
  const propertiesSource = useMemo<(() => Promise<PresentationInstanceFilterPropertiesSource>) | undefined>(() => {
    if (!filteringOptions) {
      return undefined;
    }

    return async () => {
      const inputKeysIterator = filteringOptions.getInstanceKeysIterator();
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
    const currentFilter = filteringOptions?.instanceFilter;
    if (!currentFilter) {
      return undefined;
    }

    return (descriptor: Descriptor) => fromGenericFilter(descriptor, currentFilter);
  }, [filteringOptions]);

  const getDecorations = useCallback((node: PresentationHierarchyNode) => {
    return <Icon href={getIcon(node)} />;
  }, []);

  const getActions = useCallback(
    (node: PresentationHierarchyNode) => [
      <FilterAction key="filter" node={node} onFilter={setFilteringOptions} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
    ],
    [getHierarchyLevelDetails],
  );

  const renderContent = () => {
    if (treeProps.rootErrorRenderProps) {
      return <RootErrorRenderer {...treeProps.rootErrorRenderProps} reloadTree={reloadTree} getHierarchyLevelDetails={getHierarchyLevelDetails} />;
    }

    if (!treeProps.treeRenderProps) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted> Loading </Text>
        </Flex>
      );
    }

    if (treeProps.treeRenderProps.rootNodes.length === 0 && filter) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted>There are no nodes matching filter text {filter}</Text>
        </Flex>
      );
    }

    return (
      <TreeRenderer
        {...treeProps.treeRenderProps}
        reloadTree={reloadTree}
        getHierarchyLevelDetails={getHierarchyLevelDetails}
        style={{ height: "100%", width: "100%" }}
        onFilterClick={setFilteringOptions}
        getActions={getActions}
        selectionMode={"extended"}
        getDecorations={getDecorations}
      />
    );
  };

  const renderLoadingOverlay = () => {
    if (treeProps.rootErrorRenderProps !== undefined || treeProps.treeRenderProps !== undefined || !isReloading) {
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
        {imodel.isBriefcaseConnection() ? <Button onClick={() => void removeSelectedElements(imodel)}>Delete</Button> : null}
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
          filteringOptions?.setInstanceFilter(toGenericFilter(info));
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

function getHierarchyDefinition(props: Parameters<UseIModelTreeProps["getHierarchyDefinition"]>[0]) {
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

const subjectSvg = new URL("@stratakit/icons/bis-subject.svg", import.meta.url).href;
const classSvg = new URL("@stratakit/icons/bis-class.svg", import.meta.url).href;
const modelSvg = new URL("@stratakit/icons/model-cube.svg", import.meta.url).href;
const categorySvg = new URL("@stratakit/icons/bis-category-3d.svg", import.meta.url).href;
const elementSvg = new URL("@stratakit/icons/bis-element.svg", import.meta.url).href;
const iModelSvg = new URL("@stratakit/icons/imodel.svg", import.meta.url).href;

function getIcon(node: PresentationHierarchyNode): string | undefined {
  if (node.nodeData.extendedData?.imageId === undefined) {
    return undefined;
  }

  switch (node.nodeData.extendedData.imageId) {
    case "icon-layers":
      return categorySvg;
    case "icon-item":
      return elementSvg;
    case "icon-ec-class":
      return classSvg;
    case "icon-imodel-hollow-2":
      return iModelSvg;
    case "icon-folder":
      return subjectSvg;
    case "icon-model":
      return modelSvg;
  }

  return undefined;
}

async function removeSelectedElements(imodel: IModelConnection) {
  const keys = getSelectedElementIds(imodel);
  if (keys.length === 0) {
    return;
  }

  await MyAppFrontend.deleteElements(imodel, keys);
}

function getSelectedElementIds(imodel: IModelConnection) {
  const selection = MyAppFrontend.selectionStorage.getSelection({ imodelKey: createIModelKey(imodel) });
  const keys: InstanceKey[] = [];
  Selectables.forEach(selection, (selectable) => {
    if (Selectable.isInstanceKey(selectable)) {
      keys.push(selectable);
    }
  });

  return keys.map((key) => key.id);
}
