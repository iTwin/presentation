/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  DefineHierarchyLevelProps,
  HierarchyLevelDefinition,
  IHierarchyLevelDefinitionsFactory,
  IMetadataProvider,
  NodeSelectQueryFactory,
} from "@itwin/presentation-hierarchy-builder";

export class SpecificClassHierarchyDefinitionFactory implements IHierarchyLevelDefinitionsFactory {
  constructor(private readonly _props: { className: string; metadataProvider: IMetadataProvider }) {}

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    if (props.parentNode) {
      return [];
    }

    const query = new NodeSelectQueryFactory(this._props.metadataProvider);
    return [
      {
        fullClassName: this._props.className,
        query: {
          ecsql: `
          SELECT ${await query.createSelectClause({
            ecClassId: { selector: `this.ECClassId` },
            ecInstanceId: { selector: `this.ECInstanceId` },
            nodeLabel: "",
          })}
          FROM ${this._props.className} AS this`,
        },
      },
    ];
  }
}
