import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [session, server, catalog, createApp, letterheads, upload, asset, sessionRoute, createPage, clientSidebar, teamSidebar, adminSidebar, migration, teamMigration, quotaMigration] = await Promise.all([
  readFile("src/lib/create-platform/session.ts", "utf8"),
  readFile("src/lib/create-platform/server.ts", "utf8"),
  readFile("src/lib/create-platform/catalog.ts", "utf8"),
  readFile("src/components/create/CreateApp.tsx", "utf8"),
  readFile("src/lib/create-platform/letterheads.ts", "utf8"),
  readFile("src/app/api/create/letterheads/[id]/upload/route.ts", "utf8"),
  readFile("src/app/api/create/letterheads/[id]/asset/[kind]/route.ts", "utf8"),
  readFile("src/app/api/create/session/route.ts", "utf8"),
  readFile("src/app/create/page.tsx", "utf8"),
  readFile("src/components/layout/Sidebar.tsx", "utf8"),
  readFile("src/components/team/TeamSidebar.tsx", "utf8"),
  readFile("src/components/admin/AdminSidebar.tsx", "utf8"),
  readFile("glashdb/migrations/20260917_create_workspace_isolation.sql", "utf8"),
  readFile("glashdb/migrations/20260922_create_team_workspace_isolation.sql", "utf8"),
  readFile("glashdb/migrations/20260918_create_storage_2gb.sql", "utf8"),
]);

test("client CREATE ownership comes only from the verified stable profile ID", () => {
  assert.match(session, /client\.user\.id !== client\.profile\.id/);
  assert.match(session, /id: client\.profile\.id/);
  assert.doesNotMatch(session, /get\("(?:owner|userId)/);
  assert.match(session, /parseCreateWorkspaceKind/);
  assert.match(session, /if \(preferredKind === "client"\) return getClientCreateActor\(\)/);
  assert.match(session, /\(await getClientCreateActor\(\)\)[\s\S]+\(await getTeamCreateActor\(\)\)[\s\S]+\(await getAdminCreateActor\(\)\)/);
  assert.match(session, /workspaceReference: client\.profile\.public_user_id/);
  assert.match(session, /workspaceReference: privateWorkspaceReference\("team", team\.id\)/);
  assert.match(session, /createHash\("sha256"\)/);
  assert.match(session, /Omit<CreateActor, "id">/);
  assert.match(session, /Never serialize the internal database owner ID to the browser/);
  assert.match(createPage, /actor: publicCreateActor\(actor\)/);
  assert.match(sessionRoute, /actor: publicCreateActor\(actor\)/);
  assert.match(createApp, /Private workspace/);
  assert.match(createApp, /actor\.workspaceReference/);
});

test("each portal selects an explicit CREATE workspace and APIs preserve it", () => {
  assert.match(clientSidebar, /\/create\?workspace=client/);
  assert.match(teamSidebar, /\/create\?workspace=team/);
  assert.match(adminSidebar, /\/create\?workspace=admin/);
  assert.match(createPage, /getCreateActor\(requestedWorkspace\)/);
  assert.match(createApp, /createApiPath\("\/api\/create\/session", workspaceKind\)/);
  assert.match(sessionRoute, /getCreateActorFromRequest\(request\)/);
  assert.match(asset, /getCreateActorFromRequest\(req\)/);
  assert.match(letterheads, /\?workspace=\$\{actor\.kind\}&v=/);
});

test("CREATE presents role-aware dashboard labels and the Premium tier", () => {
  assert.match(session, /dashboardLabel: "User Dashboard"/);
  assert.match(session, /dashboardLabel: "Team Dashboard"/);
  assert.match(session, /dashboardLabel: "Admin Dashboard"/);
  assert.match(createApp, /actor\?\.kind === "admin" \? "Premium"/);
  assert.doesNotMatch(createApp, /"Unlimited"/);
});

test("existing and future CREATE workspaces use the 2 GiB quota", () => {
  assert.match(catalog, /CREATE_STORAGE_LIMIT_BYTES = 2 \* 1024 \* 1024 \* 1024/);
  assert.match(server, /storageLimitBytes: Number\(row\?\.storage_limit_bytes \|\| CREATE_STORAGE_LIMIT_BYTES\)/);
  assert.match(server, /storageLimitBytes: CREATE_STORAGE_LIMIT_BYTES/);
  assert.match(quotaMigration, /set default 2147483648/);
  assert.match(quotaMigration, /set storage_limit_bytes = 2147483648/);
});

test("all dashboard reads and writes retain owner predicates", () => {
  const predicates = server.match(/owner_kind = \$1 and owner_id = \$2/g) || [];
  assert.ok(predicates.length >= 10, "expected owner predicates on CREATE queries");
  assert.match(server, /async function ownedProjectId/);
  assert.match(server, /The selected project is not available in this workspace/);
  assert.match(server, /const projectId = await ownedProjectId/);
});

test("private assets use an opaque owner prefix and are never publicly cached", () => {
  assert.match(letterheads, /createPrivateAssetPrefix/);
  assert.match(letterheads, /isCreatePrivateAssetPath/);
  assert.match(upload, /createPrivateAssetPrefix\(actor\)/);
  assert.match(asset, /isCreatePrivateAssetPath\(actor, row\.path\)/);
  assert.match(asset, /private, no-store, max-age=0/);
  assert.match(asset, /Vary: "Cookie"/);
  assert.match(sessionRoute, /private, no-store, max-age=0/);
  assert.match(sessionRoute, /Vary: "Cookie"/);
});

test("database enforces client profile ownership and same-workspace relations", () => {
  assert.match(migration, /generated always as[\s\S]+owner_kind = ''client''[\s\S]+owner_id::uuid/i);
  assert.match(migration, /references public\.profiles\(id\) on delete cascade/i);
  assert.match(migration, /foreign key \(project_id, owner_kind, owner_id\)/i);
  assert.match(migration, /foreign key \(creation_id, owner_kind, owner_id\)/i);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on table/i);
  assert.match(migration, /create-private-assets[\s\S]+false/i);
});

test("database ties team CREATE records to stable team-member IDs", () => {
  assert.match(teamMigration, /generated always as[\s\S]+owner_kind = ''team''[\s\S]+owner_id::uuid/i);
  assert.match(teamMigration, /references public\.team_members\(id\) on delete cascade/i);
  assert.match(teamMigration, /create_letterheads/);
  assert.match(teamMigration, /create_jobs/);
});
