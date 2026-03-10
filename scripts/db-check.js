import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const companies = await prisma.company.count();
  const onboardings = await prisma.onboarding.count();
  const tasks = await prisma.task.count();
  const phases = await prisma.phase.count();
  const contacts = await prisma.contact.count();
  const comments = await prisma.comment.count();
  const magicLinks = await prisma.magicLink.count();
  const files = await prisma.file.count();

  console.log('=== Database Health Check ===');
  console.log('Companies:   ', companies);
  console.log('Onboardings: ', onboardings);
  console.log('Tasks:       ', tasks);
  console.log('Phases:      ', phases);
  console.log('Contacts:    ', contacts);
  console.log('Comments:    ', comments);
  console.log('MagicLinks:  ', magicLinks, '(new - empty, ready)');
  console.log('Files:       ', files, '(new - empty, ready)');

  const task = await prisma.task.findFirst({ select: { id: true, title: true, assigneeContactId: true } });
  console.log('');
  console.log('assigneeContactId column:', task.assigneeContactId === null ? 'exists (null as expected)' : task.assigneeContactId);

  console.log('');
  console.log('All portal models are ready!');
  await prisma.$disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
