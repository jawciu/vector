/** Local UI review only. Creates its own disposable database; never accepts a DB URL. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
import pg from "pg";
import { startLocalDb } from "../../evals/harness/local-db";
import { seedCase, phaseForTitle } from "../../evals/harness/seed-case";
import type { GoldenCase } from "../../evals/harness/types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = 3010;
const readCase = (id: string): GoldenCase => JSON.parse(fs.readFileSync(path.join(root, "evals/golden", fs.readdirSync(path.join(root, "evals/golden")).find(n => n.startsWith(`${id}-`) && n.endsWith(".json"))!), "utf8"));
async function main() {
const envFile = parse(fs.readFileSync("/Users/caro/Code/onboarding/.env"));
const db = await startLocalDb();
if (new URL(db.url).hostname !== "127.0.0.1") throw new Error("Review database must be loopback");
console.log("Local review target: fresh disposable PostgreSQL on loopback; applying migrations locally only.");
const client = new pg.Client({ connectionString: db.url });
await client.connect();
const q = async (sql: string, args: unknown[] = []) => (await client.query(sql, args)).rows;
await seedCase(client, undefined);
const run = JSON.parse(fs.readFileSync(path.join(root, "evals/runs/2026-10-14-feature4-r1.json"), "utf8"));
const vendors = new Map<string, number>((await q('SELECT id,name FROM "VendorUser"')).map(x => [x.name, x.id]));
const info: Record<string, { onboardingId: number; phaseId: number; refs: Map<string, number>; contact: Map<string, number>; eventId: number }> = {};
const manifest: Record<string, unknown> = {};

async function draft(onboardingId: number, eventId: number, action: string, payload: Record<string, unknown>, quote: string, confidence = "medium") {
  const [d] = await q('INSERT INTO "PendingAIChange" (source,"sourceEventId","onboardingId",action,payload,"sourceQuote",confidence,status) VALUES (\'miniti\',$1,$2,$3,$4::jsonb,$5,$6,\'pending\') RETURNING id', [eventId, onboardingId, action, JSON.stringify(payload), quote, confidence]);
  return d.id as number;
}
async function event(onboardingId: number, title: string, payload: unknown, extraction: unknown = null) {
  const [ev] = await q('INSERT INTO "ExternalEvent" (source,"sourceId","occurredAt",payload,"onboardingId","processedAt","orchestratorExtraction") VALUES (\'miniti\',$1,now(),$2::jsonb,$3,now(),$4::jsonb) RETURNING id', [`local-review-${onboardingId}-${title}`, JSON.stringify(payload), onboardingId, JSON.stringify(extraction)]);
  return ev.id as number;
}

for (const id of ["14", "26", "22", "15", "20"]) {
  const golden = readCase(id), board = golden.board!;
  const [ob] = await q('SELECT o.id, c.id AS "companyId" FROM "Onboarding" o JOIN "Company" c ON c.id=o."companyId" WHERE c.prefix=$1', [board.companyPrefix]);
  const phases = await q('SELECT id,name FROM "Phase" WHERE "onboardingId"=$1 ORDER BY "sortOrder"', [ob.id]);
  const phaseId = phases[0].id;
  const contact = new Map<string, number>(), refs = new Map<string, number>();
  await q('UPDATE "Company" SET "logoUrl"=$1 WHERE id=$2', [`/logos/${board.companyName.toLowerCase().replace(/\W+/g, "")}.png`, ob.companyId]);
  for (const p of board.contacts) {
    const [row] = await q('INSERT INTO "Contact" ("onboardingId",name,email) VALUES ($1,$2,$3) RETURNING id', [ob.id, p.name, p.email ?? ""]);
    contact.set(p.name, row.id);
  }
  let number = 0;
  for (const t of board.tasks) {
    number++;
    const p = phases.find(x => x.name === phaseForTitle(t.title))?.id ?? phaseId;
    const [row] = await q('INSERT INTO "Task" ("onboardingId","phaseId",title,status,due,owner,"ownerId","assigneeContactId",notes,priority,number,"companyId","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$11) RETURNING id', [ob.id,p,t.title,t.status,t.dueDate ?? "",t.ownerName,t.owner === "vendor" ? vendors.get(t.ownerName) ?? null : null,t.owner === "customer" ? contact.get(t.ownerName) ?? null : null,t.notes,t.priority,number,ob.companyId]);
    refs.set(t.ref,row.id);
  }
  await q('UPDATE "Company" SET "taskCounter"=$1 WHERE id=$2',[number,ob.companyId]);
  for (const t of board.tasks) if (t.blockedBy && refs.has(t.blockedBy)) {
    await q('INSERT INTO "TaskDependency" ("taskId","blockedByTaskId") VALUES ($1,$2)',[refs.get(t.ref),refs.get(t.blockedBy)]);
    await q('UPDATE "Task" SET "blockedByTaskId"=$1 WHERE id=$2',[refs.get(t.blockedBy),refs.get(t.ref)]);
  }
  const saved = run.cases.find((c: { case: string }) => c.case === id);
  const raw = saved.raw.afterAssign ?? saved.raw.initial;
  const eventId = await event(ob.id, `Recorded eval ${id}`, golden.payload, raw.orchestratorExtraction);
  await q('UPDATE "ExternalEvent" SET "occurredAt"=$1 WHERE id=$2',[golden.payload.meeting.date,eventId]);
  const draftIds = new Map<number, number>();
  for (const d of raw.drafts) draftIds.set(d.id, await draft(ob.id,eventId,d.action,{},d.sourceQuote ?? "",d.confidence));
  const remap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key,v]) => {
      if (key === "taskId" || key === "blockedByTaskId") return [key, refs.get(saved.raw.maps.refByTaskId[String(v)]) ?? v];
      if (key === "draftId") return [key,draftIds.get(Number(v)) ?? v];
      if (key === "phaseId") return [key,phaseId];
      if (key === "ownerId") return [key,v == null ? null : vendors.get(saved.raw.maps.vendorNameById[String(v)]) ?? null];
      if (key === "assigneeContactId") return [key,v == null ? null : contact.get(saved.raw.maps.contactNameById[String(v)]) ?? null];
      return [key,remap(v)];
    }));
  };
  for (const d of raw.drafts) await q('UPDATE "PendingAIChange" SET payload=$1::jsonb WHERE id=$2',[JSON.stringify(remap(d.payload)),draftIds.get(d.id)]);
  info[id] = { onboardingId: ob.id,phaseId,refs,contact,eventId };
  manifest[board.companyName] = { case: id,onboardingId:ob.id,actions:`http://localhost:${port}/onboardings/${ob.id}?tab=actions`,tasks:`http://localhost:${port}/onboardings/${ob.id}?tab=tasks`,meetings:`http://localhost:${port}/onboardings/${ob.id}?tab=meetings` };
}

// Prepared examples are labelled by their meeting group, not in task titles.
// Recorded eval drafts above are untouched.
const ash = info["14"], loop = info["22"], fn = info["26"], modal = info["15"];
const reviewEvent = async (ob: number, title: string) => event(ob,title,{ event:"meeting.saved",meeting:{id:`review-${ob}-${title}`,title,date:new Date().toISOString(),summary:"Prepared local review examples. These are fixtures, not newly generated AI output.",transcript:[{speaker:"Reviewer",text:"Prepared examples for reviewing the interface."}],attendees:[],action_items:[]} });
const ashEvent = await reviewEvent(ash.onboardingId,"Review 1–2: fields and owner warnings");
await draft(ash.onboardingId,ashEvent,"match_existing",{taskId:ash.refs.get("t1"),action:"update",changes:{ownerId:vendors.get("Theo Okonkwo"),priority:"high",dueDate:"2026-11-02",appendNotes:"Prepared review note: keep the first release focused on embedded recruiting dashboards."},noteSource:{date:"2026-10-18",label:"local review fixture"}},"Prepared review fixture: update owner, date, priority and notes together.");
await draft(ash.onboardingId,ashEvent,"match_existing",{taskId:ash.refs.get("t2"),action:"update",changes:{dueDate:null}},"Prepared review fixture: remove the due date.");
await draft(ash.onboardingId,ashEvent,"create_task",{title:"Share revised metrics guide",phaseId:ash.phaseId,priority:"medium",ownerId:987654321,ownerName:"Former teammate",notes:"Prepared fixture: choose a valid person or explicitly leave unassigned."},"Prepared fixture for an unavailable owner.");

const [company] = await q('SELECT c.id,c."taskCounter" FROM "Company" c JOIN "Onboarding" o ON o."companyId"=c.id WHERE o.id=$1',[fn.onboardingId]);
const [dependencyTask] = await q('INSERT INTO "Task" ("onboardingId","phaseId",title,status,due,owner,"ownerId",number,"companyId") VALUES ($1,$2,$3,\'Not started\',\'\',\'Sam Whitfield\',$4,$5,$6) RETURNING id',[fn.onboardingId,fn.phaseId,"Connect warehouse and repo",vendors.get("Sam Whitfield"),company.taskCounter+1,company.id]);
await q('UPDATE "Company" SET "taskCounter"="taskCounter"+1 WHERE id=$1',[company.id]);
for (const ref of ["t1","t3"]) await q('INSERT INTO "TaskDependency" ("taskId","blockedByTaskId") VALUES ($1,$2)',[dependencyTask.id,fn.refs.get(ref)]);
await q('UPDATE "Task" SET "blockedByTaskId"=$1 WHERE id=$2',[fn.refs.get("t1"),dependencyTask.id]);
await q('INSERT INTO "TaskDependency" ("taskId",label) VALUES ($1,$2)',[dependencyTask.id,"Security sign-off"]);

for (const label of ["4A prerequisite first","4B dependent first","4C dismiss prerequisite"]) {
  const ev = await reviewEvent(loop.onboardingId,`Review ${label}`);
  const title = "Add returns metrics";
  const first = await draft(loop.onboardingId,ev,"create_task",{title,phaseId:loop.phaseId,draftRef:"d1",priority:"medium",ownerId:vendors.get("Maya Lindqvist")},"Prepared fixture: add the metrics before migrating the dashboard.");
  await draft(loop.onboardingId,ev,"create_task",{title:"Migrate returns dashboard",phaseId:loop.phaseId,draftRef:"d2",priority:"medium",ownerId:vendors.get("Maya Lindqvist"),dependsOn:[{draftId:first,draftRef:"d1",title}]},"Prepared fixture: migrate after the metrics are ready.");
}
const modalEvent = await reviewEvent(modal.onboardingId,"Review 5: recorder without a mapped owner");
await draft(modal.onboardingId,modalEvent,"create_task",{title:"Share executive dashboard draft",phaseId:modal.phaseId,priority:"medium",ownerFromRecorder:true,notes:"Prepared fixture for a meeting processed when no recorder was configured. Settings changes do not rewrite existing drafts."},"Prepared fixture: I'll share the executive dashboard draft.");

// A dependency-only suggestion whose prerequisite has already completed.
const fnEvent = await reviewEvent(fn.onboardingId,"Review: outdated dependency suggestion");
await q('UPDATE "Task" SET status=\'Done\' WHERE id=$1',[fn.refs.get("t2")]);
await draft(fn.onboardingId,fnEvent,"match_existing",{taskId:fn.refs.get("t1"),action:"update",changes:{dependsOn:[{taskId:fn.refs.get("t2")}] }},"Prepared fixture: this suggested prerequisite has already finished.");

await client.end();
const output = path.join(root,".local-review");
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,"map.json"),JSON.stringify({port,database:"disposable loopback database",databasePort:db.port,customers:manifest,settings:`http://localhost:${port}/settings#meeting-recorder`,reviewDependencyTaskId:dependencyTask.id},null,2));
console.log(JSON.stringify(manifest,null,2));

// Auth uses the existing normal demo sign-in. No auth-admin calls/password resets.
// No mail, model, webhook, service-role or production database credential reaches the app.
const appEnv: NodeJS.ProcessEnv = { PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:"development",DATABASE_URL:db.url,DIRECT_DATABASE_URL:db.url,NEXT_PUBLIC_APP_URL:`http://localhost:${port}`,RESEND_API_KEY:"",ANTHROPIC_API_KEY:"",AI_GATEWAY_API_KEY:"" };
for (const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","DEMO_USER_EMAIL","DEMO_USER_PASSWORD"]) if(envFile[key]) appEnv[key]=envFile[key];
const child = spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:appEnv,stdio:"inherit"});
const stop = async () => {child.kill("SIGTERM");await db.stop();process.exit(0);};
process.once("SIGINT",stop);process.once("SIGTERM",stop);
child.once("exit",async code => {await db.stop();process.exit(code ?? 0);});
}
main().catch(error => {console.error(error instanceof Error ? error.message : "Local review startup failed");process.exit(1);});
