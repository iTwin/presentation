/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "@itwin/unified-selection";

import { Presentation } from "@itwin/presentation-frontend";
import { initializeLocalization, initializePropertyValueRenderers } from "./presentation-components/Initialization.js";

/**
 * @module Core
 *
 * @docs-group-description Core
 * Common types used all across ($presentation-components) package.
 */
export * from "./presentation-components/common/ContentDataProvider.js";
export { type WithConstraints } from "./presentation-components/common/ContentBuilder.js";
export * from "./presentation-components/common/Diagnostics.js";
export * from "./presentation-components/common/IPresentationDataProvider.js";
export * from "./presentation-components/common/IUnifiedSelectionComponent.js";
export * from "./presentation-components/common/PropertyRecordsBuilder.js";
export * from "./presentation-components/common/SchemaMetadataContext.js";
export { PortalTargetContextProvider, type PortalTargetContextProviderProps } from "./presentation-components/common/PortalTargetContext.js";
export * from "./presentation-components/hooks/UseRulesetRegistration.js";

/**
 * @module Logging
 *
 * @docs-group-description Logging
 * Types related to logging in ($presentation-components) package.
 */
export * from "./presentation-components/ComponentsLoggerCategory.js";

/**
 * @module Properties
 *
 * @docs-group-description Properties
 * Presentation-specific [Properties]($components-react:Properties).
 */
export * from "./presentation-components/properties/InstanceKeyValueRenderer.js";
export * from "./presentation-components/properties/editors/index.js";

/**
 * @module PropertyGrid
 *
 * @docs-group-description PropertyGrid
 * Presentation features for [VirtualizedPropertyGrid]($components-react) component.
 */
export * from "./presentation-components/propertygrid/DataProvider.js";
export * from "./presentation-components/propertygrid/FavoritePropertiesDataFilterer.js";
export {
  PropertyDataProviderWithUnifiedSelectionProps,
  UsePropertyDataProviderWithUnifiedSelectionResult,
  usePropertyDataProviderWithUnifiedSelection,
} from "./presentation-components/propertygrid/UseUnifiedSelection.js";

/**
 * @module FavoriteProperties
 *
 * @docs-group-description FavoriteProperties
 * Presentation features for [Favorite properties]($components-react:Favorite).
 */
export * from "./presentation-components/favorite-properties/DataProvider.js";

/**
 * @module Tree
 *
 * @docs-group-description Tree
 * Presentation features for [Tree]($components-react:Tree) component.
 */
export * from "./presentation-components/tree/DataProvider.js";
export * from "./presentation-components/tree/IPresentationTreeDataProvider.js";
export * from "./presentation-components/tree/PresentationTreeNodeItem.js";
export * from "./presentation-components/tree/controlled/PresentationTree.js";
export * from "./presentation-components/tree/controlled/PresentationTreeNodeRenderer.js";
export * from "./presentation-components/tree/controlled/PresentationTreeRenderer.js";
export * from "./presentation-components/tree/controlled/TreeHooks.js";
export * from "./presentation-components/tree/controlled/UseHierarchyLevelFiltering.js";
export * from "./presentation-components/tree/controlled/UsePresentationTreeState.js";
export * from "./presentation-components/tree/controlled/UseUnifiedSelection.js";

/**
 * @module Table
 *
 * @docs-group-description Table
 * Presentation features for Table component.
 */
export * from "./presentation-components/table/UsePresentationTable.js";
export * from "./presentation-components/table/Types.js";
export * from "./presentation-components/table/CellRenderer.js";

/**
 * @module Viewport
 *
 * @docs-group-description Viewport
 * Presentation features for [ViewportComponent]($imodel-components-react).
 */
export { viewWithUnifiedSelection, ViewWithUnifiedSelectionProps } from "./presentation-components/viewport/WithUnifiedSelection.js";

/**
 * @module DisplayLabels
 *
 * @docs-group-description DisplayLabels
 * Types related to display labels.
 */
export * from "./presentation-components/labels/LabelsProvider.js";

/**
 * @module UnifiedSelection
 *
 * @docs-group-description UnifiedSelection
 * Utilities for working with [Unified Selection]($docs/presentation/unified-selection/index.md) within [React](https://reactjs.org/) components.
 */
export * from "./presentation-components/unified-selection/UnifiedSelectionContext.js";

/**
 * @module InstancesFilter
 *
 * @docs-group-description InstancesFilter
 * Utilities for creating filters for filtering presentation data.
 */
export * from "./presentation-components/instance-filter-builder/PresentationInstanceFilter.js";
export * from "./presentation-components/instance-filter-builder/PresentationInstanceFilterDialog.js";
export * from "./presentation-components/instance-filter-builder/PresentationFilterBuilder.js";

/**
 * @module Internal
 *
 * @docs-group-description Internal
 * Internal APIs aren't published in documentation, so this group is expected to be empty.
 */

Presentation.registerInitializationHandler(initializeLocalization);
Presentation.registerInitializationHandler(initializePropertyValueRenderers);
