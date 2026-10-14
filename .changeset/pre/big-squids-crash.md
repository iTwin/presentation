---
"@itwin/presentation-shared": patch
---

Fix `Event` type to prohibit being assigned an event with no-argument listener (unless the target event uses a no-argument listener).

Now TS will complain about the following assignment, which it previously allowed:

```ts
const noArg: Event<() => void> = {} as any;
const withArg: Event<(arg: number) => void> = noArg; // TS didn't complain, but it does
```
