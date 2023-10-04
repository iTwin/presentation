/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ECClass, Schema, SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { ECSchema } from "@itwin/presentation-hierarchy-builder";
import { createMetadataProvider } from "../core-interop/Metadata";
import { createECClass, createECSchema } from "../core-interop/MetadataInternal";

describe("createMetadataProvider", () => {
  describe("getSchema", () => {
    it("returns schema from schema context", async () => {
      const matchSchemaName = sinon.match((key: SchemaKey) => key.compareByName("x"));
      const schemaContext = {
        getSchema: sinon
          .stub<[SchemaKey], Schema>()
          .withArgs(matchSchemaName)
          .resolves({
            name: "y",
          } as unknown as Schema),
      } as unknown as SchemaContext;

      const provider = createMetadataProvider(schemaContext);
      const schema = await provider.getSchema("x");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(schemaContext.getSchema).to.be.calledOnceWith(matchSchemaName);
      expect(schema!.name).to.eq("y");
      expect(typeof schema!.getClass === "function").to.be.true;
    });

    it("returns undefined from schema context", async () => {
      const matchSchemaName = sinon.match((key: SchemaKey) => key.compareByName("x"));
      const schemaContext = {
        getSchema: sinon.stub().resolves(undefined),
      } as unknown as SchemaContext;

      const provider = createMetadataProvider(schemaContext);
      const schema = await provider.getSchema("x");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(schemaContext.getSchema).to.be.calledOnceWith(matchSchemaName);
      expect(schema).to.be.undefined;
    });
  });
});

describe("createECSchema", () => {
  describe("getClass", () => {
    it("returns class from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: sinon.stub().resolves({
          fullName: "s.c",
          name: "c",
          label: "C",
        }),
      } as unknown as Schema;

      const schema = createECSchema(coreSchema);
      const result = await schema.getClass("c");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreSchema.getItem).to.be.calledOnceWith("c");
      expect(result!.schema.name).to.eq("s");
      expect(result!.fullName).to.eq("s.c");
      expect(result!.name).to.eq("c");
      expect(result!.label).to.eq("C");
      expect(typeof result!.is === "function").to.be.true;
    });

    it("returns undefined from core schema", async () => {
      const coreSchema = {
        name: "s",
        getItem: sinon.stub().resolves(undefined),
      } as unknown as Schema;

      const schema = createECSchema(coreSchema);
      const result = await schema.getClass("c");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreSchema.getItem).to.be.calledOnceWith("c");
      expect(result).to.be.undefined;
    });
  });
});

describe("createECClass", () => {
  const schema: ECSchema = {
    name: "s",
    async getClass() {
      return undefined;
    },
  };

  describe("is", () => {
    const coreClass = {
      fullName: "s.c",
      name: "c",
      label: "C",
      is: sinon.stub().resolves(true),
    };

    beforeEach(() => {
      coreClass.is.resetHistory();
    });

    it("handles ECClass override", async () => {
      const class1 = createECClass(coreClass as unknown as ECClass, schema);
      const class2 = createECClass(
        {
          fullName: "s.c2",
          name: "c2",
          label: "C2",
        } as unknown as ECClass,
        schema,
      );
      const result = await class1.is(class2);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.is).to.be.calledOnceWithExactly("c2", "s");
      expect(result).to.be.true;
    });

    it("handles class and schema names override", async () => {
      const class1 = createECClass(coreClass as unknown as ECClass, schema);
      const result = await class1.is("a", "b");

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(coreClass.is).to.be.calledOnceWithExactly("a", "b");
      expect(result).to.be.true;
    });
  });
});
