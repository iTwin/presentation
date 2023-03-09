/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { MultiTagSelect } from "../../presentation-components/instance-filter-builder/MultiTagSelect";

describe("MultiTagSelect", () => {
  const options = [{
    label: "Option1",
    value: "option1",
  }, {
    label: "Option2",
    value: "option2",
  }, {
    label: "Option3",
    value: "option3",
  }];

  it("renders with selected tags", async () => {
    const { container } = render(<MultiTagSelect
      options={options}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      value={[options[1], options[2]]}
    />);

    await waitFor(() => {
      const tags = container.querySelectorAll(".iui-tag");
      expect(tags).to.have.lengthOf(2);
    });
  });

  it("render dropdown menu", async () => {
    const { container, getByTestId } = render(<MultiTagSelect
      options={options}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      value={[options[1], options[2]]}
      hideSelectedOptions={false}
    />);

    const dropdownIndicator = await waitFor(() => getByTestId("multi-tag-select-dropdownIndicator"));
    act(() => {
      fireEvent.mouseDown(dropdownIndicator);
    });

    await waitFor(() => {
      const dropdownMenu = container.querySelector(".iui-menu");
      expect(dropdownMenu).to.not.be.null;
    });
  });
});
