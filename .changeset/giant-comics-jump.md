---
"@itwin/presentation-shared": minor
---

Added an utility `ECSql.createInstanceKeySelector` function to simplify selecting `InstanceKey` objects.

Example usage:

```ts
const reader = queryExecutor.createQueryReader({
  ecsql: `
    SELECT ${ECSql.createInstanceKeySelector("el")} key
    FROM bis.Element el
  `,
});
for await (const row of reader) {
  const instanceKey: InstanceKey = JSON.parse(row.key);
  // do something with instanceKey
}
```
