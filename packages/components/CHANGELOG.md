# Change Log - @itwin/presentation-components

## 5.0.1

### Patch Changes

- [#492](https://github.com/iTwin/presentation/pull/492): Avoid removing instances explicitly added to unified selection when grouping node is unselected.
- [#494](https://github.com/iTwin/presentation/pull/494): Updated `usePresentationTableWithUnifiedSelection` to work outside `UnifiedSelectionContextProvider`
- [#464](https://github.com/iTwin/presentation/pull/464): Fixed navigation property editor dropdown layout in property grid.
- [#493](https://github.com/iTwin/presentation/pull/493): Updated `UnifiedSelectionTreeEventHandler` to correctly handle unified selection change when it is not updated immediatly after `add`|`replace`|`remove`|`clear` action.

## 5.0.0

### Major Changes

- [#412](https://github.com/iTwin/presentation/pull/412): **Dependencies:** Bumped peer dependency version of all [itwinjs-core](https://github.com/iTwin/itwinjs-core) packages to `^4.4.0`.

- [#399](https://github.com/iTwin/presentation/pull/399): **Dependencies:** Bumped peer dependency version of all [appui](https://github.com/iTwin/appui) packages to `^4.9.0`.

- [#398](https://github.com/iTwin/presentation/pull/398): **Dependencies:** Bumped `@itwin/itwinui-react` package dependency version to `3.x`. This entails that all components from `@itwin/presentation-components` must be wrapped in `ThemeProvider` from `itwinui-react@3`. [See more](https://github.com/iTwin/iTwinUI/wiki/iTwinUI-react-v3-migration-guide#themeprovider).

- [#222](https://github.com/iTwin/presentation/pull/222): **Tree:** Show the size of filtered tree hierarchy level while building a filter.

  Includes breaking `@beta` API change in `PresentationTreeRenderer` - instead of taking [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/), [TreeModelSource](https://www.itwinjs.org/reference/components-react/tree/treemodelsource/) and [ITreeNodeLoader](https://www.itwinjs.org/reference/components-react/tree/itreenodeloader/) as 3 separate props, it now takes a single `AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>` prop. Implementing the feature required adding an `IPresentationTreeDataProvider` to props, however requesting a single, more specific, node loader instead of 4 different props that are tightly coupled was a much cleaner solution, especially since using `PresentationTreeRenderer` with node loaders other than `AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>` made little sense.

  Generally, reacting to the change is as simple as removing `imodel` and `modelSource` from the list of props, passed to `PresentationTreeRenderer`. In case the type of `nodeLoader` prop doesn't match, we recommend using the new `usePresentationTreeState` for creating one. Or, if the tree is not based on presentation rules, not using the `PresentationTreeRenderer` at all and instead switching to [TreeRenderer](https://www.itwinjs.org/reference/components-react/tree/treerenderer/).

- [#313](https://github.com/iTwin/presentation/pull/313): **Tree:** Added interactive and more detailed informational messages in the tree and its hierarchy level filtering components:

  - When a hierarchy level size exceeds given limit, a message is displayed, suggesting the results should be filtered to reduce the result set.
  - The hierarchy level filtering dialog informs whether provided filters reduce the result set to a small enough size to be displayed in the tree.

  Includes 2 breaking `@beta` API changes:

  - `PresentationTreeNodeRenderer` now takes `onClearFilterClick` and `onFilterClick` callback props with node identifier argument rather than `PresentationTreeNodeItem`. This was a necessary change to allow opening filtering dialog for a parent node from its child node. To react to this breaking change:

    _before_

    ```tsx
    const [clickedNode, setClickedNode] = useState<PresentationTreeNodeItem>();
    <PresentationTreeNodeRenderer
      {...nodeProps}
      onFilterClick={(node: PresentationTreeNodeItem) => {
        setClickedNode(node);
      }}
    />;
    ```

    _after_

    ```tsx
    const [clickedNode, setClickedNode] = useState<PresentationTreeNodeItem>();
    <PresentationTreeNodeRenderer
      {...nodeProps}
      onFilterClick={(nodeId: string) => {
        const node = modelSource.getModel().getNode(nodeId);
        if (isTreeModelNode(node) && isPresentationTreeNodeItem(node.item)) {
          setClickedNode(node.item);
        }
      }}
    />;
    ```

  - `useHierarchyLevelFiltering` hook's result now contains functions `applyFilter` and `clearFilter` that take node identifier argument rather than a [TreeNodeItem](https://www.itwinjs.org/reference/components-react/tree/treenodeitem/). The change was made to help reacting to the above `PresentationTreeNodeRenderer` change by requiring the same types of arguments as what `onClearFilterClick` and `onFilterClick` get. In case these functions are used outside of `PresentationTreeNodeRenderer` workflows, reacting to the breaking change is as follows:

    _before_

    ```tsx
    const { applyFilter } = useHierarchyLevelFiltering({
      nodeLoader,
      modelSource,
    });
    const [filterNode, setFilterNode] = useState<PresentationTreeNodeItem>();
    const onFilterChanged = (filter: PresentationInstanceFilterInfo) => {
      if (filterNode) {
        applyFilter(filterNode, filter);
      }
    };
    ```

    _after_

    ```tsx
    const { applyFilter } = useHierarchyLevelFiltering({
      nodeLoader,
      modelSource,
    });
    const [filterNodeId, setFilterNodeId] = useState<string>();
    const onFilterChanged = (filter: PresentationInstanceFilterInfo) => {
      if (filterNodeId) {
        applyFilter(filterNodeId, filter);
      }
    };
    ```

  Generally, the above two APIs are used together, which means no changes should be necessary.

- [#438](https://github.com/iTwin/presentation/pull/438): **Instance filter builder / dialog:** Changed `PresentationInstanceFilterDialogProps.descriptor` attribute to `propertiesSource`, which associates `Descriptor` with input keys used to create the descriptor. This allows the dialog to use the `Keys` information, which is required for loading suggestions in value inputs.

  _before_

  ```tsx
  const [inputKeys] = useState<Keys>();
  <PresentationInstanceFilterDialog
    descriptor={async () => loadDescriptor(inputKeys)}
  />;
  ```

  _after_

  ```tsx
  const [inputKeys] = useState<Keys>();
  <PresentationInstanceFilterDialog
    propertiesSource={async () => {
      const descriptor = await loadDescriptor(inputKeys);
      return { descriptor, inputKeys };
    }}
  />;
  ```

### Minor Changes

- [#316](https://github.com/iTwin/presentation/pull/316): **Instance filter builder / dialog:** Promoted some `@internal` APIs to `@beta`

  - `useInstanceFilterPropertyInfos` - a hook for creating a property list based on supplied [Descriptor](https://www.itwinjs.org/reference/presentation-common/content/descriptor/). The property list is necessary for rendering the [PropertyFilterBuilder](https://www.itwinjs.org/reference/components-react/propertyfilterbuilder/propertyfilterbuilder/) component.
  - `PresentationInstanceFilter.fromComponentsPropertyFilter` - for adding presentation data to [PropertyFilter](https://www.itwinjs.org/reference/components-react/propertyfilterbuilder/propertyfilter/) built by [usePropertyFilterBuilder](https://www.itwinjs.org/reference/components-react/propertyfilterbuilder/usepropertyfilterbuilder/).
  - `PresentationInstanceFilter.toComponentsPropertyFilter` - for stripping out presentation data from filter for usage with [usePropertyFilterBuilder](https://www.itwinjs.org/reference/components-react/propertyfilterbuilder/usepropertyfilterbuilder/).
  - `PresentationFilterBuilderValueRenderer` - a custom renderer for property value input. It renders unique values selector for `Equal` / `NotEqual` rules and handles numeric values' unit conversion on top of the general value input.
  - `PresentationInstanceFilterPropertyInfo` - a data structure defining a property used in instance filter.

- [#316](https://github.com/iTwin/presentation/pull/316), [#407](https://github.com/iTwin/presentation/pull/407): **Instance filter builder / dialog:** Added utilities `PresentationInstanceFilter.fromGenericInstanceFilter` and `PresentationInstanceFilter.toGenericInstanceFilter` to help with parsing the `PresentationInstanceFilter` data structure into a more consumer-friendly, lower-level [GenericInstanceFilter](https://www.itwinjs.org/reference/core-common/utils/genericinstancefilter/).

- [#193](https://github.com/iTwin/presentation/pull/193): **Instance filter builder / dialog:** Show a validation error message when entered property value is invalid.

- [#176](https://github.com/iTwin/presentation/pull/176): **Instance filter builder / dialog:** Added unique values selector when using `Equal` or `Not Equal` operators. The component provides a drop-down of values available for selected property.

  - `null` values are omitted. `"Is Null"` and `"Is Not Null"` operators should be used instead.
  - For empty non `null` values _Empty Value_ option is shown in selector.

- [#356](https://github.com/iTwin/presentation/pull/356): **Instance filter builder / dialog:** UX enhancements.

  - Changed the "Apply" button to always be enabled, even when no filtering rules are selected. In such situations, the calling component may clear the filter.
  - Added a "Reset" button which clears all the filtering rules in the dialog.
  - Added a `toolbarButtonsRenderer` prop to allow rendering custom toolbar buttons at the bottom of the dialog.

- [#447](https://github.com/iTwin/presentation/pull/447): **Instance filter builder / dialog:** Added ability to pass initial filter as a callback that will be invoked when descriptor is loaded.

- [#358](https://github.com/iTwin/presentation/pull/358): **Instance filter builder / dialog:** Show a union of properties of selected classes rather than intersection.

- [#416](https://github.com/iTwin/presentation/pull/416): **Instance filter builder / dialog:** `PresentationInstanceFilterDialog` now allows applying filter when only classes are selected.

  - Added `createInstanceFilterDefinition` that creates `InstanceFilterDefinition` from `PresentationInstanceFilterInfo`. Created definition can be passed to `PresentationManager` to filter results when creating content or hierarchies.

- [#388](https://github.com/iTwin/presentation/pull/388): **Tree:** Adjust API of `PresentationTreeRenderer` by separating `PresentationTreeRenderer` hierarchy level filtering logic into `useFilterablePresentationTree` hook.

- [#421](https://github.com/iTwin/presentation/pull/421): **Tree:** Simplify / clarify `PresentationTree` and `PresentationTreeRenderer` APIs.

  - Change `PresentationTreeProps.treeRenderer` type to make it compatible with what `PresentationTreeRenderer` expects.

    _before_

    ```tsx
    <PresentationTree
      {...props}
      state={state}
      treeRenderer={(treeProps) => (
        <PresentationTreeRenderer
          {...treeProps}
          nodeLoader={state.nodeLoader}
        />
      )}
    />
    ```

    _after_

    ```tsx
    <PresentationTree
      {...props}
      state={state}
      treeRenderer={(treeProps) => <PresentationTreeRenderer {...treeProps} />}
    />
    ```

  - Removed `nodeRenderer` prop from `PresentationTreeRendererProps`. The prop is not used by `PresentationTreeRenderer` as it always uses its own `PresentationTreeNodeRenderer` to render nodes.

- [#305](https://github.com/iTwin/presentation/pull/305): **Property grid:** Added an editor for editing values of properties with quantity / units information.

  Editor works only if there is `SchemaMetadataContextProvider` in React component tree above property grid components. Otherwise simple numeric editor is used.

  ```tsx
  // somewhere at the global level
  import { IModelConnection } from "@itwin/core-frontend";
  import { SchemaContext } from "@itwin/ecschema-metadata";
  function getIModelSchemaContext(imodel: IModelConnection): SchemaContext {
    // return a cached instance of SchemaContext for given IModelConnection
  }

  // in the component render function
  <SchemaMetadataContextProvider
    imodel={imodel}
    schemaContextProvider={getIModelSchemaContext}
  >
    <VirtualizedPropertyGridWithDataProvider {...props} />
  </SchemaMetadataContextProvider>;
  ```

### Patch Changes

- [#273](https://github.com/iTwin/presentation/pull/273), [#451](https://github.com/iTwin/presentation/pull/451): **Instance filter builder / dialog:** Fixed tooltip appearing under property selector in property filter builder.
- [#456](https://github.com/iTwin/presentation/pull/456): **Instance filter builder / dialog:** Reduced amount of tooltips rendered in filter builder property selector.
- [#312](https://github.com/iTwin/presentation/pull/312): **Instance filter builder / dialog:** Fixed class label shown in tooltip for related properties when building a filter. It now shows label of related class that was used to access that property instead of class where that property is defined.
- [#362](https://github.com/iTwin/presentation/pull/362): **Instance filter builder / dialog:** Change class selector placeholder value to emphasize the fact that selecting a class is optional.
- [#371](https://github.com/iTwin/presentation/pull/371): **Instance filter builder / dialog:** Clear all property filtering rules when selected class list changes.
- [#296](https://github.com/iTwin/presentation/pull/296): **Instance filter builder / dialog:** Format date values in the property value selector.
- [#373](https://github.com/iTwin/presentation/pull/373): **Instance filter builder / dialog:** Fix selected class information not being retained when using React 18 strict mode.
- [#437](https://github.com/iTwin/presentation/pull/437): **Content:** Sort struct property members by label when creating content for property grid, table, and other content components.
- [#427](https://github.com/iTwin/presentation/pull/427): **Property grid:** Inline default property grid ruleset instead of loading it from JSON file.
- [#418](https://github.com/iTwin/presentation/pull/418): **Tree:** Updated message shown in hierarchy level filtering dialog when built filter still produces too many results.
- [#446](https://github.com/iTwin/presentation/pull/446): **Tree:** Added custom CSS class on tree node actions buttons to allow customizing them.
- [#354](https://github.com/iTwin/presentation/pull/354): **Unified selection:** Cancel ongoing hilite set request when unified selection changes.
- [#348](https://github.com/iTwin/presentation/pull/348): Clean up `@internal` APIs exposed through the barrel exports file.

## 5.0.0-dev.6

### Patch Changes

- [#453](https://github.com/iTwin/presentation/pull/453): Fixed instance filter builder unique values selector dropdown menu layout.
- [#451](https://github.com/iTwin/presentation/pull/451): Fixed tooltip appearing under property selector in property filter builder.

## 5.0.0-dev.5

### Major Changes

- [#438](https://github.com/iTwin/presentation/pull/438): Merged `PresentationInstanceFilterDialogProps.descriptor` and `PresentationInstanceFilterDialogProps.descriptorInputKeys` into single property `PresentationInstanceFilterDialogProps.propertiesSource`. This explicitly associates `Descriptor` with input keys. It provides more convenient API in case `Descriptor` is lazy loaded and input keys are known only after loading.

  Before:

  ```tsx
  const [inputKey, setInputKeys] = useState([]);

  <PresentationInstanceFilterDialog
    descriptor={async () => {
      const { descriptor, keys } = loadDescriptorAndKeys();
      setInputKeys(keys);
      return descriptor;
    }}
    descriptorInputKeys={inputKeys}
  />;
  ```

  After:

  ```tsx
  <PresentationInstanceFilterDialog
    propertiesSource={async () => {
      const { descriptor, keys } = loadDescriptorAndKeys();
      return {
        descriptor,
        inputKeys: keys,
      };
    }}
  />
  ```

### Patch Changes

- [#437](https://github.com/iTwin/presentation/pull/437): Sort struct property members by label when creating content for property grid, table, and other content components.
- [#448](https://github.com/iTwin/presentation/pull/448): Fixed `UniqueValueSelector` loading only the first page of values.
- [#444](https://github.com/iTwin/presentation/pull/444): Updated UniqueValueSelector dropdown menu to open upwards when there is not enough space below.
- [#446](https://github.com/iTwin/presentation/pull/446): Added custom CSS class on tree node actions buttons to allow customizing them.
- [#427](https://github.com/iTwin/presentation/pull/427): Inline default property grid ruleset instead of loading it from JSON file.

## 5.0.0-dev.4

### Minor Changes

- [#421](https://github.com/iTwin/presentation/pull/421): Simplify / clarify `PresentationTree` and `PresentationTreeRenderer` APIs.

  - Change `PresentationTreeProps.treeRenderer` type to make it compatible with what `PresentationTreeRenderer` expects.

    Before:

    ```tsx
    return (
      <PresentationTree
        {...props}
        state={state}
        treeRenderer={(treeProps) => (
          <PresentationTreeRenderer
            {...treeProps}
            nodeLoader={state.nodeLoader}
          />
        )}
      />
    );
    ```

    After:

    ```tsx
    return (
      <PresentationTree
        {...props}
        state={state}
        treeRenderer={(treeProps) => (
          <PresentationTreeRenderer {...treeProps} />
        )}
      />
    );
    ```

  - Removed `nodeRenderer` prop from `PresentationTreeRendererProps`. The prop is not used by `PresentationTreeRenderer` as it always uses its own `PresentationTreeNodeRenderer` to render nodes.

- [#416](https://github.com/iTwin/presentation/pull/416): `PresentationInstanceFilterDialog` now allows applying filter when only classes are selected.

  Added `createInstanceFilterDefinition` that creates `InstanceFilterDefinition` from `PresentationInstanceFilterInfo`. Created definition can be passed to `PresentationManager` to filter results when creating content or hierarchies.

### Patch Changes

- [#417](https://github.com/iTwin/presentation/pull/417): Added missing "No values" localized string in unique values selector.
- [#418](https://github.com/iTwin/presentation/pull/418): Updated message shown in hierarchy level filtering dialog when built filter still produces too many results.

## 5.0.0-dev.3

### Major Changes

- [#412](https://github.com/iTwin/presentation/pull/412): Bumped peer dependency version of all `itwinjs-core` packages to `^4.4.0`.
- [#398](https://github.com/iTwin/presentation/pull/398): Bump `iTwinUI` package dependencies to 3.x. This is entails that all components from `presentation-components` must be wrapped in `ThemeProvider` from `iTwinUI` 3.x. [See more](https://github.com/iTwin/iTwinUI/wiki/iTwinUI-react-v3-migration-guide#themeprovider)
- [#399](https://github.com/iTwin/presentation/pull/399): Bumped AppUI peer dependency to `^4.9.0`.

### Minor Changes

- [#407](https://github.com/iTwin/presentation/pull/407): Removed `GenericInstanceFilter` in favor of the one delivered in `@itwin/core-common`.
  Added `PresentationInstanceFilter.fromGenericInstanceFilter` function for creating `PresentationInstanceFilter` from `GenericInstanceFilter`.
- [#399](https://github.com/iTwin/presentation/pull/399): Added validation for `Between` and `Not Between` operator values.

### Patch Changes

- [#405](https://github.com/iTwin/presentation/pull/405): Fixed unique values selector loading unique values of only the first field property.

## 5.0.0-dev.2

### Minor Changes

- [#358](https://github.com/iTwin/presentation/pull/358): Instance filter builder / dialog: Show a union of properties of selected classes rather than intersection.
- [#356](https://github.com/iTwin/presentation/pull/356): Instance filter builder / dialog: UX enhancements.

  - Changed the "Apply" button to always be enabled, even when no filtering rules are selected. In such situations, `PresentationTreeRenderer` clears the hierarchy level filter.
  - Added a "Reset" button which clears all the filtering rules in the dialog.
  - Added a `toolbarButtonsRenderer` prop to allow rendering custom toolbar buttons at the bottom of the dialog.

- [#363](https://github.com/iTwin/presentation/pull/363): Instance filter builder / dialog: Include selected classes' information in the `GenericInstanceFilter` data structure to allow filtering by them. Use this information when building hierararchy level filters to allow users filter-out instances of specific class(es).
- [#388](https://github.com/iTwin/presentation/pull/388): Adjust API of `PresentationTreeRenderer` by separating `PresentationTreeRenderer` hierarchy level filtering logic into `useFilterablePresentationTree` hook.

### Patch Changes

- [#354](https://github.com/iTwin/presentation/pull/354): Unified selection: Cancel ongoing hilite set request when unified selection changes.
- [#362](https://github.com/iTwin/presentation/pull/362): Instance filter builder / dialog: Change class selector placeholder value to emphasize the fact that selecting a class is optional.
- [#371](https://github.com/iTwin/presentation/pull/371): Instance filter builder / dialog: Clear all property filtering rules when selected class list changes.
- [#348](https://github.com/iTwin/presentation/pull/348): Clean up `@internal` APIs exposed through the barrel exports file.
- [#373](https://github.com/iTwin/presentation/pull/373): Instance filter builder / dialog: Fix selected class information not being retained when using React 18 strict mode.

## 4.4.0

This release brings official React 18 support. Components and hooks provided by this package were updated to work with [`StrictMode` in React 18](https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-strict-mode).

### Minor Changes

- [#333](https://github.com/iTwin/presentation/pull/333): Deprecated `useRulesetRegistration` because it is not compatible with React 18
- [#328](https://github.com/iTwin/presentation/pull/328): Added `usePresentationTreeState` and `PresentationTree` for using presentation data with `ControlledTree`. This is a replacement for `usePresentationTreeNodeLoader` which is not fully compatible with React 18 and now is deprecated.

  Old API:

  ```tsx
  function Tree(props) {
    const { nodeLoader } = usePresentationTreeNodeLoader({
      imodel: props.imodel,
      ruleset: TREE_RULESET,
      pagingSize: PAGING_SIZE,
    });
    const eventHandler = useUnifiedSelectionTreeEventHandler({ nodeLoader });
    const treeModel = useTreeModel(nodeLoader.modelSource);

    return (
      <ControlledTree
        width={200}
        height={400}
        model={treeModel}
        nodeLoader={nodeLoader}
        eventsHandler={eventHandler}
        selectionMode={SelectionMode.Single}
      />
    );
  }
  ```

  New API:

  ```tsx
  function Tree(props) {
    const state = usePresentationTreeState({
      imodel: props.imodel,
      ruleset: TREE_RULESET,
      pagingSize: PAGING_SIZE,
      eventHandlerFactory: useCallback(
        (handlerProps: TreeEventHandlerProps) =>
          new UnifiedSelectionTreeEventHandler({
            nodeLoader: handlerProps.nodeLoader,
          }),
        [],
      ),
    });
    if (!state) {
      return null;
    }

    return (
      <PresentationTree
        width={200}
        height={400}
        state={state}
        selectionMode={SelectionMode.Single}
      />
    );
  }
  ```

## 5.0.0-dev.1

### Minor Changes

- [#316](https://github.com/iTwin/presentation/pull/316): Added `GenericInstanceFilter` data structure that has all the data needed to convert an instance filter to `ECSQL`, `ECExpression` or other formats. The data structure can be created from `PresentationInstanceFilter` using the `GenericInstanceFilter.fromPresentationInstanceFilter` call.
- [#316](https://github.com/iTwin/presentation/pull/316): Promoted some instance filtering - related `internal` APIs to `beta`:

  - `useInstanceFilterPropertyInfos` - for creating a property list based on supplied `Descriptor`. The property list is necessary for rendering the `PropertyFilterBuilder` component from `@itwin/components-react` package.
  - `PresentationFilterBuilderValueRenderer` - a custom renderer for property value input. It renders unique values selector for `Equal` / `NotEqual` rules and handles unit conversion on top of the general value input.
  - `PresentationInstanceFilter.fromComponentsPropertyFilter` - for adding presentation data to `PropertyFilter` built by `usePropertyFilterBuilder`.
  - `PresentationInstanceFilter.toComponentsPropertyFilter` - for stripping out presentation data from filter for usage with `usePropertyFilterBuilder`.
  - `PresentationInstanceFilterPropertyInfo` - data structure defining a property used in instance filter.

  Also, moved a couple of beta APIs to a common namespace to make them more discoverable:

  - `convertToInstanceFilterDefinition` -> `PresentationInstanceFilter.toInstanceFilterDefinition`,
  - `isPresentationInstanceFilterConditionGroup` -> `PresentationInstanceFilter.isConditionGroup`.

- [#313](https://github.com/iTwin/presentation/pull/313): Add interactive and more detailed informational messages in tree and instance filter components.
- [#305](https://github.com/iTwin/presentation/pull/305): Added editor for editing quantity property values in property grid. Editor works only if there is `SchemaMetadataContextProvider` in React component tree above property grid components. Otherwise simple numeric editor is used.

### Patch Changes

- [#317](https://github.com/iTwin/presentation/pull/317): Fix unique value selector placeholder formatting in instance filter builder.
- [#312](https://github.com/iTwin/presentation/pull/312): Fixed class name shown in tooltip for related properties when building filter. It now shows name of related class that was used to access that property instead of class where that property is defined.

## 5.0.0-dev.0

The `5.0` release is targeted towards getting instance filtering production-ready and contains a number of bug fixes and enhancements for the `PresentationInstanceFilterDialog` component.

The release does not contain any breaking API changes and the bump in peer-depenendecies is the only reason this is a major release.

### Major Changes

- [#299](https://github.com/iTwin/presentation/pull/299): Bumped `AppUI` peer dependencies to `4.6.0`. Bumped `itwinjs-core` peer dependencies to `^4.1.0`.

### Minor Changes

- [#213](https://github.com/iTwin/presentation/pull/213): `PresentationInstanceFilterDialog`: Added support for quantity values.
- [#193](https://github.com/iTwin/presentation/pull/193): `PresentationInstanceFilterDialog`: Show error message when value input is invalid.
- [#222](https://github.com/iTwin/presentation/pull/222): `PresentationInstanceFilterDialog`: Show results count while building instance filter.
- [#176](https://github.com/iTwin/presentation/pull/176): `PresentationInstanceFilterDialog`: Added unique values value selector when using `Equal` or `Not Equal` operators. It loads unique property values that are associated with node on which filter is placed.

  - `null` values are omitted. `"Is Null"` and `"Is Not Null"` operators should be used instead.
  - For empty non `null` values _Empty Value_ option is shown in selector.

- [#296](https://github.com/iTwin/presentation/pull/296): `PresentationInstanceFilterDialog`: Add formatting to dates that are displayed in the property value selector.

### Patch Changes

- [#273](https://github.com/iTwin/presentation/pull/273): Fixed property tooltip appearing behind the property selector.
- [#206](https://github.com/iTwin/presentation/pull/206): Fix filtering when `Like` operator is selected.

## 4.3.0

### Minor Changes

- [#289](https://github.com/iTwin/presentation/pull/289): Removed dependency on `@itwin/itwinui-css` and switched to using components from `@itwin/itwinui-react` instead.
- [#284](https://github.com/iTwin/presentation/pull/284): Fix for missing/incomplete category labels in the property selector of the instance filter builder.
- [#231](https://github.com/iTwin/presentation/pull/231): Expand the `usePresentationTableWithUnifiedSelection()` hook to additionally return:

  - an `onSelect()` callback which will update the `unifiedSelection` one level above it (+1) with the keys that are passed to it.
  - `selectedRows` which is updated every time `unifiedSelection` changes one level above the table component.

### Patch Changes

- [#292](https://github.com/iTwin/presentation/pull/292): Broaden default instance filter builder dialog.
- [#289](https://github.com/iTwin/presentation/pull/289): Fixed navigation property value selector dropdown menu to be visible when used inside dialog.
- [#291](https://github.com/iTwin/presentation/pull/291): Updated `@itwin/itwinui-react` dependency version to consume the latest fixes.
- [#264](https://github.com/iTwin/presentation/pull/264): Change `NumericPropertyEditor` logic to only commit changes on `onBlur` event rather than every time the value is changed.

## 4.2.1

### Patch Changes

- [#230](https://github.com/iTwin/presentation/pull/230): Fixed hierarchy level filtering under grouping nodes.

This log was last generated on Thu, 31 Aug 2023 11:51:06 GMT and should not be manually modified.

<!-- Start content -->

## 4.2.0

Thu, 31 Aug 2023 11:51:06 GMT

### Minor changes

- Reload content and hierarchies when active unit system is changed. ([commit](https://github.com/iTwin/presentation/commit/326dd33a9e40659f6b6af4a0dd100948798db6c8))

### Patches

- Update dependencies ([commit](https://github.com/iTwin/presentation/commit/585bfe098c3c388c48ffa4f311c4722f1b6835df))

## 4.1.0

Wed, 09 Aug 2023 11:47:16 GMT

### Minor changes

- Make sure `FilteredPresentationTreeDataProvider` creates same tree node items as parent `PresentationTreeDataProvider`. ([commit](https://github.com/iTwin/presentation/commit/3d770080cb55dcfef0cb39a32119ad8ce042aad6))

### Patches

- `InstanceFilterDialog`: fix resize observer error when navigation property is selected. ([commit](https://github.com/iTwin/presentation/commit/11ad3f98efde2a8eb78aa9f2c986472a34c66ea7))
- Update package dependencies ([commit](https://github.com/iTwin/presentation/commit/22593a8fddc52b5c547c024d64e7cc5659c81d01))
- Add `Home` and `End` buttons functionality to the navigation property value selector. ([commit](https://github.com/iTwin/presentation/commit/0840ddf4b9ac098eb457169696bd48ea88797095))
- Remove dead code ([commit](https://github.com/iTwin/presentation/commit/f18cae3e518e50265c39ae2684fe91bc56cf38de))
- `useControlledPresentationTreeFiltering`: Reset `filteredNodeLoader` after filter string is changed and filtering is in progress. ([commit](https://github.com/iTwin/presentation/commit/3f36136778e2444c1224a5b68b0a21f707b5685f))
- `InstanceFilterDialog`: Add filter expression for `Point` type. ([commit](https://github.com/iTwin/presentation/commit/a9f4c2b467bfdd75501f4e48bfaadd51108665b1))
- Add custom numeric property editor. ([commit](https://github.com/iTwin/presentation/commit/aeae3ff736d772ce61b0dfdb34335f1a7d76f1ce))
- Update `rxjs` dependency to `7.8.1` ([commit](https://github.com/iTwin/presentation/commit/cfef82ba0050915a1d2bb5d3bd9538737bc47326))

## 4.0.1

Thu, 15 Jun 2023 07:31:33 GMT

### Patches

- `InstanceFilterDialog`: Make dialog width and height larger. ([commit](https://github.com/iTwin/presentation/commit/676e370cf2f76863ee595fb8b2c3270281de5ba8))
- Small documentation improvements ([commit](https://github.com/iTwin/presentation/commit/5bdb5ab060142225d5249b52cdb5fd9520d112ed))
- `InstanceFilterDialog`: Make dialog resizable and draggable. ([commit](https://github.com/iTwin/presentation/commit/676e370cf2f76863ee595fb8b2c3270281de5ba8))
- `InstanceFilterDialog`: Show loading spinner when filtering is in progress. ([commit](https://github.com/iTwin/presentation/commit/55e97cb3c74c15c32aae9ea61c94b568c4461b7b))

## 4.0.0

Tue, 02 May 2023 11:39:31 GMT

### Major changes

- Upgrade to AppUI 4.0 ([commit](https://github.com/iTwin/presentation/commit/c869d568d3b462670d20e1ec31807aee15a0857e))

### Minor changes

- Deprecate `IContentDataProvider.getFieldByPropertyRecord` in favor of the new `IContentDataProvider.getFieldByPropertyDescription`. ([commit](https://github.com/iTwin/presentation/commit/4c31428c0bff68186256b9375edf41e68c75c4f2))
- Unified hierarchy update handling in all situations (after iModel change, ruleset change or ruleset variables change) ([commit](https://github.com/iTwin/presentation/commit/ba7ef1aab92651f624c6d9190e150c438f8cfab8))
- Add support for hierarchy level size limiting ([commit](https://github.com/iTwin/presentation/commit/6bf1a99ec570751e16f30af658e0fa7e27e7631f))
- Updated `@itwinui-react` package to `^2.5.0` ([commit](https://github.com/iTwin/presentation/commit/fbbb45e2a75fb11f282f2474f6419cd20a65829c))
- Prepared package to be used with React 18. Updated React `peerDependency` to `^17.0.0 || ^18.0.0` ([commit](https://github.com/iTwin/presentation/commit/d46358ebcd7e035d36e700b2a76c581922e1053b))
- Bump minimum required `itwinjs-core` version to `3.6.3` ([commit](https://github.com/iTwin/presentation/commit/7bf12337f09b7fda0362474d3d63b18bb4b07aab))
- Added custom hook to get Presentation data for displaying it in table components. ([commit](https://github.com/iTwin/presentation/commit/90d197c1949d05f456d818a32c150e0096b85747))
- `IPresentationTreeDataProvider`: deprecated `getNodeKey` method in favor of getting `NodeKey` directly from `TreeNodeItem` using `isPresentationTreeNodeItem` typeguard. ([commit](https://github.com/iTwin/presentation/commit/f24452ceeb1277d85e0f515d8e18a24493242833))

### Patches

- Fixed Table rows not loading with latest `presentation-frontend` version ([commit](https://github.com/iTwin/presentation/commit/d6145c666d398c5c22f7d7402c318ec924232009))
- `PresentationTreeNodeRenderer`: ensure that the action buttons have the same background color as the node ([commit](https://github.com/iTwin/presentation/commit/98e77a3d2dcd57d758f77bdaa5e82971c82d0b09))
- Set editor to `StandardEditorNames.NumericInput` for all numeric properties ([commit](https://github.com/iTwin/presentation/commit/acac9a6426372eb68010bf737f4b8308edad3bdc))
- `NavigationPropertyTargetSelector`: add white background to the chevron ([commit](https://github.com/iTwin/presentation/commit/015bd5926437beb911cb0947958a56c4f46a2c5e))
- `InstanceFilterDialog`: Ensure "Accept" button is enabled when opening the dialog with pre-filled values ([commit](https://github.com/iTwin/presentation/commit/acac9a6426372eb68010bf737f4b8308edad3bdc))
- Fix failure to load property data when nested properties are placed in root categories different from their parent property category ([commit](https://github.com/iTwin/presentation/commit/3e241403894c693bb94214ad186ea04f17b5d4b5))
- `PresentationTreeDataProvider`: Handle errors that may occur when loading nodes ([commit](https://github.com/iTwin/presentation/commit/6bf1a99ec570751e16f30af658e0fa7e27e7631f))
- Fixed styles in `PresentationInstanceFilterBuilder` component. ([commit](https://github.com/iTwin/presentation/commit/39ca07c58f3031c97fbd760df53dc5c6a9b5222e))
- Fixed `usePresentationTable` to re -throw errors in React render loop on failure to get table content. Also affects `usePresentationTableWithUnifiedSelection` hook. ([commit](https://github.com/iTwin/presentation/commit/cc86391c6e437da4cec8365326e99db2a5423d1b))

### Changes

- Updated to TypeScript 5.0 ([commit](https://github.com/iTwin/presentation/commit/4b7924ee69265aaadeaba81f02162bf5c404d33a))
- Update dependencies ([commit](https://github.com/iTwin/presentation/commit/ddf8cf327436fa38dc304666992e9fb66e942933))

## 3.7.4

Tue, 25 Apr 2023 17:50:35 GMT

_Version update only_

## 3.7.3

Thu, 20 Apr 2023 13:19:29 GMT

_Version update only_

## 3.7.2

Wed, 12 Apr 2023 13:12:42 GMT

_Version update only_

## 3.7.1

Mon, 03 Apr 2023 15:15:37 GMT

_Version update only_

## 3.7.0

Wed, 29 Mar 2023 15:02:27 GMT

_Version update only_

## 3.6.3

Mon, 27 Mar 2023 16:26:47 GMT

_Version update only_

## 3.6.2

Fri, 17 Mar 2023 17:52:32 GMT

_Version update only_

## 3.6.1

Fri, 24 Feb 2023 22:00:48 GMT

### Updates

- Minor improvements to `PresentationInstanceFilterDialog`.
- Fix failure to load property data when nested properties are placed in root categories different from their parent property category
- Update `@itwin/itwinui-icons-react` dependency to version `^1.15`

## 3.6.0

Wed, 08 Feb 2023 14:58:40 GMT

### Updates

- Use `EmptyLocalization` for localization in tests to increase test performance
- Added support for initial filter to instance filter builder
- API promotions
- Correctly render `NavigationPropertyEditor` when it is used in dialog
- Correctly handle navigation property value when converting `PresentationInstanceFilter` into ECExpression
- Fixed `PresentationInstanceFilter` to `InstanceFilterDefinition` conversion to use operator supported by ECExpressions
- Fix duplicate classes displayed in instance filter class selector
- Added dialog for presentation instance filter
- Deprecate `PresentationPropertyDataProvider` properties `includeFieldsWithNoValues` and `includeFieldsWithCompositeValues`. Should use `FilteringPropertyDataProvider` instead.
- Added API to enable hierarchy level filtering in trees using presentation library

## 3.5.6

Fri, 24 Feb 2023 16:02:47 GMT

_Version update only_

## 3.5.5

Thu, 26 Jan 2023 22:53:28 GMT

_Version update only_

## 3.5.4

Wed, 18 Jan 2023 15:27:15 GMT

_Version update only_

## 3.5.3

Fri, 13 Jan 2023 17:23:07 GMT

_Version update only_

## 3.5.2

Wed, 11 Jan 2023 16:46:30 GMT

_Version update only_

## 3.5.1

Thu, 15 Dec 2022 16:38:29 GMT

_Version update only_

## 3.5.0

Wed, 07 Dec 2022 19:12:37 GMT

### Updates

- Use stripped relationship path in instance filter definition
- Added conversion from `FilterBuilder` output to `InstanceFilterDefinition`
- Deprecated `PresentationTableDataProvider` and `Table` related code that uses deprecated `Table` component from `@itwin/components-react` package
- Added editor for navigation properties
- Avoid loading whole class hierarchy up front for `PresentationInstanceFilterBuilder` component
- Updated `DiagnosticsProps` interface to match `DiagnosticsOptions`
- Unpin `classnames` package

## 3.4.7

Wed, 30 Nov 2022 14:28:19 GMT

_Version update only_

## 3.4.6

Tue, 22 Nov 2022 14:24:19 GMT

_Version update only_

## 3.4.5

Thu, 17 Nov 2022 21:32:50 GMT

_Version update only_

## 3.4.4

Thu, 10 Nov 2022 19:32:17 GMT

_Version update only_

## 3.4.3

Fri, 28 Oct 2022 13:34:58 GMT

_Version update only_

## 3.4.2

Mon, 24 Oct 2022 13:23:45 GMT

_Version update only_

## 3.4.1

Mon, 17 Oct 2022 20:06:51 GMT

_Version update only_

## 3.4.0

Thu, 13 Oct 2022 20:24:47 GMT

### Updates

- Improved instance filter builder property renderer to avoid duplicate entries
- `usePresentationTreeNodeLoader`: Add ability to supply initial `TreeModel`.

## 3.3.5

Tue, 27 Sep 2022 11:50:59 GMT

_Version update only_

## 3.3.4

Thu, 08 Sep 2022 19:00:05 GMT

_Version update only_

## 3.3.3

Tue, 06 Sep 2022 20:54:19 GMT

_Version update only_

## 3.3.2

Thu, 01 Sep 2022 14:37:23 GMT

_Version update only_

## 3.3.1

Fri, 26 Aug 2022 15:40:02 GMT

_Version update only_

## 3.3.0

Thu, 18 Aug 2022 19:08:02 GMT

### Updates

- upgrade mocha to version 10.0.0
- Renderer for nodes with too many children.
- Add filter button
- Fix: set correct node's children count after hierarchy update
- Added 'PresentationInstanceFilterBuilder' component for building complex filters to filter instances when requesting presentation data
- usePresentationTreeNodeLoader: pass 'customizeTreeNodeItem' callback to 'PresentationTreeDataProvider'

## 3.2.9

Fri, 26 Aug 2022 14:21:40 GMT

_Version update only_

## 3.2.8

Tue, 09 Aug 2022 15:52:41 GMT

_Version update only_

## 3.2.7

Mon, 01 Aug 2022 13:36:56 GMT

_Version update only_

## 3.2.6

Fri, 15 Jul 2022 19:04:43 GMT

_Version update only_

## 3.2.5

Wed, 13 Jul 2022 15:45:53 GMT

_Version update only_

## 3.2.4

Tue, 21 Jun 2022 18:06:33 GMT

_Version update only_

## 3.2.3

Fri, 17 Jun 2022 15:18:39 GMT

_Version update only_

## 3.2.2

Fri, 10 Jun 2022 16:11:37 GMT

_Version update only_

## 3.2.1

Tue, 07 Jun 2022 15:02:57 GMT

### Updates

- Fix excluding related properties without values

## 3.2.0

Fri, 20 May 2022 13:10:54 GMT

### Updates

- Added ability to customize TreeNodeItems produced by PresentationTreeDataProvider
- Documentation updates.

## 3.1.3

Fri, 15 Apr 2022 13:49:25 GMT

_Version update only_

## 3.1.2

Wed, 06 Apr 2022 22:27:56 GMT

_Version update only_

## 3.1.1

Thu, 31 Mar 2022 15:55:48 GMT

_Version update only_

## 3.1.0

Tue, 29 Mar 2022 20:53:47 GMT

_Version update only_

## 3.0.3

Fri, 25 Mar 2022 15:10:02 GMT

_Version update only_

## 3.0.2

Thu, 10 Mar 2022 21:18:13 GMT

_Version update only_

## 3.0.1

Thu, 24 Feb 2022 15:26:55 GMT

_Version update only_

## 3.0.0

Mon, 24 Jan 2022 14:00:52 GMT

### Updates

- Upgrade target to ES2019 and deliver both a CommonJs and ESModule version of package
- rename contextId -> iTwinId
- rename to @itwin/presentation-components
- remove ClientRequestContext and its subclasses
- Clean up deprecated APIs
- Make property category grouping enabled by default.
- `usePresentationTreeNodeLoader`: Redesign the way tree component reloads when `enableHierarchyAutoUpdate` is set.
- Remove `IPresentationTreeDataProvider.loadHierarchy`.
- Fixed SameInstance nested properties bug when merged cells with multiple nested content items were not created properly.
- Created an additional nodeLoader used only when filtering Tree Component. That fixed the bug when spinner was not showing when filtering was in progress.
- Replace usage of I18N with generic Localization interface.
- Renamed an iModel's parent container to iTwin
- Removed deprecated `DEPRECATED_controlledTreeWithFilteringSupport` and `DEPRECATED_controlledTreeWithVisibleNodes`.
- Remove `immer` dependency.
- Ignore lint errors for deprecated Table component.
- Update to React 17.
- Created imodel-components folder & package and moved color, lineweight, navigationaids, quantity, timeline & viewport. Deprecated MessageSeverity in ui-core & added it ui-abstract. Added MessagePresenter interface to ui-abstract.
- Remove react 16 peer dependency.
- Update to latest types/react package
- Lock down and update version numbers so docs will build.

## 2.19.28

Wed, 12 Jan 2022 14:52:38 GMT

_Version update only_

## 2.19.27

Wed, 05 Jan 2022 20:07:20 GMT

_Version update only_

## 2.19.26

Wed, 08 Dec 2021 20:54:53 GMT

_Version update only_

## 2.19.25

Fri, 03 Dec 2021 20:05:49 GMT

_Version update only_

## 2.19.24

Mon, 29 Nov 2021 18:44:31 GMT

_Version update only_

## 2.19.23

Mon, 22 Nov 2021 20:41:40 GMT

_Version update only_

## 2.19.22

Wed, 17 Nov 2021 01:23:26 GMT

_Version update only_

## 2.19.21

Wed, 10 Nov 2021 10:58:24 GMT

_Version update only_

## 2.19.20

Fri, 29 Oct 2021 16:14:22 GMT

_Version update only_

## 2.19.19

Mon, 25 Oct 2021 16:16:25 GMT

_Version update only_

## 2.19.18

Thu, 21 Oct 2021 20:59:44 GMT

_Version update only_

## 2.19.17

Thu, 14 Oct 2021 21:19:43 GMT

_Version update only_

## 2.19.16

Mon, 11 Oct 2021 17:37:46 GMT

_Version update only_

## 2.19.15

Fri, 08 Oct 2021 16:44:23 GMT

_Version update only_

## 2.19.14

Fri, 01 Oct 2021 13:07:03 GMT

_Version update only_

## 2.19.13

Tue, 21 Sep 2021 21:06:40 GMT

_Version update only_

## 2.19.12

Wed, 15 Sep 2021 18:06:46 GMT

_Version update only_

## 2.19.11

Thu, 09 Sep 2021 21:04:58 GMT

_Version update only_

## 2.19.10

Wed, 08 Sep 2021 14:36:01 GMT

_Version update only_

## 2.19.9

Wed, 25 Aug 2021 15:36:01 GMT

_Version update only_

## 2.19.8

Mon, 23 Aug 2021 13:23:13 GMT

_Version update only_

## 2.19.7

Fri, 20 Aug 2021 17:47:22 GMT

_Version update only_

## 2.19.6

Tue, 17 Aug 2021 20:34:29 GMT

_Version update only_

## 2.19.5

Fri, 13 Aug 2021 21:48:09 GMT

_Version update only_

## 2.19.4

Thu, 12 Aug 2021 13:09:26 GMT

_Version update only_

## 2.19.3

Wed, 04 Aug 2021 20:29:34 GMT

_Version update only_

## 2.19.2

Tue, 03 Aug 2021 18:26:23 GMT

_Version update only_

## 2.19.1

Thu, 29 Jul 2021 20:01:11 GMT

_Version update only_

## 2.19.0

Mon, 26 Jul 2021 12:21:25 GMT

### Updates

- remove internal barrel-import usage

## 2.18.4

Tue, 10 Aug 2021 19:35:13 GMT

_Version update only_

## 2.18.3

Wed, 28 Jul 2021 17:16:30 GMT

_Version update only_

## 2.18.2

Mon, 26 Jul 2021 16:18:31 GMT

_Version update only_

## 2.18.1

Fri, 16 Jul 2021 17:45:09 GMT

_Version update only_

## 2.18.0

Fri, 09 Jul 2021 18:11:24 GMT

_Version update only_

## 2.17.3

Mon, 26 Jul 2021 16:08:36 GMT

_Version update only_

## 2.17.2

Thu, 08 Jul 2021 15:23:00 GMT

_Version update only_

## 2.17.1

Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0

Mon, 28 Jun 2021 16:20:11 GMT

### Updates

- Move `immer` from `devDependencies` into `dependencies`.
- `usePresentationTreeNodeLoader`: Fix change in props not being properly reflected when hierarchy auto-update is enabled.
- Updated table/DataProvider so that it would find sameInstance nested properties and extract their values/fields when needed.
- `usePropertyDataProviderWithUnifiedSelection`: Add selected element count to the return value.

## 2.16.10

Thu, 22 Jul 2021 20:23:45 GMT

_Version update only_

## 2.16.9

Tue, 06 Jul 2021 22:08:34 GMT

_Version update only_

## 2.16.8

Fri, 02 Jul 2021 17:40:46 GMT

_Version update only_

## 2.16.7

Mon, 28 Jun 2021 18:13:04 GMT

_Version update only_

## 2.16.6

Mon, 28 Jun 2021 13:12:55 GMT

_Version update only_

## 2.16.5

Fri, 25 Jun 2021 16:03:01 GMT

_Version update only_

## 2.16.4

Wed, 23 Jun 2021 17:09:07 GMT

_Version update only_

## 2.16.3

Wed, 16 Jun 2021 20:29:32 GMT

_Version update only_

## 2.16.2

Thu, 03 Jun 2021 18:08:11 GMT

_Version update only_

## 2.16.1

Thu, 27 May 2021 20:04:22 GMT

_Version update only_

## 2.16.0

Mon, 24 May 2021 15:58:39 GMT

### Updates

- Added ability to get diagnostics data when using presentation data providers (tree, property grid, table).
- Fix wrong colors being assigned to objects created using presentation rules
- Fix `PresentationPropertyDataProvider` not working after Presentation re-initialization
- Drop lodash dependency
- Fix nested fields' enum info not being carried to PropertyRecords
- Add `PresentationPropertyDataProvider.getPropertyRecordInstanceKeys` function to find keys of instance that is the source of given `PropertyRecord`.
- Sort categories and fields in table and property data providers based on priority and label rather than name.
- Release tags' review
- Set renderer and editor for deeply nested `PropertyRecord` instances.
- Add support for custom property category renderers.

## 2.15.6

Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5

Thu, 20 May 2021 15:06:26 GMT

_Version update only_

## 2.15.4

Tue, 18 May 2021 21:59:07 GMT

_Version update only_

## 2.15.3

Mon, 17 May 2021 13:31:38 GMT

_Version update only_

## 2.15.2

Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1

Wed, 05 May 2021 13:18:31 GMT

_Version update only_

## 2.15.0

Fri, 30 Apr 2021 12:36:58 GMT

### Updates

- Refactor the way presentation type of content is mapped to UI type of content. This is a more flexible approach and allowed to fix invalid properties display when an element had multiple aspects with categorized properties.
- Change hierarchy auto updating after iModel data changes to reload only nodes visible in the tree
- Disable hierarchy preloading
- Fix compatibility issue when multiple versions of `rxjs` are in use.

## 2.14.4

Thu, 22 Apr 2021 21:07:33 GMT

_Version update only_

## 2.14.3

Thu, 15 Apr 2021 15:13:16 GMT

_Version update only_

## 2.14.2

Thu, 08 Apr 2021 14:30:09 GMT

_Version update only_

## 2.14.1

Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0

Fri, 02 Apr 2021 13:18:42 GMT

### Updates

- Apply unified selection on newly created viewports
- Added expanded nodes tracking in trees using usePresentationTreeNodeLoader with enabled hierarchy auto update
- Changed `PresentationManager` to **not** set link information on created `PropertyRecords`. Default behavior should be handled by UI components. Custom behavior can be injected by overriding data providers that return the records.
- Always set `PropertyDescription.typename` to lowercase when creating content.
- Handle partial hierarchy updates without loosing tree state.

## 2.13.0

Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Fixed broken double angle bracket link syntax
- Updated to use TypeScript 4.1
- begin rename project from iModel.js to iTwin.js

## 2.12.3

Mon, 08 Mar 2021 15:32:00 GMT

_Version update only_

## 2.12.2

Wed, 03 Mar 2021 18:48:53 GMT

_Version update only_

## 2.12.1

Tue, 23 Feb 2021 20:54:45 GMT

_Version update only_

## 2.12.0

Thu, 18 Feb 2021 22:10:13 GMT

### Updates

- Ignore update records for unrelated iModels.
- Added IFilteredPresentationTreeDataProvider interface

## 2.11.2

Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1

Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0

Thu, 28 Jan 2021 13:39:27 GMT

### Updates

- Minimaly changed `FavoritePropertiesDataFilterer` interface, to match new `PropertyDataFiltererBase`, added some more `FavoritePropertiesDataFilterer` testing
- Add `InstanceKeyValueRenderer`.
- Updated PresentationLabelsProvider to send requests in batches
- Add class information to navigation properties
- Add `UnifiedSelectionContext`.

## 2.10.3

Fri, 08 Jan 2021 18:34:03 GMT

_Version update only_

## 2.10.2

Fri, 08 Jan 2021 14:52:02 GMT

_Version update only_

## 2.10.1

Tue, 22 Dec 2020 00:53:38 GMT

_Version update only_

## 2.10.0

Fri, 18 Dec 2020 18:24:01 GMT

### Updates

- Add support for custom property value renderers

## 2.9.9

Sun, 13 Dec 2020 19:00:03 GMT

_Version update only_

## 2.9.8

Fri, 11 Dec 2020 02:57:36 GMT

_Version update only_

## 2.9.7

Wed, 09 Dec 2020 20:58:23 GMT

_Version update only_

## 2.9.6

Mon, 07 Dec 2020 18:40:48 GMT

_Version update only_

## 2.9.5

Sat, 05 Dec 2020 01:55:56 GMT

_Version update only_

## 2.9.4

Wed, 02 Dec 2020 20:55:40 GMT

_Version update only_

## 2.9.3

Mon, 23 Nov 2020 20:57:56 GMT

_Version update only_

## 2.9.2

Mon, 23 Nov 2020 15:33:50 GMT

_Version update only_

## 2.9.1

Thu, 19 Nov 2020 17:03:42 GMT

_Version update only_

## 2.9.0

Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Fix property data provider including member-less structs and arrays into content

## 2.8.1

Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0

Fri, 23 Oct 2020 17:04:02 GMT

_Version update only_

## 2.7.6

Wed, 11 Nov 2020 16:28:23 GMT

_Version update only_

## 2.7.5

Fri, 23 Oct 2020 16:23:50 GMT

_Version update only_

## 2.7.4

Mon, 19 Oct 2020 17:57:02 GMT

_Version update only_

## 2.7.3

Wed, 14 Oct 2020 17:00:59 GMT

_Version update only_

## 2.7.2

Tue, 13 Oct 2020 18:20:39 GMT

_Version update only_

## 2.7.1

Thu, 08 Oct 2020 13:04:35 GMT

_Version update only_

## 2.7.0

Fri, 02 Oct 2020 18:03:32 GMT

### Updates

- Export `DEFAULT_PROPERTY_GRID_RULESET` as @beta
- Added filtering exports
- `ContentDataProvider` implementations now always use `DescriptorOverrides` when requesting content rather than switching between `DescriptorOverrides` and `Descriptor`. Simplifies the logic and makes the requests more efficient.

## 2.6.5

Sat, 26 Sep 2020 16:06:34 GMT

_Version update only_

## 2.6.4

Tue, 22 Sep 2020 17:40:07 GMT

_Version update only_

## 2.6.3

Mon, 21 Sep 2020 14:47:10 GMT

_Version update only_

## 2.6.2

Mon, 21 Sep 2020 13:07:44 GMT

_Version update only_

## 2.6.1

Fri, 18 Sep 2020 13:15:09 GMT

_Version update only_

## 2.6.0

Thu, 17 Sep 2020 13:16:12 GMT

### Updates

- Moved ESLint configuration to a plugin
- Addressed ESLint warnings in UI packages. Fixed react-set-state-usage rule. Allowing PascalCase for functions in UI packages for React function component names.
- Implemented favorite property filter.
- Added usePropertyDataProviderWithUnifiedSelection Hook

## 2.5.5

Wed, 02 Sep 2020 17:42:23 GMT

### Updates

- Update rxjs dependency version to `^6.6.2`

## 2.5.4

Fri, 28 Aug 2020 15:34:15 GMT

_Version update only_

## 2.5.3

Wed, 26 Aug 2020 11:46:00 GMT

_Version update only_

## 2.5.2

Tue, 25 Aug 2020 22:09:08 GMT

_Version update only_

## 2.5.1

Mon, 24 Aug 2020 18:13:04 GMT

_Version update only_

## 2.5.0

Thu, 20 Aug 2020 20:57:10 GMT

### Updates

- WIP: Update components' UI when rulesets, ruleset variables or iModel data changes.
- lock down @types/react version at 16.9.43 to prevent build error from csstype dependency
- Switch to ESLint
- Tree keyboard node selection & expansion

## 2.4.2

Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1

Fri, 07 Aug 2020 19:57:43 GMT

_Version update only_

## 2.4.0

Tue, 28 Jul 2020 16:26:24 GMT

_Version update only_

## 2.3.3

Thu, 23 Jul 2020 12:57:15 GMT

_Version update only_

## 2.3.2

Tue, 14 Jul 2020 23:50:36 GMT

_Version update only_

## 2.3.1

Mon, 13 Jul 2020 18:50:14 GMT

_Version update only_

## 2.3.0

Fri, 10 Jul 2020 17:23:14 GMT

### Updates

- geometry clip containment
- Fix useControlledTreeFiltering hook to react to dataProvider changes.
- Expose logger categories similar to how it's done in core
- Add ability to swap data source used by `PresentationTreeDataProvider`
- Add support for nested property categories. Can be enabled by setting `PresentationPropertyDataProvider.isNestedPropertyCategoryGroupingEnabled = true`

## 2.2.1

Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0

Fri, 19 Jun 2020 14:10:03 GMT

### Updates

- Set paging size for ContentDataProvider to avoid requesting whole content on first request
- BREAKING CHANGE: Change `PresentationTreeNodeLoaderProps` to derive from `PresentationTreeDataProviderProps`. This changes paging attribute name from `pageSize` to `pagingSize`.

## 2.1.0

Thu, 28 May 2020 22:48:59 GMT

### Updates

- Add ability to append grouping node children counts to their label
- Remove memoized values in TreeDataProvider when Ruleset variables changes
- Added ability for apps to display Favorite properties in Element Tooltip & Card at Cursor

## 2.0.0

Wed, 06 May 2020 13:17:49 GMT

### Updates

- Clean up deprecated APIs
- Change argument lists to props object
- Make all IPresentationDataProviders extend IDisposable
- Memoize just the last request instead of everything in presentation data providers
- Register localization namespace during Presentation frontend initialization
- PresentationPropertyDataProvider provides data having sorted favorite properties using FavoritePropertiesManager
- Separate tests from source
- Refatored UnifiedSelectionTreeEventHandler to use inheritance instead of composition
- Apply unified selection for modified tree nodes
- Made React functional component specifications consistent across UI packages
- Upgrade to Rush 5.23.2
- Moved Property classes and interfaces to ui-abstract package.
- Remove support for the iModel.js module system by no longer delivering modules.

## 1.14.1

Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0

Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0

Wed, 04 Mar 2020 16:16:31 GMT

### Updates

- Refatored UnifiedSelectionTreeEventHandler to use inheritance instead of composition

## 1.12.0

Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Fix nested content records being duplicated if all nested fields have their own category definitions
- PresentationTableDataProvider should create column for display label when display type is 'List'
- Ignore barrel file on docs processing
- Added nodeLoadHandler to usePresentationNodeLoader props
- Avoid handling whole tree model when handling model change event in UnifiedSelectionTreeEventHandler
- Set label and labelDefinition when creating PropertyData and TreeNodeItem

## 1.11.0

Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Create PropertyRecord to represent TreeNodeItem label if node's LabelDefinition is provided
- Upgrade to TypeScript 3.7.2.

## 1.10.0

Tue, 07 Jan 2020 19:44:01 GMT

### Updates

- Apply unified selection in ControlledTree after selection event is handled.

## 1.9.0

Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Exposed UnifiedSelectionTreeEventHandler and made it more customizable
- Handle newly introduced multi-ECInstance nodes
- Added a favorite property data provider.
- Make `rulesetId` for PropertyGridDataProvider optional
- Avoid duplicate `PropertyRecord` names when content has multiple `Field`s with the same name nested under different parent fields.
- No longer accessing this.state or this.props in setState updater - flagged by lgtm report
- Changed ControlledTree specific hooks and HOCs release tags to beta
- Adjusted UnifiedSelectionTreeEventHandler according changes to ControlledTree events
- Added useRulesetRegistration hook and refactores usePresentationNodeLoader hook

## 1.8.0

Fri, 22 Nov 2019 14:03:34 GMT

### Updates

- Fix property data provider failing to create data when content includes empty nested content values
- Tablet responsive UI
- Add usePresentationNodeLoader custom hook
- Added custom hook and HOC that adds filtering support to ControlledTree

## 1.7.0

Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Added logic to set the scope of Favorite Properties in DataProvider.
- Disable filtering of table columns created by PresentationTableDataProvider until the provider supports filtering
- Added useUnifiedSelection hook to enabled unified selection in ControlledTree

## 1.6.0

Wed, 09 Oct 2019 20:28:42 GMT

### Updates

- Fix broken `IPresentationTreeDataProvider` API by making `loadHierarchy` optional.
- Handle categorized fields inside nested content

## 1.5.0

Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- Implemented favorite properties logic in PresentationPropertyDataProvider
- Add a helper method `IPresentationTreeDataProvider.loadHierarchy()`
- Added autoExpand property to RelatedPropertiesSpecification and NestedContentField
- Add module descriptions
- Upgrade to TypeScript 3.6.2

## 1.4.0

Tue, 10 Sep 2019 12:09:49 GMT

_Version update only_

## 1.3.0

Tue, 13 Aug 2019 20:25:53 GMT

### Updates

- Fix invalid double display values in similar instances provider description
- Use the new `RulesetsFactory.createSimilarInstancesRulesetAsync` to produce 'similar instances' ruleset. Use type converters to calculate display values used in 'similar instances' provider description.
- Added test for ContentBuilder to verify that links property is set for nested PropertyRecord.
- Added checking for links in the ContentBuilder with tests for it.

## 1.2.0

Wed, 24 Jul 2019 11:47:26 GMT

_Version update only_

## 1.1.0

Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Reorganize docs script output
- Include `!lib/**/*.*css` in `.npmignore` for presentation-components to includes css files in `lib/module/prod`
- `treeWithFilteringSupport` HOC now sends the filtered data provider as the second parameter to `onFilterApplied` prop callback
- Moved the part that determines hilite set out of `presentation-components` to `presentation-frontend` and expose it as a public API.
- Clear tool selection set when models or categories are selected. Replace tool selection set with new selection when elements are selected.
- Always clear tool selection set when applying unified selection. If there're elements in logical selection, they're added to selection set afterwards.
- Do not clear selection set before replacing it - this causes unnecessary onChanged events
- Implement hiliting for selected subjects, models and categories
- Update to TypeScript 3.5
- Fix `autoExpand` flag not being set for `TreeNodeItem`s

## 1.0.0

Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Add transient element IDs from selection into hilite list when syncing
- Disable default hilite list syncing with tool selection set when using unified selection
- Set extended data when creating UI objects
- Change the way `TreeNodeItem` key is stored inside the object. Instead of using `extendedData`, now we use an undefined property on the `TreeNodeItem` itself. This should help us avoid the key being overwritten in the `extendedData` and makes `extendedData` usable for other purposes, e.g. storing some user's data.
- Add release tags
- Mark `ViewWithUnifiedSelectionProps.ruleset` as @alpha
- Improve warnings about unset `pagingSize` property

## 0.191.0

Mon, 13 May 2019 15:52:05 GMT

### Updates

- Added ViewportSelectionHandler to the barrel file
- Adds parameter for api-extractor to validate missing release tags
- Fix broken links
- Put sourcemap in npm package.
- Forward React.Ref from TreeWithUnifiedSelection HOC
- Fix marshaling class instances through RPC by removing use of Readonly
- Add APIs to retrieve instance labels
- Avoid making a backend request when we know there will be no content
- Do not load property grid data if more than 100 (configurable) elements are selected
- Fix a warning in `propertyGridWithUnifiedSelection` due to state being set after unmounting component
- Add `IPresentationTableDataProvider.getRowKey` method
- `viewWithUnifiedSelection` was refactored to only do 1 way synchronization: logical selection -> iModel hilite list
- Supply default presentation ruleset for the viewports hilite list when using the `viewWithUnifiedSelection` HOC
- Avoid making a descriptor request when requesting content for property grid and hilite list
- Require React & React-dom 16.8
- Remove IModelApp subclasses
- Temporarily disable hiliting model and category elements until a more performant way to do that exists
- Upgrade TypeDoc dependency to 0.14.2

## 0.190.0

Thu, 14 Mar 2019 14:26:49 GMT

### Updates

- Fix test scripts for unix systems
- Set `TreeNodeItem.icon` when initializing it from presentation `Node` object

## 0.189.0

Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Changes package.json to include api-extractor and adds api-extractor.json
- Use new buildIModelJsBuild script
- Exported ContentBuilder and ContentDataProvider
- Remove unneeded typedoc plugin dependency
- Expose presentation-specific content request methods through IContentDataProvider so they're available for provider consumers
- Save BUILD_SEMVER to globally accessible map
- Change `DataProvidersFactory.createSimilarInstancesTableDataProvider` to return data provider that also has a description
- Add DataProvidersFactory API for creating presentation data providers targeted towards specific use cases
- (breaking) Change PresentationTableDataProvider's constructor to accept a props object instead of multiple arguments
- Make all content data providers IDisposable. **Important:** providers must be disposed after use.
- Changed the way `0` selection level is handled in unified selection tables. Previously we used to reload table data when selection changed with level below boundary **or level `0`**. Now the **underlined** part is removed and we only reload data if selection changes with level below boundary (set through props).
- RPC Interface changes to optimize getting first page of nodes/content
- Move property definitions to imodeljs-frontend so they could be used by tools to define properties for tool settings.
- Upgrade to TypeScript 3.2.2

## 0.188.0

Wed, 16 Jan 2019 16:36:09 GMT

_Version update only_

## 0.187.0

Tue, 15 Jan 2019 15:18:59 GMT

_Version update only_

## 0.186.0

Mon, 14 Jan 2019 23:09:10 GMT

_Version update only_

## 0.185.0

Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0

Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Do not set optional TreeNodeItem properties if values match defaults
- Added interfaces for Property Pane and Table data providers.
- Changed 'connection' property name to 'imodel' in IPropertyDataProvider.
- Removed default exports in presentation-components.

## 0.183.0

Mon, 07 Jan 2019 21:49:21 GMT

_Version update only_

## 0.182.0

Mon, 07 Jan 2019 13:31:34 GMT

_Version update only_

## 0.181.0

Fri, 04 Jan 2019 13:02:40 GMT

_Version update only_

## 0.180.0

Wed, 02 Jan 2019 15:18:23 GMT

_Version update only_

## 0.179.0

Wed, 19 Dec 2018 18:26:14 GMT

### Updates

- Throttling for withUnifiedSelection(Viewport) - avoid handling intermediate selection changes
- Fix linter warnings

## 0.178.0

Thu, 13 Dec 2018 22:06:10 GMT

_Version update only_

## 0.177.0

Wed, 12 Dec 2018 17:21:31 GMT

### Updates

- Remove `selectionTarget` prop from `withUnifiedSelection(Tree)` - `SelectionTarget.Node` turned out to make no sense, so it got removed. Now the tree always works in `SelectionTarget.Instance` mode.
- Remove `selectedNodes` prop from `withUnifiedSelection(Tree)` - it makes no sense to allow specify selected nodes for a unified selection tree.
- Fix `withUnifiedSelection(Tree)` reloading on selection change to avoid `forceRefresh()` call.
- React to checkbox-related prop renames in ui-components

## 0.176.0

Mon, 10 Dec 2018 21:19:45 GMT

_Version update only_

## 0.175.0

Mon, 10 Dec 2018 17:08:55 GMT

_Version update only_

## 0.174.0

Mon, 10 Dec 2018 13:24:09 GMT

### Updates

- Remove unused dependencies, add `build:watch` script

## 0.173.0

Thu, 06 Dec 2018 22:03:29 GMT

_Version update only_

## 0.172.0

Tue, 04 Dec 2018 17:24:39 GMT

### Updates

- Changed index file name to match package name, eliminate subdirectory index files, decrease usage of default exports, change imports to use other packages' index file.

## 0.171.0

Mon, 03 Dec 2018 18:52:58 GMT

### Updates

- PropertyRecord of type Array now also returns itemsTypeName under value property.

## 0.170.0

Mon, 26 Nov 2018 19:38:42 GMT

### Updates

- PropertyRecord of type Array now also returns itemsTypeName under value property.

## 0.169.0

Tue, 20 Nov 2018 16:17:15 GMT

### Updates

- Rename withFilteringSupport props: onHighlightedCounted -> onMatchesCounted, activeHighlightedIndex -> activeMatchIndex

## 0.168.0

Sat, 17 Nov 2018 14:20:11 GMT

_Version update only_

## 0.167.0

Fri, 16 Nov 2018 21:45:44 GMT

_Version update only_

## 0.166.0

Mon, 12 Nov 2018 16:42:10 GMT

_Version update only_

## 0.165.0

Mon, 12 Nov 2018 15:47:00 GMT

### Updates

- Unified Selection: Fix selection change events being broadcasted indefinitely when multiple unified selection viewports are used

## 0.164.0

Thu, 08 Nov 2018 17:59:21 GMT

### Updates

- Deprecated dev-cors-proxy-server and use of it.
- Fix filtered tree rendering "0 matches found" when there's no filtering applied and data provider returns 0 nodes
- Updated to TypeScript 3.1
- React to Tree API changes

## 0.163.0

Wed, 31 Oct 2018 20:55:37 GMT

_Version update only_

## 0.162.0

Wed, 24 Oct 2018 19:20:07 GMT

### Updates

- Handle undefined structs and arrays

## 0.161.0

Fri, 19 Oct 2018 13:04:14 GMT

_Version update only_

## 0.160.0

Wed, 17 Oct 2018 18:18:38 GMT

_Version update only_

## 0.159.0

Tue, 16 Oct 2018 14:09:09 GMT

_Version update only_

## 0.158.0

Mon, 15 Oct 2018 19:36:09 GMT

_Version update only_

## 0.157.0

Sun, 14 Oct 2018 17:20:06 GMT

### Updates

- Fixing scripts for linux

## 0.156.0

Fri, 12 Oct 2018 23:00:10 GMT

### Updates

- Initial release
