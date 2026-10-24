import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/chrome/AuthFrame";
import { SetupForm } from "@/components/auth/SetupForm";
import { isSetupOpen } from "@/lib/setup";

export const metadata: Metadata = { title: "Set up Space Works Inventory" };

/** First run only: disappears (redirects to /login) once any account exists. */
export default async function SetupPage() {
  if (!(await isSetupOpen())) redirect("/login");
  return (
    <AuthFrame title="Set up Space Works Inventory." description="Create the instance admin account and your first makerspace. Locations, categories, roles and sample data come next." accent={"Every tool,\naccounted for."}>
      <SetupForm defaultTimeZone="Asia/Kolkata" />
    </AuthFrame>
  );
}
