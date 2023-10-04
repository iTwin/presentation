/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

<<<<<<<< HEAD:packages/hierarchy-builder/src/hierarchy-builder/queries/ECSql.ts
/** @beta */
export type ECSqlBindingType = "boolean" | "double" | "id" | "idset" | "int" | "long" | "string" | "point2d" | "point3d";

/** @beta */
export interface ECSqlBinding {
  type: ECSqlBindingType;
  value?: any;
}

/** @beta */
export interface ECSqlQueryDef {
  ctes?: string[];
  ecsql: string;
  bindings?: ECSqlBinding[];
}
========
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import sinonChai from "sinon-chai";

// setup chai
chai.use(chaiAsPromised);
chai.use(sinonChai);

beforeEach(function () {
  sinon.restore();
});
>>>>>>>> master:packages/core-interop/src/test/index.ts
