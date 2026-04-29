/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { Format, FormatterSpec, ParserSpec } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext.js";
import {
  QuantityEditorName,
  QuantityPropertyEditor,
} from "../../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { render, waitFor } from "../../TestUtils.js";

const createRecord = ({
  initialValue,
  kindOfQuantityName,
  quantityType,
}: {
  initialValue?: number;
  kindOfQuantityName?: string;
  quantityType?: string;
}) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, kindOfQuantityName, quantityType, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditor />", () => {
  beforeEach(() => {
    const format = new Format("test format");
    const formatterSpec = {
      applyFormatting: (raw: number) => `${raw} unit`,
      unitConversions: [{ name: "test unit", label: "unit" }],
      format,
    };
    const parserSpec = {
      parseToQuantityValue: (value: string) => ({ ok: true, value: Number(value.substring(0, value.length - 4)) }),
      format,
    };

    vi.spyOn(KoqPropertyValueFormatter.prototype, "getFormatterSpec").mockResolvedValue(
      formatterSpec as unknown as FormatterSpec,
    );
    vi.spyOn(KoqPropertyValueFormatter.prototype, "getParserSpec").mockResolvedValue(
      parserSpec as unknown as ParserSpec,
    );

    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    } as unknown as QuantityFormatter);
  });

  it("renders nothing if property record is not provided", async () => {
    const { container } = render(<QuantityPropertyEditor />);
    expect(container.childElementCount).toBe(0);
  });

  it("renders numeric input if schema context is not available", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(<QuantityPropertyEditor propertyRecord={record} />);

    expect(getByDisplayValue("10")).not.toBeNull();
  });

  it("renders quantity input if schema context is available and kindOfQuantityName is provided", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider
        imodel={{} as IModelConnection}
        schemaContextProvider={() => ({}) as SchemaContext}
      >
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => {
      expect(getByDisplayValue("10 unit")).not.toBeNull();
    });
  });

  it("renders quantity input if schema context is available and quantityType is provided", async () => {
    const record = createRecord({ initialValue: 10, quantityType: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider
        imodel={{} as IModelConnection}
        schemaContextProvider={() => ({}) as SchemaContext}
      >
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => {
      expect(getByDisplayValue("10 unit")).not.toBeNull();
    });
  });

  it("renders '-- unit' for merged record with no value when schema context is available", async () => {
    const record = createRecord({ kindOfQuantityName: "TestKOQ" });
    record.isMerged = true;
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider
        imodel={{} as IModelConnection}
        schemaContextProvider={() => ({}) as SchemaContext}
      >
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => {
      expect(getByDisplayValue("-- unit")).not.toBeNull();
    });
  });

  it("renders '--' for merged record with no value when schema context is not available", async () => {
    const record = createRecord({});
    record.isMerged = true;
    const { getByDisplayValue } = render(<QuantityPropertyEditor propertyRecord={record} />);

    expect(getByDisplayValue("--")).not.toBeNull();
  });
});
