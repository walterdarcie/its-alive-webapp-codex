import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { LoginClient } from "@/app/ui/login-client";

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) {
    redirect("/");
  }

  return <LoginClient />;
}
