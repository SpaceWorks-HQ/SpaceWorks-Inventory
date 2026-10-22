// Generated from app/login/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { redirect } from "next/navigation";
import { isOpenSignup } from "@/lib/instanceSettings";
import { getCurrentUser } from "@/lib/permissions";
import { isSetupOpen } from "@/lib/setup";

export async function loadLoginPage() {
if (await isSetupOpen()) redirect("/setup");
if (await getCurrentUser()) redirect("/");
const signupOpen = await isOpenSignup().catch(() => false);
return viewDto({ signupOpen } as const);
}
