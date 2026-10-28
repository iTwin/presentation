/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./ContentPropertiesWidget.css";

import { useEffect, useMemo, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { Orientation, PropertyDataChangeEvent, VirtualizedPropertyGridWithDataProvider } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { useUnifiedSelectionContent } from "@itwin/presentation-content-react";
import {
  createECSchemaProvider,
  createECSqlQueryExecutor,
  createIModelKey,
  createValueFormatter,
  registerTxnListeners,
} from "@itwin/presentation-core-interop";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { Button, CircularProgress, Stack, Typography } from "@mui/material";
import { createPropertyData } from "./PropertyDataMapper";

import type { IPropertyDataProvider, PropertyData } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Content } from "@itwin/presentation-content-react";
import type { IPrimitiveValueFormatter } from "@itwin/presentation-shared";

/**
 * Properties widget backed by `useUnifiedSelectionContent` from `@itwin/presentation-content-react`. Loads content
 * of the selected instances and renders it with the `PropertyGrid` component.
 */
export function ContentPropertiesWidget({ imodel }: { imodel: IModelConnection }) {
  const unifiedSelectionContext = useUnifiedSelectionContext();
  if (!unifiedSelectionContext) {
    throw new Error("Unified selection context is not available");
  }

  const imodelAccess = useMemo(
    () => ({
      ...createECSqlQueryExecutor(imodel),
      ...createECSchemaProvider(imodel),
      imodelKey: createIModelKey(imodel),
    }),
    [imodel],
  );
  const [imodelChanged] = useState(() => new BeEvent<() => void>());
  useEffect(() => {
    if (imodel.isBriefcaseConnection()) {
      return registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
    }
    return undefined;
  }, [imodel, imodelChanged]);

  const { content, error, reload, isOverLimit, selectedInstancesCount } = useUnifiedSelectionContent({
    imodelAccess,
    imodelChanged,
    selectionStorage: unifiedSelectionContext.storage,
  });
  const formatter = useValueFormatter(imodel);
  const propertyData = usePropertyData({ content, formatter });
  const loadingError = error ?? propertyData.error;

  const [dataProvider] = useState(() => new ContentPropertyDataProvider());
  useEffect(() => {
    if (propertyData.data) {
      dataProvider.setData(propertyData.data);
    }
  }, [dataProvider, propertyData.data]);

  const { width, height, ref } = useResizeDetector();

  return (
    <div className="ContentPropertiesWidget">
      <Typography>Properties (presentation-content)</Typography>
      <div ref={ref} className="ContentContainer">
        {(() => {
          if (isOverLimit) {
            return (
              <Message>
                {IModelApp.localization.getLocalizedString("Sample:property-grid.too-many-elements-selected")}
              </Message>
            );
          }
          if (loadingError !== undefined) {
            return (
              <Message>
                <Typography color="error">{getErrorMessage(loadingError)}</Typography>
                <Button onClick={reload}>Reload</Button>
              </Message>
            );
          }
          if (selectedInstancesCount === 0) {
            return (
              <Message>
                {IModelApp.localization.getLocalizedString("Sample:property-grid.no-elements-selected")}
              </Message>
            );
          }
          if (!propertyData.data || !width || !height) {
            return (
              <Message>
                <CircularProgress size={24} />
              </Message>
            );
          }
          return (
            <VirtualizedPropertyGridWithDataProvider
              width={width}
              height={height}
              dataProvider={dataProvider}
              orientation={Orientation.Horizontal}
              horizontalOrientationMinWidth={500}
              editorSystem="new"
            />
          );
        })()}
      </div>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <Stack className="ContentPropertiesWidget-message">{children}</Stack>;
}

/** Maps loaded content to `PropertyData`, keeping the previous data while mapping new content of the same targets. */
function usePropertyData({
  content,
  formatter,
}: {
  content: Content | undefined;
  formatter: IPrimitiveValueFormatter;
}) {
  const [state, setState] = useState<{ data?: PropertyData; error?: unknown }>({});
  useEffect(() => {
    if (!content) {
      setState({});
      return undefined;
    }
    let cancelled = false;
    createPropertyData({ content, formatter }).then(
      (data) => !cancelled && setState({ data }),
      (error: unknown) => !cancelled && setState({ error }),
    );
    return () => {
      cancelled = true;
    };
  }, [content, formatter]);
  return content ? state : {};
}

/** Creates a value formatter for the active unit system, and creates it again when the unit system changes. */
function useValueFormatter(imodel: IModelConnection): IPrimitiveValueFormatter {
  const [unitSystem, setUnitSystem] = useState(IModelApp.quantityFormatter.activeUnitSystem);
  useEffect(
    () =>
      IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(({ system }) =>
        setUnitSystem(system),
      ),
    [],
  );
  return useMemo(
    () =>
      createValueFormatter({
        formatsProvider: IModelApp.formatsProvider,
        unitsProvider: IModelApp.quantityFormatter,
        imodel,
        unitSystem,
      }),
    [imodel, unitSystem],
  );
}

class ContentPropertyDataProvider implements IPropertyDataProvider {
  public onDataChanged = new PropertyDataChangeEvent();
  #data?: PropertyData;

  public setData(data: PropertyData) {
    this.#data = data;
    this.onDataChanged.raiseEvent();
  }

  public async getData(): Promise<PropertyData> {
    if (!this.#data) {
      throw new Error("Property data is not set");
    }
    return this.#data;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
