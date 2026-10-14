import { beforeAll, describe, it, expect } from "vitest";
import {
  initializeWorkerDb,
  TEST_PRINCIPAL,
  TEST_PROJECT,
  TEST_AGENT,
  TEST_CONVERSATION,
} from "../test-db";
import { approvedTestBuild } from "./test-fixture";
import { resolveConversationBuildContext } from "./build-context";
let db: ReturnType<typeof initializeWorkerDb>;
beforeAll(() => {
  db = initializeWorkerDb();
});
describe("explicit build context", () => {
  it("accepts only an owned session from this conversation", async () => {
    const session = await approvedTestBuild(db, TEST_PRINCIPAL, {
      projectId: TEST_PROJECT,
      agentId: TEST_AGENT,
      conversationId: TEST_CONVERSATION,
      brief: "Bygg",
      idempotencyKey: crypto.randomUUID(),
    });
    const ref = {
      projectId: TEST_PROJECT,
      sessionId: session.sessionId,
      viewedRevisionId: null,
    };
    expect(
      await resolveConversationBuildContext(
        db,
        TEST_PRINCIPAL,
        TEST_CONVERSATION,
        ref,
      ),
    ).toEqual(ref);
    await expect(
      resolveConversationBuildContext(
        db,
        TEST_PRINCIPAL,
        crypto.randomUUID(),
        ref,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects non-existent rendered revisions and extra credential fields", async () => {
    const session = await approvedTestBuild(db, TEST_PRINCIPAL, {
      projectId: TEST_PROJECT,
      agentId: TEST_AGENT,
      conversationId: TEST_CONVERSATION,
      brief: "Bygg",
      idempotencyKey: crypto.randomUUID(),
    });
    const ref = {
      projectId: TEST_PROJECT,
      sessionId: session.sessionId,
      viewedRevisionId: crypto.randomUUID(),
    };
    await expect(
      resolveConversationBuildContext(
        db,
        TEST_PRINCIPAL,
        TEST_CONVERSATION,
        ref,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      resolveConversationBuildContext(db, TEST_PRINCIPAL, TEST_CONVERSATION, {
        ...ref,
        key: "secret",
      }),
    ).rejects.toMatchObject({ code: "INVALID_BODY" });
  });
});
