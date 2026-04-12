import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { LoginClient } from "@/app/ui/login-client";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const user = await getServerUser();
  if (user) {
    redirect("/");
  }

  const nextUrl = typeof searchParams?.next === "string" ? searchParams.next : undefined;

  return <LoginClient initialErrorKey={typeof searchParams?.error === "string" ? searchParams.error : undefined} nextUrl={nextUrl} />;
}
