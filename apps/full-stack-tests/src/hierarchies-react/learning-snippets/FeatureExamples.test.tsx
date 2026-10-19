/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */
/* eslint-disable no-console */

import { createHierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.RendererImport
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.HookImports
import { useTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.DecorationImports
import { Badge } from "@mui/material";
import { Icon } from "@stratakit/mui";
import folderSvg from "@stratakit/icons/folder.svg";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.ActionImports
import { TreeActionBase } from "@itwin/presentation-hierarchies-react/stratakit";
import type { TreeNode } from "@itwin/presentation-hierarchies-react";
import type { TreeActionBaseAttributes } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.RenameActionImport
import { TreeNodeRenameAction } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.RenamingImports
import { useRef } from "react";
import type { StrataKitTreeRendererAttributes } from "@itwin/presentation-hierarchies-react/stratakit";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.ErrorImports
import { Link, Typography } from "@mui/material";
import { ErrorItemRenderer, TreeErrorRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import type { ComponentProps } from "react";
// __PUBLISH_EXTRACT_END__
import { render, waitFor } from "../../RenderUtils.js";
import { stubVirtualization } from "../../Utils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Root } from "@stratakit/mui";

describe("Hierarchies React", () => {
  describe("Learning snippets", () => {
    describe("Feature examples", () => {
      stubVirtualization();

      // These examples only demonstrate tree rendering customizations, so instead of building an iModel they use a
      // provider that returns a single generic node. Real applications typically build the hierarchy from an iModel -
      // see the "Full example" section of the README.
      const getHierarchyProvider: Props<typeof useTree>["getHierarchyProvider"] = () =>
        createHierarchyProvider(() => ({
          async *getNodes({ parentNode }) {
            if (!parentNode) {
              yield {
                key: { type: "generic", id: "my-model-a" },
                label: "My Model A",
                children: false,
                parentKeys: [],
              };
            }
          },
        }));

      beforeEach(async function () {
        await initialize();
      });

      afterEach(async () => {
        await terminate();
      });

      it("renders a tree with custom node decorations", async function () {
        function TreeWithDecorations() {
          const treeProps = useTree({ getHierarchyProvider });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isLoading) {
            return "Loading...";
          }
          return (
            // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.CustomNodeRendering
            // Customize per-node rendering through the `getTreeItemProps` callback. `decorations` accepts any
            // `ReactNode`, so you can render multiple elements before the label (an icon, a text tag, etc.), and
            // `label`/`description` override the node's text.
            <StrataKitTreeRenderer
              {...treeProps.treeRendererProps}
              treeLabel="My Tree"
              getTreeItemProps={(node) => ({
                // Render several decorations before the label by returning multiple elements - here an icon
                // and a badge with a text label.
                decorations: (
                  <>
                    <Icon href={folderSvg} />
                    <Badge color="primary" badgeContent="Model" />
                  </>
                ),
                label: node.label,
              })}
            />
            // __PUBLISH_EXTRACT_END__
          );
        }

        const { getByText } = render(
          <Root colorScheme="light">
            <TreeWithDecorations />
          </Root>,
        );
        await waitFor(() => expect(getByText("My Model A")).to.not.be.null);
      });

      it("renders a tree with custom row actions", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.CustomAction
        // Build a custom action by rendering `TreeActionBase`. Forward `TreeActionBaseAttributes` so the action
        // renders correctly in every context (inline, overflow menu, context menu). The `icon` is only shown when
        // the action is rendered as an icon button.
        function MyLogAction({
          node,
          selectedNodes,
          ...attributes
        }: TreeActionBaseAttributes & { node: TreeNode; selectedNodes: TreeNode[] }) {
          return (
            <TreeActionBase
              {...attributes}
              label="Log node"
              icon={<span className="my-action-icon" aria-hidden={true} />}
              onClick={() => console.log("Clicked node:", node, "Selection:", selectedNodes)}
            />
          );
        }
        // __PUBLISH_EXTRACT_END__

        function TreeWithActions() {
          const treeProps = useTree({ getHierarchyProvider });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isLoading) {
            return "Loading...";
          }
          return (
            // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.Actions
            // Row actions are provided through three callbacks, depending on where they should appear. Each receives
            // the `targetNode` and the current `selectedNodes`.
            <StrataKitTreeRenderer
              {...treeProps.treeRendererProps}
              treeLabel="My Tree"
              // Rendered directly on the row (at most two).
              getInlineActions={({ targetNode, selectedNodes }) => [
                <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
              ]}
              // Rendered in the overflow (ellipsis) menu on the row.
              getMenuActions={({ targetNode, selectedNodes }) => [
                <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
              ]}
              // Rendered in the context menu opened by right-clicking the row.
              getContextMenuActions={({ targetNode, selectedNodes }) => [
                <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
              ]}
            />
            // __PUBLISH_EXTRACT_END__
          );
        }

        const result = render(
          <Root colorScheme="light">
            <TreeWithActions />
          </Root>,
        );
        await waitFor(() => expect(result.getByText("My Model A")).to.not.be.null);
      });

      it("renders a tree with node renaming", async function () {
        function TreeWithRenaming() {
          const treeProps = useTree({ getHierarchyProvider });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isLoading) {
            return "Loading...";
          }
          return (
            // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.Renaming
            // Enable node renaming through the `getEditingProps` callback. Return `undefined` for nodes that cannot be
            // renamed. Users enter rename mode through `TreeNodeRenameAction`.
            <StrataKitTreeRenderer
              {...treeProps.treeRendererProps}
              treeLabel="My Tree"
              getEditingProps={(node) => ({
                onLabelChanged: (newLabel) => console.log(`Renamed "${node.label}" to "${newLabel}"`),
                validate: (newLabel) => newLabel.trim().length > 0,
                labelValidationHint: "Label must not be empty",
              })}
              getMenuActions={({ targetNode }) => [<TreeNodeRenameAction key="rename" node={targetNode} />]}
            />
            // __PUBLISH_EXTRACT_END__
          );
        }

        const { getByText } = render(
          <Root colorScheme="light">
            <TreeWithRenaming />
          </Root>,
        );
        await waitFor(() => expect(getByText("My Model A")).to.not.be.null);
      });

      it("starts node renaming programmatically", async function () {
        function TreeWithProgrammaticRenaming() {
          // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.ProgrammaticRenaming
          // Hold a ref to the renderer and call `renameNode` to enter rename mode for the first node matching the
          // predicate. The node must already be loaded; collapsed parents are expanded and the node is scrolled
          // into view.
          const treeRef = useRef<StrataKitTreeRendererAttributes>(null);
          const renameMyModel = () => treeRef.current?.renameNode((node) => node.label === "My Model A");
          // __PUBLISH_EXTRACT_END__
          const treeProps = useTree({ getHierarchyProvider });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isLoading) {
            return "Loading...";
          }
          return (
            // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.ProgrammaticRenamingRenderer
            // Wire the ref to the renderer and trigger `renameMyModel` from your own UI. `getEditingProps` must
            // enable editing for the node you want to rename.
            <>
              <button onClick={renameMyModel}>Rename model</button>
              <StrataKitTreeRenderer
                {...treeProps.treeRendererProps}
                ref={treeRef}
                treeLabel="My Tree"
                getEditingProps={(node) => ({
                  onLabelChanged: (newLabel) => console.log(`Renamed "${node.label}" to "${newLabel}"`),
                })}
              />
            </>
            // __PUBLISH_EXTRACT_END__
          );
        }

        const { getByText } = render(
          <Root colorScheme="light">
            <TreeWithProgrammaticRenaming />
          </Root>,
        );
        await waitFor(() => expect(getByText("My Model A")).to.not.be.null);
      });

      it("renders a tree with custom errors", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.Features.ErrorRendering
        // The payload your application attaches to a node's error through `additionalData`. Carry whatever the
        // renderer needs to recognize the error and build its UI - here a discriminating `type` and the affected object.
        interface MyError {
          type: "resource-not-supported";
          object: { displayName: string };
        }
        function isMyError(data: unknown): data is MyError {
          return !!data && typeof data === "object" && "type" in data && data.type === "resource-not-supported";
        }

        // Builds the message shown in the error region: the object's label as a link that scrolls to the node,
        // followed by the error message.
        function ErrorMessage({
          label,
          message,
          scrollToItem,
        }: {
          label: string;
          message: string;
          scrollToItem: () => void;
        }) {
          return (
            <Typography>
              <Link component="button" type="button" onClick={scrollToItem}>
                {label}
              </Link>
              {`: ${message}`}
            </Typography>
          );
        }

        // A custom error item renderer. For your own `"Generic"` errors it renders a custom
        // `unstable_ErrorRegion.Item`; everything else - including the default message and node link - is
        // delegated to the delivered `ErrorItemRenderer`.
        function MyErrorItemRenderer(props: ComponentProps<typeof ErrorItemRenderer>) {
          const { error } = props;
          if (error.type === "Generic" && isMyError(error.additionalData)) {
            const { object } = error.additionalData;
            const message = (
              <ErrorMessage
                label={object.displayName}
                message={error.message}
                scrollToItem={() => props.scrollToNode(props.treeNode)}
              />
            );
            return <ErrorRegion.Item messageId={props.treeNode.id} message={message} />;
          }
          return <ErrorItemRenderer {...props} />;
        }

        // Attach the error through `getTreeNodeErrors` and plug the custom renderer in through `errorRenderer`,
        // delegating to `TreeErrorRenderer` with a `renderError` callback.
        function TreeWithCustomErrors() {
          const treeProps = useTree({
            getHierarchyProvider,
            getTreeNodeErrors: (node) => [
              {
                id: `${node.label}-error`,
                type: "Generic",
                message: "This resource is not supported",
                isNodeExpandable: true,
                additionalData: {
                  type: "resource-not-supported",
                  object: { displayName: node.label },
                } satisfies MyError,
              },
            ],
          });
          if (treeProps.rootErrorRendererProps) {
            return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
          }
          if (!treeProps.treeRendererProps || treeProps.isLoading) {
            return "Loading...";
          }
          return (
            <StrataKitTreeRenderer
              {...treeProps.treeRendererProps}
              treeLabel="My Tree"
              errorRenderer={(errorProps) => (
                <TreeErrorRenderer
                  {...errorProps}
                  renderError={(errorItemProps) => <MyErrorItemRenderer {...errorItemProps} />}
                />
              )}
            />
          );
        }
        // __PUBLISH_EXTRACT_END__

        const { getByRole } = render(
          <Root colorScheme="light">
            <TreeWithCustomErrors />
          </Root>,
        );
        await waitFor(() => expect(getByRole("treeitem", { name: /My Model A/ })).to.not.be.null);
      });
    });
  });
});
