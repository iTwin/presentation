/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as rimraf from "rimraf";
import * as sinon from "sinon";
import { Guid } from "@itwin/core-bentley";
import { NoRenderApp } from "@itwin/core-frontend";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";
import { HierarchyCacheMode, initialize, PresentationTestingInitProps, terminate } from "../presentation-testing/Helpers";

describe("Helpers", () => {
  describe("initialize", () => {
    afterEach(async () => {
      await terminate();
    });

    it("initializes PresentationBackend and PresentationFrontend on initialize", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendInitializationSpy = sinon.spy(PresentationFrontend, "initialize");

      await initialize();
      expect(backendInitializationSpy).to.be.calledOnce;
      expect(frontendInitializationSpy).to.be.calledOnce;
    });

    it("does not initialize PresentationBackend and PresentationFrontend on second call to initialize", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendInitializationSpy = sinon.spy(PresentationFrontend, "initialize");

      await initialize();
      expect(backendInitializationSpy).to.be.calledOnce;
      expect(frontendInitializationSpy).to.be.calledOnce;

      sinon.resetHistory();

      await initialize();
      expect(backendInitializationSpy).to.not.be.called;
      expect(frontendInitializationSpy).to.not.be.called;
    });

    it("initializes PresentationBackend and PresentationFrontend with provided props", async () => {
      const backendInitializationSpy = sinon.spy(PresentationBackend, "initialize");
      const frontendAppStartupSpy = sinon.spy(NoRenderApp, "startup");
      const props: PresentationTestingInitProps = { backendProps: { id: Guid.createValue() }, frontendApp: NoRenderApp };

      await initialize(props);
      expect(backendInitializationSpy).to.be.calledOnceWith(props.backendProps);
      expect(frontendAppStartupSpy).to.be.calledOnce;
    });
  });

  describe("terminate", () => {
    it("terminates PresentationBackend and PresentationFrontend on terminate", async () => {
      const backendTerminationSpy = sinon.spy(PresentationBackend, "terminate");
      const frontendTerminationSpy = sinon.spy(PresentationFrontend, "terminate");
      await initialize();

      await terminate();
      expect(backendTerminationSpy).to.be.calledOnce;
      expect(frontendTerminationSpy).to.be.calledOnce;
    });

    it("does not terminate PresentationBackend and PresentationFrontend on second call to terminate", async () => {
      const backendTerminationSpy = sinon.spy(PresentationBackend, "terminate");
      const frontendTerminationSpy = sinon.spy(PresentationFrontend, "terminate");
      await initialize();

      await terminate();
      expect(backendTerminationSpy).to.be.calledOnce;
      expect(frontendTerminationSpy).to.be.calledOnce;

      sinon.resetHistory();

      await terminate();
      expect(backendTerminationSpy).to.not.be.called;
      expect(frontendTerminationSpy).to.not.be.called;
    });

    it("clears cache directory when initialized with DiskHierarchyCacheConfig", async () => {
      const syncStub = sinon.stub(rimraf, "sync");
      const testDirectory = "/test/directory/";
      const props: PresentationTestingInitProps = { backendProps: { caching: { hierarchies: { mode: HierarchyCacheMode.Disk, directory: testDirectory } } } };
      await initialize(props);

      await terminate();
      expect(syncStub).to.be.calledOnceWith(testDirectory);
    });

    it("clears cache directory when initialized with HybridCacheConfig", async () => {
      const syncStub = sinon.stub(rimraf, "sync");
      const testDirectory = "/test/directory/";
      const props: PresentationTestingInitProps = {
        backendProps: { caching: { hierarchies: { mode: HierarchyCacheMode.Hybrid, disk: { mode: HierarchyCacheMode.Disk, directory: testDirectory } } } },
      };
      await initialize(props);

      await terminate();
      expect(syncStub).to.be.calledOnceWith(testDirectory);
    });
  });
});
