/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./FilterBuilder.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PropertyFilterBuilderRenderer,
  PropertyFilterBuilderRuleValue,
  usePropertyFilterBuilder,
} from "@itwin/components-react";
import { Badge, ComboBox } from "@itwin/itwinui-react";
import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { useInstanceFilterPropertiesInfo } from "@itwin/presentation-content-react";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { CircularProgress, Stack, Typography } from "@mui/material";
import { UniqueValuesSelector } from "./UniqueValuesSelector";

import type { PropertyDescription } from "@itwin/appui-abstract";
import type { PropertyFilterBuilderRuleValueRendererProps } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { ReadonlyContentDescriptor, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { InstanceFilterClass } from "@itwin/presentation-content-react";
import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";

type IModelAccess = ECSqlQueryExecutor & ECSchemaProvider;

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

const target = { primaryClass: "BisCore.GeometricElement3d" } as const;

/**
 * Loads and renders the presentation-content-backed filter builder.
 */
function ContentFilterBuilder({ imodel }: { imodel: IModelConnection }) {
  const [state, setState] = useState<{
    descriptor?: ReadonlyContentDescriptor;
    imodelAccess?: IModelAccess;
    error?: unknown;
  }>({});

  useEffect(() => {
    let disposed = false;
    // oxlint-disable-next-line react-hooks/set-state-in-effect
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
      {state.descriptor && state.imodelAccess ? (
        <LoadedContentFilterBuilder descriptor={state.descriptor} imodelAccess={state.imodelAccess} />
      ) : null}
    </>
  );
}

async function loadContent(
  imodel: IModelConnection,
): Promise<{ descriptor: ReadonlyContentDescriptor; imodelAccess: IModelAccess }> {
  const imodelAccess = { ...createECSqlQueryExecutor(imodel), ...createECSchemaProvider(imodel) };
  const imodelContentConfig = await createIModelContentConfiguration({ imodelAccess });
  const sources = await resolveContentSources({ imodelAccess, targets: [target], config: imodelContentConfig });
  const descriptor = await createContentProvider({
    imodelAccess,
    sources,
    config: imodelContentConfig,
  }).getContentDescriptor();
  return { descriptor, imodelAccess };
}

function LoadedContentFilterBuilder({
  descriptor,
  imodelAccess,
}: {
  descriptor: ReadonlyContentDescriptor;
  imodelAccess: IModelAccess;
}) {
  const { classes, visibleProperties, selectedClasses, onSelectedClassesChanged } = useInstanceFilterPropertiesInfo({
    descriptor,
  });
  const { rootGroup, actions } = usePropertyFilterBuilder();
  const filterBuilderProperties = useMemo(() => visibleProperties.map(toPropertyDescription), [visibleProperties]);
  const classOptions = useMemo(() => classes.map((item) => ({ label: item.label, value: item.name })), [classes]);

  const propertyRenderer = useCallback(
    (id: string) => {
      const property = visibleProperties.find((item) => item.id === id);
      if (!property) {
        return id;
      }
      return (
        <span className="filter-builder-property">
          {property.label}
          {property.categoryId ? (
            <Badge backgroundColor="montecarlo">{getCategoryLabel(property, descriptor)}</Badge>
          ) : null}
        </span>
      );
    },
    [descriptor, visibleProperties],
  );

  const ruleValueRenderer = useCallback(
    (props: PropertyFilterBuilderRuleValueRendererProps) => {
      const field = visibleProperties.find((item) => item.id === props.property.name);
      if (!field || !supportsUniqueValues(field, props.operator)) {
        return <PropertyFilterBuilderRuleValue {...props} />;
      }
      return (
        <UniqueValuesSelector
          // Reload from scratch when the rule switches to a different field.
          key={field.id}
          imodelAccess={imodelAccess}
          field={field}
          value={props.value}
          onChange={props.onChange}
        />
      );
    },
    [imodelAccess, visibleProperties],
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
        ruleValueRenderer={ruleValueRenderer}
      />
    </>
  );
}

/**
 * Unique values populate the editor for equality rules only — those are the operators that compare
 * against a specific value the user should be able to pick from a list.
 *
 * Array and struct fields have no single scalar to take distinct values of, so they keep the default
 * editor rather than surfacing the error `useUniqueFieldValues` would raise for them.
 */
function supportsUniqueValues(field: ReadonlyPropertyField, operator: string): boolean {
  if (operator !== "is-equal" && operator !== "is-not-equal") {
    return false;
  }
  return field.type.kind !== "array" && field.type.kind !== "struct";
}

function getSelectedClassNames(selectedNames: string[], classes: InstanceFilterClass[]): InstanceFilterClass["name"][] {
  const selectedNameSet = new Set(selectedNames);
  return classes.flatMap((item) => (selectedNameSet.has(item.name) ? [item.name] : []));
}

function toPropertyDescription(property: ReadonlyPropertyField): PropertyDescription {
  return { name: property.id, displayLabel: property.label, typename: getContentPropertyTypeName(property) };
}

function getCategoryLabel(property: ReadonlyPropertyField, descriptor: ReadonlyContentDescriptor): string {
  let category = property.categoryId ? descriptor.categories[property.categoryId] : undefined;
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
function getContentPropertyTypeName(property: ReadonlyPropertyField): string {
  switch (property.type.kind) {
    case "primitive":
      switch (property.type.type) {
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
