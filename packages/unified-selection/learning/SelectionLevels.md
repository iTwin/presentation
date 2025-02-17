# Selection levels

By default, whenever a component changes unified selection, that happens at 0th (top) selection level. And similarly, whenever a component requests current selection from the storage, by default the top selection level is used. However, there are cases when we want to have multiple levels of selection.

For example, let's say there're 3 components: _A_, _B_ and _C_:

- _Component A_ shows a list of elements and allows selecting them.
- _Component B_ shows a list of elements selected in _Component A_ and allows selecting them individually. Selecting an individual element should not change selection in _Component A_ or content in _Component B_ itself.
- _Component C_ shows properties of elements selected either in _Component A_ or _Component B_.

The behavior described above can't be achieved using just one level of selection, because as soon as selection is made in _Component B_, that selection would get represented in _Component A_, and _Component B_ would change what it's displaying to the individual element.

That can be fixed by introducing another selection level, but before the components can be configured, here are a few key facts about selection levels:

- Higher level selection has lower index. So top level selection is 0, lower level is 1, and so on.
- Changing higher level selection clears all lower level selections.
- Lower level selection doesn't have to be a sub-set of higher level selection.

With that in mind, the above components _A_, _B_ and _C_ can be configured as follows:

- _Component A_ only cares about top level selection. Whenever something is selected in the component, unified selection is updated at the top level. Similarly, whenever unified selection changes, the component only reacts if that happened at the top level.
- _Component B_ reloads its content if the selection changes at the top level. Row selection is handled using lower level, so selecting a row doesn't affect _Component A's_ selection or _Component B's_ content.
- _Component C_ reloads its content no matter the selection level.
