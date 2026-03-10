import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find a contact
  const contact = await prisma.contact.findFirst({ include: { onboarding: true } });
  if (!contact) {
    console.log('No contacts found — seed the DB first');
    return;
  }

  console.log('Contact:', contact.name, '(id:', contact.id + ')');
  console.log('Onboarding:', contact.onboarding.id);

  // Create a magic link
  const link = await prisma.magicLink.create({
    data: {
      contactId: contact.id,
      onboardingId: contact.onboardingId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('');
  console.log('=== Portal Test Link ===');
  console.log(`http://localhost:3000/portal/auth?token=${link.token}`);
  console.log('');
  console.log('Open this URL in your browser to test the portal.');

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
