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
export { HierarchyCacheMode, PresentationBackendProps, PresentationTestingInitProps, initialize, terminate } from "./presentation-testing/Helpers.js";
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
