/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./App.css";
import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
import "@itwin/itwinui-react/styles.css";
import { useEffect, useRef, useState } from "react";
import { from, reduce, Subject, takeUntil } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Geometry } from "@itwin/core-geometry";
import { UnitSystemKey } from "@itwin/core-quantity";
import { ElementSeparator, Orientation } from "@itwin/core-react";
import { ThemeProvider, ToggleSwitch } from "@itwin/itwinui-react";
import { InstanceKey, Key, KeySet, PresentationQuery, PresentationQueryBinding, StandardNodeTypes } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider, UnifiedSelectionContextProvider } from "@itwin/presentation-components";
import { HiliteSet, Presentation, SelectionChangeEventArgs, SelectionChangeType } from "@itwin/presentation-frontend";
import { ClassGroupingNodeKey, GroupingHierarchyNode, parseFullClassName } from "@itwin/presentation-hierarchies";
import { UnifiedSelectionProvider } from "@itwin/presentation-hierarchies-react";
import { createStorage, Selectable, Selectables } from "@itwin/unified-selection";
import { MyAppFrontend, MyAppSettings } from "../../api/MyAppFrontend";
import { IModelSelector } from "../imodel-selector/IModelSelector";
import { PropertiesWidget } from "../properties-widget/PropertiesWidget";
import { RulesetSelector } from "../ruleset-selector/RulesetSelector";
import { TableWidget } from "../table-widget/TableWidget";
import { TreeWidget } from "../tree-widget/TreeWidget";
// import { ExperimentalModelsTree } from "../tree-widget/TreeWidget";
import { UnitSystemSelector } from "../unit-system-selector/UnitSystemSelector";
import ViewportContentControl from "../viewport/ViewportContentControl";

export interface State {
  imodel?: IModelConnection;
  imodelPath?: string;
  rulesetId?: string;
  activeUnitSystem: UnitSystemKey;
  persistSettings: boolean;
}

const selectionStorage = createStorage();

export function App() {
  const [state, setState] = useAppState();

  const onIModelSelected = (imodel: IModelConnection | undefined, path?: string) => {
    if (imodel) {
      imodel.onClose.addOnce(() => {
        selectionStorage.clearStorage({ iModelKey: imodel.key });
      });
    }
    setState((prev) => ({
      ...prev,
      imodel,
      imodelPath: path,
    }));
  };

  const onRulesetSelected = (rulesetId: string | undefined) => {
    if (state.imodel) {
      Presentation.selection.clearSelection("onRulesetChanged", state.imodel, 0);
    }

    setState((prev) => ({
      ...prev,
      rulesetId,
    }));
  };

  const onUnitSystemSelected = async (unitSystem: UnitSystemKey) => {
    await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
  };

  const onPersistSettingsValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState((prev) => ({
      ...prev,
      persistSettings: e.target.checked,
    }));
  };

  useSyncedUnifiedSelection(state.imodel);

  useEffect(() => {
    const cancel = new Subject<void>();
    const removeListener = Presentation.selection.selectionChange.addListener(async (args: SelectionChangeEventArgs) => {
      cancel.next();
      if (!IModelApp.viewManager.selectedView) {
        // no viewport to zoom in
        return;
      }

      if (args.source === "Tool") {
        // selection originated from the viewport - don't change what it's displaying by zooming in
        return;
      }

      // determine what the viewport is hiliting
      const selectedView = IModelApp.viewManager.selectedView;
      from(Presentation.selection.getHiliteSetIterator(args.imodel))
        .pipe(
          takeUntil(cancel),
          reduce<HiliteSet, { elements: Id64String[] }>(
            (acc, curr) => {
              // note: the hilite list may contain models and subcategories as well - we don't
              // care about them at this moment
              acc.elements.push(...(curr.elements ?? []));
              return acc;
            },
            { elements: [] },
          ),
        )
        .subscribe({
          next: (set) => {
            void selectedView.zoomToElements(set.elements);
          },
        });
    });

    return () => {
      cancel.next();
      removeListener();
    };
  }, []);

  return (
    <ThemeProvider theme="os">
      <div className="app">
        <div className="app-header">
          <h2>{IModelApp.localization.getLocalizedString("Sample:welcome-message")}</h2>
        </div>
        <div className="app-pickers">
          <IModelSelector onIModelSelected={onIModelSelected} activeIModelPath={state.imodelPath} />
          <RulesetSelector onRulesetSelected={onRulesetSelected} activeRulesetId={state.rulesetId} />
          <UnitSystemSelector selectedUnitSystem={state.activeUnitSystem} onUnitSystemSelected={onUnitSystemSelected} />
          <ToggleSwitch label="Persist settings" labelPosition="right" checked={state.persistSettings} onChange={onPersistSettingsValueChange} />
        </div>
        {state.imodel ? <IModelComponents imodel={state.imodel} rulesetId={state.rulesetId} /> : null}
      </div>
    </ThemeProvider>
  );
}

function updateAppSettings(state: State) {
  const settings: MyAppSettings = {
    persistSettings: state.persistSettings,
  };
  if (state.persistSettings) {
    settings.imodelPath = state.imodelPath;
    settings.rulesetId = state.rulesetId;
    settings.unitSystem = state.activeUnitSystem;
  }
  MyAppFrontend.settings = settings;
}

function useAppState(): [State, (produceState: (prev: State) => State) => void] {
  const [state, setState] = useState<State>(() => {
    const settings = MyAppFrontend.settings;
    const update: Partial<State> = {
      persistSettings: settings.persistSettings,
      activeUnitSystem: IModelApp.quantityFormatter.activeUnitSystem,
    };
    if (!settings.persistSettings) {
      return update as State;
    }

    if (settings.unitSystem) {
      void IModelApp.quantityFormatter.setActiveUnitSystem(settings.unitSystem);
    }

    update.imodelPath = settings.imodelPath;
    update.rulesetId = settings.rulesetId;
    update.activeUnitSystem = settings.unitSystem;
    return update as State;
  });

  const updateState = (produceState: (prev: State) => State) => {
    setState((prev) => {
      const newState = produceState(prev);
      updateAppSettings(newState);
      return newState;
    });
  };

  useEffect(() => {
    return IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(({ system }) => {
      updateState((prev) => ({
        ...prev,
        activeUnitSystem: system,
      }));
    });
  }, []);

  return [state, updateState];
}

interface IModelComponentsProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

function IModelComponents(props: IModelComponentsProps) {
  const { imodel, rulesetId } = props;

  const {
    ref: contentRef,
    ratio: contentRatio,
    onResize: onContentResize,
    width: contentWidth,
  } = useResizableElement<HTMLDivElement>({ min: 0.2, max: 0.9, initial: 0.7 }); // content
  const {
    ref: panelRef,
    ratio: panelRatio,
    onResize: onPanelResize,
    height: panelHeight,
  } = useResizableElement<HTMLDivElement>({ min: 0.3, max: 0.7, initial: 0.5 }); // rightPanel

  return (
    <div
      className="app-content"
      ref={contentRef}
      style={{
        gridTemplateColumns: `${contentRatio * 100}% 1px calc(${(1 - contentRatio) * 100}% - 1px)`,
      }}
    >
      <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={MyAppFrontend.getSchemaContext.bind(MyAppFrontend)}>
        <UnifiedSelectionContextProvider imodel={imodel} selectionLevel={0}>
          <UnifiedSelectionProvider storage={selectionStorage}>
            <div className="app-content-left">
              <div className="app-content-left-top">
                <ViewportContentControl imodel={imodel} />
              </div>
              <div className="app-content-left-bottom">
                <TableWidget imodel={imodel} rulesetId={rulesetId} />
              </div>
            </div>
            <ElementSeparator
              orientation={Orientation.Horizontal}
              ratio={contentRatio}
              movableArea={contentWidth}
              separatorSize={10}
              onRatioChanged={onContentResize}
            />
            <div
              ref={panelRef}
              className="app-content-right"
              style={{
                gridTemplateRows: `${panelRatio * 100}% 30px calc(${(1 - panelRatio) * 100}% - 30px)`,
              }}
            >
              <TreeWidget imodel={imodel} rulesetId={rulesetId} />
              <div className="app-content-right-separator">
                <hr />
                <ElementSeparator orientation={Orientation.Vertical} ratio={panelRatio} movableArea={panelHeight} onRatioChanged={onPanelResize} />
              </div>
              <PropertiesWidget imodel={imodel} rulesetId={rulesetId} />
            </div>
          </UnifiedSelectionProvider>
        </UnifiedSelectionContextProvider>
      </SchemaMetadataContextProvider>
    </div>
  );
}

function useResizableElement<T extends Element>({ min, max, initial }: { min: number; max: number; initial: number }) {
  const ref = useRef<T>(null);
  const [ratio, setRatio] = useState(initial);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    setHeight(rect.height);
    setWidth(rect.width);
  }, []);

  const onResize = (newRatio: number) => {
    setRatio(Geometry.clamp(newRatio, min, max));
  };

  return {
    ref,
    ratio,
    height,
    width,
    onResize,
  };
}

// simple implementation to sync `presentation-frontend` unified selection with `@itwin/unified-selection` storage.
// TODO: remove when `presentation-frontend` can use supplied unified selection storage.
function useSyncedUnifiedSelection(imodel?: IModelConnection) {
  useEffect(() => {
    if (!imodel) {
      return;
    }

    const selectionChangeDispose = Presentation.selection.selectionChange.addListener((args) => {
      if (args.source === "sync" || args.imodel.key !== imodel.key) {
        return;
      }

      switch (args.changeType) {
        case SelectionChangeType.Add:
          return selectionStorage.addToSelection({ source: "sync", iModelKey: imodel.key, selectables: keysToSelectable(args.keys), level: args.level });
        case SelectionChangeType.Remove:
          return selectionStorage.removeFromSelection({ source: "sync", iModelKey: imodel.key, selectables: keysToSelectable(args.keys), level: args.level });
        case SelectionChangeType.Replace:
          return selectionStorage.replaceSelection({ source: "sync", iModelKey: imodel.key, selectables: keysToSelectable(args.keys), level: args.level });
        case SelectionChangeType.Clear:
          return selectionStorage.clearSelection({ source: "sync", iModelKey: imodel.key, level: args.level });
      }
    });

    const selectionStorageChangeDispose = selectionStorage.selectionChangeEvent.addListener((args) => {
      if (args.source === "sync" || args.iModelKey !== imodel.key) {
        return;
      }

      switch (args.changeType) {
        case "add":
          return Presentation.selection.addToSelection("sync", imodel, selectablesToKeys(args.selectables), args.level);
        case "remove":
          return Presentation.selection.removeFromSelection("sync", imodel, selectablesToKeys(args.selectables), args.level);
        case "replace":
          return Presentation.selection.replaceSelection("sync", imodel, selectablesToKeys(args.selectables), args.level);
        case "clear":
          return Presentation.selection.clearSelection("sync", imodel, args.level);
      }
    });

    return () => {
      selectionChangeDispose();
      selectionStorageChangeDispose();
    };
  }, [imodel]);
}

function keysToSelectable(keys: Readonly<KeySet>) {
  const selectables: Selectable[] = [];
  keys.forEach((key) => {
    if ("id" in key) {
      selectables.push(key);
    }
  });
  return selectables;
}

function selectablesToKeys(selectables: Selectables): Key[] {
  const keys: Key[] = [];

  Selectables.forEach(selectables, (selectable) => {
    if (Selectable.isInstanceKey(selectable)) {
      keys.push(selectable);
      return;
    }

    const hierarchyNode = selectable.data as GroupingHierarchyNode;
    keys.push({
      version: 3,
      type: StandardNodeTypes.ECClassGroupingNode,
      className: (hierarchyNode.key as ClassGroupingNodeKey).className,
      pathFromRoot: [selectable.identifier],
      groupedInstancesCount: hierarchyNode.groupedInstanceKeys.length,
      instanceKeysSelectQuery: createInstanceKeysSelectQuery(hierarchyNode.groupedInstanceKeys),
    });
  });

  return keys;
}

function createInstanceKeysSelectQuery(keys: InstanceKey[]): PresentationQuery {
  let query = "";
  const bindings: PresentationQueryBinding[] = [];
  new KeySet(keys).instanceKeys.forEach((idsSet, fullClassName) => {
    const { schemaName, className } = parseFullClassName(fullClassName);
    const ids = [...idsSet];
    if (query.length > 0) {
      query += ` UNION ALL `;
    }
    query += `SELECT ECClassId, ECInstanceId FROM [${schemaName}].[${className}] WHERE ECInstanceId IN (${ids.map(() => "?").join(",")})`;
    ids.forEach((id) => bindings.push({ type: "Id" as const, value: id }));
  });
  return { query, bindings };
}
