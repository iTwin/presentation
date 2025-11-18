/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./App.css";
import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
import "@itwin/itwinui-react/styles.css";

import { useEffect, useRef, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { from, reduce, Subject, takeUntil } from "rxjs";
import {
  ConfigurableUiContent,
  ContentGroup,
  StagePanelState,
  StageUsage,
  StandardContentLayouts,
  ThemeManager,
  UiFramework,
  UiStateStorageHandler,
  WidgetState,
} from "@itwin/appui-react";
import { Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { UnitSystemKey } from "@itwin/core-quantity";
import { ThemeProvider, ToggleSwitch } from "@itwin/itwinui-react";
import { SchemaMetadataContextProvider } from "@itwin/presentation-components";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createHiliteSetProvider, enableUnifiedSelectionSyncWithIModel, HiliteSet, SelectionScope } from "@itwin/unified-selection";
import { UnifiedSelectionContextProvider } from "@itwin/unified-selection-react";
import { Root } from "@stratakit/foundations";
import { MyAppFrontend, MyAppSettings } from "../../api/MyAppFrontend";
import { IModelSelector } from "../imodel-selector/IModelSelector";
import { PropertiesWidget } from "../properties-widget/PropertiesWidget";
import { RulesetSelector } from "../ruleset-selector/RulesetSelector";
import { TableWidget } from "../table-widget/TableWidget";
import { MultiDataSourceTree } from "../tree-widget/MultiDataSourceTree";
import { RulesDrivenTreeWidget } from "../tree-widget/RulesDrivenTree";
import { StatelessTreeV2 } from "../tree-widget/StatelessTree";
import { UnitSystemSelector } from "../unit-system-selector/UnitSystemSelector";
import ViewportContentControl from "../viewport/ViewportContentControl";

export interface State {
  imodel?: IModelConnection;
  imodelPath?: string;
  rulesetId?: string;
  activeUnitSystem: UnitSystemKey;
  persistSettings: boolean;
}

export function App() {
  const [state, setState] = useAppState();

  const onIModelSelected = (imodel: IModelConnection | undefined, path?: string) => {
    setState((prev) => ({
      ...prev,
      imodel,
      imodelPath: path,
    }));
  };

  const onRulesetSelected = (rulesetId: string | undefined) => {
    if (state.imodel) {
      MyAppFrontend.selectionStorage.clearSelection({
        imodelKey: createIModelKey(state.imodel),
        source: "onRulesetChanged",
        level: 0,
      });
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

  useEffect(() => {
    const cancel = new Subject<void>();
    const removeListener = MyAppFrontend.selectionStorage.selectionChangeEvent.addListener(async (args) => {
      cancel.next();
      if (!IModelApp.viewManager.selectedView || !state.imodel) {
        // no viewport to zoom in
        return;
      }

      if (args.source === "Tool") {
        // selection originated from the viewport - don't change what it's displaying by zooming in
        return;
      }

      if (args.imodelKey !== createIModelKey(state.imodel)) {
        return;
      }

      // determine what the viewport is hiliting
      const selectedView = IModelApp.viewManager.selectedView;
      const schemas = MyAppFrontend.getSchemaContext(state.imodel);
      const hiliteSetProvider = createHiliteSetProvider({
        imodelAccess: {
          ...createECSqlQueryExecutor(state.imodel),
          ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(schemas) }),
        },
      });
      from(hiliteSetProvider.getHiliteSet({ selectables: MyAppFrontend.selectionStorage.getSelection({ imodelKey: createIModelKey(state.imodel) }) }))
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
  }, [state.imodel]);

  return (
    <ThemeProvider theme={"light"} future={{ themeBridge: true }} as={Root} colorScheme={"light"} synchronizeColorScheme density="dense">
      <UnifiedSelectionContextProvider storage={MyAppFrontend.selectionStorage}>
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
      </UnifiedSelectionContextProvider>
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

  const activeSelectionScope = useRef<SelectionScope>("element");

  useEffect(() => {
    UiFramework.frontstages.addFrontstage({
      id: "presentation-test-app-frontstage",
      version: 1,
      usage: StageUsage.General,
      contentGroup: new ContentGroup({
        id: "presentation-test-app-stage-content",
        layout: StandardContentLayouts.singleView,
        contents: [
          {
            id: "primaryContent",
            classId: "",
            content: <ViewportContentControl imodel={imodel} onSelectionScopeChanged={(scope) => (activeSelectionScope.current = scope)} />,
          },
        ],
      }),
      rightPanel: {
        defaultState: StagePanelState.Open,
        maxSizeSpec: { percentage: 90 },
        minSizeSpec: 400,
        sizeSpec: { percentage: 40 },
        sections: {
          start: [
            {
              id: "rules-driven-tree",
              label: "Rules-driven tree",
              content: <RulesDrivenTreePanel imodel={imodel} rulesetId={rulesetId} />,
              defaultState: WidgetState.Open,
              canPopout: true,
            },
            {
              id: "stateless-models-tree",
              label: "Stateless Models tree",
              content: <StatelessModelsTreePanel imodel={imodel} />,
              defaultState: WidgetState.Open,
              canPopout: true,
            },
            {
              id: "multi-datasource-tree",
              label: "Multi data source tree",
              content: <MultiDataSourceTreePanel imodel={imodel} />,
              defaultState: WidgetState.Open,
              canPopout: true,
            },
          ],
          end: [
            {
              id: "properties",
              label: "Properties widget",
              content: <PropertiesWidget imodel={imodel} rulesetId={rulesetId} />,
              defaultState: WidgetState.Open,
              canPopout: true,
            },
          ],
        },
      },
      bottomPanel: {
        defaultState: StagePanelState.Minimized,
        sections: {
          start: [
            {
              id: "table",
              label: "Table widget",
              content: <TableWidget imodel={imodel} rulesetId={rulesetId} />,
              defaultState: WidgetState.Closed,
              canFloat: true,
              canPopout: true,
            },
          ],
        },
      },
    });
    void UiFramework.frontstages.setActiveFrontstage("presentation-test-app-frontstage");
    return () => {
      UiFramework.frontstages.clearFrontstages();
    };
  }, [imodel, rulesetId]);

  useEffect(
    () =>
      enableUnifiedSelectionSyncWithIModel({
        imodelAccess: {
          ...createECSqlQueryExecutor(imodel),
          ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)) }),
          key: imodel.key,
          hiliteSet: imodel.hilited,
          selectionSet: imodel.selectionSet,
        },
        selectionStorage: MyAppFrontend.selectionStorage,
        activeScopeProvider: () => activeSelectionScope.current,
      }),
    [imodel],
  );

  return (
    <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={MyAppFrontend.getSchemaContext.bind(MyAppFrontend)}>
      <ThemeManager theme="light">
        <UiStateStorageHandler>
          <ConfigurableUiContent />
        </UiStateStorageHandler>
      </ThemeManager>
    </SchemaMetadataContextProvider>
  );
}

function RulesDrivenTreePanel(props: { imodel: IModelConnection; rulesetId?: string }) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <div className="tree-widget-tabs-content" ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <RulesDrivenTreeWidget imodel={props.imodel} rulesetId={props.rulesetId} width={width} height={height} />
    </div>
  );
}

function StatelessModelsTreePanel(props: { imodel: IModelConnection }) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <div className="tree-widget-tabs-content" ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <StatelessTreeV2 treeLabel="Models tree" imodel={props.imodel} width={width ?? 0} height={height ?? 0} />
    </div>
  );
}

function MultiDataSourceTreePanel(props: { imodel: IModelConnection }) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <div className="tree-widget-tabs-content" ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <MultiDataSourceTree treeLabel="Multi data source tree" imodel={props.imodel} width={width ?? 0} height={height ?? 0} />
    </div>
  );
}
