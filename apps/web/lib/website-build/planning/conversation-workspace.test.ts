import { beforeAll, it, expect } from "vitest";
import {
  initializeWorkerDb,
  testSql,
  TEST_PRINCIPAL,
  TEST_PROJECT,
  TEST_AGENT,
} from "../test-db";
import { approvedTestBuild } from "./test-fixture";
import { readConversationWorkspace } from "./conversation-workspace";
let db: ReturnType<typeof initializeWorkerDb>;
beforeAll(() => {
  db = initializeWorkerDb();
});
const conv = () => {
  const id = crypto.randomUUID();
  testSql(
    "insert into conversations(id,user_id,project_id) values('" +
      id +
      "','" +
      TEST_PRINCIPAL.userId +
      "','" +
      TEST_PROJECT +
      "');",
  );
  return id;
};
it("reload restores the owner plan and exact build without trusting saved tool rows", async () => {
  const c = conv(),
    session = await approvedTestBuild(db, TEST_PRINCIPAL, {
      projectId: TEST_PROJECT,
      agentId: TEST_AGENT,
      conversationId: c,
      brief: "Webb",
      idempotencyKey: crypto.randomUUID(),
    });
  const saved = await readConversationWorkspace(db, TEST_PRINCIPAL, c);
  expect(saved.session?.sessionId).toBe(session.sessionId);
  expect(saved.plan?.approvedDecision?.sessionId).toBe(session.sessionId);
});
it("a historical session has its actual brief and no fabricated plan", async () => {
  const c = conv(),
    id = testSql(
      "insert into website_build_sessions(project_id,created_by,agent_id,conversation_id,brief,idempotency_key) values('" +
        TEST_PROJECT +
        "','" +
        TEST_PRINCIPAL.userId +
        "','" +
        TEST_AGENT +
        "','" +
        c +
        "','Ursprunglig brief','" +
        crypto.randomUUID() +
        "') returning id;",
    );
  const old = await readConversationWorkspace(db, TEST_PRINCIPAL, c, id);
  expect(old.plan).toBeNull();
  expect(old.brief).toBe("Ursprunglig brief");
  expect(old.session?.sessionId).toBe(id);
});
it("foreign conversation is refused before its workspace can load", async () => {
  const c = conv();
  await expect(
    readConversationWorkspace(
      db,
      { ...TEST_PRINCIPAL, userId: "20000000-0000-4000-8000-000000000002" },
      c,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
