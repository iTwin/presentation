# Presentation

A monorepo for [Presentation](https://www.itwinjs.org/presentation/) packages.

## Development

### Building

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

### Debugging

Test-app is setup to be debugged using [Visual Studio Code](https://code.visualstudio.com/docs/editor/debugging). Frontend web server needs to be manually started before debug session:

```shell
pnpm start:frontend
```

After frontend webserver is started debug session can be started using provided configurations:

* `Test App (web)` for debugging web version of test-app.
* `Test App (electron)` for debugging electron version of test-app.

### Local development using `CoSpace`

For local development it is recommended to setup [`CoSpace`](https://www.npmjs.com/package/cospace). It provides a convenient way to link local versions of packages from other repositories like: [`itwinjs-core`](https://github.com/iTwin/itwinjs-core), [`appui`](https://github.com/iTwin/appui).

#### Getting started

1. Initialize `CoSpace`.

    ```shell
    npx cospace@latest init my-cospace
    ```

2. Clone all repos you want to link together under the `repos` sub directory. List of recommended repos to clone:

    * [presentation](https://github.com/iTwin/presentation)
    * [itwinjs-core](https://github.com/iTwin/itwinjs-core)
    * [appui](https://github.com/iTwin/appui)
    * [imodel-native](https://dev.azure.com/bentleycs/iModelTechnologies/_wiki/wikis/iModelTechnologies.wiki/308/Get-and-Build-Native-imodel02-Code?anchor=bootstrap-the-source)

3. Update the `pnpm-workspace.yaml` file with all the packages you want to add to your `CoSpace`. By default all packages under the `repos` sub directory will be added. Recommended configuration for linking presentation test-app with itwinjs-core

    ```yaml
    packages:
    - 'repos/presentation/apps/**'
    - 'repos/itwinjs-core/presentation/*'
    - 'repos/itwinjs-core/core/bentley'
    - 'repos/itwinjs-core/core/backend'
    - 'repos/itwinjs-core/core/common'
    - 'repos/itwinjs-core/core/frontend'
    - 'repos/itwinjs-core/core/geometry'
    - 'repos/itwinjs-core/core/quantity'
    - 'repos/itwinjs-core/core/telemetry'
    - 'repos/itwinjs-core/core/i18n'
    - 'repos/itwinjs-core/core/orbitgt'
    - 'repos/itwinjs-core/core/electron'
    - 'repos/itwinjs-core/core/express-server'
    - 'repos/itwinjs-core/core/webgl-compatibility'
    - 'repos/itwinjs-core/ui/appui-abstract'
    - 'repos/itwinjs-core/ui/core-react'
    - 'repos/itwinjs-core/ui/components-react'
    - 'repos/itwinjs-core/ui/imodel-components-react'
    - 'repos/itwinjs-core/tools/build'
    - 'repos/itwinjs-core/tools/eslint-plugin'
    - 'repos/itwinjs-core/tools/webpack-core'
    - 'repos/itwinjs-core/tools/internal'
    - 'repos/itwinjs-core/tools/certa'
    ```

4. Run `pnpm exec cospace override` to automatically update the `pnpm.overrides` section of the `CoSpace`'s `package.json`, to link all the dependencies together with the copy found in the workspace.

5. Run `pnpm install` to install all dependencies in your workspace and link all the packages you've added to your `CoSpace`.

6. Run `pnpm build` to build all the packages you've added to your `CoSpace` using your monorepo task runner.

#### Debugging code from linked repos

In order to debug packages from different repos using [`Visual Studio Code`](https://code.visualstudio.com/docs/editor/debugging) you will need launch configuration at your `CoSpace` root. Example configuration for debugging presentation test-app and locally built presentation packages from [itwinjs-core](https://github.com/iTwin/itwinjs-core) (you may need to adjust paths according your `CoSpace` setup):

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "[presentation-test-app] Start Web Backend",
            "skipFiles": [
                "<node_internals>/**"
            ],
            "cwd": "${workspaceFolder}/repos/presentation/apps/test-app/backend",
            "program": "${workspaceFolder}/repos/presentation/apps/test-app/backend/lib/main.js",
            "outFiles": [
                "${workspaceFolder}/repos/presentation/apps/test-app/{backend, common}/**/*.js",
                "${workspaceFolder}/repos/itwinjs-core/presentation/{backend, common}/**/*.js",
                "${workspaceFolder}/repos/itwinjs-core/core/{backend, common}/**/*.js",
                "!**/node_modules/**"
            ]
        },
        {
            "type": "chrome",
            "request": "launch",
            "name": "[presentation-test-app] Launch Web Frontend",
            "url": "http://localhost:3000/",
            "webRoot": "${workspaceFolder}/repos/presentation/apps/test-app/frontend",
            "sourceMapPathOverrides": {
                "webpack://@test-app/frontend/*": "${workspaceFolder}/repos/presentation/apps/test-app/frontend/*",
                "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/frontend/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/frontend/src/*.ts",
                "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/common/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/common/src/*.ts",
                "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/components/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/components/src/*.ts",
                // defaults
                "webpack:///./~/*": "${webRoot}/node_modules/*",
                "webpack:///./*":   "${webRoot}/*",
                "webpack:///*":     "*"
            }
        }
    ]
}
```
