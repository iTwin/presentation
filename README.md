# Presentation

A monorepo for [Presentation](https://www.itwinjs.org/presentation/) packages.

## Build instructions

1. Install dependencies.

    ```shell
    pnpm install
    ```

2. Build packages.

    ```shell
    pnpm build
    ```

3. Start test-app.

    3.1 Web version of test-app.

    ```shell
    pnpm start:web
    ```

    3.2. Electron version of test-app.

    ```shell
    pnpm start:electron
    ```

## Debugging

Test-app is setup to be debugged using [Visual Studio Code](https://code.visualstudio.com/docs/editor/debugging). Frontend web server needs to be manually started before debug session:

```shell
pnpm start:frontend
```

After frontend webserver is started debug session can be started using provided configurations:

* `Test App (web)` for debugging web version of test-app.
* `Test App (electron)` for debugging electron version of test-app.
