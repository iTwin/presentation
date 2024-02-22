/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useResizeDetector } from "react-resize-detector";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Tabs } from "@itwin/itwinui-react";
import { RulesDrivenTreeWidget } from "./rules-driven/Tree";
import { StatelessTreeV2 } from "./stateless-v2/Tree";
import { StatelessTreeWidget } from "./stateless/Tree";

export interface TreeWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
  height?: number;
  width?: number;
}

export function TreeWidget(props: Omit<TreeWidgetProps, "height" | "width">) {
  return (
    <Tabs.Wrapper className="tree-widget">
      <Tabs.TabList>
        <Tabs.Tab value="rules-driven" label={IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.rules-driven-tree")} key="rules-driven" />
        <Tabs.Tab value="stateless" label={IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.stateless-models-tree")} key="stateless" />
        <Tabs.Tab value="stateless-v2" label={"Stateless Tree V2"} key="stateless-v2" />
      </Tabs.TabList>

      <RulesDrivenTreePanel imodel={props.imodel} rulesetId={props.rulesetId} />
      <StatelessTreePanel imodel={props.imodel} rulesetId={props.rulesetId} />
      <StatelessV2TreePanel imodel={props.imodel} rulesetId={props.rulesetId} />
    </Tabs.Wrapper>
  );
}

function RulesDrivenTreePanel(props: Omit<TreeWidgetProps, "height" | "width">) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <Tabs.Panel
      className="tree-widget-tabs-content"
      value="rules-driven"
      key="rules-driven"
      ref={ref}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      <RulesDrivenTreeWidget imodel={props.imodel} rulesetId={props.rulesetId} width={width} height={height} />
    </Tabs.Panel>
  );
}

function StatelessTreePanel(props: Omit<TreeWidgetProps, "height" | "width">) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <Tabs.Panel className="tree-widget-tabs-content" value="stateless" key="stateless" ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <StatelessTreeWidget imodel={props.imodel} width={width} height={height} />
    </Tabs.Panel>
  );
}

function StatelessV2TreePanel(props: Omit<TreeWidgetProps, "height" | "width">) {
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  return (
    <Tabs.Panel
      className="tree-widget-tabs-content"
      value="stateless-v2"
      key="stateless-v2"
      ref={ref}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      <StatelessTreeV2 imodel={props.imodel} width={width ?? 0} height={height ?? 0} />
    </Tabs.Panel>
  );
}
