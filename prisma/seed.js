// Log immediately so we see the script started (imports can be slow)
console.log("Seed script starting...");

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

console.log("Running seed...");

async function main() {
  await prisma.task.deleteMany();
  await prisma.onboarding.deleteMany();
  await prisma.company.deleteMany();

  // --- Companies ---
  const companies = await Promise.all([
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

  const [acme, techcorp, globex, initech, umbrella, stark, wayne, cyberdyne, soylent, wonka] = companies;

  // --- Onboardings (mix of Active, Completed, Paused) ---
  const ob1  = await prisma.onboarding.create({ data: { companyId: acme.id,      owner: "Jess Park",     status: "Active" } });
  const ob2  = await prisma.onboarding.create({ data: { companyId: techcorp.id,   owner: "Alex Chen",     status: "Completed" } });
  const ob3  = await prisma.onboarding.create({ data: { companyId: globex.id,     owner: "Jess Park",     status: "Active" } });
  const ob4  = await prisma.onboarding.create({ data: { companyId: initech.id,    owner: "Sam Torres",    status: "Active" } });
  const ob5  = await prisma.onboarding.create({ data: { companyId: umbrella.id,   owner: "Alex Chen",     status: "Paused" } });
  const ob6  = await prisma.onboarding.create({ data: { companyId: stark.id,      owner: "Maya Lin",      status: "Completed" } });
  const ob7  = await prisma.onboarding.create({ data: { companyId: wayne.id,      owner: "Jess Park",     status: "Active" } });
  const ob8  = await prisma.onboarding.create({ data: { companyId: cyberdyne.id,  owner: "Sam Torres",    status: "Active" } });
  const ob9  = await prisma.onboarding.create({ data: { companyId: soylent.id,    owner: "Maya Lin",      status: "Paused" } });
  const ob10 = await prisma.onboarding.create({ data: { companyId: wonka.id,      owner: "Alex Chen",     status: "Completed" } });

  // --- Tasks ---
  await prisma.task.createMany({
    data: [
      // Acme Co (Active) — has blocked tasks → At risk
      { onboardingId: ob1.id, title: "Provide warehouse read access", status: "Blocked", due: "Fri", waitingOn: "Customer (Sam)" },
      { onboardingId: ob1.id, title: "Send security questionnaire",   status: "In progress", due: "Thu", waitingOn: "Vendor (Jess)" },
      { onboardingId: ob1.id, title: "Confirm SSO details",           status: "Todo", due: "Tue", waitingOn: "Customer (Maya)" },
      { onboardingId: ob1.id, title: "Schedule admin training",       status: "Done", due: "Mon", waitingOn: "Vendor (Jess)" },

      // TechCorp (Completed) — all done
      { onboardingId: ob2.id, title: "Sign MSA",              status: "Done", due: "Mon", waitingOn: "Customer (Legal)" },
      { onboardingId: ob2.id, title: "Provision workspace",   status: "Done", due: "Wed", waitingOn: "Vendor" },
      { onboardingId: ob2.id, title: "Kickoff call",          status: "Done", due: "Fri", waitingOn: "Both" },

      // Globex (Active) — on track, no blockers
      { onboardingId: ob3.id, title: "Data migration plan",      status: "In progress", due: "Wed", waitingOn: "Vendor (Jess)" },
      { onboardingId: ob3.id, title: "API key provisioning",     status: "Todo", due: "Thu", waitingOn: "Customer (IT)" },
      { onboardingId: ob3.id, title: "Compliance review",        status: "Done", due: "Mon", waitingOn: "Vendor (Legal)" },

      // Initech (Active) — all blocked
      { onboardingId: ob4.id, title: "Contract amendment",        status: "Blocked", due: "Fri", waitingOn: "Customer (Legal)" },
      { onboardingId: ob4.id, title: "VPN access setup",          status: "Blocked", due: "Thu", waitingOn: "Customer (IT)" },

      // Umbrella Corp (Paused)
      { onboardingId: ob5.id, title: "Environment provisioning",  status: "Todo", due: "Mon", waitingOn: "Vendor" },
      { onboardingId: ob5.id, title: "Security audit",            status: "Todo", due: "Wed", waitingOn: "Both" },

      // Stark Enterprises (Completed) — all done
      { onboardingId: ob6.id, title: "Integration testing",      status: "Done", due: "Tue", waitingOn: "Both" },
      { onboardingId: ob6.id, title: "Go-live checklist",        status: "Done", due: "Fri", waitingOn: "Vendor (Maya)" },
      { onboardingId: ob6.id, title: "Handoff to support",       status: "Done", due: "Mon", waitingOn: "Vendor" },

      // Wayne Industries (Active) — has a blocker → At risk
      { onboardingId: ob7.id, title: "SSO configuration",         status: "Blocked", due: "Wed", waitingOn: "Customer (DevOps)" },
      { onboardingId: ob7.id, title: "User role mapping",         status: "In progress", due: "Thu", waitingOn: "Vendor (Jess)" },
      { onboardingId: ob7.id, title: "Training materials",        status: "Todo", due: "Fri", waitingOn: "Vendor" },
      { onboardingId: ob7.id, title: "Sandbox deployment",        status: "Done", due: "Mon", waitingOn: "Vendor" },

      // Cyberdyne (Active) — on track
      { onboardingId: ob8.id, title: "Webhook setup",             status: "In progress", due: "Tue", waitingOn: "Customer (Eng)" },
      { onboardingId: ob8.id, title: "Load testing",              status: "Todo", due: "Fri", waitingOn: "Both" },

      // Soylent Corp (Paused)
      { onboardingId: ob9.id, title: "Legal review",              status: "Todo", due: "Mon", waitingOn: "Customer (Legal)" },
      { onboardingId: ob9.id, title: "Data residency check",      status: "Todo", due: "Wed", waitingOn: "Vendor (Maya)" },
      { onboardingId: ob9.id, title: "Pilot program scope",       status: "Todo", due: "Fri", waitingOn: "Both" },

      // Wonka Industries (Completed) — all done
      { onboardingId: ob10.id, title: "Custom branding",          status: "Done", due: "Mon", waitingOn: "Vendor" },
      { onboardingId: ob10.id, title: "Admin onboarding call",    status: "Done", due: "Wed", waitingOn: "Both" },
    ],
  });

  const companyCount = await prisma.company.count();
  const taskCount = await prisma.task.count();
  console.log(`Seeded: ${companyCount} companies with ${taskCount} tasks.`);
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
