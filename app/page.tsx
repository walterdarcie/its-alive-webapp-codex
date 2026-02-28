import { requireServerUser } from "@/lib/auth";
import { HomeClient } from "@/app/ui/home-client";

export default async function HomePage() {
  await requireServerUser();
  return <HomeClient />;
}
