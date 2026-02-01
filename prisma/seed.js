import { PrismaClient } from "../lib/generated/prisma/client.js";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  await prisma.task.deleteMany();
  await prisma.onboarding.deleteMany();
  await prisma.company.deleteMany();

  const acme = await prisma.company.create({ data: { name: "Acme Co" } });
  const techcorp = await prisma.company.create({ data: { name: "TechCorp" } });

  const ob1 = await prisma.onboarding.create({ data: { companyId: acme.id } });
  const ob2 = await prisma.onboarding.create({ data: { companyId: techcorp.id } });

  await prisma.task.createMany({
    data: [
      { onboardingId: ob1.id, title: "Provide warehouse read access", status: "Blocked", due: "Fri", waitingOn: "Customer (Sam)" },
      { onboardingId: ob1.id, title: "Send security questionnaire", status: "In progress", due: "Thu", waitingOn: "Vendor (Jess)" },
      { onboardingId: ob1.id, title: "Confirm SSO details", status: "Todo", due: "Tue", waitingOn: "Customer (Maya)" },
      { onboardingId: ob1.id, title: "Schedule admin training", status: "Done", due: "Mon", waitingOn: "Vendor (Jess)" },
      { onboardingId: ob2.id, title: "Sign MSA", status: "Done", due: "Mon", waitingOn: "Customer (Legal)" },
      { onboardingId: ob2.id, title: "Provision workspace", status: "In progress", due: "Wed", waitingOn: "Vendor" },
      { onboardingId: ob2.id, title: "Kickoff call", status: "Todo", due: "Fri", waitingOn: "Both" },
    ],
  });

  console.log("Seeded: Acme Co, TechCorp with tasks.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
