/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./FilterBuilder.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyFilterBuilderRenderer, usePropertyFilterBuilder } from "@itwin/components-react";
import { Badge, ComboBox } from "@itwin/itwinui-react";
import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { useInstanceFilterPropertiesInfo } from "@itwin/presentation-content-react";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { CircularProgress, Stack, Typography } from "@mui/material";
import { bisCoreContentCustomization } from "./BisCoreContentCustomization";

import type { PropertyDescription } from "@itwin/appui-abstract";
import type { IModelConnection } from "@itwin/core-frontend";
import type { ContentDescriptor } from "@itwin/presentation-content";
import type { InstanceFilterClass, InstanceFilterProperty } from "@itwin/presentation-content-react";

/**
 * Displays a presentation-content-backed filter builder.
 */
export function FilterBuilder({ imodel }: { imodel: IModelConnection }) {
  return (
    <div className="filter-builder">
      <section>
        <ContentFilterBuilder imodel={imodel} />
      </section>
    </div>
  );
}

const target = { primaryClass: "BisCore.Element" } as const;

/**
 * Loads and renders the presentation-content-backed filter builder.
 */
function ContentFilterBuilder({ imodel }: { imodel: IModelConnection }) {
  const [state, setState] = useState<{ descriptor?: ContentDescriptor; error?: unknown }>({});

  useEffect(() => {
    let disposed = false;
    setState({});

    void loadContent(imodel).then(
      (result) => {
        if (!disposed) {
          setState(result);
        }
      },
      (error: unknown) => {
        if (!disposed) {
          setState({ error });
        }
      },
    );

    return () => {
      disposed = true;
    };
  }, [imodel]);

  return (
    <>
      <Typography>Presentation content</Typography>
      {state.error ? <Typography color="error">{getErrorMessage(state.error)}</Typography> : null}
      {!state.descriptor && !state.error ? (
        <Stack className="filter-builder-status">
          <CircularProgress size={24} />
        </Stack>
      ) : null}
      {state.descriptor ? <LoadedContentFilterBuilder descriptor={state.descriptor} /> : null}
    </>
  );
}

async function loadContent(imodel: IModelConnection): Promise<{ descriptor: ContentDescriptor }> {
  const schemaProvider = createECSchemaProvider(imodel);
  const imodelAccess = {
    ...createECSqlQueryExecutor(imodel),
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider }),
  };
  const embeddedConfiguration = await createIModelContentConfiguration({ imodelAccess });
  const configuration = {
    ...embeddedConfiguration,
    imodelFieldsProviders: [...(embeddedConfiguration.imodelFieldsProviders ?? []), bisCoreContentCustomization],
  };
  const sources = await resolveContentSources({ imodelAccess, targets: [target], config: configuration });
  const descriptor = await createContentProvider({
    imodelAccess,
    sources,
    config: configuration,
  }).getContentDescriptor();
  return { descriptor: descriptor as ContentDescriptor };
}

function LoadedContentFilterBuilder({ descriptor }: { descriptor: ContentDescriptor }) {
  const { classes, visibleProperties, selectedClasses, onSelectedClassesChanged } = useInstanceFilterPropertiesInfo({
    descriptor,
  });
  const { rootGroup, actions } = usePropertyFilterBuilder();
  const filterBuilderProperties = useMemo(() => visibleProperties.map(toPropertyDescription), [visibleProperties]);
  const classOptions = useMemo(() => classes.map((item) => ({ label: item.label, value: item.name })), [classes]);

  const propertyRenderer = useCallback(
    (id: string) => {
      const property = visibleProperties.find((item) => item.field.id === id);
      if (!property) {
        return id;
      }
      return (
        <span className="filter-builder-property">
          {property.field.label}
          {property.field.categoryId ? (
            <Badge backgroundColor="montecarlo">{getCategoryLabel(property, descriptor)}</Badge>
          ) : null}
        </span>
      );
    },
    [descriptor, visibleProperties],
  );

  return (
    <>
      <ComboBox
        enableVirtualization
        multiple
        options={classOptions}
        value={selectedClasses}
        inputProps={{ placeholder: "Limit properties by class" }}
        onChange={(classNames) => {
          onSelectedClassesChanged(getSelectedClassNames(classNames, classes));
          actions.removeAllItems();
        }}
      />
      <PropertyFilterBuilderRenderer
        rootGroup={rootGroup}
        actions={actions}
        properties={filterBuilderProperties}
        propertyRenderer={propertyRenderer}
      />
    </>
  );
}

function getSelectedClassNames(selectedNames: string[], classes: InstanceFilterClass[]): InstanceFilterClass["name"][] {
  const selectedNameSet = new Set(selectedNames);
  return classes.flatMap((item) => (selectedNameSet.has(item.name) ? [item.name] : []));
}

function toPropertyDescription(property: InstanceFilterProperty): PropertyDescription {
  return {
    name: property.field.id,
    displayLabel: property.field.label,
    typename: getContentPropertyTypeName(property),
  };
}

function getCategoryLabel(property: InstanceFilterProperty, descriptor: ContentDescriptor): string {
  let category = property.field.categoryId ? descriptor.categories[property.field.categoryId] : undefined;
  if (!category) {
    return "Related";
  }

  const labels: string[] = [];
  const visited = new Set<string>();
  while (category && !visited.has(category.id)) {
    labels.unshift(category.label);
    visited.add(category.id);
    category = category.parentId ? descriptor.categories[category.parentId] : undefined;
  }
  return labels.join(" | ");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load the presentation-content descriptor.";
}

/**
 * Maps a content value descriptor to the type-name vocabulary expected by `PropertyFilterBuilderRenderer`.
 */
function getContentPropertyTypeName(property: InstanceFilterProperty): string {
  switch (property.field.type.kind) {
    case "primitive":
      switch (property.field.type.type) {
        case "String":
          return "string";
        case "Integer":
          return "int";
        case "Long":
          return "long";
        case "Double":
          return "double";
        case "Boolean":
          return "boolean";
        case "DateTime":
          return "dateTime";
        case "Point2d":
          return "point2d";
        case "Point3d":
          return "point3d";
        case "Id":
          return "long";
        default:
          return "string";
      }
    case "navigation":
      return "navigation";
    default:
      return "string";
  }
}
