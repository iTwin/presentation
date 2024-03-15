/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedAsyncValue } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { SvgFolder, SvgImodelHollow, SvgItem, SvgLayers, SvgModel } from "@itwin/itwinui-icons-react";
import { Flex, ProgressRadial, SearchBox, Text, ToggleSwitch } from "@itwin/itwinui-react";
import { ClassInfo, Descriptor } from "@itwin/presentation-common";
import {
  PresentationInstanceFilter,
  PresentationInstanceFilterDialog,
  PresentationInstanceFilterInfo,
  PresentationInstanceFilterPropertiesSource,
} from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createHierarchyLevelDescriptor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { HierarchyLevelFilteringOptions, PresentationHierarchyNode, TreeRenderer, useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import {
  createLimitingECSqlQueryExecutor,
  GenericInstanceFilter,
  HierarchyProvider,
  ILimitingECSqlQueryExecutor,
  IMetadataProvider,
  NonGroupingHierarchyNode,
  TypedPrimitiveValue,
} from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";

interface MetadataProviders {
  queryExecutor: ILimitingECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

export function StatelessTreeV2(props: { imodel: IModelConnection; height: number; width: number }) {
  return <Tree {...props} />;
}

function Tree({ imodel, height, width }: { imodel: IModelConnection; height: number; width: number }) {
  const [metadata, setMetadata] = useState<MetadataProviders>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();
  const [filter, setFilter] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    setMetadata({
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
      metadataProvider: createMetadataProvider(schemas),
    });
  }, [imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      setIsFiltering(false);
      if (!metadata) {
        return undefined;
      }
      if (filter !== "") {
        setIsFiltering(true);
        const paths = await ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider: metadata.metadataProvider,
          queryExecutor: metadata.queryExecutor,
          label: filter,
        });
        return paths;
      }
      return undefined;
    }, [metadata, filter]),
  );

  useEffect(() => {
    setIsFiltering(false);
    if (!metadata) {
      return;
    }

    setHierarchyProvider(
      new HierarchyProvider({
        metadataProvider: metadata.metadataProvider,
        queryExecutor: metadata.queryExecutor,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider: metadata.metadataProvider }),
        filtering: filteredPaths
          ? {
              paths: filteredPaths,
            }
          : undefined,
      }),
    );
  }, [metadata, filteredPaths]);

  const { rootNodes, isLoading, ...treeProps } = useUnifiedSelectionTree({
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
    treeProps.reloadTree();
  };

  const [filteringOptions, setFilteringOptions] = useState<HierarchyLevelFilteringOptions>();
  const propertiesSource = useMemo<(() => Promise<PresentationInstanceFilterPropertiesSource>) | undefined>(() => {
    if (!hierarchyProvider || !filteringOptions) {
      return undefined;
    }

    return async () => {
      const result = await createHierarchyLevelDescriptor({
        descriptorBuilder: Presentation.presentation,
        hierarchyProvider,
        imodel,
        parentNode: filteringOptions.hierarchyNode as NonGroupingHierarchyNode,
      });

      if (!result) {
        throw new Error("Failed to create descriptor");
      }

      return {
        descriptor: result.descriptor,
        inputKeys: result.inputKeys,
      };
    };
  }, [filteringOptions, imodel, hierarchyProvider]);

  const getInitialFilter = useMemo(() => {
    const currentFilter = filteringOptions?.currentFilter;
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
        <TreeRenderer rootNodes={rootNodes} {...treeProps} onFilterClick={setFilteringOptions} getIcon={getIcon} />
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
          filteringOptions?.applyFilter(toGenericFilter(info));
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

async function customFormatter(val: TypedPrimitiveValue) {
  return `THIS_IS_FORMATTED_${val ? JSON.stringify(val.value) : ""}_THIS_IS_FORMATTED`;
}

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
