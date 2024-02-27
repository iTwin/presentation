---
"@itwin/presentation-components": major
---

Merged `PresentationInstanceFilterDialogProps.descriptor` and `PresentationInstanceFilterDialogProps.descriptorInputKeys` into single property `PresentationInstanceFilterDialogProps.propertiesSource`. This explicitly associates `Descriptor` with input keys. It provides more convenient API in case `Descriptor` is lazy loaded and input keys are known only after loading.

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
/>
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
