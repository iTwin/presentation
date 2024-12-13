---
"@itwin/presentation-hierarchies-react": minor
"@itwin/unified-selection": minor
"@itwin/presentation-hierarchies": minor
"@itwin/presentation-components": minor
---

Prefer `Symbol.dispose` over `dispose` for disposable objects.

The package contained a number of types for disposable objects, that had a requirement of `dispose` method being called on them after they are no longer needed. In conjunction with the `using` utility from `@itwin/core-bentley`, usage of such objects looked like this:

```ts
class MyDisposable() {
  dispose() {
    // do some cleanup
  }
}
using(new MyDisposable(), (obj) => {
  // do something with obj, it'll get disposed when the callback returns
});
```

In version `5.2`, TypeScript [introduced](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management) `Disposable` type and `using` declarations (from the upcoming [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) feature in ECMAScript). Now we're making use of those new utilities in this package (while still supporting the old `dispose` method), which allows using `MyDisposable` from the above snippet like this:

```ts
using obj = new MyDisposable();
// do something with obj, it'll get disposed when it goes out of scope
```
