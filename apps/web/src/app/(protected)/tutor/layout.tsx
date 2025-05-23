import { getServerSessionOrRedirect } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import type { Role } from "@prisma/client";

export default async function ProtectedLayout({ children }: { children: React.ReactNode; }) {
  const session = await getServerSessionOrRedirect();

  const allowedRoles: Role[] = ["INSTRUCTOR", "MENTOR"];

  if (!allowedRoles.includes(session.user.role)) {
    return notFound();
  }

  return (
    <div>
      {children}
    </div>
  );
} 