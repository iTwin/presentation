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

#### Full Models tree load

The scenario simulates 10 users simultaneously fully loading the Models Tree hierarchy. Each user waits 100 after making a request, requests are made in random order.

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

   3.3 `npm start`.

## Output

The test output looks like this:

```txt
http.codes.200: ................................................................ 20183
http.request_rate: ............................................................. 60/sec
http.requests: ................................................................. 20183
http.response_time:
  min: ......................................................................... 8
  max: ......................................................................... 5019
  median: ...................................................................... 18
  p95: ......................................................................... 242.3
  p99: ......................................................................... 561.2
http.responses: ................................................................ 20183
vusers.completed: .............................................................. 10
vusers.created: ................................................................ 10
vusers.created_by_name.Full Models Tree: ....................................... 10
vusers.failed: ................................................................. 0
vusers.session_length:
  min: ......................................................................... 320781.1
  max: ......................................................................... 333165.9
  median: ...................................................................... 331165.6
  p95: ......................................................................... 331165.6
  p99: ......................................................................... 331165.6
```
