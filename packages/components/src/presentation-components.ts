/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Presentation } from "@itwin/presentation-frontend";
import { initializeLocalization, initializePropertyValueRenderers } from "./presentation-components/common/Utils";

/**
 * @module Core
 *
 * @docs-group-description Core
 * Common types used all across ($presentation-components) package.
 */
export * from "./presentation-components/common/ContentDataProvider";
export * from "./presentation-components/common/Diagnostics";
export * from "./presentation-components/common/IPresentationDataProvider";
export * from "./presentation-components/common/IUnifiedSelectionComponent";
export * from "./presentation-components/common/PropertyRecordsBuilder";
export * from "./presentation-components/common/SchemaMetadataContext";
export { PortalTargetContextProvider, type PortalTargetContextProviderProps } from "./presentation-components/common/PortalTargetContext";
export * from "./presentation-components/hooks/UseRulesetRegistration";

/**
 * @module Logging
 *
 * @docs-group-description Logging
 * Types related to logging in ($presentation-components) package.
 */
export * from "./presentation-components/ComponentsLoggerCategory";

/**
 * @module Properties
 *
 * @docs-group-description Properties
 * Presentation-specific [Properties]($components-react:Properties).
 */
export * from "./presentation-components/properties/InstanceKeyValueRenderer";
export * from "./presentation-components/properties/editors";

/**
 * @module PropertyGrid
 *
 * @docs-group-description PropertyGrid
 * Presentation features for [VirtualizedPropertyGrid]($components-react) component.
 */
export * from "./presentation-components/propertygrid/DataProvider";
export * from "./presentation-components/propertygrid/FavoritePropertiesDataFilterer";
export {
  PropertyDataProviderWithUnifiedSelectionProps,
  UsePropertyDataProviderWithUnifiedSelectionResult,
  usePropertyDataProviderWithUnifiedSelection,
} from "./presentation-components/propertygrid/UseUnifiedSelection";

/**
 * @module FavoriteProperties
 *
 * @docs-group-description FavoriteProperties
 * Presentation features for [Favorite properties]($components-react:Favorite).
 */
export * from "./presentation-components/favorite-properties/DataProvider";

/**
 * @module Tree
 *
 * @docs-group-description Tree
 * Presentation features for [Tree]($components-react:Tree) component.
 */
export * from "./presentation-components/tree/DataProvider";
export * from "./presentation-components/tree/IPresentationTreeDataProvider";
export * from "./presentation-components/tree/PresentationTreeNodeItem";
export * from "./presentation-components/tree/controlled/PresentationTree";
export * from "./presentation-components/tree/controlled/PresentationTreeNodeRenderer";
export * from "./presentation-components/tree/controlled/PresentationTreeRenderer";
export * from "./presentation-components/tree/controlled/TreeHooks";
export * from "./presentation-components/tree/controlled/UseHierarchyLevelFiltering";
export * from "./presentation-components/tree/controlled/UsePresentationTreeState";
export * from "./presentation-components/tree/controlled/UseUnifiedSelection";

/**
 * @module Table
 *
 * @docs-group-description Table
 * Presentation features for Table component.
 */
export * from "./presentation-components/table/UsePresentationTable";
export * from "./presentation-components/table/Types";
export * from "./presentation-components/table/CellRenderer";

/**
 * @module Viewport
 *
 * @docs-group-description Viewport
 * Presentation features for [ViewportComponent]($imodel-components-react).
 */
export { viewWithUnifiedSelection, ViewWithUnifiedSelectionProps } from "./presentation-components/viewport/WithUnifiedSelection";

/**
 * @module DisplayLabels
 *
 * @docs-group-description DisplayLabels
 * Types related to display labels.
 */
export * from "./presentation-components/labels/LabelsProvider";

/**
 * @module UnifiedSelection
 *
 * @docs-group-description UnifiedSelection
 * Utilities for working with [Unified Selection]($docs/presentation/unified-selection/index.md) within [React](https://reactjs.org/) components.
 */
export * from "./presentation-components/unified-selection/UnifiedSelectionContext";

/**
 * @module InstancesFilter
 *
 * @docs-group-description InstancesFilter
 * Utilities for creating filters for filtering presentation data.
 */
export * from "./presentation-components/instance-filter-builder/PresentationInstanceFilter";
export * from "./presentation-components/instance-filter-builder/PresentationInstanceFilterDialog";
export * from "./presentation-components/instance-filter-builder/PresentationFilterBuilder";

/**
 * @module Internal
 *
 * @docs-group-description Internal
 * Internal APIs aren't published in documentation, so this group is expected to be empty.
 */

Presentation.registerInitializationHandler(initializeLocalization);
Presentation.registerInitializationHandler(initializePropertyValueRenderers);
