import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /platform/api is retired — API keys are managed in the dashboard now.
 * The redirect keeps old links and bookmarks working.
 */
export default function PlatformApiPage() {
  redirect("/platform/dash/apikey");
}
