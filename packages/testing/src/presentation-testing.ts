/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Hierarchies
 *
 * @docs-group-description Hierarchies
 * Types for testing hierarchies.
 */
export * from "./presentation-testing/HierarchyBuilder.js";

/**
 * @module Content
 *
 * @docs-group-description Content
 * Types for testing content.
 */
export * from "./presentation-testing/ContentBuilder.js";

/**
 * @module Helpers
 *
 * @docs-group-description Helpers
 * Various test helpers.
 */

export type { PresentationBackendProps, PresentationTestingInitProps } from "./presentation-testing/Helpers.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { HierarchyCacheMode, initialize, terminate } from "./presentation-testing/Helpers.js";
export {
  createFileNameFromString,
  getTestOutputDir,
  limitFilePathLength,
  setTestOutputDir,
  setupOutputFileLocation,
} from "./presentation-testing/FilenameUtils.js";

/**
 * @module IModel
 *
 * @docs-group-description IModel
 * Utilities for creating test iModels that can be used to exercise presentation rules.
 */
export * from "./presentation-testing/IModelUtilities.js";

// TODO: remove when itwinjs-core 4.x is dropped.
/**
 * Presentation manager working mode.
 * @public
 * @deprecated in 3.x. The attribute is not used by [[PresentationManager]] anymore
 */
export enum PresentationManagerMode {
  /**
   * Presentation manager assumes iModels are opened in read-only mode and avoids doing some work
   * related to reacting to changes in iModels.
   */
  ReadOnly,

  /**
   * Presentation manager assumes iModels are opened in read-write mode and it may need to
   * react to changes. This involves some additional work and gives slightly worse performance.
   */
  ReadWrite,
}
