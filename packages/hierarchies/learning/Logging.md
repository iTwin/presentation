# Logging

The `@itwin/presentation-hierarchies` package uses [logging API from `@itwin/presentation-shared` package](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#logging) and provides a way to supply logger implementation through the `setLogger` function (by default, a no-op logger is used). It's anticipated that in most cases the consumers will want to forward all logging to `Logger` from `@itwin/core-bentley`:

<!-- [[include: [Presentation.Hierarchies.Logging.Imports, Presentation.Hierarchies.Logging.ForwardingLogsToCoreBentleyLogger], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { Logger } from "@itwin/core-bentley";
import { createLogger } from "@itwin/presentation-core-interop";
import { setLogger } from "@itwin/presentation-hierarchies";

// create a logger that forwards all logs to Logger from @itwin/core-bentley
const logger = createLogger(Logger);
// set the logger for use by @itwin/presentation-hierarchies
setLogger(logger);
```

<!-- END EXTRACTION -->

However, consumers may also want to use their own logger. For example, the following code creates a logger that logs messages to console with a timestamp:

<!-- [[include: [Presentation.Hierarchies.Logging.CreatingCustomLogger], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import type { ILogger, LogLevel } from "@itwin/presentation-shared";

export const LOGGER: ILogger = {
  isEnabled: (_category: string, level: LogLevel) => {
    return level === "error";
  },
  logError: (category: string, message: string) => console.log(createLogMessage("error", category, message)),
  logWarning: (category: string, message: string) => console.log(createLogMessage("warning", category, message)),
  logInfo: (category: string, message: string) => console.log(createLogMessage("info", category, message)),
  logTrace: (category: string, message: string) => console.log(createLogMessage("trace", category, message)),
};

function createLogMessage(severity: LogLevel, category: string, message: string) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
  return `[${timeStr}] ${severity.toUpperCase().padEnd(7)} | ${category} | ${message}`;
}
```

<!-- END EXTRACTION -->

## Logging categories

All logging functions take a category and a message. Below is a list of logging categories, used by the package, that may be useful in diagnosing common problems:

| Logging namespace                               | Usage                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Presentation.Hierarchies`                      | The root logging category used by the package, subscribing to this category will return all logs. |
| `Presentation.Hierarchies.Performance`          | A root logging category used for reporting all performance-related logs.                          |
| `Presentation.Hierarchies.Provider`             | A logging category used by `HierarchyProvider`.                                                   |
| `Presentation.Hierarchies.Performance.Provider` | A logging category used by `HierarchyProvider` for emitting performance-related logs.             |
| `Presentation.Hierarchies.Queries`              | A logging category used for logging all executed ECSQL queries.                                   |
| `Presentation.Hierarchies.Performance.Queries`  | A logging category used for reporting performance of executed ECSQL queries.                      |
