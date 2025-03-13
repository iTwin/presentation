/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { IModelConnection } from "@itwin/core-frontend";
import { SelectionHandler } from "@itwin/presentation-frontend";

/**
 * An interface for all unified selection components
 * @public
 * @deprecated in 5.12.0. All unified selection-driven components should use `SelectionStorage` from `@itwin/unified-selection` rather than `SelectionHandler`.
 */
export interface IUnifiedSelectionComponent {
  /** [IModelConnection]($core-frontend) used by this data provider */
  readonly imodel: IModelConnection;

  /** Selection handler used by this component */
  readonly selectionHandler?: SelectionHandler; // eslint-disable-line @typescript-eslint/no-deprecated
}
