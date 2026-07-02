import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "MANAGER" || session.user.role === "ADMIN") redirect("/manager");
  redirect("/leads");
}
