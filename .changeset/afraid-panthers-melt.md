---
"@itwin/presentation-shared": minor
---

Added a number of mapped types:

- `Props<TFunc>` obtains the type of the first `TFunc` function argument.

   ```ts
  function func(props: { x: number, y: string }) {
    // ...
  }
  type FunctionProps = Props<typeof func>; // { x: number, y: string }
   ```

- `EventListener<TEvent>` obtains the event listener type of given event type.

   ```ts
   type MyEvent = Event<(arg: number) => void>;
   type MyEventListener = EventListener<MyEvent>; // (arg: number) => void
   ```

- `EventArgs<TEvent>` obtains the type of the first event listener's argument of given event type.

   ```ts
   type MyEvent = Event<(arg: { x: number, y: string }) => void>;
   type MyEventArgs = EventArgs<MyEvent>; // { x: number, y: string }
   ```
