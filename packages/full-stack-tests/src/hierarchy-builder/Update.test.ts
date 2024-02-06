/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import * as fs from "fs";
import {
  Element,
  ElementOwnsExternalSourceAspects,
  ElementRefersToElements,
  ExternalSourceAspect,
  IpcHost,
  PhysicalModel,
  PhysicalPartition,
  StandaloneDb,
  Subject,
  SubjectOwnsPartitionElements,
  SubjectOwnsSubjects,
} from "@itwin/core-backend";
import { Guid, Id64String, OpenMode } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  EmptyLocalization,
  ExternalSourceAspectProps,
  IModel,
  IModelReadRpcInterface,
  IpcListener,
  IpcSocketBackend,
  IpcSocketFrontend,
  RelationshipProps,
  RemoveFunction,
  RpcConfiguration,
  RpcManager,
} from "@itwin/core-common";
import { BriefcaseConnection, IpcApp, NullRenderSystem } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { registerTxnListeners } from "@itwin/presentation-core-interop";
import { ECSqlSnippets, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { createFileNameFromString } from "@itwin/presentation-testing/lib/cjs/presentation-testing/InternalUtils";
import { setupOutputFileLocation } from "../IModelUtils";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation";
import { createClassECSqlSelector, createMetadataProvider, createProvider } from "./Utils";

describe("Stateless hierarchy builder", () => {
  describe("Updating hierarchies upon iModel change", () => {
    let db: StandaloneDb;
    let connection: BriefcaseConnection;

    before(async function () {
      const socket = new TestSocket();
      await IpcHost.startup({
        ipcHost: {
          socket,
        },
        iModelHost: {
          profileName: Guid.createValue(),
        },
      });
      RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
      await IpcApp.startup(socket, {
        iModelApp: {
          // eslint-disable-next-line @itwin/no-internal
          renderSys: new NullRenderSystem(),
          noRender: true,
          localization: new EmptyLocalization(),
        },
      });
      RpcConfiguration.developmentMode = true;
      RpcManager.initializeInterface(IModelReadRpcInterface);
      RpcManager.initializeInterface(ECSchemaRpcInterface);
    });

    after(async () => {
      // eslint-disable-next-line @itwin/no-internal
      await IpcApp.shutdown();
      await IpcHost.shutdown();
    });

    beforeEach(async function () {
      const fileName = createFileNameFromString(this.test!.fullTitle());
      const filePath = setupOutputFileLocation(fileName);

      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
      }
      db = StandaloneDb.createEmpty(filePath, {
        rootSubject: { name: fileName },
        allowEdit: JSON.stringify({ txns: true }),
      });
      db.close();

      // we want connection to point to the exact same imodel and the only way to do this is to first open
      // connection and only then open the db
      connection = await BriefcaseConnection.openStandalone(filePath, OpenMode.ReadWrite);
      db = StandaloneDb.findByKey(connection.key);
    });

    afterEach(async () => {
      const filePath = db.pathName;
      await connection.close();
      db.close();
      fs.rmSync(filePath);
    });

    [
      {
        name: "on the backend",
        getIModel: () => db,
      },
      {
        name: "on the frontend",
        getIModel: () => connection,
      },
    ].forEach(({ name, getIModel }) => {
      describe(name, () => {
        let imodel: StandaloneDb | BriefcaseConnection;
        beforeEach(() => {
          imodel = getIModel();
        });

        it("updates hierarchy when an element is inserted", async function () {
          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });

          const subjectId = insertSubject("0x1", "test subject");
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }] })],
          });
        });

        it("updates hierarchy when an element is updated", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          db.saveChanges();

          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "test subject",
              }),
            ],
          });

          updateSubject(subjectId, "modified label");
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "modified label",
              }),
            ],
          });
        });

        it("updates hierarchy when an element is deleted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          db.saveChanges();

          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "test subject",
              }),
            ],
          });

          deleteElement(subjectId);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });
        });

        it("updates hierarchy when an aspect is inserted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          db.saveChanges();

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "",
              }),
            ],
          });

          insertExternalSourceAspect(subjectId, "test aspect");
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });
        });

        it("updates hierarchy when an aspect is updated", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          const aspectId = insertExternalSourceAspect(subjectId, "test aspect");
          db.saveChanges();

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });

          updateExternalSourceAspect(aspectId, "modified aspect");
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "modified aspect",
              }),
            ],
          });
        });

        it("updates hierarchy when an aspect is deleted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          const aspectId = insertExternalSourceAspect(subjectId, "test aspect");
          db.saveChanges();

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });

          deleteAspect(aspectId);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }],
                label: "",
              }),
            ],
          });
        });

        it("updates hierarchy when a model is inserted", async function () {
          const partitionId = insertPhysicalPartition("0x1");
          db.saveChanges();

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });

          const modelId = insertPhysicalModel(partitionId, false);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: PhysicalModel.classFullName.replace(":", "."), id: modelId }] })],
          });
        });

        it("updates hierarchy when a model is updated", async function () {
          const partitionId = insertPhysicalPartition("0x1", "test");
          const modelId = insertPhysicalModel(partitionId, false);
          db.saveChanges();

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: PhysicalModel.classFullName.replace(":", "."), id: modelId }],
                label: "test. IsPrivate: false",
              }),
            ],
          });

          updatePhysicalModel(modelId, true);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: PhysicalModel.classFullName.replace(":", "."), id: modelId }],
                label: "test. IsPrivate: true",
              }),
            ],
          });
        });

        it("updates hierarchy when a model is deleted", async function () {
          const partitionId = insertPhysicalPartition("0x1");
          const modelId = insertPhysicalModel(partitionId, false);
          db.saveChanges();

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: PhysicalModel.classFullName.replace(":", "."), id: modelId }] })],
          });

          deleteModel(modelId);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is inserted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          db.saveChanges();

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });

          insertElementRefersToElementRelationship("0x1", subjectId);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }] })],
          });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is updated", async function () {
          const subject1Id = insertSubject("0x1", "test subject 1");
          const subject2Id = insertSubject("0x1", "test subject 2");
          const relationshipProps = insertElementRefersToElementRelationship("0x1", subject1Id);
          db.saveChanges();

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subject1Id }] })],
          });

          updateElementRefersToElementRelationship({ ...relationshipProps, targetId: subject2Id });
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subject2Id }] })],
          });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is deleted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          const relationshipProps = insertElementRefersToElementRelationship("0x1", subjectId);
          db.saveChanges();

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: subjectId }] })],
          });

          deleteRelationship(relationshipProps);
          db.saveChanges();

          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [],
          });
        });

        function createRootSubjectChildrenProvider(props: { label: "codeValue" | "aspectIdentifier" } = { label: "codeValue" }) {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel() {
              return [
                {
                  fullClassName: Subject.classFullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: props.label === "codeValue" ? `this.CodeValue` : `aspect.Identifier` },
                      })}
                      FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                      LEFT JOIN ${createClassECSqlSelector(ExternalSourceAspect.classFullName)} AS aspect ON aspect.Element.Id = this.ECInstanceId
                      WHERE this.Parent.Id = 0x1
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          registerTxnListeners(imodel.txns, () => provider.notifyDataSourceChanged());
          return provider;
        }

        function createRootSubjectReferredElementsProvider() {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel() {
              return [
                {
                  fullClassName: Element.classFullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${createClassECSqlSelector(Element.classFullName)} AS this
                      JOIN ${createClassECSqlSelector(ElementRefersToElements.classFullName)} AS rel ON rel.TargetECInstanceId = this.ECInstanceId
                      WHERE rel.SourceECInstanceId = 0x1
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          registerTxnListeners(imodel.txns, () => provider.notifyDataSourceChanged());
          return provider;
        }

        function createPhysicalModelsProvider() {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel() {
              return [
                {
                  fullClassName: Subject.classFullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: {
                          selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
                            { propertyClassName: Element.classFullName, propertyClassAlias: "modeledElement", propertyName: "CodeValue" },
                            { type: "String", value: ". IsPrivate: " },
                            { propertyClassName: PhysicalModel.classFullName, propertyClassAlias: "this", propertyName: "IsPrivate" },
                          ]),
                        },
                      })}
                      FROM ${createClassECSqlSelector(PhysicalModel.classFullName)} AS this
                      JOIN ${createClassECSqlSelector(Element.classFullName)} AS modeledElement ON modeledElement.ECInstanceId = this.ModeledElement.Id
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          registerTxnListeners(imodel.txns, () => provider.notifyDataSourceChanged());
          return provider;
        }

        function insertSubject(parentId: Id64String, codeValue: string) {
          return db.elements.insertElement({
            classFullName: "BisCore.Subject",
            model: IModel.repositoryModelId,
            parent: {
              id: parentId,
              relClassName: SubjectOwnsSubjects.classFullName,
            },
            code: { scope: parentId, spec: db.codeSpecs.getByName(BisCodeSpec.subject).id, value: codeValue },
          });
        }

        function updateSubject(subjectId: Id64String, newCodeValue: string) {
          const props = db.elements.getElementProps(subjectId);
          db.elements.updateElement({
            ...props,
            code: { ...props.code, value: newCodeValue },
          });
        }

        function deleteElement(subjectId: Id64String) {
          db.elements.deleteElement(subjectId);
        }

        function insertExternalSourceAspect(elementId: Id64String, identifier: string) {
          return db.elements.insertAspect({
            classFullName: ExternalSourceAspect.classFullName,
            element: {
              relClassName: ElementOwnsExternalSourceAspects.classFullName,
              id: elementId,
            },
            identifier,
          } as ExternalSourceAspectProps);
        }

        function updateExternalSourceAspect(aspectId: Id64String, newIdentifier: string) {
          const props = db.elements.getAspect(aspectId).toJSON();
          db.elements.updateAspect({
            ...props,
            identifier: newIdentifier,
          } as ExternalSourceAspectProps);
        }

        function deleteAspect(aspectId: Id64String) {
          db.elements.deleteAspect(aspectId);
        }

        function insertPhysicalPartition(parentSubjectId: Id64String, codeValue = "test partition") {
          return db.elements.insertElement({
            classFullName: PhysicalPartition.classFullName,
            model: IModel.repositoryModelId,
            parent: {
              id: parentSubjectId,
              relClassName: SubjectOwnsPartitionElements.classFullName,
            },
            code: { scope: parentSubjectId, spec: db.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id, value: codeValue },
          });
        }

        function insertPhysicalModel(modeldElementId: Id64String, isPrivate: boolean) {
          return db.models.insertModel({
            classFullName: PhysicalModel.classFullName,
            modeledElement: {
              id: modeldElementId,
            },
            isPrivate,
          });
        }

        function updatePhysicalModel(modelId: Id64String, newIsPrivate: boolean) {
          const props = db.models.getModelProps(modelId);
          db.models.updateModel({
            ...props,
            isPrivate: newIsPrivate,
          });
        }

        function deleteModel(modelId: Id64String) {
          db.models.deleteModel(modelId);
        }

        function insertElementRefersToElementRelationship(sourceId: Id64String, targetId: Id64String): RelationshipProps {
          const props: RelationshipProps = {
            classFullName: ElementRefersToElements.classFullName,
            sourceId,
            targetId,
          };
          const id = db.relationships.insertInstance(props);
          return { ...props, id };
        }

        function updateElementRefersToElementRelationship(props: RelationshipProps) {
          db.relationships.updateInstance(props);
        }

        function deleteRelationship(props: RelationshipProps) {
          db.relationships.deleteInstance(props);
        }
      });
    });
  });

  class TestSocket implements IpcSocketBackend, IpcSocketFrontend {
    private _handlers = new Map<string, (...args: any[]) => Promise<any>>();
    private _listeners = new Map<string, IpcListener[]>();

    /**
     * Send a message to the backend via `channel` and expect a result asynchronously.
     * @param channel The name of the channel for the method.  Must begin with the [[iTwinChannel]] prefix.
     * @see Electron [ipcRenderer.invoke](https://www.electronjs.org/docs/api/ipc-renderer) documentation for details.
     * Note that this interface *may* be implemented via Electron for desktop apps, or via
     * [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) for mobile or web-based
     * Ipc connections. In either case, the Electron documentation provides the specifications for how it works.
     * @note `args` are serialized with the [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so only
     * primitive types and `ArrayBuffers` are allowed.
     */
    public async invoke(channel: string, ...args: any[]): Promise<any> {
      const handler = this._handlers.get(channel);
      if (!handler) {
        throw new Error(`no handler for channel "${channel}"`);
      }
      return handler({} as Event, ...args);
    }

    /**
     * Establish a backend implementation of an Ipc interface for a channel.
     * @param channel The name of the channel for this handler. Must begin with the [[iTwinChannel]] prefix.
     * @param handler A function that supplies the implementation for methods invoked over `channel` via [[IpcSocketFrontend.invoke]]
     * @note returns A function to call to remove the handler.
     */
    public handle(channel: string, handler: (...args: any[]) => Promise<any>): RemoveFunction {
      this._handlers.set(channel, handler);
      return () => {
        this._handlers.delete(channel);
      };
    }

    /**
     * Send a message over the socket.
     * @param channel The name of the channel for the message. Must begin with the [[iTwinChannel]] prefix.
     * @param data The optional data of the message.
     * @note `data` is serialized with the [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so only
     * primitive types and `ArrayBuffers` are allowed.
     */
    public send(channel: string, ...data: any[]): void {
      const listeners = this._listeners.get(channel);
      if (!listeners) {
        return;
      }
      listeners.forEach((l) => l({} as Event, ...data));
    }

    /**
     * Establish a handler to receive messages for a channel through a socket.
     * @param channel The name of the channel for the messages. Must begin with the [[iTwinChannel]] prefix.
     * @param listener A function called when messages are sent over `channel`
     * @note returns A function to call to remove the listener.
     */
    public addListener(channel: string, listener: IpcListener): RemoveFunction {
      let listeners = this._listeners.get(channel);
      if (!listeners) {
        listeners = [];
        this._listeners.set(channel, listeners);
      }
      listeners.push(listener);
      return () => {
        this.removeListener(channel, listener);
      };
    }

    /**
     * Remove a previously registered listener
     * @param channel The name of the channel for the listener previously registered with [[addListener]]
     * @param listener The function passed to [[addListener]]
     */
    public removeListener(channel: string, listener: IpcListener): void {
      const listeners = this._listeners.get(channel);
      if (!listeners) {
        return;
      }
      const index = listeners.findIndex((l) => l === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
});
