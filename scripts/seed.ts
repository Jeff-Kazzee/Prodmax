/**
 * Demo-bench seed (ux-spec §12 step 5) — deterministic via mulberry32 so
 * every rebuild produces the same demo content (ids vary only by clock, per
 * UUIDv7). Wipes all app tables and reseeds:
 *
 *   workspace "Acme Workshop" (acme) · 4 users (password `prodmax-demo`)
 *   team PRO "Product" with the full state set · 10 labels in 2 groups
 *   projects "Payments Reliability" (3 milestones) + "Onboarding Revamp"
 *   24 issues (mixed states/priorities/assignees/estimates, blocked pair,
 *   duplicate pair, sub-issues) · 1 active + 1 completed cycle
 *   4 doc pages with real blocks (heading/todo/callout/code/issue_view)
 *   3 saved views · 5 notifications · activity events · FTS reindex
 *
 * Run: npm run db:migrate && npm run seed
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { hashPassword } from "../src/lib/auth/password.ts";
import {
  allocateIssueIdentifier,
  ensureTeamCounter,
  mulberry32,
  uuid7,
} from "../src/db/ids.ts";
import { rebalanceKeys } from "../src/db/positions.ts";
import { reindexFts } from "../src/db/fts.ts";
import { richTextToPlain, type RichTextNode } from "../src/lib/validation/blocks-richtext.ts";

type Sqlite = Database.Database;

export interface SeedCounts {
  users: number;
  issues: number;
  labels: number;
  pages: number;
  blocks: number;
  views: number;
  notifications: number;
  activityEvents: number;
  activeCycles: number;
}

const SEED = 20260817;
const DEMO_PASSWORD = "prodmax-demo";
const DAY = 86_400_000;
const HOUR = 3_600_000;

function insert(sqlite: Sqlite, table: string, row: Record<string, unknown>): void {
  const keys = Object.keys(row);
  sqlite
    .prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
    .run(...keys.map((k) => row[k]));
}

function count(sqlite: Sqlite, table: string, where = ""): number {
  return (sqlite.prepare(`SELECT count(*) AS n FROM ${table}${where}`).get() as { n: number }).n;
}

/** Delete every app table's rows (FK-safe: constraints off during the wipe). */
function wipe(sqlite: Sqlite): void {
  sqlite.pragma("foreign_keys = OFF");
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'
       AND name NOT LIKE 'search_fts%'`,
    )
    .all() as Array<{ name: string }>;
  sqlite.transaction(() => {
    for (const t of tables) sqlite.exec(`DELETE FROM ${t.name}`);
    // The FTS5 virtual table itself (not its shadow tables) is deletable.
    sqlite.exec("DELETE FROM search_fts");
    if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'").get()) {
      sqlite.exec("DELETE FROM sqlite_sequence WHERE name IN ('activity_events', 'event_log')");
    }
  })();
  sqlite.pragma("foreign_keys = ON");
}

export function seedDemo(sqlite: Sqlite): SeedCounts {
  const rng = mulberry32(SEED);
  const id = (): string => uuid7(rng);
  const NOW = Date.now();
  const ago = (days: number, hours = 0): number => NOW - days * DAY - hours * HOUR;
  const ahead = (days: number): number => NOW + days * DAY;

  wipe(sqlite);

  /* -------------------------------------------------- workspace & users */
  const wsId = id();
  insert(sqlite, "workspaces", {
    id: wsId,
    name: "Acme Workshop",
    slug: "acme",
    timezone: "America/New_York",
    settings: JSON.stringify({ demo_bench: true }),
    created_at: ago(45),
    updated_at: ago(1),
  });

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const users = {
    demo: { id: id(), email: "demo@prodmax.dev", name: "Demo Owner", role: "owner", seed: "demo" },
    maya: { id: id(), email: "maya@prodmax.dev", name: "Maya Chen", role: "admin", seed: "maya" },
    theo: { id: id(), email: "theo@prodmax.dev", name: "Theo Park", role: "member", seed: "theo" },
    sam: { id: id(), email: "sam@prodmax.dev", name: "Sam Rivera", role: "member", seed: "sam" },
  } as const;
  type UserKey = keyof typeof users;
  for (const u of Object.values(users)) {
    insert(sqlite, "users", {
      id: u.id,
      email: u.email,
      password_hash: passwordHash,
      name: u.name,
      avatar_seed: u.seed,
      created_at: ago(44),
      updated_at: ago(2),
      last_seen_at: ago(0, 3),
    });
    insert(sqlite, "workspace_members", {
      id: id(),
      workspace_id: wsId,
      user_id: u.id,
      role: u.role,
      created_at: ago(44),
    });
  }

  /* ------------------------------------------------- team, states, labels */
  const teamId = id();
  const stateIds: Record<string, string> = {};
  const stateRows = [
    { key: "backlog", name: "Backlog", category: "backlog", color: "#8a8f98" },
    { key: "triage", name: "Triage", category: "triage", color: "#f2c94c" },
    { key: "todo", name: "Todo", category: "unstarted", color: "#e2e2e2" },
    { key: "in_progress", name: "In Progress", category: "started", color: "#f2994a" },
    { key: "in_review", name: "In Review", category: "started", color: "#bb6bd9" },
    { key: "done", name: "Done", category: "completed", color: "#5e6ad2" },
    { key: "canceled", name: "Canceled", category: "canceled", color: "#6b6f76" },
  ];
  const statePos = rebalanceKeys(stateRows.length);

  // teams ↔ states is circularly FK'd (default/triage state): insert the team
  // with NULL state refs first, then the states, then backfill the refs.
  insert(sqlite, "teams", {
    id: teamId,
    workspace_id: wsId,
    key: "PRO",
    name: "Product",
    description: "Acme Workshop product engineering",
    timezone: null,
    position: rebalanceKeys(1)[0],
    default_state_id: null,
    triage_enabled: 1,
    triage_state_id: null,
    cycles_enabled: 1,
    cycle_length_days: 14,
    cycle_start_day: 1,
    cooldown_length_days: 2,
    auto_add_to_cycle: 0,
    next_cycle_number: 3,
    estimate_scale: "fibonacci",
    estimate_allow_zero: 0,
    auto_archive_days: 30,
    created_at: ago(44),
    updated_at: ago(5),
    archived_at: null,
  });
  stateRows.forEach((s, i) => {
    stateIds[s.key] = id();
    insert(sqlite, "states", {
      id: stateIds[s.key],
      team_id: teamId,
      name: s.name,
      category: s.category,
      position: statePos[i],
      color: s.color,
    });
  });
  sqlite
    .prepare("UPDATE teams SET default_state_id = ?, triage_state_id = ? WHERE id = ?")
    .run(stateIds.todo, stateIds.triage, teamId);

  ensureTeamCounter(sqlite, teamId);
  for (const u of Object.values(users)) {
    insert(sqlite, "team_members", { id: id(), team_id: teamId, user_id: u.id, created_at: ago(43) });
  }

  const groupIds = { type: id(), area: id() };
  insert(sqlite, "label_groups", { id: groupIds.type, workspace_id: wsId, name: "Type", position: rebalanceKeys(2)[0] });
  insert(sqlite, "label_groups", { id: groupIds.area, workspace_id: wsId, name: "Area", position: rebalanceKeys(2)[1] });

  const labelRows = [
    { key: "bug", name: "Bug", group: "type", color: "#e5484d" },
    { key: "feature", name: "Feature", group: "type", color: "#46a758" },
    { key: "improvement", name: "Improvement", group: "type", color: "#00b2ff" },
    { key: "docs", name: "Docs", group: "type", color: "#8e8e93" },
    { key: "chore", name: "Chore", group: "type", color: "#6b6f76" },
    { key: "payments", name: "Payments", group: "area", color: "#f5a524" },
    { key: "onboarding", name: "Onboarding", group: "area", color: "#9b5de5" },
    { key: "performance", name: "Performance", group: "area", color: "#ef7d43" },
    { key: "security", name: "Security", group: "area", color: "#d6409f" },
    { key: "design", name: "Design", group: "area", color: "#12a594" },
  ];
  const labelIds: Record<string, string> = {};
  labelRows.forEach((l) => {
    labelIds[l.key] = id();
    insert(sqlite, "labels", {
      id: labelIds[l.key],
      workspace_id: wsId,
      team_id: null,
      name: l.name,
      color: l.color,
      description: null,
      group_id: l.group === "type" ? groupIds.type : groupIds.area,
      archived_at: null,
      created_at: ago(40),
    });
  });

  /* --------------------------------------- projects, milestones, cycles */
  const projects = {
    payments: id(),
    onboarding: id(),
  } as const;
  type ProjectKey = keyof typeof projects;
  const dateStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  insert(sqlite, "projects", {
    id: projects.payments,
    workspace_id: wsId,
    name: "Payments Reliability",
    description_md: "Make the payment path boring: no double charges, no dropped webhooks, sub-800ms checkout.",
    status: "started",
    lead_id: users.maya.id,
    target_start_date: dateStr(ago(20)),
    target_end_date: dateStr(ahead(40)),
    color: "#f5a524",
    brief_page_id: null,
    position: rebalanceKeys(2)[0],
    // Derived at the end of this function by repairAllProjects, from the
    // issues actually seeded. See the note there.
    progress_cache: 0,
    progress_points_cache: null,
    update_cadence: "weekly",
    archived_at: null,
    deleted_at: null,
    created_at: ago(21),
    updated_at: ago(8),
  });
  insert(sqlite, "projects", {
    id: projects.onboarding,
    workspace_id: wsId,
    name: "Onboarding Revamp",
    description_md: "First value in under 90 seconds: faster setup, cleaner coach marks, sample data that sings.",
    status: "planned",
    lead_id: users.theo.id,
    target_start_date: dateStr(ahead(7)),
    target_end_date: dateStr(ahead(60)),
    color: "#9b5de5",
    brief_page_id: null,
    position: rebalanceKeys(2)[1],
    progress_cache: 0,
    progress_points_cache: null,
    update_cadence: "off",
    archived_at: null,
    deleted_at: null,
    created_at: ago(14),
    updated_at: ago(2),
  });

  const milestones = { m1: id(), m2: id(), m3: id() } as const;
  const milestoneRows = [
    { key: "m1" as const, name: "Stabilize payouts", target: ahead(10) },
    { key: "m2" as const, name: "Retry infrastructure", target: ahead(30) },
    { key: "m3" as const, name: "Observability GA", target: ahead(75) },
  ];
  const milestonePos = rebalanceKeys(3);
  milestoneRows.forEach((m, i) => {
    insert(sqlite, "milestones", {
      id: milestones[m.key],
      workspace_id: wsId,
      project_id: projects.payments,
      name: m.name,
      target_date: dateStr(m.target),
      position: milestonePos[i],
      created_at: ago(20),
      deleted_at: null,
    });
  });

  const cycles = { completed: id(), active: id() } as const;
  insert(sqlite, "cycles", {
    id: cycles.completed,
    workspace_id: wsId,
    team_id: teamId,
    number: 1,
    name: "Cycle 1",
    starts_at: ago(30),
    ends_at: ago(16),
    status: "completed",
    closed_at: ago(16),
    // Filled in below from the issues that end up on this cycle. The shape
    // `parseStats` accepts is {scope:{issues,points}, completed:{issues,points}};
    // this row used to carry {completed,carried,points}, which parses to zeros,
    // so the closed cycle rendered as one that did nothing.
    stats_snapshot: null,
    created_at: ago(30),
  });
  insert(sqlite, "cycles", {
    id: cycles.active,
    workspace_id: wsId,
    team_id: teamId,
    number: 2,
    name: "Cycle 2",
    starts_at: ago(3),
    ends_at: ahead(11),
    status: "active",
    closed_at: null,
    stats_snapshot: null,
    created_at: ago(30),
  });

  /* ------------------------------------------------------ 24 issues */
  interface IssueSeed {
    title: string;
    description: string;
    state: string;
    priority: number;
    estimate: number | null;
    assignee: UserKey | null;
    creator: UserKey;
    project: ProjectKey | null;
    milestone?: "m1" | "m2" | "m3";
    cycle?: "active" | "completed";
    parent?: number; // index into this array
    labels: string[];
    createdDaysAgo: number;
    updatedDaysAgo: number;
    updatedHoursAgo?: number;
    completedDaysAgo?: number;
    dueInDays?: number;
  }
  const issueSeeds: IssueSeed[] = [
    { title: "Payment latency spike on checkout", description: "Checkout p95 jumped to 2.8s during the 14:00 UTC window. Payment gateway latency cascades into the retry queue. Demo-bench search target: press Cmd+K and type \"payment\".", state: "in_progress", priority: 4, estimate: 3, assignee: "maya", creator: "sam", project: "payments", milestone: "m1", cycle: "active", labels: ["bug", "payments", "performance"], createdDaysAgo: 6, updatedDaysAgo: 0, updatedHoursAgo: 0 },
    { title: "Retries double-charge when gateway times out", description: "When the payment gateway times out after the charge succeeds server-side, our retry logic issues a second charge. Needs an idempotency key on the charge call, not just the refund path.", state: "todo", priority: 4, estimate: 5, assignee: "sam", creator: "maya", project: "payments", milestone: "m1", cycle: "active", labels: ["bug", "payments", "security"], createdDaysAgo: 5, updatedDaysAgo: 1 },
    { title: "Webhook deliveries silently dropped during failover", description: "During the gateway failover drill, 3% of payment webhook deliveries were dropped without a dead-letter entry. Triage queue saw chargebacks before we did.", state: "in_progress", priority: 3, estimate: 3, assignee: "theo", creator: "theo", project: "payments", milestone: "m1", cycle: "active", labels: ["bug", "payments"], createdDaysAgo: 12, updatedDaysAgo: 3 },
    { title: "Add idempotency keys to refund endpoint", description: "Refunds now carry an Idempotency-Key header end-to-end. Duplicate refund requests within 24h collapse to the first result.", state: "done", priority: 3, estimate: 2, assignee: "maya", creator: "maya", project: "payments", milestone: "m1", cycle: "completed", labels: ["improvement", "payments", "security"], createdDaysAgo: 28, updatedDaysAgo: 17, completedDaysAgo: 18 },
    { title: "Payout reconciliation off by cents on multi-currency", description: "Daily payout reconciliation drifts by fractions when a settlement spans currencies — rounding happens twice, once per ledger. Fix is a single rounding point at settlement.", state: "todo", priority: 3, estimate: 8, assignee: "maya", creator: "demo", project: "payments", milestone: "m2", cycle: "active", labels: ["bug", "payments"], createdDaysAgo: 10, updatedDaysAgo: 6, dueInDays: 9 },
    { title: "Retry queue backs up past 10k jobs", description: "The retry queue grows faster than the drain rate during incidents; past 10k jobs, latency compounds and checkout degrades. Shard the drain workers and add backpressure.", state: "in_review", priority: 2, estimate: 5, assignee: "theo", creator: "sam", project: "payments", milestone: "m2", cycle: "active", parent: 1, labels: ["improvement", "payments", "performance"], createdDaysAgo: 9, updatedDaysAgo: 1 },
    { title: "Duplicate payment emails on retry", description: "Customers receive the same payment receipt twice when a retry succeeds after the email send. Same root class as the double-charge bug.", state: "todo", priority: 1, estimate: 1, assignee: "sam", creator: "theo", project: "payments", milestone: "m2", cycle: "active", labels: ["bug", "payments"], createdDaysAgo: 8, updatedDaysAgo: 8 },
    { title: "Gateway cert rotation breaks mTLS pool", description: "Certificate rotation drops established mTLS connections and the pool does not refresh credentials until restart. Needs hot-reload of the client cert store.", state: "backlog", priority: 3, estimate: 3, assignee: null, creator: "maya", project: "payments", milestone: "m3", labels: ["bug", "security"], createdDaysAgo: 15, updatedDaysAgo: 15 },
    { title: "Gateway metrics vanished from the dashboard", description: "The observability dashboard shows zeros for gateway latency and charge success rate — the metrics pipeline lost its namespace after the collector migration.", state: "in_progress", priority: 2, estimate: 2, assignee: "maya", creator: "demo", project: "payments", milestone: "m3", cycle: "active", labels: ["improvement", "payments"], createdDaysAgo: 7, updatedDaysAgo: 2 },
    { title: "Chargeback webhook schema drift", description: "The processor added two fields to the chargeback webhook without a version bump; our parser rejects the payload. Needs a tolerant reader plus a contract test.", state: "triage", priority: 2, estimate: 2, assignee: "theo", creator: "sam", project: "payments", labels: ["bug", "payments"], createdDaysAgo: 1, updatedDaysAgo: 1 },
    { title: "Reduce checkout p95 under 800ms", description: "Checkout p95 must land under 800ms before the holiday traffic window. Payment authorization is 60% of the budget; the rest is rendering and session lookups.", state: "todo", priority: 3, estimate: 8, assignee: "maya", creator: "demo", project: "payments", milestone: "m2", cycle: "active", labels: ["performance", "payments"], createdDaysAgo: 4, updatedDaysAgo: 4, dueInDays: 21 },
    { title: "Sandbox environment resets mid-test", description: "The gateway sandbox wipes fixtures every 6 hours, breaking long e2e payment runs mid-suite. Pin a dedicated sandbox account per run.", state: "backlog", priority: 1, estimate: 3, assignee: "sam", creator: "sam", project: "payments", milestone: "m3", labels: ["bug"], createdDaysAgo: 20, updatedDaysAgo: 20 },
    { title: "Deprecate legacy payments API v1", description: "v1 of the internal payments API still serves 3 services. Migrate them to v2 and freeze v1 behind a deprecation header.", state: "todo", priority: 2, estimate: 5, assignee: null, creator: "theo", project: "payments", milestone: "m3", labels: ["chore", "payments"], createdDaysAgo: 18, updatedDaysAgo: 10 },
    { title: "Payment link preview OG image broken", description: "Shared payment links render a blank card — the OG image endpoint 404s after the CDN path change.", state: "done", priority: 1, estimate: 1, assignee: "theo", creator: "theo", project: "payments", milestone: "m1", cycle: "completed", labels: ["bug"], createdDaysAgo: 26, updatedDaysAgo: 19, completedDaysAgo: 19 },
    { title: "Redesign first-run workspace setup", description: "The first-run wizard buries team creation behind three screens. New layout: workspace, team, invite on one page with a live slug preview.", state: "in_progress", priority: 4, estimate: 5, assignee: "sam", creator: "demo", project: "onboarding", cycle: "active", labels: ["feature", "onboarding", "design"], createdDaysAgo: 8, updatedDaysAgo: 1 },
    { title: "Coach marks overlap on small screens", description: "The 4-step tour coach marks stack on viewport widths under 720px, hiding the Skip button.", state: "todo", priority: 2, estimate: 2, assignee: "theo", creator: "theo", project: "onboarding", labels: ["bug", "onboarding", "design"], createdDaysAgo: 5, updatedDaysAgo: 5 },
    { title: "Sample data seed takes over 10 seconds", description: "Seeding the demo bench blocks the onboarding thread for 10+ seconds on low-end laptops — move it off the critical path and show progress.", state: "in_review", priority: 2, estimate: 2, assignee: "maya", creator: "sam", project: "onboarding", parent: 14, labels: ["performance"], createdDaysAgo: 4, updatedDaysAgo: 2 },
    { title: "Skip-setup path drops invite draft", description: "Choosing \"Skip for now\" after typing invite emails silently discards the drafts. Persist them into the dismissable setup checklist instead.", state: "todo", priority: 3, estimate: 3, assignee: "sam", creator: "sam", project: "onboarding", parent: 14, labels: ["bug", "onboarding"], createdDaysAgo: 3, updatedDaysAgo: 3 },
    { title: "Welcome email lands in spam", description: "The welcome email scores 5.2 on spam filters — missing DMARC alignment and one oversized tracking pixel.", state: "done", priority: 1, estimate: 1, assignee: "theo", creator: "demo", project: "onboarding", cycle: "completed", labels: ["bug"], createdDaysAgo: 25, updatedDaysAgo: 20, completedDaysAgo: 20 },
    { title: "Progress ring stuck at 60 percent", description: "The onboarding progress ring freezes at 60% when the invite step is skipped, leaving users unsure what remains.", state: "todo", priority: 2, estimate: 1, assignee: "maya", creator: "sam", project: "onboarding", labels: ["bug", "onboarding"], createdDaysAgo: 2, updatedDaysAgo: 2 },
    { title: "Add template gallery to blank workspace", description: "Workspaces that start clean get a gallery of issue/page templates instead of an empty sidebar.", state: "backlog", priority: 1, estimate: 5, assignee: null, creator: "maya", project: "onboarding", labels: ["feature", "design"], createdDaysAgo: 16, updatedDaysAgo: 16 },
    { title: "Keyboard shortcuts cheat sheet drift", description: "The shortcuts overlay still lists three bindings we removed and misses the new goto keys.", state: "todo", priority: 0, estimate: 1, assignee: "theo", creator: "theo", project: null, labels: ["docs"], createdDaysAgo: 13, updatedDaysAgo: 13 },
    { title: "Search highlights missing for CJK queries", description: "Full-text search finds CJK results but the highlighter returns empty ranges, so nothing is emphasized.", state: "triage", priority: 2, estimate: 3, assignee: "maya", creator: "maya", project: null, labels: ["bug"], createdDaysAgo: 1, updatedDaysAgo: 1 },
    { title: "Dark theme contrast audit", description: "Run the default dark theme through a contrast audit; several muted labels sit below 4.5:1 on card backgrounds.", state: "todo", priority: 1, estimate: 2, assignee: "sam", creator: "maya", project: null, labels: ["design"], createdDaysAgo: 11, updatedDaysAgo: 11, dueInDays: 14 },
  ];
  if (issueSeeds.length !== 24) throw new Error(`demo bench expects 24 issues, got ${issueSeeds.length}`);

  const issueIds: string[] = [];
  const issuePos = rebalanceKeys(issueSeeds.length);
  const seedIssues = sqlite.transaction(() => {
    issueSeeds.forEach((s, i) => {
      const { number, identifier } = allocateIssueIdentifier(sqlite, teamId);
      const issueId = id();
      issueIds.push(issueId);
      const createdAt = ago(s.createdDaysAgo);
      const updatedAt = ago(s.updatedDaysAgo, s.updatedHoursAgo ?? 0);
      const started = ["in_progress", "in_review", "done"].includes(s.state);
      insert(sqlite, "issues", {
        id: issueId,
        workspace_id: wsId,
        team_id: teamId,
        number,
        identifier,
        title: s.title,
        description_md: s.description,
        state_id: stateIds[s.state],
        priority: s.priority,
        estimate: s.estimate,
        assignee_id: s.assignee === null ? null : users[s.assignee].id,
        creator_id: users[s.creator].id,
        project_id: s.project === null ? null : projects[s.project],
        milestone_id: s.milestone === undefined ? null : milestones[s.milestone],
        cycle_id: s.cycle === undefined ? null : cycles[s.cycle],
        parent_id: s.parent === undefined ? null : issueIds[s.parent],
        due_date: s.dueInDays === undefined ? null : dateStr(ahead(s.dueInDays)),
        position: issuePos[i],
        started_at: started ? createdAt + DAY : null,
        completed_at: s.completedDaysAgo === undefined ? null : ago(s.completedDaysAgo),
        triaged_at: null,
        version: 1,
        archived_at: null,
        deleted_at: null,
        created_at: createdAt,
        updated_at: Math.max(updatedAt, createdAt),
      });
      for (const l of s.labels) {
        insert(sqlite, "issue_labels", { issue_id: issueId, label_id: labelIds[l] });
      }
      insert(sqlite, "issue_subscribers", { issue_id: issueId, user_id: users[s.creator].id, reason: "created", created_at: createdAt });
      if (s.assignee !== null && s.assignee !== s.creator) {
        insert(sqlite, "issue_subscribers", { issue_id: issueId, user_id: users[s.assignee].id, reason: "assigned", created_at: createdAt });
      }
    });

    // Blocked pair: the checkout latency incident is blocked by the retry-queue backup.
    insert(sqlite, "issue_relations", {
      id: id(), workspace_id: wsId, issue_id: issueIds[0], related_issue_id: issueIds[5],
      type: "blocked_by", created_by: users.demo.id, created_at: ago(5),
    });
    // Duplicate pair: the duplicate receipt email duplicates the double-charge report.
    insert(sqlite, "issue_relations", {
      id: id(), workspace_id: wsId, issue_id: issueIds[6], related_issue_id: issueIds[1],
      type: "duplicate", created_by: users.theo.id, created_at: ago(7),
    });
  });
  seedIssues();

  /* View ids are allocated up here, ahead of the views insert below, because
     the Product Home page carries an issue_view block and section 2.6 types
     its props as {viewId}: an embedded saved view, not an issue. */
  const viewIds = { myOpen: id(), paymentsBoard: id(), urgent: id() } as const;

  /* ------------------------------------------------- pages and blocks */
  const pages = { handbook: id(), devEnv: id(), codeReview: id(), productHome: id() } as const;
  type PageKey = keyof typeof pages;
  const rootPos = rebalanceKeys(2);
  const childPos = rebalanceKeys(2);
  const pageRows: Array<{
    key: PageKey;
    parent: PageKey | null;
    title: string;
    icon: string;
    path: string;
    depth: number;
    position: string;
  }> = [
    { key: "handbook", parent: null, title: "Engineering Handbook", icon: "🛠️", path: `/${pages.handbook}`, depth: 0, position: rootPos[0] },
    { key: "devEnv", parent: "handbook", title: "Development Environment", icon: "🧰", path: `/${pages.handbook}/${pages.devEnv}`, depth: 1, position: childPos[0] },
    { key: "codeReview", parent: "handbook", title: "Code Review Guide", icon: "🔍", path: `/${pages.handbook}/${pages.codeReview}`, depth: 1, position: childPos[1] },
    { key: "productHome", parent: null, title: "Product Home", icon: "🚀", path: `/${pages.productHome}`, depth: 0, position: rootPos[1] },
  ];
  for (const p of pageRows) {
    insert(sqlite, "pages", {
      id: pages[p.key],
      workspace_id: wsId,
      parent_id: p.parent === null ? null : pages[p.parent],
      path: p.path,
      title: p.title,
      icon: p.icon,
      creator_id: users.demo.id,
      position: p.position,
      depth: p.depth,
      version: 1,
      archived_at: null,
      deleted_at: null,
      created_at: ago(30),
      updated_at: ago(2),
      updated_by: users.demo.id,
    });
  }

  /**
   * Blocks carry their content in `props`, per the section 2.6 contract, and
   * the `text` column is DERIVED from it below rather than hand-written.
   *
   * The seed used to do the opposite: content lived in `text` and `props` held
   * a different shape per type (callout {style, emoji}, code {language}, todo
   * {checked}, issue_view {issueId, display}). Section 2.6 defines `text` as
   * "extracted plain text of the block", a mirror of props rather than the
   * source, so every spec-conformant reader found seeded pages empty. T-034.
   */
  interface BlockSeed {
    page: keyof typeof pages;
    type: string;
    props: Record<string, unknown>;
  }

  /** A plain richText run, the shape section 2.6 gives every text-bearing type. */
  const t = (text: string): RichTextNode[] => [{ type: "text", text }];

  const blockSeeds: BlockSeed[] = [
    { page: "handbook", type: "heading_1", props: { text: t("Engineering Handbook") } },
    { page: "handbook", type: "paragraph", props: { text: t("How Acme Workshop builds Product: small teams, short cycles, docs beside issues.") } },
    { page: "handbook", type: "heading_2", props: { text: t("How we build") } },
    { page: "handbook", type: "bulleted_list", props: { text: t("Plan before code; validate before merge.") } },
    { page: "handbook", type: "bulleted_list", props: { text: t("Every change ships behind a flag until the demo bench passes.") } },
    { page: "handbook", type: "callout", props: { emoji: "💡", text: t("Deploy any day of the week. Rollbacks are rehearsed, not hoped for.") } },
    { page: "handbook", type: "code", props: { code: "npm ci\nnpm run db:migrate && npm run seed\nnpm run check && npm test", language: "bash", wrap: false } },
    { page: "handbook", type: "todo", props: { checked: true, text: t("Read the Development Environment guide") } },
    { page: "handbook", type: "todo", props: { checked: false, text: t("Pair once with the on-call triage rotation") } },
    { page: "devEnv", type: "heading_2", props: { text: t("Setup") } },
    { page: "devEnv", type: "paragraph", props: { text: t("Node 24, SQLite via better-sqlite3, no external services required.") } },
    { page: "devEnv", type: "code", props: { code: "npm run dev\n# http://localhost:4321, log in as demo@prodmax.dev", language: "bash", wrap: false } },
    { page: "devEnv", type: "todo", props: { checked: true, text: t("Run the full test suite once") } },
    { page: "devEnv", type: "callout", props: { emoji: "⚠️", text: t("Never edit data/prodmax.db while the dev server is running. Reseed instead.") } },
    { page: "codeReview", type: "heading_2", props: { text: t("Review checklist") } },
    { page: "codeReview", type: "paragraph", props: { text: t("Reviews answer two questions: is it correct, and will the next reader understand it?") } },
    { page: "codeReview", type: "todo", props: { checked: false, text: t("Tests cover the failure mode named in the issue") } },
    { page: "codeReview", type: "todo", props: { checked: false, text: t("No workspace-scoped query bypasses the scope guard") } },
    { page: "codeReview", type: "todo", props: { checked: true, text: t("Migrations are additive and reversible") } },
    { page: "codeReview", type: "code", props: { code: "SELECT count(*) FROM issues WHERE workspace_id = ? -- always", language: "sql", wrap: false } },
    { page: "productHome", type: "heading_1", props: { text: t("Product Home") } },
    { page: "productHome", type: "paragraph", props: { text: t("One page that points at everything the team is watching this cycle.") } },
    // Section 2.6 and ux-spec ED-09 both make issue_view an embedded saved
    // VIEW. It used to carry {issueId, display}, which no consumer looks for.
    { page: "productHome", type: "issue_view", props: { viewId: viewIds.urgent, layout: "list" } },
    { page: "productHome", type: "callout", props: { emoji: "🎯", text: t('This incident is the demo-bench search target: press Cmd+K and type "payment".') } },
  ];

  /**
   * The plain text of a block's props, using the same extractor the service
   * layer uses (src/lib/validation/blocks-richtext.ts). Importing it rather
   * than copying it is what stops the seed drifting from the contract again.
   */
  function blockText(seed: BlockSeed): string {
    if (seed.type === "code") return String(seed.props.code ?? "");
    const run = seed.props.text;
    return Array.isArray(run) ? richTextToPlain(run as RichTextNode[]) : "";
  }

  const blocksPerPage = new Map<string, number>();
  for (const b of blockSeeds) {
    const n = (blocksPerPage.get(b.page) ?? 0) + 1;
    blocksPerPage.set(b.page, n);
    insert(sqlite, "blocks", {
      id: id(),
      workspace_id: wsId,
      page_id: pages[b.page],
      parent_id: null,
      type: b.type,
      props: JSON.stringify(b.props),
      position: rebalanceKeys(n)[n - 1],
      text: blockText(b),
      version: 1,
      deleted_at: null,
      created_by: users.demo.id,
      updated_by: users.demo.id,
      created_at: ago(30),
      updated_at: ago(2),
    });
  }

  /* ------------------------------------------------------- saved views */
  const viewRows = [
    {
      name: "My open issues",
      scope: "workspace",
      layout: "list",
      filters: { combinator: "and", children: [
        { field: "assignee", op: "eq", value: "me" },
        { field: "statusCategory", op: "nin", value: ["completed", "canceled"] },
      ] },
      groupBy: null, orderBy: "updated", orderDir: "desc",
      display: { grouping: true, estimates: true },
    },
    {
      name: "Payments board",
      scope: "project",
      projectId: projects.payments,
      layout: "board",
      filters: { combinator: "and", children: [
        { field: "project", op: "eq", value: projects.payments },
      ] },
      groupBy: "status", orderBy: "priority", orderDir: "desc",
      display: { grouping: true, estimates: true },
    },
    {
      name: "Urgent & high",
      scope: "workspace",
      layout: "list",
      filters: { combinator: "and", children: [
        { field: "priority", op: "in", value: ["3", "4"] },
      ] },
      groupBy: null, orderBy: "priority", orderDir: "desc",
      display: { grouping: false, estimates: false },
    },
  ];
  const viewPos = rebalanceKeys(viewRows.length);
  const viewIdOrder = [viewIds.myOpen, viewIds.paymentsBoard, viewIds.urgent];
  viewRows.forEach((v, i) => {
    insert(sqlite, "views", {
      id: viewIdOrder[i],
      workspace_id: wsId,
      owner_id: users.demo.id,
      scope: v.scope,
      team_id: null,
      project_id: v.projectId ?? null,
      name: v.name,
      layout: v.layout,
      filters: JSON.stringify(v.filters),
      group_by: v.groupBy,
      sub_group_by: null,
      order_by: v.orderBy,
      order_dir: v.orderDir,
      display: JSON.stringify(v.display),
      position: viewPos[i],
      created_at: ago(9),
      updated_at: ago(1),
    });
  });

  /* --------------------------------------------- notifications & activity */
  const notificationRows: Array<{
    user: UserKey;
    type: string;
    entity: ["issue" | "cycle", string];
    actor: UserKey | null;
    read: boolean;
    createdDaysAgo: number;
    hours: number;
  }> = [
    { user: "maya", type: "issue.assigned", entity: ["issue", issueIds[0]], actor: "sam", read: false, createdDaysAgo: 0, hours: 5 },
    { user: "sam", type: "issue.assigned", entity: ["issue", issueIds[1]], actor: "maya", read: false, createdDaysAgo: 1, hours: 6 },
    { user: "demo", type: "issue.completed", entity: ["issue", issueIds[3]], actor: "maya", read: true, createdDaysAgo: 17, hours: 0 },
    { user: "theo", type: "mention", entity: ["issue", issueIds[4]], actor: "maya", read: false, createdDaysAgo: 2, hours: 3 },
    { user: "demo", type: "cycle.started", entity: ["cycle", cycles.active], actor: null, read: true, createdDaysAgo: 3, hours: 0 },
  ];
  for (const n of notificationRows) {
    insert(sqlite, "notifications", {
      id: id(),
      workspace_id: wsId,
      user_id: users[n.user].id,
      type: n.type,
      entity_type: n.entity[0],
      entity_id: n.entity[1],
      actor_id: n.actor === null ? null : users[n.actor].id,
      read_at: n.read ? ago(n.createdDaysAgo, 12) : null,
      snoozed_until: null,
      deleted_at: null,
      created_at: ago(n.createdDaysAgo, n.hours),
    });
  }

  const activityRows = [
    { actor: "demo" as UserKey | null, actorKind: "user", verb: "workspace.created", entity: ["workspace", wsId], summary: "Demo created the workspace Acme Workshop", daysAgo: 45 },
    { actor: "sam" as UserKey | null, actorKind: "user", verb: "issue.created", entity: ["issue", issueIds[0]], summary: "Sam filed PRO-1 Payment latency spike on checkout", daysAgo: 6 },
    { actor: "maya" as UserKey | null, actorKind: "user", verb: "issue.updated", entity: ["issue", issueIds[0]], summary: "Maya moved PRO-1 to In Progress and raised priority to Urgent", daysAgo: 5 },
    { actor: "maya" as UserKey | null, actorKind: "user", verb: "issue.completed", entity: ["issue", issueIds[3]], summary: "Maya completed PRO-4 Add idempotency keys to refund endpoint", daysAgo: 18 },
    { actor: "theo" as UserKey | null, actorKind: "user", verb: "issue.completed", entity: ["issue", issueIds[13]], summary: "Theo completed PRO-14 Payment link preview OG image broken", daysAgo: 19 },
    { actor: null, actorKind: "ai", verb: "ai.suggested_label", entity: ["issue", issueIds[9]], summary: "AI suggested labels Bug, Payments for PRO-10 with 0.92 confidence", daysAgo: 1 },
    { actor: null, actorKind: "system", verb: "cycle.started", entity: ["cycle", cycles.active], summary: "Cycle 2 started for team Product", daysAgo: 3 },
    { actor: "sam" as UserKey | null, actorKind: "user", verb: "issue.created", entity: ["issue", issueIds[14]], summary: "Sam filed PRO-15 Redesign first-run workspace setup", daysAgo: 8 },
  ];
  for (const a of activityRows) {
    insert(sqlite, "activity_events", {
      workspace_id: wsId,
      actor_id: a.actor === null ? null : users[a.actor].id,
      actor_kind: a.actorKind,
      verb: a.verb,
      entity_type: a.entity[0],
      entity_id: a.entity[1],
      summary: a.summary,
      data: JSON.stringify({ seed: true }),
      created_at: ago(a.daysAgo),
    });
  }

  /* ------------------------------------------- derived caches (T-025) */

  /**
   * Derive the materialized caches instead of typing them in beside the
   * inserts, which is what this seed used to do.
   *
   * Two defects came from that. The numbers drifted from the rows they claim
   * to summarize, and reads never recompute (§9), so the demo bench served
   * wrong figures until something happened to write an issue. And the shape
   * was the legacy two-field one, which `parseProgressPoints` rejects, so
   * every seeded project started in the degraded state the UI honestly renders
   * as "counts unavailable".
   *
   * The aggregate is raw SQL rather than a call to `repairAllProjects`,
   * because node runs this file directly and cannot resolve the `@/` alias
   * that the services layer imports through. `tests/api/projects-progress-seed`
   * closes that gap from the other side: it runs the real service over a
   * freshly seeded database and requires it to produce exactly these numbers,
   * so the two implementations are pinned to each other.
   *
   * The counted set is the §9 rule: live issues on the project whose state
   * category is not canceled.
   */
  const projectRows = sqlite.prepare(`SELECT id FROM projects WHERE workspace_id = ?`).all(wsId) as Array<{ id: string }>;
  const aggregate = sqlite.prepare(
    `SELECT COUNT(*) AS issuesTotal,
            COALESCE(SUM(CASE WHEN s.category = 'completed' THEN 1 ELSE 0 END), 0) AS issuesDone,
            COALESCE(SUM(COALESCE(i.estimate, 0)), 0) AS total,
            COALESCE(SUM(CASE WHEN s.category = 'completed' THEN COALESCE(i.estimate, 0) ELSE 0 END), 0) AS done
       FROM issues i JOIN states s ON s.id = i.state_id
      WHERE i.workspace_id = ? AND i.project_id = ? AND i.deleted_at IS NULL AND s.category != 'canceled'`,
  );
  const writeProgress = sqlite.prepare(
    `UPDATE projects SET progress_cache = ?, progress_points_cache = ? WHERE id = ?`,
  );
  for (const project of projectRows) {
    const p = aggregate.get(wsId, project.id) as {
      issuesTotal: number;
      issuesDone: number;
      total: number;
      done: number;
    };
    const percent = p.issuesTotal === 0 ? 0 : Math.round((100 * p.issuesDone) / p.issuesTotal);
    writeProgress.run(percent, JSON.stringify(p), project.id);
  }

  /**
   * The closed cycle's frozen snapshot was the same class of defect: a
   * hand-written cache in a shape the parser rejects. It carried
   * {completed, carried, points} where `parseStats` wants
   * {scope:{issues,points}, completed:{issues,points}}, so it parsed to zeros
   * and the closed cycle rendered as one that did nothing.
   */
  const cycleStats = sqlite
    .prepare(
      `SELECT COUNT(*) AS scopeIssues,
              COALESCE(SUM(COALESCE(i.estimate, 0)), 0) AS scopePoints,
              COALESCE(SUM(CASE WHEN s.category = 'completed' THEN 1 ELSE 0 END), 0) AS doneIssues,
              COALESCE(SUM(CASE WHEN s.category = 'completed' THEN COALESCE(i.estimate, 0) ELSE 0 END), 0) AS donePoints
         FROM issues i JOIN states s ON s.id = i.state_id
        WHERE i.cycle_id = ? AND i.deleted_at IS NULL AND s.category != 'canceled'`,
    )
    .get(cycles.completed) as {
    scopeIssues: number;
    scopePoints: number;
    doneIssues: number;
    donePoints: number;
  };
  sqlite
    .prepare(`UPDATE cycles SET stats_snapshot = ? WHERE id = ?`)
    .run(
      JSON.stringify({
        scope: { issues: cycleStats.scopeIssues, points: cycleStats.scopePoints },
        completed: { issues: cycleStats.doneIssues, points: cycleStats.donePoints },
      }),
      cycles.completed,
    );

  /* -------------------------------------------------- FTS reindex & out */
  reindexFts(sqlite);

  return {
    users: count(sqlite, "users"),
    issues: count(sqlite, "issues"),
    labels: count(sqlite, "labels"),
    pages: count(sqlite, "pages"),
    blocks: count(sqlite, "blocks"),
    views: count(sqlite, "views"),
    notifications: count(sqlite, "notifications"),
    activityEvents: count(sqlite, "activity_events"),
    activeCycles: count(sqlite, "cycles", " WHERE status = 'active'"),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dbFile = path.resolve(process.cwd(), "data", "prodmax.db");
  const sqlite = new Database(dbFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const counts = seedDemo(sqlite);
  sqlite.close();
  console.log(`seeded data/prodmax.db (wipe + reseed):`, counts);
}

