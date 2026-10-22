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
          schema: getOrCreateSchema(schemaName),
          baseClass: props.baseClassName
            ? (() => {
                const [baseSchemaName, baseClassName] = props.baseClassName.split(".");
                return getOrCreateSchema(baseSchemaName).classes.get(baseClassName);
              })()
            : undefined,
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

  it("returns empty tree when there are no derived classes", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x" });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([]);
  });

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
    const tree = await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" });
    expect(tree).toHaveLength(2);
    expect(tree).toEqual(
      expect.arrayContaining([
        { fullName: "s.y", state: "hide", children: [] },
        { fullName: "s.z", state: "hide", children: [] },
      ]),
    );
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

  it("treats explicitly selected hidden class and its descendants as visible", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.x", isHidden: true });
    schemaProvider.addClass({ fullName: "s.y", baseClassName: "s.x" });
    schemaProvider.addClass({ fullName: "s.z", baseClassName: "s.x", isHidden: true });
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.x" })).toEqual([
      { fullName: "s.z", state: "hide", children: [] },
    ]);
  });

  it.each([
    { source: "class", attribute: "HiddenClass" },
    { source: "schema", attribute: "HiddenSchema" },
  ])("doesn't hide descendants of the selected class when its base is hidden by $attribute", async ({ source }) => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "base.hidden", isHidden: source === "class" ? true : undefined });
    if (source === "schema") {
      schemaProvider.hideSchema("base");
    }
    schemaProvider.addClass({ fullName: "base.middle", baseClassName: "base.hidden" });
    schemaProvider.addClass({ fullName: "s.selected", baseClassName: "base.middle" });
    schemaProvider.addClass({ fullName: "s.child", baseClassName: "s.selected" });
    schemaProvider.addClass({ fullName: "s.hiddenChild", baseClassName: "s.child", isHidden: true });
    schemaProvider.addClass({ fullName: "s.shown", baseClassName: "s.hiddenChild", isHidden: false });

    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.selected" })).toEqual([
      { fullName: "s.hiddenChild", state: "hide", children: [{ fullName: "s.shown", state: "show", children: [] }] },
    ]);
  });

  it("applies hiding of a class below a broader selected class, but not of the selected class itself", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.top" });
    schemaProvider.addClass({ fullName: "s.root", baseClassName: "s.top", isHidden: true });
    schemaProvider.addClass({ fullName: "s.target", baseClassName: "s.root" });
    schemaProvider.addClass({ fullName: "s.derived", baseClassName: "s.target" });
    schemaProvider.addClass({ fullName: "s.hiddenDerived", baseClassName: "s.target", isHidden: true });

    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.top" })).toEqual([
      { fullName: "s.root", state: "hide", children: [] },
    ]);
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.target" })).toEqual([
      { fullName: "s.hiddenDerived", state: "hide", children: [] },
    ]);
    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.root" })).toEqual([
      { fullName: "s.hiddenDerived", state: "hide", children: [] },
    ]);
  });

  it("hides descendants in a hidden schema, regardless of the selected class' own state", async () => {
    const schemaProvider = createSchemaProvider();
    schemaProvider.addClass({ fullName: "s.selected", isHidden: false });
    schemaProvider.addClass({ fullName: "s.child", baseClassName: "s.selected" });
    schemaProvider.addClass({ fullName: "s.shownChild", baseClassName: "s.selected", isHidden: false });
    schemaProvider.addClass({ fullName: "other.child", baseClassName: "s.selected" });
    schemaProvider.hideSchema("s");

    expect(await createHiddenClassesTree({ schemaProvider, selectClassName: "s.selected" })).toEqual([
      { fullName: "s.child", state: "hide", children: [] },
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
