---
"@itwin/presentation-hierarchies-react": patch
---

Replaced `getIcons` with `getDecorations`. `getDecorations` takes in an array of callbacks that return an element, previously used `getIcons` should be used with kiwi provided `<Icon />` component.
