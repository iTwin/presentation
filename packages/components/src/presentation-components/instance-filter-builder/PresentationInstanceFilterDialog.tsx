/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import "./PresentationInstanceFilterDialog.scss";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { BuildFilterOptions, usePropertyFilterBuilder } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SvgError } from "@itwin/itwinui-illustrations-react";
import { Button, Dialog, NonIdealState, ProgressRadial } from "@itwin/itwinui-react";
import { Descriptor, Keys } from "@itwin/presentation-common";
import { translate, useDelay } from "../common/Utils";
import { InstanceFilterBuilder, usePresentationInstanceFilteringProps } from "./InstanceFilterBuilder";
import { PresentationInstanceFilterInfo } from "./PresentationFilterBuilder";
import { PresentationInstanceFilter } from "./PresentationInstanceFilter";
import { filterRuleValidator, isFilterNonEmpty } from "./Utils";

/**
 * Props for [[PresentationInstanceFilterDialog]] component.
 * @beta
 */
export interface PresentationInstanceFilterDialogProps {
  /** iModel connection to pull data from. */
  imodel: IModelConnection;
  /** Specifies how deep rule groups can be nested. */
  ruleGroupDepthLimit?: number;
  /** Specifies whether dialog is open or not. */
  isOpen: boolean;
  /** Callback that is invoked when 'Apply' button is clicked. */
  onApply: (filter?: PresentationInstanceFilterInfo) => void;
  /** Callback that is invoked when 'Close' button is clicked or dialog is closed. */
  onClose?: () => void;
  /** Callback that is invoked when 'Reset' button is clicked. */
  onReset?: () => void;
  /** Renderer that will be used to render a custom toolbar instead of the default one. */
  toolbarButtonsRenderer?: (toolbarHandlers: FilteringDialogToolbarHandlers) => ReactNode;
  /**
   * [Descriptor]($presentation-common) that will be used in [[InstanceFilterBuilder]] component rendered inside this dialog.
   *
   * This property can be set to function in order to lazy load [Descriptor]($presentation-common) when dialog is opened.
   */
  descriptor: (() => Promise<Descriptor>) | Descriptor;
  /** Renders filter results count. */
  filterResultsCountRenderer?: (filter: PresentationInstanceFilterInfo) => ReactNode;
  /**
   * [Keys]($presentation-common) of filterables on which the filter was called.
   *
   * These keys should match the keys that were used to create the descriptor.
   */
  descriptorInputKeys?: Keys;
  /** Dialog title. */
  title?: React.ReactNode;
  /** Initial filter that will be show when component is mounted. */
  initialFilter?: PresentationInstanceFilterInfo;
}

/**
 * Set of action handlers that are passed to [[PresentationInstanceFilterDialogProps.toolbarButtonsRenderer]] for rendering custom buttons.
 * @beta
 */
export interface FilteringDialogToolbarHandlers {
  handleApply: () => void;
  handleClose: () => void;
  handleReset: () => void;
}

/**
 * Dialog component that renders [[InstanceFilterBuilder]] inside.
 * @beta
 */
export function PresentationInstanceFilterDialog(props: PresentationInstanceFilterDialogProps) {
  const { isOpen, title, ...restProps } = props;

  return (
    <Dialog
      className="presentation-instance-filter-dialog"
      isOpen={isOpen}
      onClose={props.onClose}
      closeOnEsc={false}
      preventDocumentScroll={true}
      trapFocus={true}
      isDraggable
      isResizable
    >
      <Dialog.Backdrop />
      <Dialog.Main className="presentation-instance-filter-dialog-content-container">
        <Dialog.TitleBar className="presentation-instance-filter-title" titleText={title ? title : translate("instance-filter-builder.filter")} />
        <ErrorBoundary fallback={<ErrorState />}>
          <FilterDialogContent {...restProps} />
        </ErrorBoundary>
      </Dialog.Main>
    </Dialog>
  );
}

type FilterDialogContentProps = Omit<PresentationInstanceFilterDialogProps, "isOpen" | "title">;

function FilterDialogContent({ descriptor, ...restProps }: FilterDialogContentProps) {
  const loadedDescriptor = useDelayLoadedDescriptor(descriptor);
  if (!loadedDescriptor) {
    return <DelayedCenteredProgressRadial />;
  }

  return <LoadedFilterDialogContent {...restProps} descriptor={loadedDescriptor} />;
}

function useDelayLoadedDescriptor(descriptorOrGetter: Descriptor | (() => Promise<Descriptor>)) {
  const [descriptor, setDescriptor] = useState<Descriptor | undefined>(() => (descriptorOrGetter instanceof Descriptor ? descriptorOrGetter : undefined));

  useEffect(() => {
    let disposed = false;

    if (descriptorOrGetter instanceof Descriptor) {
      setDescriptor(descriptorOrGetter);
    } else {
      const updateState = (...params: Parameters<typeof setDescriptor>) => {
        // istanbul ignore else
        if (!disposed) {
          setDescriptor(...params);
        }
      };

      void (async () => {
        try {
          const newDescriptor = await descriptorOrGetter();
          updateState(newDescriptor);
        } catch (error) {
          updateState(() => {
            // throw error in setSate callback for it to be caught by ErrorBoundary
            throw error;
          });
        }
      })();
    }

    return () => {
      disposed = true;
    };
  }, [descriptorOrGetter]);

  return descriptor;
}

interface LoadedFilterDialogContentProps extends Omit<PresentationInstanceFilterDialogProps, "isOpen" | "title" | "descriptor"> {
  descriptor: Descriptor;
  descriptorInputKeys?: Keys;
}

function LoadedFilterDialogContent(props: LoadedFilterDialogContentProps) {
  const {
    initialFilter,
    descriptor,
    imodel,
    ruleGroupDepthLimit,
    filterResultsCountRenderer,
    descriptorInputKeys,
    onApply,
    onReset,
    onClose,
    toolbarButtonsRenderer,
  } = props;
  const [initialPropertyFilter] = useState(() => {
    if (!initialFilter) {
      return undefined;
    }
    return PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, initialFilter.filter);
  });

  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({
    initialFilter: initialPropertyFilter,
    ruleValidator: filterRuleValidator,
  });

  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);
  const getFilterInfo = useCallback(
    (options?: BuildFilterOptions) => {
      const filter = buildFilter(options);
      if (!filter) {
        return undefined;
      }
      const presentationInstanceFilter = PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter);
      return { filter: presentationInstanceFilter, usedClasses: filteringProps.selectedClasses };
    },
    [buildFilter, descriptor, filteringProps.selectedClasses],
  );

  const handleReset = () => {
    filteringProps.selectedClasses = [];
    filteringProps.onSelectedClassesChanged([]);
    actions.removeAllItems();
    onReset && onReset();
  };

  const onSelectedClassesChanged = (classIds: string[]) => {
    filteringProps.onSelectedClassesChanged(classIds);
    actions.removeAllItems();
  };

  const throwError = useThrowError();
  const handleApply = () => {
    try {
      const result = getFilterInfo();

      // we need to check whether the filter was invalid or empty.
      if (result === undefined && isFilterNonEmpty(rootGroup)) {
        return;
      }
      onApply(result);
    } catch (error) {
      throwError(error);
    }
  };

  const handleClose = () => {
    onClose && onClose();
  };

  return (
    <>
      <Dialog.Content className="presentation-instance-filter-content">
        <InstanceFilterBuilder
          {...filteringProps}
          onSelectedClassesChanged={onSelectedClassesChanged}
          rootGroup={rootGroup}
          actions={actions}
          ruleGroupDepthLimit={ruleGroupDepthLimit}
          imodel={imodel}
          descriptor={descriptor}
          descriptorInputKeys={descriptorInputKeys}
        />
      </Dialog.Content>
      <div className="presentation-instance-filter-dialog-bottom-container">
        <div>{filterResultsCountRenderer ? <ResultsRenderer buildFilter={getFilterInfo} renderer={filterResultsCountRenderer} /> : null}</div>
        <Dialog.ButtonBar className="presentation-instance-filter-button-bar">
          {toolbarButtonsRenderer ? (
            toolbarButtonsRenderer({ handleApply, handleReset, handleClose })
          ) : (
            <ToolbarButtonsRenderer handleApply={handleApply} handleReset={handleReset} handleClose={handleClose}></ToolbarButtonsRenderer>
          )}
        </Dialog.ButtonBar>
      </div>
    </>
  );
}

function ToolbarButtonsRenderer({ handleApply, handleClose, handleReset }: FilteringDialogToolbarHandlers) {
  return (
    <>
      <Button className="presentation-instance-filter-dialog-apply-button" styleType="high-visibility" onClick={handleApply}>
        {translate("instance-filter-builder.apply")}
      </Button>
      <Button className="presentation-instance-filter-dialog-close-button" onClick={handleClose}>
        {translate("instance-filter-builder.cancel")}
      </Button>
      <Button className="presentation-instance-filter-dialog-reset-button" onClick={handleReset}>
        {translate("instance-filter-builder.reset")}
      </Button>
    </>
  );
}

interface ResultsRendererProps {
  buildFilter: (options?: BuildFilterOptions) => PresentationInstanceFilterInfo | undefined;
  renderer: (filter: PresentationInstanceFilterInfo) => ReactNode;
}

function ResultsRenderer({ buildFilter, renderer }: ResultsRendererProps) {
  const filter = useMemo(() => buildFilter({ ignoreErrors: true }), [buildFilter]);
  if (!filter) {
    return null;
  }
  return <>{renderer(filter)}</>;
}

function DelayedCenteredProgressRadial() {
  const show = useDelay();

  if (!show) {
    return null;
  }

  return (
    <div className="presentation-instance-filter-dialog-progress">
      <ProgressRadial indeterminate={true} size="large" />
    </div>
  );
}

function ErrorState() {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <NonIdealState svg={<SvgError />} heading={translate("general.error")} description={translate("general.generic-error-description")} />
    </div>
  );
}

// ErrorBoundary only catches errors that are thrown in React lifecycle methods. For event handlers and
// async function errors can be rethrown from `setState` callback.
function useThrowError() {
  const [_, setSate] = useState({});
  return (error: unknown) => {
    setSate(() => {
      throw error;
    });
  };
}
