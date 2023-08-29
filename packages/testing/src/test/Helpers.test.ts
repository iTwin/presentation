/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyCacheMode, initialize, PresentationTestingInitProps, terminate } from "../presentation-testing/Helpers";
import * as sinon from "sinon";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";
import * as rimraf from "rimraf";
import { Guid } from "@itwin/core-bentley";
import { NoRenderApp } from "@itwin/core-frontend";

describe("Helpers", () => {
  describe("initialize", () => {
    afterEach(async () => {
      await terminate();
    });

    it("initializes PresentationBackend and PresentationFrontend on initialize", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendInitializationSpy = sinon.spy(PresentationFrontend, "initialize");

      await initialize();
      expect(backendInitializationSpy.calledOnce);
      expect(frontendInitializationSpy.calledOnce);
    });

    it("does not initialize PresentationBackend and PresentationFrontend on second call to initialize", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendInitializationSpy = sinon.spy(PresentationFrontend, "initialize");

      await initialize();
      expect(backendInitializationSpy.calledOnce);
      expect(frontendInitializationSpy.calledOnce);

      sinon.resetHistory();

      await initialize();
      expect(backendInitializationSpy.notCalled);
      expect(frontendInitializationSpy.notCalled);
    });

    it("initializes PresentationBackend and PresentationFrontend with provided props", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendAppStartupSpy = sinon.spy(NoRenderApp, "startup");
      const props: PresentationTestingInitProps = { backendProps: { id: Guid.createValue() }, frontendApp: NoRenderApp };

      await initialize(props);
      expect(backendInitializationSpy.calledOnceWith(props.backendProps));
      expect(frontendAppStartupSpy.calledOnce);
    });
  });

  describe("terminate", () => {
    it("terminates PresentationBackend and PresentationFrontend on terminate", async () => {
      const backendTerminationSpy = sinon.spy(PresentationBackend, "terminate");
      const frontendTerminationSpy = sinon.spy(PresentationFrontend, "terminate");
      await initialize();

      await terminate();
      expect(backendTerminationSpy.calledOnce);
      expect(frontendTerminationSpy.calledOnce);
    });

    it("does not terminate PresentationBackend and PresentationFrontend on second call to terminate", async () => {
      const backendTerminationSpy = sinon.spy(PresentationBackend, "terminate");
      const frontendTerminationSpy = sinon.spy(PresentationFrontend, "terminate");
      await initialize();

      await terminate();
      expect(backendTerminationSpy.calledOnce);
      expect(frontendTerminationSpy.calledOnce);

      sinon.resetHistory();

      await terminate();
      expect(backendTerminationSpy.notCalled);
      expect(frontendTerminationSpy.notCalled);
    });

    it("calls rimraf sync when initialized with DiskHierarchyCacheConfig", async () => {
      const syncStub = sinon.stub(rimraf, "sync");
      const props: PresentationTestingInitProps = { backendProps: { caching: { hierarchies: { mode: HierarchyCacheMode.Disk, directory: process.cwd() } } } };
      await initialize(props);

      await terminate();
      expect(syncStub.calledOnce);
    });

    it("calls rimraf sync when initialized with HybridCacheConfig", async () => {
      const syncStub = sinon.stub(rimraf, "sync");
      const props: PresentationTestingInitProps = {
        backendProps: { caching: { hierarchies: { mode: HierarchyCacheMode.Hybrid, disk: { mode: HierarchyCacheMode.Disk, directory: process.cwd() } } } },
      };
      await initialize(props);

      await terminate();
      expect(syncStub.calledOnce);
    });
  });
});
