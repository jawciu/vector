/**
 * World + per-case board seeding for the eval harness.
 *
 * Reset strategy: before every case, TRUNCATE every public table (RESTART
 * IDENTITY CASCADE) and insert the world again with plain SQL. The whole world
 * is ~12 companies, ~6 vendor users, 12 onboardings, 60 phases and one board of
 * ~5 tasks, so a full reset + reseed takes tens of milliseconds, well under a
 * template-database clone, and leaves no state behind from the previous case.
 *
 * The world:
 *   - the 12 cast companies (REALISM_PLAN.md step 2) with their real email
 *     domains, because the meeting matcher keys on attendee email domain, and
 *     a case is only realistic if other customers exist for it to NOT match
 *     (case 24 needs Modal and Raycast both present to be ambiguous);
 *   - exactly one Active onboarding per company with the default phases
 *     (two onboardings for one company would make every match ambiguous);
 *   - the Quarry vendor team (Maya, Theo, Ines, Sam, Caroline) plus any extra
 *     vendor user a board names (the anonymous recorder "You");
 *   - the case's `board` (contacts, tasks, blockedBy → TaskDependency rows
 *     plus the legacy column) on its company's
 *     onboarding. Every other onboarding is empty.
 *
 * Writes go through a raw `pg` client, never through lib/db, so seeding does
 * not emit activity rows, notifications or emails.
 */

import type pg from "pg";
import type { Board } from "./types";
import { EVAL_MARKER_TABLE } from "./local-db";

export const CAST_COMPANIES: { name: string; domain: string; prefix: string }[] = [
  { name: "Raycast", domain: "raycast.com", prefix: "RAY" },
  { name: "beehiiv", domain: "beehiiv.com", prefix: "BEE" },
  { name: "Modal", domain: "modal.com", prefix: "MDL" },
  { name: "Loop Returns", domain: "loopreturns.com", prefix: "LOOP" },
  { name: "Huel", domain: "huel.com", prefix: "HUEL" },
  { name: "Function Health", domain: "functionhealth.com", prefix: "FN" },
  { name: "Flock Freight", domain: "flockfreight.com", prefix: "FLK" },
  { name: "Sylvera", domain: "sylvera.com", prefix: "SYL" },
  { name: "ChowNow", domain: "chownow.com", prefix: "CHOW" },
  { name: "Ashby", domain: "ashbyhq.com", prefix: "ASH" },
  { name: "Peerspace", domain: "peerspace.com", prefix: "PEER" },
  { name: "Patch", domain: "patch.io", prefix: "PAT" },
];

export const VENDOR_TEAM: { name: string; email: string }[] = [
  { name: "Maya Lindqvist", email: "maya@vector.test" },
  { name: "Theo Okonkwo", email: "theo@vector.test" },
  { name: "Ines Ferreira", email: "ines@vector.test" },
  { name: "Sam Whitfield", email: "sam@vector.test" },
  { name: "Caroline Jaworsky", email: "caroline@vector.test" },
];

const DEFAULT_PHASES = ["Kickoff", "Configuration", "Data Migration", "Training", "Go-Live"];

/** Boards carry no phase, so place each task in the phase its title implies. */
export function phaseForTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\btrain|enablement|workshop|office hours/.test(t)) return "Training";
  if (/go-live|go live|launch|cutover|parity|sign-off|signoff|rollout|hypercare/.test(t)) return "Go-Live";
  if (/migrat|dbt|model|dashboard|metric|semantic|backfill|explore/.test(t)) return "Data Migration";
  if (/kickoff|kick-off|discovery/.test(t)) return "Kickoff";
  return "Configuration";
}

/** Lookup tables from database ids back to the answer key's vocabulary. */
export type SeedMaps = {
  companyPrefixByOnboardingId: Map<number, string>;
  onboardingIdByPrefix: Map<string, number>;
  vendorNameById: Map<number, string>;
  contactNameById: Map<number, string>;
  refByTaskId: Map<number, string>;
  taskIdByRef: Map<string, number>;
};

const placeholderEmail = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "user"}@vector.test`;

export async function resetDb(client: pg.Client) {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', $1)`,
    [EVAL_MARKER_TABLE]
  );
  if (rows.length === 0) return;
  await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/**
 * Reset the database and seed the world, plus `board` (if any) on its
 * company's onboarding. Returns the id → ref/name maps the runner needs.
 */
export async function seedCase(client: pg.Client, board: Board | undefined): Promise<SeedMaps> {
  await resetDb(client);
  const maps: SeedMaps = {
    companyPrefixByOnboardingId: new Map(),
    onboardingIdByPrefix: new Map(),
    vendorNameById: new Map(),
    contactNameById: new Map(),
    refByTaskId: new Map(),
    taskIdByRef: new Map(),
  };

  await client.query("BEGIN");
  try {
    // ---- Vendor users. The board's spelling of a name wins for its email
    //      (case 30 calls Caroline "Caroline"); board-only users are added.
    const vendors = new Map<string, string>(VENDOR_TEAM.map((u) => [u.email, u.name]));
    for (const u of board?.vendorUsers ?? []) {
      vendors.set(u.email || placeholderEmail(u.name), u.name);
    }
    const vendorIdByName = new Map<string, number>();
    for (const [email, name] of vendors) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO "VendorUser" (email, name, role) VALUES ($1, $2, 'admin') RETURNING id`,
        [email, name]
      );
      maps.vendorNameById.set(rows[0].id, name);
      vendorIdByName.set(name, rows[0].id);
    }
    const boardOwnerName = board?.vendorUsers.find((u) => u.name !== "You")?.name ?? board?.vendorUsers[0]?.name;
    const defaultOwnerId = vendorIdByName.get(boardOwnerName ?? "Maya Lindqvist") ?? vendorIdByName.get("Maya Lindqvist")!;

    // ---- Companies, one onboarding each, default phases.
    const phaseIdByName = new Map<string, number>(); // for the board's onboarding only
    for (const c of CAST_COMPANIES) {
      const isBoard = board?.companyPrefix === c.prefix;
      const taskCount = isBoard ? board!.tasks.length : 0;
      const { rows: [company] } = await client.query<{ id: number }>(
        `INSERT INTO "Company" (name, domain, prefix, "taskCounter") VALUES ($1, $2, $3, $4) RETURNING id`,
        [isBoard ? board!.companyName : c.name, c.domain, c.prefix, taskCount]
      );
      const { rows: [ob] } = await client.query<{ id: number }>(
        `INSERT INTO "Onboarding" ("companyId", "ownerId", status) VALUES ($1, $2, 'Active') RETURNING id`,
        [company.id, defaultOwnerId]
      );
      maps.companyPrefixByOnboardingId.set(ob.id, c.prefix);
      maps.onboardingIdByPrefix.set(c.prefix, ob.id);
      for (let i = 0; i < DEFAULT_PHASES.length; i++) {
        const { rows: [ph] } = await client.query<{ id: number }>(
          `INSERT INTO "Phase" ("onboardingId", name, "sortOrder") VALUES ($1, $2, $3) RETURNING id`,
          [ob.id, DEFAULT_PHASES[i], i]
        );
        if (isBoard) phaseIdByName.set(DEFAULT_PHASES[i], ph.id);
      }

      if (!isBoard) continue;

      // ---- The case's board.
      const contactIdByName = new Map<string, number>();
      for (const ct of board!.contacts) {
        const { rows: [row] } = await client.query<{ id: number }>(
          `INSERT INTO "Contact" ("onboardingId", name, email) VALUES ($1, $2, $3) RETURNING id`,
          [ob.id, ct.name, ct.email ?? ""]
        );
        contactIdByName.set(ct.name, row.id);
        maps.contactNameById.set(row.id, ct.name);
      }
      let number = 0;
      for (const t of board!.tasks) {
        number += 1;
        const ownerId = t.owner === "vendor" ? vendorIdByName.get(t.ownerName) ?? null : null;
        const contactId = t.owner === "customer" ? contactIdByName.get(t.ownerName) ?? null : null;
        if (t.owner === "vendor" && ownerId == null) throw new Error(`board task ${t.ref}: vendor "${t.ownerName}" not seeded`);
        if (t.owner === "customer" && contactId == null) throw new Error(`board task ${t.ref}: contact "${t.ownerName}" not on board`);
        const { rows: [row] } = await client.query<{ id: number }>(
          `INSERT INTO "Task" ("onboardingId", "phaseId", title, status, due, owner, "ownerId", notes, priority,
                               "assigneeContactId", "sortOrder", number, "companyId", "previousStatus")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            ob.id,
            phaseIdByName.get(phaseForTitle(t.title)),
            t.title,
            t.status,
            t.dueDate ?? "",
            t.ownerName,
            ownerId,
            t.notes ?? "",
            t.priority,
            contactId,
            number,
            number,
            company.id,
            t.status === "Done" ? "In progress" : null,
          ]
        );
        maps.taskIdByRef.set(t.ref, row.id);
        maps.refByTaskId.set(row.id, t.ref);
      }
      // Board blockers, the way the app stores them (GAPS-PLAN feature 2): one
      // TaskDependency row per blocker, and the legacy Task.blockedByTaskId
      // column set to the first one, as lib/db keeps it.
      for (const t of board!.tasks) {
        const refs = (Array.isArray(t.blockedBy) ? t.blockedBy : t.blockedBy ? [t.blockedBy] : []) as string[];
        const taskId = maps.taskIdByRef.get(t.ref);
        for (const r of refs) {
          const blocker = maps.taskIdByRef.get(r);
          if (blocker == null) throw new Error(`board task ${t.ref}: blockedBy ${r} not on board`);
          await client.query(`INSERT INTO "TaskDependency" ("taskId", "blockedByTaskId") VALUES ($1, $2)`, [taskId, blocker]);
        }
        if (refs.length > 0) {
          await client.query(`UPDATE "Task" SET "blockedByTaskId" = $1 WHERE id = $2`, [maps.taskIdByRef.get(refs[0]), taskId]);
        }
      }
    }
    if (board && !maps.onboardingIdByPrefix.has(board.companyPrefix)) {
      throw new Error(`board company ${board.companyPrefix} is not in the cast`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return maps;
}
