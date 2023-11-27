/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Viewport
 */

import { memo, useEffect, useState } from "react";
import { ViewportProps } from "@itwin/imodel-components-react";
import { getDisplayName } from "../common/Utils";
import { ViewportSelectionHandler } from "./ViewportSelectionHandler";

/**
 * Props that are injected to the ViewWithUnifiedSelection HOC component.
 * @public
 */
export interface ViewWithUnifiedSelectionProps {
  /** @internal */
  selectionHandler?: ViewportSelectionHandler;
}

/**
 * A HOC component that adds unified selection functionality to the supplied
 * viewport component.
 *
 * @public
 */
export function viewWithUnifiedSelection<P extends ViewportProps>(
  ViewportComponent: React.ComponentType<P>,
): React.ComponentType<P & ViewWithUnifiedSelectionProps> {
  type CombinedProps = P & ViewWithUnifiedSelectionProps;

  const WithUnifiedSelection = memo<CombinedProps>((props) => {
    const { selectionHandler, ...restProps } = props;
    const imodel = restProps.imodel;
    const [viewportSelectionHandler, setViewportSelectionHandler] = useState<ViewportSelectionHandler>();

    // apply currentSelection when 'viewportSelectionHandler' is initialized (set to handler from props or new is created)
    // 'viewportSelectionHandler' should never change because setter is not used.
    useEffect(() => {
      if (selectionHandler) {
        selectionHandler.applyCurrentSelection();
        setViewportSelectionHandler(selectionHandler);
        return;
      }

      const handler = new ViewportSelectionHandler({ imodel });
      handler.applyCurrentSelection();
      setViewportSelectionHandler(handler);
      return () => {
        handler.dispose();
      };
    }, [selectionHandler, imodel]);

    // set new imodel on 'viewportSelectionHandler' when it changes
    useEffect(() => {
      if (!viewportSelectionHandler) {
        return;
      }
      viewportSelectionHandler.imodel = imodel;
    }, [viewportSelectionHandler, imodel]);

    return <ViewportComponent {...(restProps as P)} />;
  });

  WithUnifiedSelection.displayName = `WithUnifiedSelection(${getDisplayName(ViewportComponent)})`;
  return WithUnifiedSelection;
}
