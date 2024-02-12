window.BENCHMARK_DATA = {
  "lastUpdate": 1707741923916,
  "repoUrl": "https://github.com/iTwin/presentation",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "name": "Grigas",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "1f1e8cdd0b3d4f823df8ca18be42ed535d498f35",
          "message": "Allow manually dispatching perf benchmark workflow (#335)",
          "timestamp": "2023-11-10T15:13:01Z",
          "url": "https://github.com/iTwin/presentation/commit/1f1e8cdd0b3d4f823df8ca18be42ed535d498f35"
        },
        "date": 1699629287456,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 361,
            "unit": "ms",
            "extra": "min: 361\nmax: 361\ncount: 1\nmean: 361\np50: 361.5\nmedian: 361.5\np75: 361.5\np90: 361.5\np95: 361.5\np99: 361.5\np999: 361.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1845,
            "unit": "ms",
            "extra": "min: 1845\nmax: 1845\ncount: 1\nmean: 1845\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "eff3091248199449d86772d450324c1888de7d8e",
          "message": "Stop exposing internal APIs (#348)\n\n* Cleanup `@internal` APIs from `presentation-testing` barrel\r\n\r\n* Cleanup `@internal` APIs from `presentation-components` barrel\r\n\r\n* Fix `@internal` detection script to allow non-root level `@internal` APIs\r\n\r\n* Some renames to get creating root level API exports summary working\r\n\r\n* changeset",
          "timestamp": "2023-11-22T14:40:49Z",
          "tree_id": "eb5ec2d809132c48e55073247040df877cabc327",
          "url": "https://github.com/iTwin/presentation/commit/eff3091248199449d86772d450324c1888de7d8e"
        },
        "date": 1700664136600,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 409,
            "unit": "ms",
            "extra": "min: 409\nmax: 409\ncount: 1\nmean: 409\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1793,
            "unit": "ms",
            "extra": "min: 1793\nmax: 1793\ncount: 1\nmean: 1793\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3a212a51d635264a663bfccc8b8a099ca7f28ce3",
          "message": "Add localization to core-interop and hierarchy-builder packages (#349)\n\n* Add localization\r\n\r\n* Add changeset\r\n\r\n* Add eslint disable\r\n\r\n* Resolve comments\r\n\r\n* Add test for 100% coverage\r\n\r\n* Remove unused export\r\n\r\n* Run extract api",
          "timestamp": "2023-11-23T08:32:25Z",
          "tree_id": "04f1a50addbeb58bc85a59d6c74bbe4951b95f24",
          "url": "https://github.com/iTwin/presentation/commit/3a212a51d635264a663bfccc8b8a099ca7f28ce3"
        },
        "date": 1700728411197,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 429,
            "unit": "ms",
            "extra": "min: 429\nmax: 429\ncount: 1\nmean: 429\np50: 432.7\nmedian: 432.7\np75: 432.7\np90: 432.7\np95: 432.7\np99: 432.7\np999: 432.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1872,
            "unit": "ms",
            "extra": "min: 1872\nmax: 1872\ncount: 1\nmean: 1872\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "13f2a5fa9cbb33ef1653d687a6fc1689c80e1ca4",
          "message": "Bump `@itwin` dependencies (#352)\n\n* Bump `itwinjs-core` dependencies\r\n\r\n* empty changeset",
          "timestamp": "2023-11-23T08:55:30Z",
          "tree_id": "10cf1e5f1bef60f2e6cd7b147bcf2e196e3b9327",
          "url": "https://github.com/iTwin/presentation/commit/13f2a5fa9cbb33ef1653d687a6fc1689c80e1ca4"
        },
        "date": 1700729820743,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 356,
            "unit": "ms",
            "extra": "min: 356\nmax: 356\ncount: 1\nmean: 356\np50: 354.3\nmedian: 354.3\np75: 354.3\np90: 354.3\np95: 354.3\np99: 354.3\np999: 354.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1800,
            "unit": "ms",
            "extra": "min: 1800\nmax: 1800\ncount: 1\nmean: 1800\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6d5fb05db8f49dfdc057f14f7bacb537bce8363b",
          "message": "Hierarchy builder: Hierarchy level filtering (#342)\n\n* Move some stuff around\r\n\r\n* WIP hierarchy level filtering\r\n\r\n* Allow hierarchy definitions to opt-in for hierarchy level filtering\r\n\r\n* Support filtering by advanced property types\r\n\r\n* 100% coverage\r\n\r\n* Add full stack tests for hierarchy level filtering\r\n\r\n* finalize",
          "timestamp": "2023-11-23T14:24:45Z",
          "tree_id": "b252973e2b626e97d592b4463b2169ce0c957cb7",
          "url": "https://github.com/iTwin/presentation/commit/6d5fb05db8f49dfdc057f14f7bacb537bce8363b"
        },
        "date": 1700749576357,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 404,
            "unit": "ms",
            "extra": "min: 404\nmax: 404\ncount: 1\nmean: 404\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1807,
            "unit": "ms",
            "extra": "min: 1807\nmax: 1807\ncount: 1\nmean: 1807\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6aef4b81f1531de409a853ed59f8579f1946ac9e",
          "message": "Add properties grouping (#345)\n\n* Initial changes\r\n\r\n* Update propertyGrouping\r\n\r\n* Add properties grouping\r\n\r\n* changeset\r\n\r\n* Extract api\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectClauseFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectClauseFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Apply renaming changes\r\n\r\n* Fix test\r\n\r\n* Move docs to PropertyGroup\r\n\r\n* Move addToPreviousPropertiesInfo to the beginning and remove function\r\n\r\n* change \"undefined\" to \"\"\r\n\r\n* Add clarification\r\n\r\n* Add export\r\n\r\n* Remove groupingInfo add export\r\n\r\n* Use localization\r\n\r\n* Use valueFormatter from HierarchyProvider\r\n\r\n* Small fixes\r\n\r\n* Renaming\r\n\r\n* Merge master and run extract api\r\n\r\n* Run extract api\r\n\r\n* Add translate\r\n\r\n* Add 100% coverage\r\n\r\n* Fix integration tests\r\n\r\n* Add tests\r\n\r\n* Remove .only\r\n\r\n* Fix tests\r\n\r\n* Fix merge conflicts\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectQueryFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Rename ECSqlSelectClauseRange to ECSqlSelectClausePropertyValueRange\r\n\r\n* Remove unused json\r\n\r\n* Rename PropertyGroup to HierarchyNodePropertyGroup\r\n\r\n* Run extract-api\r\n\r\n* Rename Range to HierarchyNodePropertyValueRange\r\n\r\n* Merge getGroupingAutoExpandOptionsFromParentNode() and getGroupingHideOptionsFromParentNode()\r\n\r\n* Change fullClassName: to propertiesClassName:\r\n\r\n* Add docs to NodeSelectQueryFactory\r\n\r\n* Remove @beta tag\r\n\r\n* Rename extractedPropertyInfo to handlerGroupingParams\r\n\r\n* Add extra information to range formatting\r\n\r\n* Fix autoExpand\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/BaseClassGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/AutoExpand.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Refactor multi level grouping tests\r\n\r\n* Do not extract ecproperty a second time\r\n\r\n* Not allow user to specify propertyValue\r\n\r\n* Define base object for tests\r\n\r\n* Resolve final comments\r\n\r\n* Run export api\r\n\r\n* Use property shorthand\r\n\r\n* Add check if index can be accessed.\r\n\r\n* Rename test and tweak it a little bit.\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Rename propertiesClassName to propertyClassName in NodeKeys\r\n\r\n* Remove unused properties from other grouping node\r\n\r\n* Change Shared, AutoExpand and GroupHiding\r\n\r\n* Fix docs\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectQueryFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Fix localization\r\n\r\n* Remove TypedPrimitiveValue cast\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2023-11-30T16:24:44+02:00",
          "tree_id": "62a14cad88dae92b45d204d0fd2b2d1b78d99184",
          "url": "https://github.com/iTwin/presentation/commit/6aef4b81f1531de409a853ed59f8579f1946ac9e"
        },
        "date": 1701354377918,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1831,
            "unit": "ms",
            "extra": "min: 1831\nmax: 1831\ncount: 1\nmean: 1831\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 367,
            "unit": "ms",
            "extra": "min: 367\nmax: 367\ncount: 1\nmean: 367\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b817000a345e4c20a7b365e24a669c2f2fb2cec7",
          "message": "Bump `itwinjs-core` dependencies to latest `4.3-rc` (#357)",
          "timestamp": "2023-12-07T09:53:47+02:00",
          "tree_id": "a69c35445029d2d678306feb2f1e21a39ec9a027",
          "url": "https://github.com/iTwin/presentation/commit/b817000a345e4c20a7b365e24a669c2f2fb2cec7"
        },
        "date": 1701935714640,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 388,
            "unit": "ms",
            "extra": "min: 388\nmax: 388\ncount: 1\nmean: 388\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1849,
            "unit": "ms",
            "extra": "min: 1849\nmax: 1849\ncount: 1\nmean: 1849\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "76a926beae23976b0fdeb6ecf1cee02a7c30c7c8",
          "message": "Unify label grouping and merging (#355)\n\n* Combine label grouping and merging\r\n\r\n* Rename mergeInstanceNodes to mergedInstanceNodes\r\n\r\n* Apply suggestion\r\n\r\n* Add resorting\r\n\r\n* Add mergeArraysByLabel operation\r\n\r\n* Update byLabel structure, so grouping could also have groupId\r\n\r\n* Fix lint\r\n\r\n* Fix lint\r\n\r\n* Change throw comment\r\n\r\n* Rename mergeArraysByLabel to mergeSortedArrays, make it reusable, and move it to common.ts\r\n\r\n* Move byLabelSelector checks to createLabelGroupingBaseParamsSelectors\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/LabelGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Remove code duplication\r\n\r\n* Rename test\r\n\r\n* Simplify code\r\n\r\n* Re save files\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2023-12-07T09:50:04Z",
          "tree_id": "cfd6f6b580a02484fcd5ed7b74c24c7ae8d9275d",
          "url": "https://github.com/iTwin/presentation/commit/76a926beae23976b0fdeb6ecf1cee02a7c30c7c8"
        },
        "date": 1701942666365,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 350,
            "unit": "ms",
            "extra": "min: 350\nmax: 350\ncount: 1\nmean: 350\np50: 347.3\nmedian: 347.3\np75: 347.3\np90: 347.3\np95: 347.3\np99: 347.3\np999: 347.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1786,
            "unit": "ms",
            "extra": "min: 1786\nmax: 1786\ncount: 1\nmean: 1786\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fb70af84c1b9655ff661015088267c9c0b85982f",
          "message": "Fixed models tree definition not handling hidden subjects appropriately (#364)",
          "timestamp": "2023-12-17T11:09:43+02:00",
          "tree_id": "1bc9ec5d498f8670914124c418b821998ed4ebc5",
          "url": "https://github.com/iTwin/presentation/commit/fb70af84c1b9655ff661015088267c9c0b85982f"
        },
        "date": 1702804250253,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 593,
            "unit": "ms",
            "extra": "min: 593\nmax: 593\ncount: 1\nmean: 593\np50: 596\nmedian: 596\np75: 596\np90: 596\np95: 596\np99: 596\np999: 596"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1817,
            "unit": "ms",
            "extra": "min: 1817\nmax: 1817\ncount: 1\nmean: 1817\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "20fbd7d5cec780240055d392d640f6b0adeab1f1",
          "message": "Option to override hierarchy level size limit for each hierarchy level (#366)\n\n* Add localization text\r\n\r\n* Add error type checker\r\n\r\n* Change backend to allow reseting size limit\r\n\r\n* Update tree widget\r\n\r\n* Add changeset\r\n\r\n* Remove space\r\n\r\n* Log error if it is not RowsLimitExceededError\r\n\r\n* Allow level limit to be unbounded\r\n\r\n* Move applyLimit usage to read()\r\n\r\n* Allow setting limit for specific hierarchy level\r\n\r\n* Export RowsLimitExceededError\r\n\r\n* Final fixes\r\n\r\n* Update Sample.json\r\n\r\n* Retrieve parentId only when it is needed\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Apply ctes\r\n\r\n* Include message\r\n\r\n* Change hierarchyLevelSizeLimit map to object\r\n\r\n* Remove limit setting\r\n\r\n* Use parentId to set/remove limit\r\n\r\n* applyLimit cleanup\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/TreeNodesReader.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* simplify limit assignment; add comments to GetHierarchyNodesProps\r\n\r\n* Remove useCallback for nodeRenderer\r\n\r\n* Move stateless tree widget to a separate file\r\n\r\n* Fix test\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-01-04T09:16:58+02:00",
          "tree_id": "816c085ea19f91a9303f4e39c5c94483b411ad2d",
          "url": "https://github.com/iTwin/presentation/commit/20fbd7d5cec780240055d392d640f6b0adeab1f1"
        },
        "date": 1704352721263,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 339,
            "unit": "ms",
            "extra": "min: 339\nmax: 339\ncount: 1\nmean: 339\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1860,
            "unit": "ms",
            "extra": "min: 1860\nmax: 1860\ncount: 1\nmean: 1860\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "21c32ad173f02df9fea97b53d0a53cf10b9cbb0c",
          "message": "Hierarchy builder: Fix visible child nodes not loaded when hierarchy filter matches parent node and hidden child nodes (#379)\n\n* Fix visible child nodes not loaded when hierarchy filter matches parent node and hidden child nodes\r\n\r\n* Add some handling for very long test dataset paths\r\n\r\n* Fix non-matching child nodes not loaded from a matching hierarchy level definition when parent is a filter target\r\n\r\n* Fixup header filtering input status\r\n\r\n* Attempt to shorten temp schema file path as well\r\n\r\n* Child nodes of filter target should always be returned",
          "timestamp": "2024-01-16T16:08:53+02:00",
          "tree_id": "1b09b7a80cbe0b0860ba5be21cf7b6f2fb3086d2",
          "url": "https://github.com/iTwin/presentation/commit/21c32ad173f02df9fea97b53d0a53cf10b9cbb0c"
        },
        "date": 1705414226252,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 533,
            "unit": "ms",
            "extra": "min: 533\nmax: 533\ncount: 1\nmean: 533\np50: 528.6\nmedian: 528.6\np75: 528.6\np90: 528.6\np95: 528.6\np99: 528.6\np999: 528.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1818,
            "unit": "ms",
            "extra": "min: 1818\nmax: 1818\ncount: 1\nmean: 1818\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f6ae78f6cafd8eecaee5c186b8cb6cdcb57e54e6",
          "message": "Creating hierarchy level descriptors for filtering stateless hierarchies (#378)\n\n* Add a way to create hierarchy level descriptor for filtering stateless hierarchies\r\n\r\n* changeset\r\n\r\n* Avoid exposing `rxjs` APIs through out barrel\r\n\r\n* Assign ruleset to hierarchy level descriptor\r\n\r\n* lint\r\n\r\n* Add missing docs",
          "timestamp": "2024-01-16T14:33:49Z",
          "tree_id": "fed960b018a942a34e62fac07d80283dc8b5a5b9",
          "url": "https://github.com/iTwin/presentation/commit/f6ae78f6cafd8eecaee5c186b8cb6cdcb57e54e6"
        },
        "date": 1705415721256,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 355,
            "unit": "ms",
            "extra": "min: 355\nmax: 355\ncount: 1\nmean: 355\np50: 354.3\nmedian: 354.3\np75: 354.3\np90: 354.3\np95: 354.3\np99: 354.3\np999: 354.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1842,
            "unit": "ms",
            "extra": "min: 1842\nmax: 1842\ncount: 1\nmean: 1842\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9d0bad0c74e37d07401b418779abcd0c4c63c5ac",
          "message": "Hierarchy builder: Add ability to filter hierarchy by Element's ECInstanceId suffix (#380)\n\n* Add ability to filter hierarchy by Element's ECInstanceId suffix\r\n\r\n* extract-api",
          "timestamp": "2024-01-18T09:43:29+02:00",
          "tree_id": "f2349bebe4479c7f2e6a448e450cef8fdf02ac91",
          "url": "https://github.com/iTwin/presentation/commit/9d0bad0c74e37d07401b418779abcd0c4c63c5ac"
        },
        "date": 1705563880038,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 385,
            "unit": "ms",
            "extra": "min: 385\nmax: 385\ncount: 1\nmean: 385\np50: 383.8\nmedian: 383.8\np75: 383.8\np90: 383.8\np95: 383.8\np99: 383.8\np999: 383.8"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1864,
            "unit": "ms",
            "extra": "min: 1864\nmax: 1864\ncount: 1\nmean: 1864\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "grigas.petraitis",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "committer": {
            "name": "grigas.petraitis",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "id": "7ac2299a32384691da7398c1f06ce7d51882882b",
          "message": "change",
          "timestamp": "2024-01-19T07:18:50Z",
          "url": "https://github.com/iTwin/presentation/commit/7ac2299a32384691da7398c1f06ce7d51882882b"
        },
        "date": 1705649771196,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 324,
            "unit": "ms",
            "extra": "min: 324\nmax: 324\ncount: 1\nmean: 324\np50: 327.1\nmedian: 327.1\np75: 327.1\np90: 327.1\np95: 327.1\np99: 327.1\np999: 327.1"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2558,
            "unit": "ms",
            "extra": "min: 2558\nmax: 2558\ncount: 1\nmean: 2558\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e0c915134acc25f2643ce6271a90d726eba09ab6",
          "message": "Hierarchy builder: Unified selection support (#381)\n\n* Grouping nodes now know what instances they group\r\n\r\n* Add unified selection support to test app\r\n\r\n* change",
          "timestamp": "2024-01-23T12:44:14+02:00",
          "tree_id": "0939bb0dc7dcbe8c010a404a43fe475cccbb48d7",
          "url": "https://github.com/iTwin/presentation/commit/e0c915134acc25f2643ce6271a90d726eba09ab6"
        },
        "date": 1706006721091,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 342,
            "unit": "ms",
            "extra": "min: 342\nmax: 342\ncount: 1\nmean: 342\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2522,
            "unit": "ms",
            "extra": "min: 2522\nmax: 2522\ncount: 1\nmean: 2522\np50: 2515.5\nmedian: 2515.5\np75: 2515.5\np90: 2515.5\np95: 2515.5\np99: 2515.5\np999: 2515.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f2bf5afa09915c3dcc20e845e91d15edce7bea81",
          "message": "Hierarchy builder: Add results count limiting to hierarchy filtering (#383)\n\n* Add results count limiting to hierarchy filtering\r\n\r\n* Fixup test app\r\n\r\n* Avoid using `rxjs` and `rxjs-for-await` just for creating async iterators",
          "timestamp": "2024-01-23T11:16:32Z",
          "tree_id": "16d565e189cad0f439cf35e7bd83a0622bd766e4",
          "url": "https://github.com/iTwin/presentation/commit/f2bf5afa09915c3dcc20e845e91d15edce7bea81"
        },
        "date": 1706008687725,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2540,
            "unit": "ms",
            "extra": "min: 2540\nmax: 2540\ncount: 1\nmean: 2540\np50: 2515.5\nmedian: 2515.5\np75: 2515.5\np90: 2515.5\np95: 2515.5\np99: 2515.5\np999: 2515.5"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 387,
            "unit": "ms",
            "extra": "min: 387\nmax: 387\ncount: 1\nmean: 387\np50: 383.8\nmedian: 383.8\np75: 383.8\np90: 383.8\np95: 383.8\np99: 383.8\np999: 383.8"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "84a3924f274f45c82ab57abf694229bd2c889060",
          "message": "Allow changing formatter without requerying. (#386)\n\n* Implement formatter setter\r\n\r\n* Add option to set formatter in test app\r\n\r\n* Add import\r\n\r\n* Add tests\r\n\r\n* Fix import order\r\n\r\n* Update api and add changeset\r\n\r\n* Minor styling changes\r\n\r\n* Move files to stateless folder\r\n\r\n* Remove event handler from useControlledTreeComponentsState\r\n\r\n* Fix test to use limitingQueryExecutor instead of queryExecutor\r\n\r\n* Change shareReplay to shareReplayWithErrors\r\n\r\n* Remove this.map.get from QueriesCache.add function\r\n\r\n* Remove formatter spy\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Add docs to setFormatter and fix test\r\n\r\n* Use string in test instead of Date\r\n\r\n* Simplify and merge full stack tests\r\n\r\n* Rename modelsTreeHierarchyProvider to hierarchyProvider\r\n\r\n* Update apps/test-app/frontend/src/components/tree-widget/stateless/CustomHooks.ts\r\n\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>\r\n\r\n* Move createNewComponents outside useControlledTreeComponentsState\r\n\r\n* Use single menuItem\r\n\r\n* Add documentation for getNodes\r\n\r\n* Extract formatter dropdown menu to a separate component\r\n\r\n* Remove queryCache and add tests\r\n\r\n* Run extract api\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/HideIfNoChildren.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/HideNodesInHierarchy.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Change FormatterTogglerDropdownProps and fix the displayed text\r\n\r\n* Remove assert\r\n\r\n* Remove unused import\r\n\r\n* Fix import order\r\n\r\n* Set event handler\r\n\r\n* Add ...lhs to mergeNodes result\r\n\r\n* Create a new seed on each subscribe\r\n\r\n* Wrap useState initialization inside a callback\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>",
          "timestamp": "2024-02-01T10:03:54+02:00",
          "tree_id": "112f0e7efa3c89a9190dfbdf77be8b1245bd7e3b",
          "url": "https://github.com/iTwin/presentation/commit/84a3924f274f45c82ab57abf694229bd2c889060"
        },
        "date": 1706774728213,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2554,
            "unit": "ms",
            "extra": "min: 2554\nmax: 2554\ncount: 1\nmean: 2554\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 406,
            "unit": "ms",
            "extra": "min: 406\nmax: 406\ncount: 1\nmean: 406\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ebb4047479a216ca590d459457c283b63acbc828",
          "message": "Presentation: Misc. cleanup in hierarchy builder (#394)\n\n* Add query performance logging\r\n\r\n* Add an option to set query rows limit when creating a HierarchyProvider\r\n\r\n* Don't unnecessarily store node observables\r\n\r\n* Request consumers to provide `ILimitingECSqlQueryExecutor` rather than creating it internally\r\n\r\n* changeset",
          "timestamp": "2024-02-02T14:43:35+02:00",
          "tree_id": "32691ef86c397eea982acffef3dbfdd16c9e6866",
          "url": "https://github.com/iTwin/presentation/commit/ebb4047479a216ca590d459457c283b63acbc828"
        },
        "date": 1706877881749,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 395,
            "unit": "ms",
            "extra": "min: 395\nmax: 395\ncount: 1\nmean: 395\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2586,
            "unit": "ms",
            "extra": "min: 2586\nmax: 2586\ncount: 1\nmean: 2586\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Saulius Skliutas",
            "username": "saskliutas",
            "email": "24278440+saskliutas@users.noreply.github.com"
          },
          "committer": {
            "name": "Saulius Skliutas",
            "username": "saskliutas",
            "email": "24278440+saskliutas@users.noreply.github.com"
          },
          "id": "81d4ee2166694fce796365bee04d16052334c84b",
          "message": "change",
          "timestamp": "2024-02-02T15:12:09Z",
          "url": "https://github.com/iTwin/presentation/commit/81d4ee2166694fce796365bee04d16052334c84b"
        },
        "date": 1706888130261,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 379,
            "unit": "ms",
            "extra": "min: 379\nmax: 379\ncount: 1\nmean: 379\np50: 376.2\nmedian: 376.2\np75: 376.2\np90: 376.2\np95: 376.2\np99: 376.2\np999: 376.2"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2575,
            "unit": "ms",
            "extra": "min: 2575\nmax: 2575\ncount: 1\nmean: 2575\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4373fd23a19204c879c7fde04f0b0a7eb55f04d6",
          "message": "Bump dev dependencies (#395)\n\n* Bump dev dependencies\r\n\r\n* Run prettier\r\n\r\n* change",
          "timestamp": "2024-02-02T17:38:38+02:00",
          "tree_id": "9aa7f807b22428301277eef0a4d643fce4aff250",
          "url": "https://github.com/iTwin/presentation/commit/4373fd23a19204c879c7fde04f0b0a7eb55f04d6"
        },
        "date": 1706888409681,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 320,
            "unit": "ms",
            "extra": "min: 320\nmax: 320\ncount: 1\nmean: 320\np50: 320.6\nmedian: 320.6\np75: 320.6\np90: 320.6\np95: 320.6\np99: 320.6\np999: 320.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2574,
            "unit": "ms",
            "extra": "min: 2574\nmax: 2574\ncount: 1\nmean: 2574\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "53893a975dce944a356ff7597103466c0fa8ff25",
          "message": "Updating hierarchies upon imodel data change (#396)\n\n* Updating hierarchies upon imodel data change\r\n\r\n* lint",
          "timestamp": "2024-02-05T13:44:12+02:00",
          "tree_id": "b4566a5f231b8f438a983f7d35e23e8bec6ae748",
          "url": "https://github.com/iTwin/presentation/commit/53893a975dce944a356ff7597103466c0fa8ff25"
        },
        "date": 1707133519432,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2599,
            "unit": "ms",
            "extra": "min: 2599\nmax: 2599\ncount: 1\nmean: 2599\np50: 2618.1\nmedian: 2618.1\np75: 2618.1\np90: 2618.1\np95: 2618.1\np99: 2618.1\np999: 2618.1"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 236,
            "unit": "ms",
            "extra": "min: 236\nmax: 236\ncount: 1\nmean: 236\np50: 237.5\nmedian: 237.5\np75: 237.5\np90: 237.5\np95: 237.5\np99: 237.5\np999: 237.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9835235fd18b3eb0f5bce5a0d3d17009e6add749",
          "message": "Change child nodes cache to use Dictionary instead of Map (#397)\n\n* Change map to dictionary\r\n\r\n* Add changeset and run extract api\r\n\r\n* Fix sorting problem\r\n\r\n* Resolve comments\r\n\r\n* Resolve comment",
          "timestamp": "2024-02-06T10:10:55+02:00",
          "tree_id": "673ec9e060ef12bc7af3279dfe825b2870f8843d",
          "url": "https://github.com/iTwin/presentation/commit/9835235fd18b3eb0f5bce5a0d3d17009e6add749"
        },
        "date": 1707207122703,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 482,
            "unit": "ms",
            "extra": "min: 482\nmax: 482\ncount: 1\nmean: 482\np50: 478.3\nmedian: 478.3\np75: 478.3\np90: 478.3\np95: 478.3\np99: 478.3\np999: 478.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1854,
            "unit": "ms",
            "extra": "min: 1854\nmax: 1854\ncount: 1\nmean: 1854\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d177c7ededefa0d12a4fefb41c402cf7ed791de",
          "message": "Remove `groupedInstanceKeys` property from `parentKeys` (#401)\n\n* Remove groupedInstanceKeys from parentKeys\r\n\r\n* Run extract api +add changeset\r\n\r\n* Fix prettier errors\r\n\r\n* Add ParentNodeKey type and move equals and compare checks to ParentNodeKey namespace\r\n\r\n* Move OmitOverUnion to utils and use ParentNodeKey namespace to do compare and equals checks\r\n\r\n* Fix tests, and use omit\r\n\r\n* Run extract api\r\n\r\n* Using omit where possible\r\n\r\n* Move HierarchyNodeKey namespace to be right below HierarchyNodeKey type\r\n\r\n* Add internal tag to OmitOverUnion\r\n\r\n* Remove Guid.createValue()\r\n\r\n* Change OmitOverUnion to have beta tag instead of internal",
          "timestamp": "2024-02-07T13:42:44Z",
          "tree_id": "48efdb999e96a2adbadbb6274e24d83401cc9b98",
          "url": "https://github.com/iTwin/presentation/commit/4d177c7ededefa0d12a4fefb41c402cf7ed791de"
        },
        "date": 1707313487998,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1766,
            "unit": "ms",
            "extra": "min: 1766\nmax: 1766\ncount: 1\nmean: 1766\np50: 1755\nmedian: 1755\np75: 1755\np90: 1755\np95: 1755\np99: 1755\np999: 1755"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 366,
            "unit": "ms",
            "extra": "min: 366\nmax: 366\ncount: 1\nmean: 366\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6e8aa1afd8a07a97d89e95bbbe07935a646b5133",
          "message": "Remove localization. Let consumers supply the two strings we need. (#404)\n\n* Remove localization. Let consumers supply the two strings we need.\r\n\r\n* change",
          "timestamp": "2024-02-07T18:03:05+02:00",
          "tree_id": "5c51b1026173764d331493c2db8447c7a5ab4e00",
          "url": "https://github.com/iTwin/presentation/commit/6e8aa1afd8a07a97d89e95bbbe07935a646b5133"
        },
        "date": 1707321848192,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1809,
            "unit": "ms",
            "extra": "min: 1809\nmax: 1809\ncount: 1\nmean: 1809\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 368,
            "unit": "ms",
            "extra": "min: 368\nmax: 368\ncount: 1\nmean: 368\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "94be1d03fb4557856c3cf555382c011caf7f35fe",
          "message": "Bump `itwinjs-core` dev dependencies to `4.4.0-dev.35` (#406)\n\n* Bump `itwinjs-core` dev dependencies to `4.4.0-dev.35`\r\n\r\n* change",
          "timestamp": "2024-02-09T10:20:57+02:00",
          "tree_id": "04c4da6cfe179b8508cb198e7cec288453c7c1c5",
          "url": "https://github.com/iTwin/presentation/commit/94be1d03fb4557856c3cf555382c011caf7f35fe"
        },
        "date": 1707466955792,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 319,
            "unit": "ms",
            "extra": "min: 319\nmax: 319\ncount: 1\nmean: 319\np50: 320.6\nmedian: 320.6\np75: 320.6\np90: 320.6\np95: 320.6\np99: 320.6\np999: 320.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1838,
            "unit": "ms",
            "extra": "min: 1838\nmax: 1838\ncount: 1\nmean: 1838\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7510b87cd46269433559c9207ce4dcf54f380b34",
          "message": "Remove typemoq (#411)\n\n* Remove mockPresentationManager\r\n\r\n* Remove typemoq usage in `presentation-components`\r\n\r\n* Remove last reference to typemoq in presentation-components\r\n\r\n* Remove typemoq references in presentation-testing\r\n\r\n* Remove typemoq\r\n\r\n* Run prettier\r\n\r\n* lint\r\n\r\n* prettier\r\n\r\n* Bump mocha\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-02-12T14:44:03+02:00",
          "tree_id": "519a0aa046eec59a5a58e175602dcd31c60557cc",
          "url": "https://github.com/iTwin/presentation/commit/7510b87cd46269433559c9207ce4dcf54f380b34"
        },
        "date": 1707741922958,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 334,
            "unit": "ms",
            "extra": "min: 334\nmax: 334\ncount: 1\nmean: 334\np50: 333.7\nmedian: 333.7\np75: 333.7\np90: 333.7\np95: 333.7\np99: 333.7\np999: 333.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1830,
            "unit": "ms",
            "extra": "min: 1830\nmax: 1830\ncount: 1\nmean: 1830\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      }
    ]
  }
}