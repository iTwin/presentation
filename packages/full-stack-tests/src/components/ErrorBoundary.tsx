/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Component } from "react";
import { getByText, waitFor } from "@testing-library/react";

// __PUBLISH_EXTRACT_START__ Presentation.Components.SampleErrorBoundary
/**
 * A sample React error boundary which handles errors thrown by child components by merely
 * rendering the error message. Check out React's Error Boundary documentation for how to
 * implement a more elaborate solution.
 */
export class ErrorBoundary extends Component<{ children: React.ReactNode }, { error?: Error }> {
  public constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {};
  }

  public static getDerivedStateFromError(error: Error) {
    // just save the error in the internal component's state
    return { error };
  }

  public override render() {
    // in case we got an error - render the error message
    if (this.state.error)
      return this.state.error?.message ?? "Error";

    // otherwise - render provided child component
    return this.props.children;
  }
}
// __PUBLISH_EXTRACT_END__

export async function ensureHasError(container: HTMLElement, expectedError?: string) {
  return waitFor(() => getByText(container, expectedError ?? "Error"));
}
