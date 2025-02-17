# Selection scopes

Selection scopes allow decoupling of what gets picked and what gets selected. Without selection scopes, whenever a user picks an element in the viewport, its ID goes straight into unified selection storage. With selection scopes we can modify that and add something different. The input to the selection scopes' processor is a query executor, element IDs, and the scope to apply, and the output is an iterator of `SelectableInstanceKey`. We get the input when the user picks some elements in the viewport, run that through the selection scope processor and put the output into unified selection storage.

Here are the scopes we support at the moment:

- `element` - return key of selected element.
- `category` - return key of geometric element's category.
- `model` - return key of element's model.
- `functional` - return key of element's related functional element. For `BisCore.GeometricElement3d` the related functional element is found using the `Functional.PhysicalElementFulfillsFunction` relationship. For `BisCore.GeometricElement2d` the nearest functional element is searched for using the `Functional.DrawingGraphicRepresentsFunctionalElement` relationship - if the given element has a related functional element, it will be returned, otherwise the element's parent will be checked and if it also does not have a related functional, then the parent of the parent will be checked until no more ancestors can be traversed or a functional element is found. Regardless whether it is an `BisCore.GeometricElement2d` or `BisCore.GeometricElement3d` if no functional element is found then the element itself will be returned.

The `element` and `functional` scopes also support specifying an `ancestorLevel` property, which specifies how far "up" we should walk to find the target element. When not specified or `0`, the target element matches the request element. When set to `1`, the target element matches the direct parent element. When set to `2`, the target element is parent of the parent element and so on. In all situations when this is `> 0`, we're not walking further than the last existing element, for example when `ancestorLevel = 1` (direct parent element is requested), but the request element doesn't have a parent, the request element is returned as the result. A negative value would result in the top-most element to be returned.

The `@itwin/unified-selection` package delivers a `computeSelection` function for computing which elements should be added into unified selection storage based on the given element ID's and a specified selection scope:

```ts
import { computeSelection } from "@itwin/unified-selection";
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
const queryExecutor = createECSqlQueryExecutor(imodel);
const selection = computeSelection({ queryExecutor, elementIds, scope: "element" });
```

`element` and `functional` scopes additionally allow selecting assembly elements by specifying the `ancestorLevel` property in the selection scope argument of `computeSelection` function. The `ancestorLevel` property specifies how far "up" we should walk to find the target element. When not specified or `0`, the target element matches the request element. When set to `1`, the target element matches the direct parent element. When `2`, the target element is the parent of the parent element, and so on. In all situations when this is `> 0`, we're not walking further than the last existing element, for example, when `ancestorLevel = 1` (direct parent element is requested), but the request element doesn't have a parent, the request element is returned as the result. A negative value would result in the top-most element to be returned.

For the `functional` scope, the `ancestorLevel` property is used as follows: if an element is a `BisCore.GeometricElement3d` element, its ancestor is selected based on the given `ancestorLevel` the same as with non-functional elements, and then the resulting element's related functional element will be returned (using the `Functional.PhysicalElementFulfillsFunction` relationship), or if it does not have one, then the resulting element will be returned. For `BisCore.GeometricElement2d` elements, the nearest related functional element is found in the same way it is done when the `ancestorLevel` property is not provided, and then the ancestor of that element is returned (based on the provided value of `ancestorLevel`).

```ts
import { computeSelection } from "@itwin/unified-selection";
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

const queryExecutor = createECSqlQueryExecutor(imodel);

// Returns the parent element, or the element itself if it does not have a parent, for each element specified in `elementIds` argument.
const selection = computeSelection({ queryExecutor, elementIds, scope: { id: "element", ancestorLevel: 1 } });
```
