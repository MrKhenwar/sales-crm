import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

/**
 * Bootstrap the CRM with ONE manager + ONE salesperson.
 * No sample leads — production starts empty.
 *
 * Credentials come from env (set on Vercel before running).
 * Falls back to safe placeholders so a fresh local install still works.
 */
const manager = {
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
  const managerHash = await bcrypt.hash(manager.password, 10);
  const salesHash = await bcrypt.hash(salesperson.password, 10);

  await prisma.user.upsert({
    where: { email: manager.email },
    update: { name: manager.name, role: "MANAGER", phone: manager.phone, active: true, passwordHash: managerHash },
    create: {
      name: manager.name, email: manager.email, role: "MANAGER",
      phone: manager.phone, active: true, passwordHash: managerHash,
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
  console.log(`  MANAGER     ${manager.email}    password: ${manager.password}`);
  console.log(`  SALESPERSON ${salesperson.email}  password: ${salesperson.password}`);
  console.log("  ----------------------------------------------------------");
  console.log("  CHANGE THESE PASSWORDS after first sign-in. The Manager can add");
  console.log("  more salespeople via SQL until the user-management UI ships.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
