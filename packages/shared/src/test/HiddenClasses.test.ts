/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createHiddenClassesTree } from "../shared/HiddenClasses.js";

import type { EC } from "../shared/Metadata.js";

describe("createHiddenClassesTree", () => {
  function createSchemaProvider() {
    const schemas = new Map<string, { isHidden: boolean; classes: Map<string, EC.Class> }>();
    const derivedClasses = new Map<string, EC.FullClassNameDotNotation[]>();
    const getOrCreateSchema = (name: string) => {
      let schema = schemas.get(name);
      if (!schema) {
        schema = { isHidden: false, classes: new Map() };
        schemas.set(name, schema);
      }
      return schema;
    };
    return {
      getSchema: async (name: string) => {
        const schema = schemas.get(name);
        return schema
          ? ({
              name,
              isHidden: schema.isHidden,
              getClass: (className: string) => schema.classes.get(className),
            } as EC.Schema)
          : undefined;
      },
      hideSchema(name: string) {
        getOrCreateSchema(name).isHidden = true;
      },
      addClass(props: { fullName: EC.FullClassNameDotNotation; baseClassName?: string; isHidden?: boolean }) {
        const [schemaName, className] = props.fullName.split(".");
        const ecClass = {
          fullName: props.fullName,
          name: className,
          isHidden: props.isHidden,
          getDerivedClassNames: () => derivedClasses.get(props.fullName) ?? [],
        } as unknown as EC.Class;
        getOrCreateSchema(schemaName).classes.set(className, ecClass);
        if (props.baseClassName) {
          let list = derivedClasses.get(props.baseClassName);
          if (!list) {
            list = [];
            derivedClasses.set(props.baseClassName, list);
          }
          list.push(props.fullName);
        }
      },
    };
  }

  it("returns empty tree when there are no hidden derived classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x" });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([]);
  });

  it("includes hidden derived classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x", isHidden: true });
    schemaProvider.addClass({ fullName: "s.z", baseClassName: "s.x", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      { fullName: "s.y", state: "hide", children: [] },
      { fullName: "s.z", state: "hide", children: [] },
    ]);
  });

  it("includes classes from hidden schemas", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s1.x" });
    schemaProvider.addClass({ fullName: "s2.y", baseClassName: "s1.x" });
    schemaProvider.addClass({ fullName: "s2.z", baseClassName: "s2.y" });
    schemaProvider.hideSchema("s2");
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s1.x" })).toEqual([
      { fullName: "s2.y", state: "hide", children: [] },
    ]);
  });

  it("includes hidden classes nested under visible derived classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "s.n", baseClassName: "s.x" });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.n", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      { fullName: "s.y", state: "hide", children: [] },
    ]);
  });

  it("doesn't include hidden classes whose base class is already hidden", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x", isHidden: true });
    schemaProvider.addClass({ fullName: "s.z", baseClassName: "s.y", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      { fullName: "s.y", state: "hide", children: [] },
    ]);
  });

  it("includes explicitly shown descendants of hidden classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s1.x" });
    schemaProvider.addClass({ fullName: "s2.y", baseClassName: "s1.x" });
    schemaProvider.addClass({ fullName: "s2.z", baseClassName: "s2.y", isHidden: false });
    schemaProvider.hideSchema("s2");
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s1.x" })).toEqual([
      { fullName: "s2.y", state: "hide", children: [{ fullName: "s2.z", state: "show", children: [] }] },
    ]);
  });

  it("includes hidden descendants of explicitly shown classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x", isHidden: true });
    schemaProvider.addClass({ fullName: "s.z", baseClassName: "s.y", isHidden: false });
    schemaProvider.addClass({ fullName: "s.w", baseClassName: "s.z", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      {
        fullName: "s.y",
        state: "hide",
        children: [{ fullName: "s.z", state: "show", children: [{ fullName: "s.w", state: "hide", children: [] }] }],
      },
    ]);
  });

  it("treats explicitly selected hidden class as visible", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x", isHidden: true });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x" });
    schemaProvider.addClass({ fullName: "s.z", baseClassName: "s.x", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      { fullName: "s.z", state: "hide", children: [] },
    ]);
  });

  it("throws when selected class is not found", async () => {
    const schemaProvider = createSchemaProvider();
    await expect(createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).rejects.toThrow();
  });

  it("throws when derived class schema is not found", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "t.y", baseClassName: "s.x" });
    const getSchema = schemaProvider.getSchema;
    await expect(
      createHiddenClassesTree({
        schemaProvider: { getSchema: async (name) => (name === "t" ? undefined : getSchema(name)) },
        selectClassName: "s.x",
      }),
    ).rejects.toThrow(`Schema "t" not found.`);
  });

  it("throws when derived class is not found", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    schemaProvider.addClass({ fullName: "t.y", baseClassName: "s.x" });
    const getSchema = schemaProvider.getSchema;
    await expect(
      createHiddenClassesTree({
        schemaProvider: {
          getSchema: async (name) => {
            const schema = await getSchema(name);
            return name === "t" ? ({ ...schema, getClass: () => undefined } as unknown as EC.Schema) : schema;
          },
        },
        selectClassName: "s.x",
      }),
    ).rejects.toThrow(`Class "y" not found in schema "t".`);
  });
});
