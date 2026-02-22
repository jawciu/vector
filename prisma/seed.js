console.log("Seed script starting...");

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Dates relative to today (Feb 21, 2026)
const D = {
  overdue3w:  "2026-01-30",
  overdue2w:  "2026-02-07",
  overdue1w:  "2026-02-14",
  overdue3d:  "2026-02-18",
  yesterday:  "2026-02-20",
  today:      "2026-02-21",
  tomorrow:   "2026-02-22",
  in3d:       "2026-02-24",
  in5d:       "2026-02-26",
  in1w:       "2026-03-01",
  in10d:      "2026-03-03",
  in2w:       "2026-03-07",
  in3w:       "2026-03-14",
  in1m:       "2026-03-21",
};

async function main() {
  await prisma.task.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.onboarding.deleteMany();
  await prisma.company.deleteMany();

  // --- Companies ---
  const [acme, techcorp, globex, initech, umbrella, stark, wayne, cyberdyne, soylent, wonka] =
    await Promise.all([
      prisma.company.create({ data: { name: "Acme Co" } }),
      prisma.company.create({ data: { name: "TechCorp" } }),
      prisma.company.create({ data: { name: "Globex Industries" } }),
      prisma.company.create({ data: { name: "Initech" } }),
      prisma.company.create({ data: { name: "Umbrella Corp" } }),
      prisma.company.create({ data: { name: "Stark Enterprises" } }),
      prisma.company.create({ data: { name: "Wayne Industries" } }),
      prisma.company.create({ data: { name: "Cyberdyne Systems" } }),
      prisma.company.create({ data: { name: "Soylent Corp" } }),
      prisma.company.create({ data: { name: "Wonka Industries" } }),
    ]);

  // --- Onboardings ---
  const [ob1, ob2, ob3, ob4, ob5, ob6, ob7, ob8, ob9, ob10] = await Promise.all([
    prisma.onboarding.create({ data: { companyId: acme.id,      owner: "Lena Marsh",   status: "Active",    targetGoLive: new Date("2026-03-28") } }),
    prisma.onboarding.create({ data: { companyId: techcorp.id,  owner: "Jordan Cole",  status: "Completed", targetGoLive: new Date("2026-02-10") } }),
    prisma.onboarding.create({ data: { companyId: globex.id,    owner: "Priya Nair",   status: "Active",    targetGoLive: new Date("2026-04-04") } }),
    prisma.onboarding.create({ data: { companyId: initech.id,   owner: "Tom Okafor",   status: "Active",    targetGoLive: new Date("2026-03-14") } }),
    prisma.onboarding.create({ data: { companyId: umbrella.id,  owner: "Dana Fox",     status: "Paused",    targetGoLive: new Date("2026-04-18") } }),
    prisma.onboarding.create({ data: { companyId: stark.id,     owner: "Riku Sato",    status: "Completed", targetGoLive: new Date("2026-01-31") } }),
    prisma.onboarding.create({ data: { companyId: wayne.id,     owner: "Iris Blanc",   status: "Active",    targetGoLive: new Date("2026-03-21") } }),
    prisma.onboarding.create({ data: { companyId: cyberdyne.id, owner: "Lena Marsh",   status: "Active",    targetGoLive: new Date("2026-04-11") } }),
    prisma.onboarding.create({ data: { companyId: soylent.id,   owner: "Sam Torres",   status: "Paused",    targetGoLive: new Date("2026-05-02") } }),
    prisma.onboarding.create({ data: { companyId: wonka.id,     owner: "Jordan Cole",  status: "Completed", targetGoLive: new Date("2026-02-07") } }),
  ]);

  // Helper: create 4 standard phases for an onboarding, return [p0, p1, p2, p3]
  async function createPhases(onboardingId, names = ["Discovery", "Technical Setup", "Migration & Testing", "Go-Live"]) {
    return Promise.all(
      names.map((name, i) =>
        prisma.phase.create({ data: { onboardingId, name, sortOrder: i, isComplete: false } })
      )
    );
  }

  // ── Acme Co (Active, at-risk) ──────────────────────────────────────────────
  const [a0, a1, a2, a3] = await createPhases(ob1.id);
  await prisma.task.createMany({ data: [
    // Discovery
    { onboardingId: ob1.id, phaseId: a0.id, title: "Kickoff call with stakeholders",      status: "Done",                 due: D.overdue2w,  owner: "Lena Marsh",  priority: "high",   notes: "Covered scope, timeline and key contacts.", commentCount: 3 },
    { onboardingId: ob1.id, phaseId: a0.id, title: "Document current workflow",            status: "Done",                 due: D.overdue1w,  owner: "Jordan Cole", priority: "medium", notes: "",            commentCount: 1 },
    { onboardingId: ob1.id, phaseId: a0.id, title: "Identify integration touch points",   status: "In progress",          due: D.yesterday,  owner: "Lena Marsh",  priority: "high",   notes: "Waiting on network diagram from client.", commentCount: 2 },
    { onboardingId: ob1.id, phaseId: a0.id, title: "Sign off on project charter",         status: "Blocked",              due: D.today,      owner: "Tom Okafor",  priority: "high",   notes: "Contract amendment still in review.",     commentCount: 4 },
    // Technical Setup
    { onboardingId: ob1.id, phaseId: a1.id, title: "Provision staging environment",       status: "In progress",          due: D.tomorrow,   owner: "Priya Nair",  priority: "high",   notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a1.id, title: "Configure SSO with Okta",             status: "Blocked",              due: D.in3d,       owner: "Lena Marsh",  priority: "high",   notes: "Waiting for IdP metadata file.",          commentCount: 5 },
    { onboardingId: ob1.id, phaseId: a1.id, title: "Set up webhook endpoints",            status: "Not started",          due: D.in5d,       owner: "Jordan Cole", priority: "medium", notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a1.id, title: "Firewall rules & IP whitelist",       status: "Not started",          due: D.in5d,       owner: "Priya Nair",  priority: "medium", notes: "",            commentCount: 1 },
    // Migration & Testing
    { onboardingId: ob1.id, phaseId: a2.id, title: "Export legacy CRM data",              status: "Not started",          due: D.in1w,       owner: "Dana Fox",    priority: "medium", notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a2.id, title: "Map data fields to new schema",       status: "Not started",          due: D.in10d,      owner: "Lena Marsh",  priority: "low",    notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a2.id, title: "Run test migration on staging",       status: "Not started",          due: D.in2w,       owner: "Jordan Cole", priority: "medium", notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a2.id, title: "UAT sign-off from champion user",     status: "Not started",          due: D.in2w,       owner: "Tom Okafor",  priority: "high",   notes: "",            commentCount: 0 },
    // Go-Live
    { onboardingId: ob1.id, phaseId: a3.id, title: "Production cutover",                  status: "Not started",          due: D.in3w,       owner: "Lena Marsh",  priority: "high",   notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a3.id, title: "Notify users of go-live",             status: "Not started",          due: D.in3w,       owner: "Dana Fox",    priority: "low",    notes: "",            commentCount: 0 },
    { onboardingId: ob1.id, phaseId: a3.id, title: "Hypercare support window",            status: "Not started",          due: D.in1m,       owner: "Iris Blanc",  priority: "medium", notes: "",            commentCount: 0 },
  ]});

  // ── TechCorp (Completed — all Done) ───────────────────────────────────────
  const [t0, t1, t2, t3] = await createPhases(ob2.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob2.id, phaseId: t0.id, title: "Requirements workshop",               status: "Done", due: D.overdue3w,  owner: "Jordan Cole", priority: "high",   notes: "3 sessions completed.", commentCount: 2 },
    { onboardingId: ob2.id, phaseId: t0.id, title: "Security review",                    status: "Done", due: D.overdue2w,  owner: "Riku Sato",   priority: "high",   notes: "",                     commentCount: 1 },
    { onboardingId: ob2.id, phaseId: t1.id, title: "API key generation",                 status: "Done", due: D.overdue2w,  owner: "Jordan Cole", priority: "medium", notes: "",                     commentCount: 0 },
    { onboardingId: ob2.id, phaseId: t1.id, title: "SAML configuration",                 status: "Done", due: D.overdue1w,  owner: "Riku Sato",   priority: "high",   notes: "Used SP-initiated flow.",commentCount: 3 },
    { onboardingId: ob2.id, phaseId: t1.id, title: "Role mapping & permissions",         status: "Done", due: D.overdue1w,  owner: "Jordan Cole", priority: "medium", notes: "",                     commentCount: 0 },
    { onboardingId: ob2.id, phaseId: t2.id, title: "Parallel run test",                  status: "Done", due: D.overdue3d,  owner: "Riku Sato",   priority: "medium", notes: "",                     commentCount: 1 },
    { onboardingId: ob2.id, phaseId: t2.id, title: "Performance benchmarks",             status: "Done", due: D.overdue3d,  owner: "Jordan Cole", priority: "low",    notes: "",                     commentCount: 0 },
    { onboardingId: ob2.id, phaseId: t3.id, title: "Production migration",               status: "Done", due: D.overdue1w,  owner: "Riku Sato",   priority: "high",   notes: "",                     commentCount: 2 },
    { onboardingId: ob2.id, phaseId: t3.id, title: "Handoff to CS team",                 status: "Done", due: D.overdue3d,  owner: "Jordan Cole", priority: "medium", notes: "",                     commentCount: 0 },
  ]});

  // ── Globex Industries (Active, on track) ──────────────────────────────────
  const [g0, g1, g2, g3] = await createPhases(ob3.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob3.id, phaseId: g0.id, title: "Stakeholder alignment session",      status: "Done",           due: D.overdue1w,  owner: "Priya Nair",  priority: "high",   notes: "",                      commentCount: 1 },
    { onboardingId: ob3.id, phaseId: g0.id, title: "Define success metrics",             status: "Done",           due: D.overdue3d,  owner: "Sam Torres",  priority: "medium", notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g0.id, title: "Agree project timeline",             status: "In progress",    due: D.today,      owner: "Priya Nair",  priority: "high",   notes: "Waiting for sign-off.",  commentCount: 2 },
    { onboardingId: ob3.id, phaseId: g1.id, title: "Network topology review",            status: "In progress",    due: D.in3d,       owner: "Sam Torres",  priority: "high",   notes: "",                      commentCount: 1 },
    { onboardingId: ob3.id, phaseId: g1.id, title: "Deploy integration agent",           status: "Not started",    due: D.in5d,       owner: "Priya Nair",  priority: "medium", notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g1.id, title: "Configure outbound API",             status: "Not started",    due: D.in1w,       owner: "Sam Torres",  priority: "medium", notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g2.id, title: "Data cleansing",                     status: "Not started",    due: D.in2w,       owner: "Priya Nair",  priority: "low",    notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g2.id, title: "Import pilot dataset",               status: "Not started",    due: D.in2w,       owner: "Sam Torres",  priority: "medium", notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g2.id, title: "End-to-end regression test",         status: "Not started",    due: D.in3w,       owner: "Priya Nair",  priority: "high",   notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g3.id, title: "Cutover plan review",                status: "Not started",    due: D.in3w,       owner: "Sam Torres",  priority: "medium", notes: "",                      commentCount: 0 },
    { onboardingId: ob3.id, phaseId: g3.id, title: "Go-live announcement",               status: "Not started",    due: D.in1m,       owner: "Priya Nair",  priority: "low",    notes: "",                      commentCount: 0 },
  ]});

  // ── Initech (Active, blocked) ─────────────────────────────────────────────
  const [i0, i1, i2, i3] = await createPhases(ob4.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob4.id, phaseId: i0.id, title: "Initial discovery call",             status: "Done",                 due: D.overdue2w,  owner: "Tom Okafor",  priority: "medium", notes: "",                            commentCount: 0 },
    { onboardingId: ob4.id, phaseId: i0.id, title: "Data privacy impact assessment",     status: "Blocked",              due: D.overdue3d,  owner: "Tom Okafor",  priority: "high",   notes: "DPA needs executive sign-off.", commentCount: 3 },
    { onboardingId: ob4.id, phaseId: i0.id, title: "Executive sponsor confirmation",     status: "Under investigation",  due: D.today,      owner: "Dana Fox",    priority: "high",   notes: "Escalated to account director.", commentCount: 2 },
    { onboardingId: ob4.id, phaseId: i1.id, title: "VPN access for vendor team",         status: "Blocked",              due: D.overdue1w,  owner: "Tom Okafor",  priority: "high",   notes: "Ticket raised 2 weeks ago.",    commentCount: 5 },
    { onboardingId: ob4.id, phaseId: i1.id, title: "Sandbox environment setup",          status: "Blocked",              due: D.in3d,       owner: "Dana Fox",    priority: "high",   notes: "Dependent on VPN access.",      commentCount: 2 },
    { onboardingId: ob4.id, phaseId: i1.id, title: "Install connector on-prem",          status: "Not started",          due: D.in1w,       owner: "Tom Okafor",  priority: "medium", notes: "",                            commentCount: 0 },
    { onboardingId: ob4.id, phaseId: i2.id, title: "Extract historical records",         status: "Not started",          due: D.in2w,       owner: "Dana Fox",    priority: "medium", notes: "",                            commentCount: 0 },
    { onboardingId: ob4.id, phaseId: i2.id, title: "Validation with finance team",       status: "Not started",          due: D.in3w,       owner: "Tom Okafor",  priority: "low",    notes: "",                            commentCount: 0 },
    { onboardingId: ob4.id, phaseId: i3.id, title: "Cutover sign-off",                   status: "Not started",          due: D.in1m,       owner: "Dana Fox",    priority: "high",   notes: "",                            commentCount: 0 },
  ]});

  // ── Umbrella Corp (Paused) ────────────────────────────────────────────────
  const [u0, u1, u2, u3] = await createPhases(ob5.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob5.id, phaseId: u0.id, title: "Project kickoff",                    status: "Done",        due: D.overdue3w,  owner: "Dana Fox",    priority: "medium", notes: "",                    commentCount: 1 },
    { onboardingId: ob5.id, phaseId: u0.id, title: "Scope documentation",               status: "Done",        due: D.overdue2w,  owner: "Sam Torres",  priority: "low",    notes: "",                    commentCount: 0 },
    { onboardingId: ob5.id, phaseId: u0.id, title: "Budget approval",                   status: "In progress", due: D.overdue1w,  owner: "Dana Fox",    priority: "high",   notes: "On hold pending budget freeze.", commentCount: 3 },
    { onboardingId: ob5.id, phaseId: u1.id, title: "Tech stack assessment",              status: "Not started", due: D.in2w,       owner: "Sam Torres",  priority: "medium", notes: "",                    commentCount: 0 },
    { onboardingId: ob5.id, phaseId: u1.id, title: "Security questionnaire",             status: "Not started", due: D.in2w,       owner: "Dana Fox",    priority: "high",  notes: "",                    commentCount: 0 },
    { onboardingId: ob5.id, phaseId: u2.id, title: "Data classification review",         status: "Not started", due: D.in3w,       owner: "Sam Torres",  priority: "medium", notes: "",                    commentCount: 0 },
    { onboardingId: ob5.id, phaseId: u3.id, title: "Pilot group selection",              status: "Not started", due: D.in1m,       owner: "Dana Fox",    priority: "low",    notes: "",                    commentCount: 0 },
  ]});

  // ── Stark Enterprises (Completed) ─────────────────────────────────────────
  const [s0, s1, s2, s3] = await createPhases(ob6.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob6.id, phaseId: s0.id, title: "Executive kickoff",                  status: "Done", due: D.overdue3w,  owner: "Riku Sato",   priority: "high",   notes: "Tony attended personally.", commentCount: 4 },
    { onboardingId: ob6.id, phaseId: s0.id, title: "Technical requirements doc",         status: "Done", due: D.overdue2w,  owner: "Iris Blanc",  priority: "high",   notes: "",                         commentCount: 1 },
    { onboardingId: ob6.id, phaseId: s1.id, title: "Arc reactor API integration",        status: "Done", due: D.overdue2w,  owner: "Riku Sato",   priority: "high",   notes: "Custom endpoint required.", commentCount: 2 },
    { onboardingId: ob6.id, phaseId: s1.id, title: "MFA enforcement setup",              status: "Done", due: D.overdue1w,  owner: "Iris Blanc",  priority: "high",   notes: "",                         commentCount: 0 },
    { onboardingId: ob6.id, phaseId: s1.id, title: "Audit log configuration",            status: "Done", due: D.overdue1w,  owner: "Riku Sato",   priority: "medium", notes: "",                         commentCount: 1 },
    { onboardingId: ob6.id, phaseId: s2.id, title: "Load & stress testing",              status: "Done", due: D.overdue3d,  owner: "Iris Blanc",  priority: "medium", notes: "Passed at 10k req/min.",    commentCount: 2 },
    { onboardingId: ob6.id, phaseId: s2.id, title: "User acceptance testing",            status: "Done", due: D.overdue3d,  owner: "Riku Sato",   priority: "high",   notes: "",                         commentCount: 0 },
    { onboardingId: ob6.id, phaseId: s3.id, title: "Production deploy",                  status: "Done", due: D.overdue1w,  owner: "Iris Blanc",  priority: "high",   notes: "Zero-downtime deploy.",     commentCount: 3 },
    { onboardingId: ob6.id, phaseId: s3.id, title: "Hypercare monitoring",               status: "Done", due: D.overdue3d,  owner: "Riku Sato",   priority: "medium", notes: "",                         commentCount: 1 },
    { onboardingId: ob6.id, phaseId: s3.id, title: "CS handoff & close-out",             status: "Done", due: D.overdue1w,  owner: "Iris Blanc",  priority: "low",    notes: "",                         commentCount: 0 },
  ]});

  // ── Wayne Industries (Active, mixed) ──────────────────────────────────────
  const [w0, w1, w2, w3] = await createPhases(ob7.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob7.id, phaseId: w0.id, title: "Discovery workshop",                 status: "Done",                 due: D.overdue1w,  owner: "Iris Blanc",  priority: "high",   notes: "",                         commentCount: 2 },
    { onboardingId: ob7.id, phaseId: w0.id, title: "Identify admin users",               status: "Done",                 due: D.overdue3d,  owner: "Lena Marsh",  priority: "low",    notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w0.id, title: "Data residency requirements",        status: "In progress",          due: D.yesterday,  owner: "Iris Blanc",  priority: "high",   notes: "EU GDPR compliance check.", commentCount: 1 },
    { onboardingId: ob7.id, phaseId: w1.id, title: "SSO configuration",                  status: "Blocked",              due: D.overdue3d,  owner: "Lena Marsh",  priority: "high",   notes: "IdP metadata not yet sent.", commentCount: 4 },
    { onboardingId: ob7.id, phaseId: w1.id, title: "User role mapping",                  status: "In progress",          due: D.in3d,       owner: "Iris Blanc",  priority: "medium", notes: "",                         commentCount: 1 },
    { onboardingId: ob7.id, phaseId: w1.id, title: "Email domain verification",          status: "Not started",          due: D.in5d,       owner: "Lena Marsh",  priority: "medium", notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w1.id, title: "Provision production tenant",        status: "Not started",          due: D.in1w,       owner: "Iris Blanc",  priority: "high",   notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w2.id, title: "Training materials prep",            status: "In progress",          due: D.in5d,       owner: "Lena Marsh",  priority: "low",    notes: "Slide deck in review.",    commentCount: 2 },
    { onboardingId: ob7.id, phaseId: w2.id, title: "Admin user training session",        status: "Not started",          due: D.in2w,       owner: "Iris Blanc",  priority: "medium", notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w2.id, title: "UAT with 5 pilot users",             status: "Not started",          due: D.in2w,       owner: "Lena Marsh",  priority: "high",   notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w3.id, title: "Cutover weekend planning",           status: "Not started",          due: D.in3w,       owner: "Iris Blanc",  priority: "high",   notes: "",                         commentCount: 0 },
    { onboardingId: ob7.id, phaseId: w3.id, title: "Comms to all staff",                 status: "Not started",          due: D.in3w,       owner: "Lena Marsh",  priority: "low",    notes: "",                         commentCount: 0 },
  ]});

  // ── Cyberdyne (Active, early stage) ───────────────────────────────────────
  const [c0, c1, c2, c3] = await createPhases(ob8.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob8.id, phaseId: c0.id, title: "Technical discovery",                status: "Done",                 due: D.overdue3d,  owner: "Lena Marsh",  priority: "medium", notes: "",                           commentCount: 1 },
    { onboardingId: ob8.id, phaseId: c0.id, title: "Map existing automations",           status: "In progress",          due: D.today,      owner: "Sam Torres",  priority: "high",   notes: "Mapping 12 automation flows.", commentCount: 2 },
    { onboardingId: ob8.id, phaseId: c0.id, title: "Agree integration priority list",    status: "Not started",          due: D.in3d,       owner: "Lena Marsh",  priority: "high",   notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c1.id, title: "Webhook setup (orders)",             status: "In progress",          due: D.in3d,       owner: "Sam Torres",  priority: "high",   notes: "",                           commentCount: 3 },
    { onboardingId: ob8.id, phaseId: c1.id, title: "Webhook setup (inventory)",          status: "Not started",          due: D.in5d,       owner: "Lena Marsh",  priority: "medium", notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c1.id, title: "Error handling & retry logic",       status: "Not started",          due: D.in1w,       owner: "Sam Torres",  priority: "medium", notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c1.id, title: "Monitoring & alerting setup",        status: "Not started",          due: D.in10d,      owner: "Lena Marsh",  priority: "low",    notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c2.id, title: "Load testing (10k events/hr)",       status: "Not started",          due: D.in2w,       owner: "Sam Torres",  priority: "high",   notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c2.id, title: "Regression suite run",               status: "Not started",          due: D.in2w,       owner: "Lena Marsh",  priority: "medium", notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c3.id, title: "Phased rollout plan",                status: "Not started",          due: D.in3w,       owner: "Sam Torres",  priority: "medium", notes: "",                           commentCount: 0 },
    { onboardingId: ob8.id, phaseId: c3.id, title: "Rollback procedure documented",      status: "Not started",          due: D.in3w,       owner: "Lena Marsh",  priority: "medium", notes: "",                           commentCount: 0 },
  ]});

  // ── Soylent Corp (Paused) ─────────────────────────────────────────────────
  const [so0, so1, so2, so3] = await createPhases(ob9.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob9.id, phaseId: so0.id, title: "Kickoff meeting",                   status: "Done",        due: D.overdue2w,  owner: "Sam Torres",  priority: "medium", notes: "",                       commentCount: 0 },
    { onboardingId: ob9.id, phaseId: so0.id, title: "Legal & compliance review",         status: "In progress", due: D.overdue1w,  owner: "Dana Fox",    priority: "high",   notes: "Stalled on NDA review.", commentCount: 2 },
    { onboardingId: ob9.id, phaseId: so0.id, title: "Data residency check",              status: "Not started", due: D.in1w,       owner: "Sam Torres",  priority: "high",   notes: "",                       commentCount: 0 },
    { onboardingId: ob9.id, phaseId: so1.id, title: "IT readiness assessment",           status: "Not started", due: D.in2w,       owner: "Dana Fox",    priority: "medium", notes: "",                       commentCount: 0 },
    { onboardingId: ob9.id, phaseId: so2.id, title: "Pilot scope definition",            status: "Not started", due: D.in3w,       owner: "Sam Torres",  priority: "medium", notes: "",                       commentCount: 0 },
    { onboardingId: ob9.id, phaseId: so3.id, title: "Full rollout planning",             status: "Not started", due: D.in1m,       owner: "Dana Fox",    priority: "low",    notes: "",                       commentCount: 0 },
  ]});

  // ── Wonka Industries (Completed) ──────────────────────────────────────────
  const [wo0, wo1, wo2, wo3] = await createPhases(ob10.id);
  await prisma.task.createMany({ data: [
    { onboardingId: ob10.id, phaseId: wo0.id, title: "Chocolate factory tour / kickoff", status: "Done", due: D.overdue3w,  owner: "Jordan Cole", priority: "medium", notes: "Surprisingly productive.", commentCount: 5 },
    { onboardingId: ob10.id, phaseId: wo0.id, title: "Define custom branding assets",   status: "Done", due: D.overdue2w,  owner: "Jordan Cole", priority: "low",    notes: "",                        commentCount: 1 },
    { onboardingId: ob10.id, phaseId: wo1.id, title: "Apply brand theme",               status: "Done", due: D.overdue2w,  owner: "Jordan Cole", priority: "medium", notes: "",                        commentCount: 0 },
    { onboardingId: ob10.id, phaseId: wo1.id, title: "Configure Oompa Loompa user roles",status: "Done", due: D.overdue1w, owner: "Jordan Cole", priority: "medium", notes: "",                        commentCount: 2 },
    { onboardingId: ob10.id, phaseId: wo2.id, title: "Import product catalogue",        status: "Done", due: D.overdue1w,  owner: "Jordan Cole", priority: "high",   notes: "2,400 SKUs imported.",     commentCount: 1 },
    { onboardingId: ob10.id, phaseId: wo2.id, title: "Admin onboarding call",           status: "Done", due: D.overdue3d,  owner: "Jordan Cole", priority: "medium", notes: "",                        commentCount: 0 },
    { onboardingId: ob10.id, phaseId: wo3.id, title: "Go-live & golden ticket launch",  status: "Done", due: D.overdue1w,  owner: "Jordan Cole", priority: "high",   notes: "Client very happy.",       commentCount: 3 },
    { onboardingId: ob10.id, phaseId: wo3.id, title: "Post-launch retrospective",       status: "Done", due: D.overdue3d,  owner: "Jordan Cole", priority: "low",    notes: "",                        commentCount: 0 },
  ]});

  const [companyCount, taskCount, phaseCount] = await Promise.all([
    prisma.company.count(),
    prisma.task.count(),
    prisma.phase.count(),
  ]);
  console.log(`Seeded: ${companyCount} companies, ${phaseCount} phases, ${taskCount} tasks.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
