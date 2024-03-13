import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { Key } from "@itwin/presentation-common";

interface UnifiedSelectionContext {
  has: (keys: Key[]) => boolean;
  add: (keys: Key[]) => void;
  remove: (keys: Key[]) => void;
}

const unifiedSelectionContext = createContext<UnifiedSelectionContext>({
  has: () => false,
  add: () => {},
  remove: () => {},
});

/** @beta */
export interface EventLike<TArgs> {
  addListener: (listener: (args: TArgs) => void) => () => void;
}

/** @beta */
export interface UnifiedSelectionContainer {
  add: (keys: Key[]) => void;
  remove: (keys: Key[]) => void;
  has: (keys: Key[]) => boolean;
}

/** @beta */
export interface UnifiedSelectionStore {
  onChange: EventLike<UnifiedSelectionContainer>;
  container: UnifiedSelectionContainer;
}

interface Props {
  store: UnifiedSelectionStore;
}

/** @beta */
export function UnifiedSelectionContextProvider({ store, children }: PropsWithChildren<Props>) {
  const [value, setValue] = useState<UnifiedSelectionContext>({
    has: (keys) => store.container.has(keys),
    add: (keys) => store.container.add(keys),
    remove: (keys) => store.container.remove(keys),
  });

  useEffect(() => {
    return store.onChange.addListener((container) => {
      setValue({
        has: (keys) => container.has(keys),
        add: (keys) => container.add(keys),
        remove: (keys) => container.remove(keys),
      });
    });
  }, [store]);

  return <unifiedSelectionContext.Provider value={value}>{children}</unifiedSelectionContext.Provider>;
}

/** @internal */
export function useUnifiedSelectionContext() {
  return useContext(unifiedSelectionContext);
}
