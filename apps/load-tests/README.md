# Presentation load tests

## Backend

The backend is a very simplistic web backend set up to handle incoming iTwin.js RPC requests at `http://localhost:3001`.

### Configuration

The backend may be configured through environment variables:

- `PROCESS_COUNT` specifies how many worker processes should be started. Default is `1`. The purpose of this configuration option is to allow replicating scaling.

- `SHARE_CACHES` specifies whether the backend worker processes should share file-based caches, e.g. the hierarchy cache. Default is `false`. The purpose of this configuration option is to simulate either co-located backend instances that can share file-based caches or distant ones, that have unique caches.

## Tests

The test runner uses [artillery](https://www.artillery.io/) to initiate requests. The tool sends HTTP requests to the running local backend using our supplied scenario(s) on the list of our supplied iModels.

### Datasets

The scenarios we currently have load the datasets from the `{load-tests}/tests/scenarios/datasets.csv` file, which lists paths to all tested iModels in a column, e.g.:

```csv
/full/path/to/my/imodel1.bim
/full/path/to/my/other/imodel.bim
```

### Test scenarios

All scenarios, by default, are configured to simulate 1 user. They can be modified to simulate multiple users by editing one of the scenario configurations at `{load-tests}/tests/scenarios` directory.

#### Full Models tree load - native implementation

The scenario simulates 1 user fully loading the Models Tree hierarchy using the `PresentationRpcInterface-getNodes` RPC calls to our native presentation manager.

Script to run the scenario: `npm run start:full-models-tree`.

#### Full Models tree load - stateless implementation

The scenario simulates 1 user fully loading the Models Tree hierarchy using the `@itwin/presentation-hierarchy-builder` package that makes `IModelReadRpcInterface-queryRows` RPC calls to execute ECSQL queries.

Script to run the scenario: `npm run start:full-models-tree-stateless`.

#### Initial Models tree load - native implementation

The scenario simulates 1 user loading 2 first levels of the Models Tree hierarchy using the `PresentationRpcInterface-getNodes` RPC calls to our native presentation manager.

Script to run the scenario: `npm run start:initial-models-tree`.

#### Initial Models tree load - stateless implementation

The scenario simulates 1 user loading 2 first levels of Models Tree hierarchy using the `@itwin/presentation-hierarchy-builder` package that makes `IModelReadRpcInterface-queryRows` RPC calls to execute ECSQL queries.

Script to run the scenario: `npm run start:initial-models-tree-stateless`.

## Usage

Typical test running scenario:

1. Specify datasets to use in `{load-tests}/tests/scenarios/datasets.csv`.

2. Start the backend:

   2.1. Open a console window for the backend.

   2.2. `cd` to `{load-tests}/backend`.

   2.3. Set [configuration variables](#configuration).

   2.4 `npm start`.

3. Run the tests:

   3.1. Open a console window for the test runner.

   3.2. `cd` to `{load-tests}/tests`.

   3.3 Run one of the scenario scripts, e.g. `npm run start:initial-models-tree-stateless`.

## Output

The test output looks like this:

```txt
full-load-BayTownProcessPlant.bim:
  min: ......................................................................... 1914
  max: ......................................................................... 1914
  mean: ........................................................................ 1914
  median: ...................................................................... 1901.1
  p95: ......................................................................... 1901.1
  p99: ......................................................................... 1901.1
http.request_rate: ............................................................. 366/sec
http.requests: ................................................................. 911
http.response_time:
  min: ......................................................................... 2
  max: ......................................................................... 115
  mean: ........................................................................ 17.9
  median: ...................................................................... 13.1
  p95: ......................................................................... 71.5
  p99: ......................................................................... 92.8
itwin.nodes_request:
  min: ......................................................................... 0
  max: ......................................................................... 918
  mean: ........................................................................ 223.4
  median: ...................................................................... 1
  p95: ......................................................................... 837.3
  p99: ......................................................................... 889.1
itwin.query_rows.requests: ..................................................... 902
itwin.query_rows.response_time:
  min: ......................................................................... 3
  max: ......................................................................... 115
  mean: ........................................................................ 17.9
  median: ...................................................................... 13.1
  p95: ......................................................................... 71.5
  p99: ......................................................................... 92.8
itwin.schema_json.requests: .................................................... 9
itwin.schema_json.response_time:
  min: ......................................................................... 2
  max: ......................................................................... 72
  mean: ........................................................................ 23.7
  median: ...................................................................... 16.9
  p95: ......................................................................... 58.6
  p99: ......................................................................... 58.6
vusers.completed: .............................................................. 1
vusers.created: ................................................................ 1
vusers.created_by_name.Full Models Tree (stateless): ........................... 1
vusers.failed: ................................................................. 0
vusers.session_length:
  min: ......................................................................... 1918
  max: ......................................................................... 1918
  mean: ........................................................................ 1918
  median: ...................................................................... 1901.1
  p95: ......................................................................... 1901.1
  p99: ......................................................................... 1901.1
```
