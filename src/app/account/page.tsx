import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountActions } from "@/components/AccountActions";
import AccountLottie from "@/components/AccountLottie";
import { createServerSupabase } from "@/lib/supabase/server";
import { PAID_PLANS, priceIdForPlan } from "@/lib/stripe";
import { getEffectiveSubscription, planAtLeast } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  // Only offer plans that are configured and are an upgrade over the current one.
  const sub = await getEffectiveSubscription(user.id);
  const availablePlans = PAID_PLANS.filter(
    (plan) => priceIdForPlan(plan) && (!sub.hasPremium || !planAtLeast(sub.plan, plan))
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
        <AccountLottie />
        <h1 className="text-xl font-semibold text-white">Account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technical settings for your Human AI account.
        </p>
        <div className="mt-6">
          <AccountActions email={user.email ?? ""} availablePlans={availablePlans} />
        </div>
      </div>
    </AppShell>
  );
}
