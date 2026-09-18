/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC } from "@itwin/presentation-shared";

/**
 * Relationship used to determine related categories for classifications.
 *
 * By default, categories are determined using `ClassificationSystems.ElementHasClassifications` and `BisCore.GeometricElement3dIsInCategory` relationships.
 *
 * @beta
 */
export interface ClassificationToCategoriesRelationshipSpecification {
  /**
   * Full class name of the relationship which links classifications to categories. Format: `{SchemaName}.{RelationshipClassName}`.
   */
  fullClassName: EC.FullClassNameDotNotation;
  /**
   * Describes the relationship direction by specifying its source.
   * E.g. whether it's a `classification` -> `categories` or `category` -> `classifications` relationship.
   */
  source: "classification" | "category";
}

/**
 * Configuration for classifications tree visibility handler.
 * @beta
 */
export interface ClassificationsTreeVisibilityHandlerConfiguration {
  /**
   * Relationship used to determine related categories for classifications.
   *
   * By default, categories are determined using `ClassificationSystems.ElementHasClassifications` and `BisCore.GeometricElement3dIsInCategory` relationships.
   */
  classificationToCategoriesRelationshipSpecification?: ClassificationToCategoriesRelationshipSpecification;
}
