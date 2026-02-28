import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { LoginClient } from "@/app/ui/login-client";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await getServerUser();
  if (user) {
    redirect("/");
  }

  return <LoginClient initialErrorKey={typeof searchParams?.error === "string" ? searchParams.error : undefined} />;
}
