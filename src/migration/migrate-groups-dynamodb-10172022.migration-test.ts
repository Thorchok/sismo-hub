import { DocumentClientTypes } from "@typedorm/document-client";
import { migrateGroups } from "./migrate-groups-dynamodb-10172022";
import { testGroupsMigration } from "./migration-test-groups";
import {
  createGroupsEntityManager,
  GroupModel,
  GroupModelLatest,
} from "infrastructure/group-store";
import { getLocalDocumentClient, resetDB } from "infrastructure/utils";
import { AccountSource, GroupMetadata } from "topics/group";

describe("Test migration", () => {
  let latestsGroupsItems: {
    items: GroupModelLatest[];
    cursor?: DocumentClientTypes.Key | undefined;
  };
  const dynamodbClient = getLocalDocumentClient();
  const entityManager = createGroupsEntityManager({
    documentClient: dynamodbClient,
    prefix: "test-",
  });
  const testGroups = testGroupsMigration;

  const createGroup = async (group: GroupMetadata) => {
    const groupMain = GroupModel.fromGroupMetadata(group);
    return entityManager.create(groupMain, {
      overwriteIfExists: true,
    });
  };

  const createGroupLatest = async (group: GroupMetadata) => {
    const groupLatest = GroupModelLatest.fromGroupMetadata(group);
    return entityManager.create(groupLatest, {
      overwriteIfExists: true,
    });
  };

  beforeEach(async () => {
    await resetDB(dynamodbClient);
    await createGroup(testGroups.group1_0);
    await createGroup(testGroups.group1_1);
    await createGroup(testGroups.group2_0);
    await createGroupLatest(testGroups.group1_1);
    await createGroupLatest(testGroups.group2_0);

    latestsGroupsItems = await entityManager.find(
      GroupModelLatest,
      {},
      {
        queryIndex: "GSI1",
      }
    );
  });

  it("should check the initial metadata of groups", async () => {
    const groups: GroupModel[] = [];
    for (const group of latestsGroupsItems.items) {
      const allGroups = await entityManager.find(GroupModel, {
        name: group.name,
      });
      for (const groupGenerated of allGroups.items) {
        groups.push(groupGenerated);
      }
    }
    expect(groups).toHaveLength(3);
    expect(groups).toEqual(
      expect.arrayContaining([
        testGroups.group1_0,
        testGroups.group1_1,
        testGroups.group2_0,
      ])
    );
  });

  it("should migrate groups", async () => {
    await migrateGroups(true, entityManager);

    const groupsItems = await entityManager.find(GroupModel, {
      name: testGroups.group1_0.name,
    });

    const groups = groupsItems.items.map((group) => {
      return group.toGroupMetadata();
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].accountSources).toEqual([AccountSource.ETHEREUM]);
    expect(groups[1].accountSources).toEqual([AccountSource.ETHEREUM]);
  });
});