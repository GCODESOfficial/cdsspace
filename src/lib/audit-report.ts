import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * The Audit & Report data set: logins, conversations, messages, works,
 * invoices, actors and the activity feed, over an arbitrary window.
 *
 * Every source is defensive - a table that does not exist on a deployment
 * reports zero and is listed in `unavailableSources` rather than failing the
 * whole report.
 */

export type AuditReportPayload = {
  generatedAt: string;
  period: { from: string; to: string; fromIso: string; toIso: string };
  stats: {
    totalTrackedEvents: number; logins: number; conversations: number; messages: number;
    works: number; invoices: number; activeActors: number; clients: number; teamMembers: number;
  };
  monthly: Array<{ key: string; label: string; logins: number; messages: number; works: number; invoices: number; projects: number; adminActions: number }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  actors: Array<{ name: string; kind: string; isAdmin: boolean; events: number; lastSeen: string }>;
  recentActivities: ActivityItem[];
  sourceMetrics: SourceMetric[];
  unavailableSources: string[];
};

export type SourceMetric = {
  key: string;
  label: string;
  count: number;
  available: boolean;
};

export type ActivityItem = {
  id: string;
  actor_kind: "admin" | "team" | "system";
  actor_name: string;
  actor_is_admin: boolean;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  page: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tableCache = new Map<string, boolean>();

function ident(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

function monthKey(dateLike: string | Date) {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1]} ${year}`;
}

function buildMonthKeys(fromIso: string, toIso: string) {
  const keys: string[] = [];
  const cursor = new Date(fromIso);
  cursor.setUTCDate(1);
  const end = new Date(toIso);
  end.setUTCDate(1);
  while (cursor <= end) {
    keys.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

async function safeQuery<T = any>(label: string, sql: string, params: unknown[] = [], fallback: T[] = []) {
  try {
    return await glashQuery<any>(sql, params) as T[];
  } catch (error) {
    console.error(`[audit-report] ${label} failed:`, error);
    return fallback;
  }
}

async function tableExists(table: string) {
  if (tableCache.has(table)) return tableCache.get(table)!;
  const rows = await safeQuery<{ exists: boolean }>(
    `exists:${table}`,
    "select to_regclass($1) is not null as exists",
    [`public.${table}`],
    [{ exists: false }],
  );
  const exists = Boolean(rows[0]?.exists);
  tableCache.set(table, exists);
  return exists;
}

async function countSource(
  key: string,
  label: string,
  table: string,
  dateColumn: string,
  fromIso: string,
  toIso: string,
  extraWhere = "",
): Promise<SourceMetric> {
  if (!(await tableExists(table))) return { key, label, count: 0, available: false };
  const where = extraWhere ? `and ${extraWhere}` : "";
  const rows = await safeQuery<{ count: number }>(
    key,
    `select count(*)::int as count
     from public.${ident(table)}
     where ${ident(dateColumn)} >= $1 and ${ident(dateColumn)} <= $2 ${where}`,
    [fromIso, toIso],
    [{ count: 0 }],
  );
  return { key, label, count: Number(rows[0]?.count || 0), available: true };
}

async function distinctSource(
  key: string,
  label: string,
  table: string,
  column: string,
  dateColumn: string,
  fromIso: string,
  toIso: string,
): Promise<SourceMetric> {
  if (!(await tableExists(table))) return { key, label, count: 0, available: false };
  const rows = await safeQuery<{ count: number }>(
    key,
    `select count(distinct ${ident(column)})::int as count
     from public.${ident(table)}
     where ${ident(dateColumn)} >= $1 and ${ident(dateColumn)} <= $2`,
    [fromIso, toIso],
    [{ count: 0 }],
  );
  return { key, label, count: Number(rows[0]?.count || 0), available: true };
}

async function monthlyCounts(
  table: string,
  dateColumn: string,
  fromIso: string,
  toIso: string,
  extraWhere = "",
) {
  if (!(await tableExists(table))) return new Map<string, number>();
  const where = extraWhere ? `and ${extraWhere}` : "";
  const rows = await safeQuery<{ bucket: string; count: number }>(
    `monthly:${table}`,
    `select to_char(date_trunc('month', ${ident(dateColumn)}), 'YYYY-MM') as bucket,
            count(*)::int as count
     from public.${ident(table)}
     where ${ident(dateColumn)} >= $1 and ${ident(dateColumn)} <= $2 ${where}
     group by 1
     order by 1`,
    [fromIso, toIso],
  );
  return new Map(rows.map((row) => [row.bucket, Number(row.count || 0)]));
}

function addMapValues(target: Map<string, number>, source: Map<string, number>) {
  source.forEach((value, key) => target.set(key, (target.get(key) || 0) + value));
}

function mergeActorRows(rows: Array<{ actor_name: string; actor_kind: string; actor_is_admin: boolean; events: number; last_seen: string }>) {
  const actors = new Map<string, { name: string; kind: string; isAdmin: boolean; events: number; lastSeen: string }>();
  for (const row of rows) {
    const name = row.actor_name || "Unknown";
    const key = `${row.actor_kind}:${name}`;
    const current = actors.get(key);
    if (!current) {
      actors.set(key, {
        name,
        kind: row.actor_kind || "system",
        isAdmin: Boolean(row.actor_is_admin),
        events: Number(row.events || 0),
        lastSeen: row.last_seen,
      });
      continue;
    }
    current.events += Number(row.events || 0);
    if (new Date(row.last_seen).getTime() > new Date(current.lastSeen).getTime()) {
      current.lastSeen = row.last_seen;
    }
  }
  return Array.from(actors.values()).sort((a, b) => b.events - a.events || new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

/**
 * Everything the Audit & Report page shows, for one period.
 *
 * Lifted out of the admin route so the end-of-day email reads from exactly the
 * same source. Two implementations would drift apart, and the report is only
 * useful if its numbers are the ones on screen.
 */
export async function collectAuditReport(range: { from: string; to: string; fromIso: string; toIso: string }): Promise<AuditReportPayload> {
  const { from, to, fromIso, toIso } = range;
  const monthKeys = buildMonthKeys(fromIso, toIso);

  const [
    adminLogins,
    teamLogins,
    teamDeviceSessions,
    faceLoginEvents,
    clientChatRooms,
    teamChatThreads,
    clientMessages,
    teamMessages,
    works,
    portfolioDesigns,
    designRequests,
    bannerRequests,
    merchOrders,
    invoices,
    projects,
    teamMembers,
    clients,
    expenditures,
    adminActions,
    projectEvents,
    chatAuditEvents,
  ] = await Promise.all([
    countSource("admin_logins", "Admin logins", "admin_activity_log", "created_at", fromIso, toIso, "action = 'admin.login'"),
    countSource("team_logins", "Team login events", "admin_activity_log", "created_at", fromIso, toIso, "action = 'team.login'"),
    countSource("team_sessions", "Team device sessions", "team_device_sessions", "created_at", fromIso, toIso),
    countSource("face_logins", "Face login checks", "team_face_verification_events", "created_at", fromIso, toIso, "event_type = 'login'"),
    distinctSource("client_chat_rooms", "Client conversations", "chat_messages", "room_id", "created_at", fromIso, toIso),
    countSource("team_chat_threads", "Team chat threads", "team_chat_threads", "created_at", fromIso, toIso),
    countSource("client_messages", "Client messages", "chat_messages", "created_at", fromIso, toIso),
    countSource("team_messages", "Team messages", "team_chat_messages", "created_at", fromIso, toIso),
    countSource("works", "Uploaded works", "works", "created_at", fromIso, toIso),
    countSource("portfolio_designs", "Portfolio designs", "portfolio_designs", "created_at", fromIso, toIso),
    countSource("design_requests", "Design requests", "design_requests", "created_at", fromIso, toIso),
    countSource("banner_requests", "Banner requests", "banner_requests", "created_at", fromIso, toIso),
    countSource("merch_orders", "Merch orders", "merch_orders", "created_at", fromIso, toIso),
    countSource("invoices", "Invoices created", "finance_invoices", "created_at", fromIso, toIso),
    countSource("projects", "Projects created", "finance_projects", "created_at", fromIso, toIso),
    countSource("team_members", "Team members added", "team_members", "created_at", fromIso, toIso),
    countSource("clients", "Client accounts", "profiles", "created_at", fromIso, toIso),
    countSource("expenditures", "Expenditures logged", "finance_expenditures", "created_at", fromIso, toIso),
    countSource("admin_actions", "Admin activity rows", "admin_activity_log", "created_at", fromIso, toIso, "action not in ('admin.login','team.login')"),
    countSource("project_events", "Project activity events", "project_activity_events", "created_at", fromIso, toIso),
    countSource("chat_audit_events", "Chat audit events", "team_chat_audit_logs", "created_at", fromIso, toIso),
  ]);

  const adminLoginCount = adminLogins.count;
  const teamLoginCount = Math.max(teamLogins.count, teamDeviceSessions.count, faceLoginEvents.count);
  const loginCount = adminLoginCount + teamLoginCount;
  const conversationsCount = clientChatRooms.count + teamChatThreads.count;
  const messageCount = clientMessages.count + teamMessages.count;
  const workCount = works.count + portfolioDesigns.count + designRequests.count + bannerRequests.count + merchOrders.count;
  const invoiceCount = invoices.count;
  const totalTrackedEvents =
    loginCount +
    conversationsCount +
    messageCount +
    workCount +
    invoiceCount +
    projects.count +
    expenditures.count +
    adminActions.count +
    projectEvents.count +
    chatAuditEvents.count;

  const [
    loginAdminMonthly,
    loginTeamMonthly,
    sessionMonthly,
    clientMessageMonthly,
    teamMessageMonthly,
    worksMonthly,
    portfolioMonthly,
    designMonthly,
    bannerMonthly,
    merchMonthly,
    invoiceMonthly,
    projectMonthly,
    adminMonthly,
  ] = await Promise.all([
    monthlyCounts("admin_activity_log", "created_at", fromIso, toIso, "action = 'admin.login'"),
    monthlyCounts("admin_activity_log", "created_at", fromIso, toIso, "action = 'team.login'"),
    monthlyCounts("team_device_sessions", "created_at", fromIso, toIso),
    monthlyCounts("chat_messages", "created_at", fromIso, toIso),
    monthlyCounts("team_chat_messages", "created_at", fromIso, toIso),
    monthlyCounts("works", "created_at", fromIso, toIso),
    monthlyCounts("portfolio_designs", "created_at", fromIso, toIso),
    monthlyCounts("design_requests", "created_at", fromIso, toIso),
    monthlyCounts("banner_requests", "created_at", fromIso, toIso),
    monthlyCounts("merch_orders", "created_at", fromIso, toIso),
    monthlyCounts("finance_invoices", "created_at", fromIso, toIso),
    monthlyCounts("finance_projects", "created_at", fromIso, toIso),
    monthlyCounts("admin_activity_log", "created_at", fromIso, toIso, "action not in ('admin.login','team.login')"),
  ]);

  const loginsMonthly = new Map<string, number>();
  addMapValues(loginsMonthly, loginAdminMonthly);
  if (loginTeamMonthly.size > 0) addMapValues(loginsMonthly, loginTeamMonthly);
  else addMapValues(loginsMonthly, sessionMonthly);

  const messagesMonthly = new Map<string, number>();
  addMapValues(messagesMonthly, clientMessageMonthly);
  addMapValues(messagesMonthly, teamMessageMonthly);

  const workMonthly = new Map<string, number>();
  [worksMonthly, portfolioMonthly, designMonthly, bannerMonthly, merchMonthly].forEach((map) => addMapValues(workMonthly, map));

  const monthly = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    logins: loginsMonthly.get(key) || 0,
    messages: messagesMonthly.get(key) || 0,
    works: workMonthly.get(key) || 0,
    invoices: invoiceMonthly.get(key) || 0,
    projects: projectMonthly.get(key) || 0,
    adminActions: adminMonthly.get(key) || 0,
  }));

  const activityRows = await safeQuery<ActivityItem>(
    "recent admin activities",
    `select id::text, actor_kind, actor_name, actor_is_admin, action, resource_type, resource_id,
            resource_label, page, metadata, created_at
     from public.admin_activity_log
     where created_at >= $1 and created_at <= $2
     order by created_at desc
     limit 120`,
    [fromIso, toIso],
  );

  const projectRows = (await safeQuery<any>(
    "recent project activities",
    `select e.id::text,
            case when e.actor_is_admin then 'admin' else 'team' end as actor_kind,
            coalesce(tm.full_name, case when e.actor_is_admin then 'Admin' else 'Team member' end, 'System') as actor_name,
            e.actor_is_admin,
            e.action,
            'project' as resource_type,
            e.project_id::text as resource_id,
            e.title as resource_label,
            'projects' as page,
            e.metadata,
            e.created_at
     from public.project_activity_events e
     left join public.team_members tm on tm.id = e.actor_member_id
     where e.created_at >= $1 and e.created_at <= $2
     order by e.created_at desc
     limit 80`,
    [fromIso, toIso],
  )).map((row) => row as ActivityItem);

  const chatAuditRows = (await safeQuery<any>(
    "recent chat audit activities",
    `select id::text,
            coalesce(actor_kind, 'system') as actor_kind,
            coalesce(actor_key, 'System') as actor_name,
            actor_kind = 'admin' as actor_is_admin,
            action,
            coalesce(resource_type, 'chat') as resource_type,
            resource_id,
            coalesce(resource_type, 'Chat event') as resource_label,
            'chat' as page,
            metadata,
            created_at
     from public.team_chat_audit_logs
     where created_at >= $1 and created_at <= $2
     order by created_at desc
     limit 80`,
    [fromIso, toIso],
  )).map((row) => row as ActivityItem);

  const recentActivities = [...activityRows, ...projectRows, ...chatAuditRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 120);

  const adminActorRows = await safeQuery<any>(
    "actor summary",
    `select actor_name, actor_kind, actor_is_admin, count(*)::int as events, max(created_at)::text as last_seen
     from public.admin_activity_log
     where created_at >= $1 and created_at <= $2
     group by actor_name, actor_kind, actor_is_admin
     order by events desc, last_seen desc
     limit 40`,
    [fromIso, toIso],
  );

  const sessionActorRows = await safeQuery<any>(
    "session actor summary",
    `select coalesce(tm.full_name, tm.email, 'Team member') as actor_name,
            'team' as actor_kind,
            false as actor_is_admin,
            count(*)::int as events,
            max(s.created_at)::text as last_seen
     from public.team_device_sessions s
     left join public.team_members tm on tm.id = s.team_member_id
     where s.created_at >= $1 and s.created_at <= $2
     group by coalesce(tm.full_name, tm.email, 'Team member')
     order by events desc
     limit 40`,
    [fromIso, toIso],
  );

  const actors = mergeActorRows([...adminActorRows, ...sessionActorRows]).slice(0, 30);
  const activeActors = actors.length;

  const categorySeed = new Map<string, number>([
    ["Logins", loginCount],
    ["Messages", messageCount],
    ["Works", workCount],
    ["Finance", invoiceCount + expenditures.count],
    ["Projects", projects.count + projectEvents.count],
    ["Team & HRM", teamMembers.count],
    ["Admin actions", adminActions.count + chatAuditEvents.count],
  ]);
  const categoryBreakdown = Array.from(categorySeed.entries())
    .map(([category, count]) => ({ category, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  const sourceMetrics = [
    adminLogins,
    teamLogins,
    teamDeviceSessions,
    faceLoginEvents,
    clientChatRooms,
    teamChatThreads,
    clientMessages,
    teamMessages,
    works,
    portfolioDesigns,
    designRequests,
    bannerRequests,
    merchOrders,
    invoices,
    projects,
    teamMembers,
    clients,
    expenditures,
    adminActions,
    projectEvents,
    chatAuditEvents,
  ];

  return {
    generatedAt: new Date().toISOString(),
    period: { from, to, fromIso, toIso },
    stats: {
      totalTrackedEvents,
      logins: loginCount,
      conversations: conversationsCount,
      messages: messageCount,
      works: workCount,
      invoices: invoiceCount,
      activeActors,
      clients: clients.count,
      teamMembers: teamMembers.count,
    },
    monthly,
    categoryBreakdown,
    actors,
    recentActivities,
    sourceMetrics,
    unavailableSources: sourceMetrics.filter((source) => !source.available).map((source) => source.label),
  };
}
