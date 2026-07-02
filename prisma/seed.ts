import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

/**
 * Bootstrap the CRM with ONE admin (the head) + ONE salesperson.
 * No sample leads — production starts empty.
 *
 * Credentials come from env (set on Vercel before running).
 * Falls back to safe placeholders so a fresh local install still works.
 *
 * The admin is the org head: they create managers, and managers pick which
 * salespeople they handle. A brand-new salesperson has no manager until picked.
 */
const admin = {
  name: process.env.INITIAL_MANAGER_NAME || "Admin",
  email: (process.env.INITIAL_MANAGER_EMAIL || "admin@yourcrm.app").toLowerCase(),
  password: process.env.INITIAL_MANAGER_PASSWORD || "Admin@12345",
  phone: process.env.INITIAL_MANAGER_PHONE || null,
};

const salesperson = {
  name: process.env.INITIAL_SALESPERSON_NAME || "Salesperson One",
  email: (process.env.INITIAL_SALESPERSON_EMAIL || "sales1@yourcrm.app").toLowerCase(),
  password: process.env.INITIAL_SALESPERSON_PASSWORD || "Sales@12345",
  phone: process.env.INITIAL_SALESPERSON_PHONE || null,
};

async function main() {
  const adminHash = await bcrypt.hash(admin.password, 10);
  const salesHash = await bcrypt.hash(salesperson.password, 10);

  await prisma.user.upsert({
    where: { email: admin.email },
    update: { name: admin.name, role: "ADMIN", phone: admin.phone, active: true, passwordHash: adminHash },
    create: {
      name: admin.name, email: admin.email, role: "ADMIN",
      phone: admin.phone, active: true, passwordHash: adminHash,
    },
  });

  await prisma.user.upsert({
    where: { email: salesperson.email },
    update: { name: salesperson.name, role: "SALESPERSON", phone: salesperson.phone, active: true, passwordHash: salesHash },
    create: {
      name: salesperson.name, email: salesperson.email, role: "SALESPERSON",
      phone: salesperson.phone, active: true, passwordHash: salesHash,
    },
  });

  const total = await prisma.user.count();
  const leads = await prisma.lead.count();
  console.log("Seed complete.");
  console.log(`  Users: ${total}  Leads: ${leads}`);
  console.log("  ----------------------------------------------------------");
  console.log(`  ADMIN       ${admin.email}    password: ${admin.password}`);
  console.log(`  SALESPERSON ${salesperson.email}  password: ${salesperson.password}`);
  console.log("  ----------------------------------------------------------");
  console.log("  CHANGE THESE PASSWORDS after first sign-in. The Admin creates");
  console.log("  managers under Users; each manager then picks their salespeople.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
