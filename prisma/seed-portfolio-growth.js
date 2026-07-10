/**
 * Portfolio growth seeder — REALISM_PLAN.md Steps 2–4.
 *
 * DEMO DATA ONLY: timestamps (createdAt, resolvedAt, activity history) are
 * fabricated relative to the run date so the portfolio looks recently active.
 * A real product would never backdate records — these fields are normally
 * write-once, set by the DB at insert time.
 *
 * Adds 12 companies (the REALISM_PLAN cast), 4 vendor users, ~14 onboardings
 * across the lifecycle mix (fresh / mid-flight / near go-live / completed),
 * ~320 playbook tasks with dependency chains, contacts, comments, and
 * backfilled ActivityLog rows.
 *
 * SAFETY:
 *   - Default mode is DRY-RUN: computes everything, prints a summary, writes
 *     NOTHING. Pass --write to actually insert.
 *   - Additive + idempotent: any company whose name already exists is skipped
 *     entirely, so re-running never duplicates.
 *   - Each company's whole object graph is created inside one transaction, so
 *     a failure can't leave a half-seeded company.
 *
 * Run via:  npx tsx prisma/seed-portfolio-growth.js            (dry-run)
 *           npx tsx prisma/seed-portfolio-growth.js --write    (insert)
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const WRITE = process.argv.includes("--write");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ── Date helpers — everything is relative to the run date ───────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);
const ymd = (d) => d.toISOString().slice(0, 10);
const dueAgo = (n) => ymd(daysAgo(n)); // Task.due is a "YYYY-MM-DD" string
const dueIn = (n) => ymd(daysFromNow(n));

// ── Vendor team (Step 3) — upserted by email, no Supabase accounts ──────────
const VENDOR_USERS = [
  { key: "maya", name: "Maya Lindqvist", email: "maya@vector.test", title: "Implementation Manager" },
  { key: "theo", name: "Theo Okonkwo", email: "theo@vector.test", title: "Solutions Engineer" },
  { key: "ines", name: "Ines Ferreira", email: "ines@vector.test", title: "Customer Success Manager" },
  { key: "sam", name: "Sam Whitfield", email: "sam@vector.test", title: "Implementation Manager" },
];
const CAROLINE_EMAIL = "jaworskycaroline@gmail.com";
const VENDOR_NAME = {
  maya: "Maya Lindqvist",
  theo: "Theo Okonkwo",
  ines: "Ines Ferreira",
  sam: "Sam Whitfield",
  caroline: "Caroline Jaworsky",
};

// ── The 6-phase implementation playbook (Step 4) ─────────────────────────────
const PHASE_NAMES = [
  "Kickoff & Discovery",
  "Technical Setup & Connectivity",
  "Semantic Layer & Modeling",
  "Content Build & Migration",
  "Security, Governance & Access",
  "Training, Rollout & Go-live",
];

// Vendor-side tasks that go to the Solutions Engineer rather than the
// onboarding owner (deeply technical work).
const SE_TASK_KEYS = new Set(["t3", "t4", "s4", "g3", "g4"]);

/**
 * Task template per onboarding. `side` decides ownerId (vendor) vs
 * assigneeContactId (customer). `blockedBy` references another key —
 * dependencies follow the natural order (service account → repo connect →
 * compile → metrics → dashboards → parity → go-live review).
 */
function playbookTasks(p) {
  return [
    // Phase 0 — Kickoff & Discovery
    { key: "k1", phaseIdx: 0, side: "vendor", priority: "high", title: "Kickoff call: goals, stakeholders, rollout timeline" },
    { key: "k2", phaseIdx: 0, side: "customer", slot: "sponsor", priority: "medium", title: `Document current ${p.biTool} reporting landscape and top dashboards` },
    { key: "k3", phaseIdx: 0, side: "vendor", priority: "medium", title: "Define success metrics and pilot scope" },
    // Phase 1 — Technical Setup & Connectivity
    { key: "t1", phaseIdx: 1, side: "customer", slot: "it", priority: "high", title: `Provision ${p.warehouse} service account with read-only access to ANALYTICS schema` },
    { key: "t2", phaseIdx: 1, side: "customer", slot: "it", priority: "medium", blockedBy: "t1", title: `Add Vector Cloud static IPs to ${p.warehouse} network policy` },
    { key: "t3", phaseIdx: 1, side: "vendor", priority: "high", blockedBy: "t1", title: `Connect dbt project repo (${p.git}) to Vector` },
    { key: "t4", phaseIdx: 1, side: "vendor", priority: "high", blockedBy: "t3", title: "First clean dbt compile in Vector staging" },
    // Phase 2 — Semantic Layer & Modeling
    { key: "s1", phaseIdx: 2, side: "vendor", priority: "high", blockedBy: "t4", title: "Define first 10 metrics in dbt .yml" },
    { key: "s2", phaseIdx: 2, side: "customer", slot: "champion", priority: "medium", title: `Add metrics block to ${p.factTable}.yml and review naming conventions` },
    { key: "s3", phaseIdx: 2, side: "customer", slot: "sponsor", priority: "medium", blockedBy: "s1", title: "Validate metric definitions with the data team" },
    { key: "s4", phaseIdx: 2, side: "vendor", priority: "low", title: "Set up CI checks on semantic layer changes" },
    // Phase 3 — Content Build & Migration
    { key: "c1", phaseIdx: 3, side: "customer", slot: "champion", priority: "medium", title: `Inventory ${p.biTool} dashboards to migrate (top 20)` },
    { key: "c2", phaseIdx: 3, side: "vendor", priority: "high", blockedBy: "s1", title: "Rebuild executive KPI dashboard in Vector" },
    { key: "c3", phaseIdx: 3, side: "vendor", priority: "medium", blockedBy: "c2", title: "Migrate team dashboards (batch 1)" },
    { key: "c4", phaseIdx: 3, side: "customer", slot: "sponsor", priority: "high", blockedBy: "c3", title: `Validate migrated numbers against ${p.biTool} (parity sign-off)` },
    // Phase 4 — Security, Governance & Access
    { key: "g1", phaseIdx: 4, side: "customer", slot: "security", priority: "high", title: "Complete infosec review and security questionnaire" },
    { key: "g2", phaseIdx: 4, side: "customer", slot: "it", priority: "high", title: `Configure ${p.idp} SAML SSO` },
    { key: "g3", phaseIdx: 4, side: "vendor", priority: "medium", title: "Map roles and row-level permissions to teams" },
    { key: "g4", phaseIdx: 4, side: "vendor", priority: "medium", title: "Set guardrails for AI-generated queries" },
    // Phase 5 — Training, Rollout & Go-live
    { key: "r1", phaseIdx: 5, side: "vendor", priority: "medium", title: "Run developer training: metrics-as-code workflow" },
    { key: "r2", phaseIdx: 5, side: "vendor", priority: "medium", title: "Enable AI analyst for pilot group and collect feedback" },
    { key: "r3", phaseIdx: 5, side: "customer", slot: "sponsor", priority: "low", title: "Company-wide rollout comms and docs" },
    { key: "r4", phaseIdx: 5, side: "vendor", priority: "high", blockedBy: "c4", title: "Go-live readiness review (parity, SSO, permissions)" },
  ];
}

// ── The cast (Step 2) — explicit prefixes; derivePrefix would collide ────────
// params drive the playbook titles so each rollout reads differently.
const CAST = [
  { name: "Raycast", domain: "raycast.com", prefix: "RAY", slug: "raycast", params: { warehouse: "BigQuery", git: "GitHub", idp: "Google Workspace", biTool: "Metabase", factTable: "fct_installs" } },
  { name: "beehiiv", domain: "beehiiv.com", prefix: "BEE", slug: "beehiiv", params: { warehouse: "Snowflake", git: "GitHub", idp: "Okta", biTool: "Looker", factTable: "fct_subscriptions" } },
  { name: "Modal", domain: "modal.com", prefix: "MDL", slug: "modal", params: { warehouse: "Snowflake", git: "GitHub", idp: "Google Workspace", biTool: "Mode", factTable: "fct_compute_usage" } },
  { name: "Loop Returns", domain: "loopreturns.com", prefix: "LOOP", slug: "loopreturns", params: { warehouse: "Snowflake", git: "GitHub", idp: "Okta", biTool: "Looker", factTable: "fct_returns" } },
  { name: "Huel", domain: "huel.com", prefix: "HUEL", slug: "huel", params: { warehouse: "BigQuery", git: "GitHub", idp: "Microsoft Entra", biTool: "Tableau", factTable: "fct_orders" } },
  { name: "Function Health", domain: "functionhealth.com", prefix: "FN", slug: "functionhealth", params: { warehouse: "Snowflake", git: "GitLab", idp: "Okta", biTool: "Tableau", factTable: "fct_lab_panels" } },
  { name: "Flock Freight", domain: "flockfreight.com", prefix: "FLK", slug: "flockfreight", params: { warehouse: "Snowflake", git: "GitHub", idp: "Okta", biTool: "Looker", factTable: "fct_shipments" } },
  { name: "Sylvera", domain: "sylvera.com", prefix: "SYL", slug: "sylvera", params: { warehouse: "BigQuery", git: "GitHub", idp: "Google Workspace", biTool: "Looker", factTable: "fct_project_ratings" } },
  { name: "ChowNow", domain: "chownow.com", prefix: "CHOW", slug: "chownow", params: { warehouse: "Redshift", git: "GitHub", idp: "Okta", biTool: "Tableau", factTable: "fct_orders" } },
  { name: "Ashby", domain: "ashbyhq.com", prefix: "ASH", slug: "ashby", params: { warehouse: "Snowflake", git: "GitHub", idp: "Okta", biTool: "Mode", factTable: "fct_pipeline" } },
  { name: "Peerspace", domain: "peerspace.com", prefix: "PEER", slug: "peerspace", params: { warehouse: "BigQuery", git: "GitHub", idp: "Google Workspace", biTool: "Looker", factTable: "fct_bookings" } },
  { name: "Patch", domain: "patch.io", prefix: "PAT", slug: "patch", params: { warehouse: "BigQuery", git: "GitHub", idp: "Google Workspace", biTool: "Metabase", factTable: "fct_carbon_orders" } },
];
const castByName = Object.fromEntries(CAST.map((c) => [c.name, c]));

const contactEmail = (name, domain) => `${name.split(" ")[0].toLowerCase()}@${domain}`;

// ── Onboarding specs — the lifecycle mix (Step 4) ────────────────────────────
// stage: fresh | mid | near | completed (summary label only; the fields drive
// the shaping). donePhases: tasks in phases below this index are Done and the
// phase isComplete. overrides: per-key status. overdue: per-key days overdue
// (2–9, the budget lives almost entirely on Function Health + Flock Freight).
const ONBOARDING_SPECS = [
  // ── 2 fresh ──
  {
    company: "Raycast", stage: "fresh", owner: "maya", status: "Active",
    ageDays: 7, goLiveInDays: 70, donePhases: 1, openBase: 4, openStep: 3,
    overrides: { t1: "In progress" },
    overdue: {},
    contacts: [
      { slot: "sponsor", name: "Priya Raman", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "Felix Gruber", role: "Analytics Engineer", lastSeenDaysAgo: 2 },
      { slot: "it", name: "Marta Silva", role: "IT Administrator", lastSeenDaysAgo: 4 },
    ],
    storyComments: [
      { key: "k1", side: "vendor", body: "Great kickoff — pilot scope agreed: launcher usage + retention metrics first.", commentDaysAgo: 6 },
      { key: "t1", side: "contact", slot: "it", body: "Service account request is with our platform team, ETA Thursday.", commentDaysAgo: 2 },
    ],
  },
  {
    company: "beehiiv", stage: "fresh", owner: "sam", status: "Active",
    ageDays: 4, goLiveInDays: 75, donePhases: 0, openBase: 5, openStep: 3,
    overrides: { k1: "In progress" },
    overdue: {},
    contacts: [
      { slot: "sponsor", name: "Marcus Bell", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "Aisha Diallo", role: "Analytics Engineer", lastSeenDaysAgo: null },
    ],
    storyComments: [
      { key: "k1", side: "vendor", body: "Kickoff scheduled for Thursday — agenda shared with Marcus.", commentDaysAgo: 1 },
    ],
  },
  // ── 6 mid-flight (Function Health + Flock Freight are the at-risk stories) ──
  {
    company: "Modal", stage: "mid", owner: "theo", status: "Active",
    ageDays: 42, goLiveInDays: 50, donePhases: 3, openBase: 3, openStep: 2.5,
    overrides: { s2: "In progress", c1: "In progress", c2: "In progress", g1: "Done", g2: "In progress" },
    overdue: { s2: 3 },
    contacts: [
      { slot: "sponsor", name: "Elena Petrova", role: "Head of Data", lastSeenDaysAgo: 2 },
      { slot: "champion", name: "Jonah Fields", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
    ],
    storyComments: [
      { key: "s1", side: "vendor", body: "First 6 metrics merged — compute-hours and active-workspaces still pending review.", commentDaysAgo: 3 },
      { key: "s2", side: "contact", slot: "champion", body: "Naming conventions PR is up, slipped a few days — reviewing with Elena tomorrow.", commentDaysAgo: 1 },
    ],
  },
  {
    company: "Loop Returns", stage: "mid", owner: "sam", status: "Active",
    ageDays: 56, goLiveInDays: 52, donePhases: 4, openBase: 3, openStep: 2.5,
    overrides: { c4: "In progress", g1: "In progress", g2: "In progress" },
    overdue: { g1: 2 },
    contacts: [
      { slot: "sponsor", name: "Sofia Marchetti", role: "Analytics Lead", lastSeenDaysAgo: 3 },
      { slot: "champion", name: "Derek Huang", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
      { slot: "it", name: "Priya Shah", role: "IT Administrator", lastSeenDaysAgo: 8 },
    ],
    storyComments: [
      { key: "c1", side: "vendor", body: "Bumping this — we need the dashboard inventory to plan the migration batches.", commentDaysAgo: 2 },
      { key: "s3", side: "contact", slot: "sponsor", body: "Return-rate definition signed off; refund-latency still being debated with finance.", commentDaysAgo: 4 },
    ],
  },
  {
    company: "Huel", stage: "mid", owner: "ines", status: "Active",
    ageDays: 49, goLiveInDays: 55, donePhases: 3, openBase: 3, openStep: 2.5,
    // g2 is "Under investigation", not "Blocked": the bouncing-IdP-contact story
    // still reads, without flagging an otherwise-healthy account as At risk.
    overrides: { s2: "In progress", c1: "In progress", g1: "Done", g2: "Under investigation" },
    overdue: { c2: 2 },
    notes: { g2: "Waiting on IdP metadata from Huel IT — Raj's email is bouncing, chasing via Oliver." },
    contacts: [
      { slot: "sponsor", name: "Oliver Bennett", role: "Head of Data", lastSeenDaysAgo: 2 },
      { slot: "champion", name: "Chloe Ashworth", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
      { slot: "it", name: "Raj Mehta", role: "IT Administrator", lastSeenDaysAgo: 20, bouncedDaysAgo: 5 },
    ],
    storyComments: [
      { key: "g2", side: "vendor", body: "Raj's address bounced — Oliver, can you loop in whoever owns Entra now?", commentDaysAgo: 4 },
      { key: "s2", side: "contact", slot: "champion", body: "fct_orders metrics block pushed to a branch, CI is green.", commentDaysAgo: 2 },
    ],
  },
  {
    company: "Function Health", stage: "mid", atRisk: true, owner: "maya", status: "Active",
    ageDays: 56, goLiveInDays: 30, donePhases: 1, openBase: 2, openStep: 2,
    // Health-data infosec review stalls the whole technical chain:
    // security review → service account → repo connection.
    overrides: { t1: "Blocked", t3: "Blocked", c1: "In progress", g1: "Under investigation" },
    extraDeps: { t1: "g1" },
    overdue: { g1: 8, t1: 6, t3: 5, c1: 3, s2: 2, g2: 4 },
    notes: {
      g1: "Health-data compliance review sitting with their security team for 3 weeks. SOC 2 Type II + subprocessor list sent; awaiting their counsel.",
      t1: "Platform team won't provision until the infosec review clears.",
    },
    contacts: [
      { slot: "sponsor", name: "Grace Lin", role: "Head of Data", lastSeenDaysAgo: 6 },
      { slot: "security", name: "Miguel Santos", role: "Security Reviewer", lastSeenDaysAgo: 12 },
      { slot: "champion", name: "Anna Kowalski", role: "Analytics Engineer", lastSeenDaysAgo: 7 },
    ],
    storyComments: [
      { key: "g1", side: "vendor", body: "Third follow-up sent. Offering a call with our compliance lead to unblock the questionnaire.", commentDaysAgo: 2 },
      { key: "g1", side: "contact", slot: "security", body: "Counsel flagged the AI-analyst data flow — need the DPA addendum before we can sign.", commentDaysAgo: 9 },
      { key: "t1", side: "contact", slot: "sponsor", body: "Hands are tied until security signs off, sorry. Escalating internally.", commentDaysAgo: 5 },
    ],
  },
  {
    company: "Flock Freight", stage: "mid", atRisk: true, owner: "theo", status: "Active",
    ageDays: 63, goLiveInDays: 25, donePhases: 2, openBase: 3, openStep: 2,
    // Champion gone quiet: customer-side tasks stale, follow-ups overdue.
    overrides: { s1: "In progress", s2: "In progress", c2: "In progress", g2: "In progress" },
    overdue: { s1: 7, s2: 9, s3: 5, s4: 6, c1: 2, c2: 3, g2: 4 },
    notes: {
      s2: "No movement in two weeks — Tyler hasn't been in the portal since the working session.",
      c2: "Blocked on inputs from Flock's side; can't finish the exec dashboard without shipment margin logic.",
    },
    contacts: [
      { slot: "champion", name: "Tyler Brooks", role: "Analytics Engineer", lastSeenDaysAgo: 14 },
      { slot: "sponsor", name: "Vanessa Cruz", role: "Head of Data", lastSeenDaysAgo: 10 },
      { slot: "it", name: "Aaron Delgado", role: "Data Platform Lead", lastSeenDaysAgo: 9 },
    ],
    storyComments: [
      { key: "s2", side: "vendor", body: "Tyler — checking in again on the metrics block. Happy to pair on it if that helps.", commentDaysAgo: 3 },
      { key: "s1", side: "vendor", body: "Paused on our side until the fct_shipments grain question is answered.", commentDaysAgo: 6 },
      { key: "c1", side: "vendor", body: "Vanessa, flagging that the dashboard inventory is now blocking the migration start.", commentDaysAgo: 1 },
    ],
  },
  {
    company: "Ashby", label: "Embedded analytics rollout", stage: "mid", owner: "caroline", status: "Active",
    ageDays: 35, goLiveInDays: 45, donePhases: 3, openBase: 3, openStep: 2.5,
    overrides: { s1: "In progress", c1: "In progress", g1: "Done" },
    overdue: {},
    contacts: [
      { slot: "sponsor", name: "Nate Coleman", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "Ritu Sharma", role: "Analytics Engineer", lastSeenDaysAgo: 2 },
    ],
    storyComments: [
      { key: "s1", side: "vendor", body: "Reusing the pilot's semantic layer — only the embedded-specific metrics are new.", commentDaysAgo: 4 },
    ],
  },
  // ── 2 near go-live ──
  {
    company: "Sylvera", stage: "near", owner: "ines", status: "Active",
    ageDays: 77, goLiveInDays: 28, donePhases: 5, openBase: 2, openStep: 2,
    overrides: { r1: "In progress", r2: "In progress" },
    overdue: {},
    contacts: [
      { slot: "sponsor", name: "Freya Nilsson", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "James Whitmore", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
    ],
    storyComments: [
      { key: "r1", side: "vendor", body: "Dev training booked for Tuesday — 8 analytics engineers confirmed.", commentDaysAgo: 2 },
      { key: "g4", side: "contact", slot: "champion", body: "Guardrail config looks right; please restrict the AI analyst to the ratings mart for launch.", commentDaysAgo: 3 },
    ],
  },
  {
    company: "ChowNow", label: "Phase 2: Self-serve rollout", stage: "near", owner: "caroline", status: "Active",
    ageDays: 70, goLiveInDays: 10, donePhases: 3, openBase: 1, openStep: 1.5,
    // Genuine crunch: parity sign-off pending with go-live 10 days out.
    overrides: {
      c1: "Done", c2: "Done", c3: "Done", c4: "In progress",
      g1: "Done", g2: "Done", g3: "Done", g4: "In progress",
      r1: "Done", r2: "In progress", r3: "In progress", r4: "Blocked",
    },
    overdue: {},
    dueOverrides: { c4: 1, r4: 7 },
    notes: { c4: "Last 3 dashboards show small variances vs Tableau — tracing to a timezone cast.", r4: "Can't run the readiness review until parity signs off." },
    contacts: [
      { slot: "sponsor", name: "Lucia Herrera", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "Kevin O'Rourke", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
      { slot: "it", name: "Sandra Kim", role: "IT Administrator", lastSeenDaysAgo: 6 },
    ],
    storyComments: [
      { key: "c4", side: "contact", slot: "sponsor", body: "Down to 2 dashboards with variances — both look like the UTC cast issue. Retesting tomorrow.", commentDaysAgo: 1 },
      { key: "c4", side: "vendor", body: "Pushed the timezone fix to staging. If numbers match we can sign off Thursday.", commentDaysAgo: 1 },
    ],
  },
  // ── 4 completed (history) ──
  {
    company: "Ashby", label: "Pilot", stage: "completed", owner: "sam", status: "Completed",
    ageDays: 98, goLiveInDays: -56, finishedDaysAgo: 56, donePhases: 6,
    overrides: {}, overdue: {},
    contacts: [
      { slot: "sponsor", name: "Nate Coleman", role: "Head of Data", lastSeenDaysAgo: 58 },
      { slot: "champion", name: "Ritu Sharma", role: "Analytics Engineer", lastSeenDaysAgo: 57 },
    ],
    storyComments: [
      { key: "r4", side: "vendor", body: "Pilot wrapped — exec team happy, expansion to embedded analytics approved.", commentDaysAgo: 57 },
    ],
  },
  {
    company: "Peerspace", stage: "completed", owner: "maya", status: "Completed",
    ageDays: 91, goLiveInDays: -28, finishedDaysAgo: 28, donePhases: 6,
    overrides: {}, overdue: {},
    contacts: [
      { slot: "sponsor", name: "Maggie Sutton", role: "Analytics Lead", lastSeenDaysAgo: 30 },
      { slot: "champion", name: "Leo Tanaka", role: "Analytics Engineer", lastSeenDaysAgo: 29 },
    ],
    storyComments: [
      { key: "c4", side: "contact", slot: "sponsor", body: "Booking numbers match Looker to the cent. Signed off.", commentDaysAgo: 34 },
    ],
  },
  {
    company: "Patch", stage: "completed", owner: "ines", status: "Completed",
    ageDays: 84, goLiveInDays: -14, finishedDaysAgo: 14, donePhases: 6,
    overrides: {}, overdue: {},
    contacts: [
      { slot: "sponsor", name: "Camille Dubois", role: "Head of Data", lastSeenDaysAgo: 15 },
      { slot: "champion", name: "Ewan MacLeod", role: "Analytics Engineer", lastSeenDaysAgo: 14 },
    ],
    storyComments: [
      { key: "r2", side: "contact", slot: "champion", body: "AI analyst is answering carbon-order questions the team used to ping us for. Nice.", commentDaysAgo: 16 },
    ],
  },
  {
    company: "ChowNow", label: "Phase 1: Core analytics", stage: "completed", owner: "caroline", status: "Completed",
    ageDays: 98, goLiveInDays: -42, finishedDaysAgo: 42, donePhases: 6,
    overrides: {}, overdue: {},
    contacts: [
      { slot: "sponsor", name: "Lucia Herrera", role: "Head of Data", lastSeenDaysAgo: 1 },
      { slot: "champion", name: "Kevin O'Rourke", role: "Analytics Engineer", lastSeenDaysAgo: 1 },
    ],
    storyComments: [
      { key: "r4", side: "vendor", body: "Phase 1 live for the ops team. Phase 2 (self-serve) kicks off next month.", commentDaysAgo: 43 },
    ],
  },
];

// Generic comment pools used to fill texture up to ~20% of tasks.
const GENERIC_COMMENTS = {
  vendor: [
    "Walked through this on today's sync — notes are in the shared doc.",
    "First pass is on staging, keen for your eyes on it.",
    "Done from our side — over to you for review.",
    "This is on the critical path for go-live, bumping it up.",
  ],
  contact: [
    "Picking this up this week.",
    "Looks good from our side — signed off.",
    "Waiting on an internal approval, will chase tomorrow.",
    "Added the details to the thread.",
  ],
};

const COMMENT_RATE = 0.2;

// ── Shaping: turn a spec into concrete rows (pure, no DB) ────────────────────
function buildOnboardingPlan(spec, numberOffset) {
  const cast = castByName[spec.company];
  const template = playbookTasks(cast.params);
  const isCompleted = spec.status === "Completed";
  const endAgo = spec.finishedDaysAgo ?? 2; // when "done" activity tails off
  const goLiveDays = spec.goLiveInDays;

  // Statuses
  const tasks = template.map((t, idx) => {
    const status =
      spec.overrides?.[t.key] ??
      (t.phaseIdx < spec.donePhases ? "Done" : "Not started");
    return { ...t, idx, status };
  });

  // Due dates. Done tasks get past dues spread across the onboarding's
  // lifetime; open tasks get future dues unless they're in the overdue map.
  const doneTasks = tasks.filter((t) => t.status === "Done");
  const spreadStart = spec.ageDays - 4;
  const spreadEnd = endAgo + 1;
  doneTasks.forEach((t, i) => {
    const frac = doneTasks.length === 1 ? 0 : i / (doneTasks.length - 1);
    t.dueDaysAgo = Math.max(1, Math.round(spreadStart - frac * (spreadStart - spreadEnd)));
  });

  let openIndex = 0;
  for (const t of tasks) {
    if (t.status === "Done") {
      t.due = dueAgo(t.dueDaysAgo);
      continue;
    }
    const overdueBy = spec.overdue?.[t.key];
    if (overdueBy) {
      t.due = dueAgo(overdueBy);
      t.isOverdue = true;
    } else if (spec.dueOverrides?.[t.key] !== undefined) {
      t.due = dueIn(spec.dueOverrides[t.key]);
    } else {
      const offset = Math.min(
        Math.round(spec.openBase + openIndex * spec.openStep),
        Math.max(goLiveDays + 7, 7)
      );
      t.due = dueIn(offset);
    }
    openIndex += 1;
  }

  // Numbers (per-company, continuous across a company's onboardings),
  // createdAt (kickoff-created, later phases trickle in), sortOrder, notes.
  tasks.forEach((t, i) => {
    t.number = numberOffset + i + 1;
    t.sortOrder = tasks.filter((x) => x.phaseIdx === t.phaseIdx && x.idx < t.idx).length;
    t.createdDaysAgo = Math.max(1, spec.ageDays - Math.min(t.phaseIdx, 3));
    t.notes = spec.notes?.[t.key] ?? "";
    if (spec.extraDeps?.[t.key]) t.blockedBy = spec.extraDeps[t.key];
  });

  // Phases: targetDates interpolated from creation to go-live/finish.
  const spanDays = spec.ageDays + (isCompleted ? -spec.finishedDaysAgo : goLiveDays);
  const phases = PHASE_NAMES.map((name, i) => ({
    name,
    sortOrder: i,
    targetDate: daysFromNow(Math.round(-spec.ageDays + ((i + 1) * spanDays) / 6)),
    isComplete: isCompleted || i < spec.donePhases,
  }));

  // Contacts
  const contacts = spec.contacts.map((c) => ({
    ...c,
    email: contactEmail(c.name, cast.domain),
    lastSeenPortalAt: c.lastSeenDaysAgo != null ? daysAgo(c.lastSeenDaysAgo) : null,
    bouncedAt: c.bouncedDaysAgo != null ? daysAgo(c.bouncedDaysAgo) : null,
  }));
  // Route a customer task to the right person by slot. When an onboarding
  // doesn't define the exact slot (e.g. no dedicated IT or security contact),
  // fall back to the next most-sensible role rather than blindly hitting
  // contact 0 (which would put service-account/SSO/infosec work on whoever
  // happens to be listed first — usually the sponsor). IT work drops to the
  // technical champion; security work drops to the sponsor who owns the
  // compliance relationship. Every onboarding has a sponsor and champion, so
  // this always resolves to a plausible owner.
  const SLOT_FALLBACKS = {
    it: ["it", "champion", "sponsor"],
    security: ["security", "sponsor", "champion"],
    sponsor: ["sponsor", "champion"],
    champion: ["champion", "sponsor"],
  };
  const slotIdx = (slot) => {
    for (const s of SLOT_FALLBACKS[slot] ?? [slot]) {
      const i = contacts.findIndex((c) => c.slot === s);
      if (i >= 0) return i;
    }
    return 0;
  };

  // Ownership: vendor tasks → onboarding owner (SE tasks → Theo);
  // customer tasks → assignee contact by slot.
  const ownerName = VENDOR_NAME[spec.owner];
  for (const t of tasks) {
    if (t.side === "vendor") {
      t.ownerKey = SE_TASK_KEYS.has(t.key) ? "theo" : spec.owner;
      t.ownerName = VENDOR_NAME[t.ownerKey];
    } else {
      t.assigneeIdx = slotIdx(t.slot);
    }
  }

  // Comments: story comments first, then generic fill until ~20% of tasks
  // carry at least one comment. Prefer tasks that have visible progress.
  const comments = [];
  const commentedKeys = new Set();
  for (const sc of spec.storyComments ?? []) {
    const t = tasks.find((x) => x.key === sc.key);
    if (!t) continue;
    comments.push({
      taskKey: sc.key,
      author: sc.side === "vendor" ? ownerName : contacts[slotIdx(sc.slot)].name,
      side: sc.side,
      slot: sc.slot,
      body: sc.body,
      createdAt: daysAgo(sc.commentDaysAgo),
    });
    commentedKeys.add(sc.key);
  }
  const targetCommented = Math.round(tasks.length * COMMENT_RATE);
  const fillCandidates = tasks.filter(
    (t) => !commentedKeys.has(t.key) && (t.status === "Done" || t.status === "In progress")
  );
  let fillIdx = 0;
  while (commentedKeys.size < targetCommented && fillIdx < fillCandidates.length) {
    const t = fillCandidates[fillIdx];
    const side = fillIdx % 2 === 0 ? "vendor" : "contact";
    const pool = GENERIC_COMMENTS[side];
    comments.push({
      taskKey: t.key,
      author: side === "vendor" ? ownerName : contacts[0].name,
      side,
      body: pool[fillIdx % pool.length],
      createdAt: isCompleted
        ? daysAgo(spec.finishedDaysAgo + 3 + fillIdx * 4)
        : daysAgo(1 + fillIdx * 2),
    });
    commentedKeys.add(t.key);
    fillIdx += 1;
  }
  for (const t of tasks) {
    t.commentCount = comments.filter((c) => c.taskKey === t.key).length;
  }

  // Activity: created / completed / status_changed / assigned / commented,
  // spread across the onboarding's lifetime.
  const activity = [];
  const pushAct = (row) => activity.push(row);
  // task creation at kickoff
  for (const t of tasks.slice(0, 3)) {
    pushAct({
      verb: "created", taskKey: t.key, actorType: "vendor", actorVendorKey: spec.owner,
      metadata: (code) => ({ title: t.title, taskId: code }),
      createdAt: daysAgo(spec.ageDays - 0.2),
    });
  }
  // completions spread between kickoff and endAgo
  const completedSample = doneTasks.filter((_, i) => i % 2 === 0).slice(0, 6);
  completedSample.forEach((t, i) => {
    const frac = completedSample.length === 1 ? 0 : i / (completedSample.length - 1);
    const at = Math.max(endAgo, Math.round(spreadStart - frac * (spreadStart - spreadEnd)) - 1);
    pushAct({
      verb: "completed", taskKey: t.key,
      actorType: t.side === "customer" ? "contact" : "vendor",
      actorVendorKey: t.side === "vendor" ? t.ownerKey : undefined,
      actorContactIdx: t.side === "customer" ? t.assigneeIdx : undefined,
      metadata: (code) => ({ from: "In progress", to: "Done", title: t.title, taskId: code }),
      createdAt: daysAgo(at),
    });
  });
  // a couple of status changes on currently-open work
  const changed = tasks.filter((t) => t.status === "In progress" || t.status === "Blocked").slice(0, 2);
  changed.forEach((t, i) => {
    pushAct({
      verb: "status_changed", taskKey: t.key, actorType: "vendor",
      actorVendorKey: t.side === "vendor" ? t.ownerKey : spec.owner,
      metadata: (code) => ({ from: "Not started", to: t.status, title: t.title, taskId: code }),
      createdAt: daysAgo(2 + i * 3),
    });
  });
  // assignments for customer-side tasks
  const assigned = tasks.filter((t) => t.side === "customer").slice(0, 2);
  assigned.forEach((t, i) => {
    pushAct({
      verb: "assigned", taskKey: t.key, actorType: "vendor", actorVendorKey: spec.owner,
      metadata: (code) => ({
        title: t.title, taskId: code,
        assigneeContactId: null, // patched to the real id at write time
        assigneeName: contacts[t.assigneeIdx].name,
      }),
      assigneeIdx: t.assigneeIdx,
      createdAt: daysAgo(Math.max(endAgo, spec.ageDays - 1 - i)),
    });
  });
  // commented activity mirrors the comments (capped for volume)
  comments.slice(0, 4).forEach((c) => {
    const t = tasks.find((x) => x.key === c.taskKey);
    pushAct({
      verb: "commented", taskKey: c.taskKey,
      actorType: c.side === "vendor" ? "vendor" : "contact",
      actorVendorKey: c.side === "vendor" ? spec.owner : undefined,
      actorContactIdx: c.side === "contact" ? slotIdx(c.slot ?? contacts[0].slot) : undefined,
      metadata: (code) => ({ taskTitle: t.title, taskId: code, excerpt: c.body.slice(0, 120) }),
      createdAt: c.createdAt,
    });
  });

  return {
    spec,
    label: spec.label ?? "Implementation",
    ownerName,
    createdAt: daysAgo(spec.ageDays),
    targetGoLive: daysFromNow(goLiveDays),
    phases,
    contacts,
    tasks,
    comments,
    activity,
  };
}

// ── Assemble the full plan, grouped per company (numbering is per-company) ───
function buildPlan() {
  const companies = CAST.map((c) => ({ cast: c, onboardings: [] }));
  const byName = Object.fromEntries(companies.map((c) => [c.cast.name, c]));
  // Completed onboardings first within a company → older tasks get lower numbers.
  const ordered = [...ONBOARDING_SPECS].sort((a, b) => b.ageDays - a.ageDays);
  for (const spec of ordered) {
    const entry = byName[spec.company];
    const offset = entry.onboardings.reduce((n, o) => n + o.tasks.length, 0);
    entry.onboardings.push(buildOnboardingPlan(spec, offset));
  }
  return companies;
}

// ── Summary printing (dry-run and post-write both use this) ──────────────────
function printSummary(plan, existingNames) {
  const stageOrder = { fresh: 0, mid: 1, near: 2, completed: 3 };
  const rows = plan
    .flatMap((c) => c.onboardings.map((o) => ({ c, o })))
    .sort((a, b) => stageOrder[a.o.spec.stage] - stageOrder[b.o.spec.stage]);

  let totalTasks = 0, totalOpen = 0, totalOverdue = 0, totalComments = 0, totalActivity = 0, totalContacts = 0;
  const stageCounts = {};

  console.log("\n─ Onboardings ───────────────────────────────────────────────────────────");
  for (const { c, o } of rows) {
    const open = o.tasks.filter((t) => t.status !== "Done").length;
    const overdue = o.tasks.filter((t) => t.isOverdue).length;
    totalTasks += o.tasks.length;
    totalOpen += open;
    totalOverdue += overdue;
    totalComments += o.comments.length;
    totalActivity += o.activity.length;
    totalContacts += o.contacts.length;
    stageCounts[o.spec.stage] = (stageCounts[o.spec.stage] ?? 0) + 1;
    const skip = existingNames.has(c.cast.name) ? "  [SKIP — company exists]" : "";
    const risk = o.spec.atRisk ? " ⚠ at-risk" : "";
    console.log(
      `  ${c.cast.prefix.padEnd(5)} ${c.cast.name} — ${o.label} (${o.spec.stage}${risk})` +
        ` · owner ${o.ownerName} · ${o.tasks.length} tasks (${open} open, ${overdue} overdue)` +
        ` · ${o.contacts.length} contacts · ${o.comments.length} comments · ${o.activity.length} activity${skip}`
    );
  }

  const overduePct = totalOpen ? ((totalOverdue / totalOpen) * 100).toFixed(1) : "0";
  console.log("\n─ Totals ────────────────────────────────────────────────────────────────");
  console.log(`  Companies:        ${plan.length} (${[...existingNames].filter((n) => castByName[n]).length} already exist → skipped)`);
  console.log(`  Vendor users:     ${VENDOR_USERS.length} upserts (${VENDOR_USERS.map((v) => v.name.split(" ")[0]).join(", ")})`);
  console.log(`  Onboardings:      ${rows.length}  — ` + Object.entries(stageCounts).map(([s, n]) => `${s}: ${n}`).join(", "));
  console.log(`  Contacts:         ${totalContacts}`);
  console.log(`  Phases:           ${rows.length * PHASE_NAMES.length}`);
  console.log(`  Tasks:            ${totalTasks} (${totalOpen} open)`);
  console.log(`  Overdue:          ${totalOverdue} (${overduePct}% of open — budget is 10–15%, concentrated on Function Health + Flock Freight)`);
  console.log(`  Comments:         ${totalComments}`);
  console.log(`  ActivityLog rows: ${totalActivity}`);
}

// ── Writer: one transaction per company ──────────────────────────────────────
async function writeCompany(entry, vendorIdByKey) {
  const { cast, onboardings } = entry;
  await prisma.$transaction(
    async (tx) => {
      const company = await tx.company.create({
        data: {
          name: cast.name,
          domain: cast.domain,
          prefix: cast.prefix,
          logoUrl: `/logos/${cast.slug}.png`,
        },
      });

      for (const o of onboardings) {
        const onboarding = await tx.onboarding.create({
          data: {
            companyId: company.id,
            owner: o.ownerName,
            ownerId: vendorIdByKey[o.spec.owner] ?? null,
            status: o.spec.status,
            targetGoLive: o.targetGoLive,
            createdAt: o.createdAt,
          },
        });

        const contactRows = [];
        for (const c of o.contacts) {
          contactRows.push(
            await tx.contact.create({
              data: {
                onboardingId: onboarding.id,
                name: c.name,
                email: c.email,
                role: c.role,
                lastSeenPortalAt: c.lastSeenPortalAt,
                bouncedAt: c.bouncedAt,
              },
            })
          );
        }

        const phaseRows = [];
        for (const p of o.phases) {
          phaseRows.push(
            await tx.phase.create({
              data: {
                onboardingId: onboarding.id,
                name: p.name,
                sortOrder: p.sortOrder,
                targetDate: p.targetDate,
                isComplete: p.isComplete,
              },
            })
          );
        }

        // Tasks via createMany with explicit numbers (seed.js pattern).
        await tx.task.createMany({
          data: o.tasks.map((t) => ({
            onboardingId: onboarding.id,
            phaseId: phaseRows[t.phaseIdx].id,
            companyId: company.id,
            number: t.number,
            title: t.title,
            status: t.status,
            due: t.due,
            owner: t.side === "vendor" ? t.ownerName : "",
            ownerId: t.side === "vendor" ? vendorIdByKey[t.ownerKey] ?? null : null,
            assigneeContactId: t.side === "customer" ? contactRows[t.assigneeIdx].id : null,
            priority: t.priority,
            notes: t.notes,
            sortOrder: t.sortOrder,
            commentCount: t.commentCount,
            createdAt: daysAgo(t.createdDaysAgo),
          })),
        });

        // Resolve number → id for deps, comments, and activity.
        const inserted = await tx.task.findMany({
          where: { onboardingId: onboarding.id },
          select: { id: true, number: true },
        });
        const idByNumber = new Map(inserted.map((t) => [t.number, t.id]));
        const idByKey = new Map(o.tasks.map((t) => [t.key, idByNumber.get(t.number)]));
        const codeByKey = new Map(o.tasks.map((t) => [t.key, `${cast.prefix}-${t.number}`]));

        // Dependency chains (blockedByTaskId).
        for (const t of o.tasks) {
          if (!t.blockedBy) continue;
          await tx.task.update({
            where: { id: idByKey.get(t.key) },
            data: { blockedByTaskId: idByKey.get(t.blockedBy) },
          });
        }

        if (o.comments.length) {
          await tx.comment.createMany({
            data: o.comments.map((c) => ({
              taskId: idByKey.get(c.taskKey),
              author: c.author,
              body: c.body,
              createdAt: c.createdAt,
            })),
          });
        }

        if (o.activity.length) {
          await tx.activityLog.createMany({
            data: o.activity.map((a) => ({
              onboardingId: onboarding.id,
              actorType: a.actorType,
              actorVendorId: a.actorVendorKey ? vendorIdByKey[a.actorVendorKey] ?? null : null,
              actorContactId: a.actorContactIdx !== undefined ? contactRows[a.actorContactIdx].id : null,
              verb: a.verb,
              entityType: "task",
              entityId: idByKey.get(a.taskKey),
              metadata: {
                ...a.metadata(codeByKey.get(a.taskKey)),
                ...(a.assigneeIdx !== undefined && { assigneeContactId: contactRows[a.assigneeIdx].id }),
              },
              createdAt: a.createdAt,
            })),
          });
        }
      }

      // Bump the counter so future createTask calls continue where we left off.
      const totalTasks = onboardings.reduce((n, o) => n + o.tasks.length, 0);
      await tx.company.update({
        where: { id: company.id },
        data: { taskCounter: totalTasks },
      });
    },
    { timeout: 60000, maxWait: 10000 }
  );
}

async function main() {
  console.log(`Portfolio growth seed — ${WRITE ? "WRITE MODE" : "DRY-RUN (no writes; pass --write to insert)"}`);

  const plan = buildPlan();

  // Idempotency check (read-only): skip companies that already exist.
  let existingNames = new Set();
  try {
    const existing = await prisma.company.findMany({
      where: { name: { in: CAST.map((c) => c.name) } },
      select: { name: true },
    });
    existingNames = new Set(existing.map((c) => c.name));
  } catch (err) {
    if (WRITE) throw err;
    console.warn("  (DB unreachable — skipping existence check in dry-run)");
  }

  printSummary(plan, existingNames);

  if (!WRITE) {
    console.log("\nDry-run complete. No database writes were made.");
    return;
  }

  // ── Write mode from here ──
  // Vendor users first (upsert by email — idempotent, never clobbers).
  for (const v of VENDOR_USERS) {
    await prisma.vendorUser.upsert({
      where: { email: v.email },
      update: {},
      create: { authUserId: null, email: v.email, name: v.name, role: "member" },
    });
  }
  const vendorRows = await prisma.vendorUser.findMany({
    where: { email: { in: [...VENDOR_USERS.map((v) => v.email), CAROLINE_EMAIL] } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map(vendorRows.map((v) => [v.email, v.id]));
  const vendorIdByKey = Object.fromEntries(
    VENDOR_USERS.map((v) => [v.key, idByEmail.get(v.email)])
  );
  vendorIdByKey.caroline = idByEmail.get(CAROLINE_EMAIL) ?? null;
  if (!vendorIdByKey.caroline) {
    console.warn("  Caroline's VendorUser not found — her onboardings get ownerId: null.");
  }

  let created = 0, skipped = 0;
  for (const entry of plan) {
    if (existingNames.has(entry.cast.name)) {
      console.log(`  · ${entry.cast.name} exists — skipped`);
      skipped += 1;
      continue;
    }
    await writeCompany(entry, vendorIdByKey);
    console.log(`  + ${entry.cast.name} seeded (${entry.onboardings.length} onboarding(s))`);
    created += 1;
  }
  console.log(`\nDone. ${created} companies created, ${skipped} skipped.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
