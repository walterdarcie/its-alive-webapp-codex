import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { SigninClient } from "@/app/ui/signin-client";

export default async function SigninPage({
  searchParams
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const user = await getServerUser();
  if (user) {
    redirect(searchParams?.next ?? "/");
  }

  const nextUrl = typeof searchParams?.next === "string" ? searchParams.next : undefined;

  return <SigninClient initialErrorKey={typeof searchParams?.error === "string" ? searchParams.error : undefined} nextUrl={nextUrl} />;
}
