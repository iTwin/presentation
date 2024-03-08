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

export interface EventLike<TArgs> {
  addListener: (listener: (args: TArgs) => void) => () => void;
}

export interface UnifiedSelectionContainer {
  add: (keys: Key[]) => void;
  remove: (keys: Key[]) => void;
  has: (keys: Key[]) => boolean;
}

export interface UnifiedSelectionStore {
  onChange: EventLike<UnifiedSelectionContainer>;
}

interface Props {
  store: UnifiedSelectionStore;
}

export function UnifiedSelectionContextProvider({ store, children }: PropsWithChildren<Props>) {
  const [value, setValue] = useState<UnifiedSelectionContext>({
    has: () => false,
    add: () => {},
    remove: () => {},
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

export function useUnifiedSelectionContext() {
  return useContext(unifiedSelectionContext);
}
