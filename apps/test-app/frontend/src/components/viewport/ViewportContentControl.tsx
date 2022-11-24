/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "./ViewportContentControl.css";
import { useCallback, useEffect, useState } from "react";
import { Id64String } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ViewportComponent } from "@itwin/imodel-components-react";
import { viewWithUnifiedSelection } from "@itwin/presentation-components";
import { MyAppFrontend } from "../../api/MyAppFrontend";
import SelectionScopePicker from "./SelectionScopePicker";
import ViewDefinitionSelector from "./ViewDefinitionSelector";

const SampleViewport = viewWithUnifiedSelection(ViewportComponent);

export interface ViewportContentComponentProps {
  imodel: IModelConnection;
}

export default function ViewportContentComponent(props: ViewportContentComponentProps) {
  const [selectedViewDefinitionId, setSelectedViewDefinitionId] = useState<Id64String | undefined>();
  const [prevIModel, setPrevIModel] = useState<IModelConnection | undefined>(props.imodel);
  if (prevIModel !== props.imodel) {
    setSelectedViewDefinitionId(undefined);
    setPrevIModel(props.imodel);
  }
  useEffect(() => {
    void MyAppFrontend.getViewDefinitions(props.imodel).then((definitions) => {
      if (definitions.length)
        setSelectedViewDefinitionId(definitions[0].id);
    });
  }, [props.imodel]);

  const onViewDefinitionChanged = useCallback((id?: Id64String) => {
    setSelectedViewDefinitionId(id);
  }, []);

  return (
    <div className="ViewportContentComponent" style={{ height: "100%" }}>
      {selectedViewDefinitionId ? (
        <SampleViewport
          imodel={props.imodel}
          viewDefinitionId={selectedViewDefinitionId}
        />
      ) : undefined}
      <ViewDefinitionSelector imodel={props.imodel} selectedViewDefinition={selectedViewDefinitionId} onViewDefinitionSelected={onViewDefinitionChanged} />
      <SelectionScopePicker imodel={props.imodel} />
    </div>
  );
}
