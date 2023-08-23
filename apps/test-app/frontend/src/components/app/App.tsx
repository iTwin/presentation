/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./App.css";
import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
import { Component, createRef } from "react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Geometry } from "@itwin/core-geometry";
import { UnitSystemKey } from "@itwin/core-quantity";
import { ElementSeparator, Orientation, RatioChangeResult } from "@itwin/core-react";
import { ThemeProvider, ToggleSwitch } from "@itwin/itwinui-react";
import { SchemaMetadataContextProvider, UnifiedSelectionContextProvider } from "@itwin/presentation-components";
import { Presentation, SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { MyAppFrontend, MyAppSettings } from "../../api/MyAppFrontend";
import { IModelSelector } from "../imodel-selector/IModelSelector";
import { PropertiesWidget } from "../properties-widget/PropertiesWidget";
import { RulesetSelector } from "../ruleset-selector/RulesetSelector";
import { TableWidget } from "../table-widget/TableWidget";
import { TreeWidget } from "../tree-widget/TreeWidget";
import { UnitSystemSelector } from "../unit-system-selector/UnitSystemSelector";
import ViewportContentControl from "../viewport/ViewportContentControl";

export interface State {
  imodel?: IModelConnection;
  imodelPath?: string;
  currentRulesetId?: string;
  rightPaneRatio: number;
  rightPaneHeight?: number;
  contentRatio: number;
  contentWidth?: number;
  activeUnitSystem?: UnitSystemKey;
  persistSettings: boolean;
}

export default class App extends Component<{}, State> {
  private readonly _minRightPaneRatio = 0.3;
  private readonly _maxRightPaneRatio = 0.7;
  private readonly _minContentRatio = 0.2;
  private readonly _maxContentRatio = 0.9;
  private _rightPaneRef = createRef<HTMLDivElement>();
  private _contentRef = createRef<HTMLDivElement>();
  private _selectionListener!: () => void;

  constructor() {
    super({});
    this.state = {
      // eslint-disable-next-line deprecation/deprecation
      activeUnitSystem: Presentation.presentation.activeUnitSystem,
      rightPaneRatio: 0.5,
      contentRatio: 0.7,
      persistSettings: MyAppFrontend.settings.persistSettings,
    };
  }

  private updateAppSettings() {
    const settings: MyAppSettings = {
      persistSettings: this.state.persistSettings,
    };
    if (this.state.persistSettings) {
      settings.imodelPath = this.state.imodelPath;
      settings.rulesetId = this.state.currentRulesetId;
      settings.unitSystem = this.state.activeUnitSystem;
    }
    MyAppFrontend.settings = settings;
  }

  private loadAppSettings() {
    const settings = MyAppFrontend.settings;
    const update: Partial<State> = {
      persistSettings: settings.persistSettings,
    };
    if (settings.persistSettings) {
      update.imodelPath = settings.imodelPath;
      update.currentRulesetId = settings.rulesetId;
      update.activeUnitSystem = settings.unitSystem;
    }
    this.setState(update as State);
  }

  private onIModelSelected = async (imodel: IModelConnection | undefined, path?: string) => {
    this.setState({ imodel, imodelPath: path }, () => this.updateAppSettings());
  };

  private onRulesetSelected = (rulesetId: string | undefined) => {
    if (this.state.imodel) {
      Presentation.selection.clearSelection("onRulesetChanged", this.state.imodel, 0);
    }

    this.setState({ currentRulesetId: rulesetId }, () => this.updateAppSettings());
  };

  private onUnitSystemSelected = (unitSystem: UnitSystemKey | undefined) => {
    // eslint-disable-next-line deprecation/deprecation
    Presentation.presentation.activeUnitSystem = unitSystem;
    this.setState({ activeUnitSystem: unitSystem }, () => this.updateAppSettings());
  };

  private onPersistSettingsValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ persistSettings: e.target.checked }, () => this.updateAppSettings());
  };

  private _onTreePaneRatioChanged = (ratio: number): RatioChangeResult => {
    ratio = Geometry.clamp(ratio, this._minRightPaneRatio, this._maxRightPaneRatio);
    if (this.state.rightPaneRatio === ratio) {
      return { ratio };
    }

    this.setState({ rightPaneRatio: ratio });
    return { ratio };
  };

  private _onContentRatioChanged = (ratio: number): RatioChangeResult => {
    ratio = Geometry.clamp(ratio, this._minContentRatio, this._maxContentRatio);
    if (this.state.contentRatio === ratio) {
      return { ratio };
    }

    this.setState({ contentRatio: ratio });
    return { ratio };
  };

  private _onSelectionChanged = async (args: SelectionChangeEventArgs) => {
    if (!IModelApp.viewManager.selectedView) {
      // no viewport to zoom in
      return;
    }

    if (args.source === "Tool") {
      // selection originated from the viewport - don't change what it's displaying by zooming in
      return;
    }

    // determine what the viewport is hiliting
    const hiliteSet = await Presentation.selection.getHiliteSet(args.imodel);
    if (hiliteSet.elements) {
      // note: the hilite list may contain models and subcategories as well - we don't
      // care about them at this moment
      await IModelApp.viewManager.selectedView.zoomToElements(hiliteSet.elements);
    }
  };

  private renderIModelComponents(imodel: IModelConnection, rulesetId?: string) {
    return (
      <div
        className="app-content"
        ref={this._contentRef}
        style={{
          gridTemplateColumns: `${this.state.contentRatio * 100}% 1px calc(${(1 - this.state.contentRatio) * 100}% - 1px)`,
        }}
      >
        <UnifiedSelectionContextProvider imodel={imodel} selectionLevel={0}>
          <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={MyAppFrontend.getSchemaContext.bind(MyAppFrontend)}>
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
              ratio={this.state.contentRatio}
              movableArea={this.state.contentWidth}
              separatorSize={10}
              onRatioChanged={this._onContentRatioChanged}
            />
            <div
              ref={this._rightPaneRef}
              className="app-content-right"
              style={{
                gridTemplateRows: `${this.state.rightPaneRatio * 100}% 30px calc(${(1 - this.state.rightPaneRatio) * 100}% - 30px)`,
              }}
            >
              <TreeWidget imodel={imodel} rulesetId={rulesetId} />
              <div className="app-content-right-separator">
                <hr />
                <ElementSeparator
                  orientation={Orientation.Vertical}
                  ratio={this.state.rightPaneRatio}
                  movableArea={this.state.rightPaneHeight}
                  onRatioChanged={this._onTreePaneRatioChanged}
                />
              </div>
              <PropertiesWidget imodel={imodel} rulesetId={rulesetId} />
            </div>
          </SchemaMetadataContextProvider>
        </UnifiedSelectionContextProvider>
      </div>
    );
  }

  private afterRender() {
    if (this._rightPaneRef.current) {
      const height = this._rightPaneRef.current.getBoundingClientRect().height;
      if (height !== this.state.rightPaneHeight) {
        this.setState({ rightPaneHeight: height });
      }
    }
    if (this._contentRef.current) {
      const width = this._contentRef.current.getBoundingClientRect().width;
      if (width !== this.state.contentWidth) {
        this.setState({ contentWidth: width });
      }
    }
  }

  public override componentDidMount() {
    this.loadAppSettings();
    this.afterRender();
    this._selectionListener = Presentation.selection.selectionChange.addListener(this._onSelectionChanged);
  }

  public override componentDidUpdate() {
    this.afterRender();
  }

  public override componentWillUnmount() {
    Presentation.selection.selectionChange.removeListener(this._selectionListener);
  }

  public override render() {
    let imodelComponents = null;
    if (this.state.imodel) {
      imodelComponents = this.renderIModelComponents(this.state.imodel, this.state.currentRulesetId);
    }

    return (
      <ThemeProvider theme="os" data-root-container="iui-root-id">
        <div className="app">
          <div className="app-header">
            <h2>{IModelApp.localization.getLocalizedString("Sample:welcome-message")}</h2>
          </div>
          <div className="app-pickers">
            <IModelSelector onIModelSelected={this.onIModelSelected} activeIModelPath={this.state.imodelPath} />
            <RulesetSelector onRulesetSelected={this.onRulesetSelected} activeRulesetId={this.state.currentRulesetId} />
            <UnitSystemSelector selectedUnitSystem={this.state.activeUnitSystem} onUnitSystemSelected={this.onUnitSystemSelected} />
            <ToggleSwitch label="Persist settings" labelPosition="right" checked={this.state.persistSettings} onChange={this.onPersistSettingsValueChange} />
          </div>
          {imodelComponents}
        </div>
      </ThemeProvider>
    );
  }
}
