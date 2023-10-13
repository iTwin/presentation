import "./ExtendedPropertiesWidget.css";

import { useCallback, useEffect, useState } from "react";
import { PropertiesWidget, PropertyGridQueryBuilderContextProps, PropertyGridQueryBuilderContextProvider, Props } from "./PropertiesWidget";
import { QueryBuilderDialog, QueryBuilderInput } from "./QueryBuilderDialog";

export function ExtendedPropertyGridWidget(props: Props) {
  const [isOpened, setIsOpen] = useState(false);

  const [inputs, setInputs] = useState<QueryBuilderInput[]>([]);
  const closeDialog = useCallback(() => setIsOpen(false), []);
  const [contextValue] = useState<PropertyGridQueryBuilderContextProps>(() => ({
    openQueryBuilder: () => {
      setIsOpen(true);
    },
    addToQueryBuilder: (descriptor, property) => {
      setInputs((prevInput) => {
        const hasInput =
          prevInput.findIndex((prev) => prev.descriptor.selectClasses[0].selectClassInfo.id === descriptor.selectClasses[0].selectClassInfo.id) !== -1;
        return hasInput ? prevInput : [...prevInput, { descriptor, property }];
      });
      setIsOpen(true);
    },
    removeFromQueryBuilder: (descriptor) => {
      setInputs((prevInputs) => {
        const newInputs = [...prevInputs].filter(
          (prev) => prev.descriptor.selectClasses[0].selectClassInfo.id !== descriptor.selectClasses[0].selectClassInfo.id,
        );
        return prevInputs.length === newInputs.length ? prevInputs : newInputs;
      });
    },
  }));

  useEffect(() => {
    setInputs([]);
  }, [props.imodel]);

  return (
    <>
      {isOpened ? <QueryBuilderDialog imodel={props.imodel} onClose={closeDialog} inputs={inputs} /> : null}
      <PropertyGridQueryBuilderContextProvider contextValue={contextValue}>
        <PropertiesWidget {...props} />
      </PropertyGridQueryBuilderContextProvider>
    </>
  );
}
