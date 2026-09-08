import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import {
  GrowthConsole,
  type Campaign,
  type GrowthEvent,
  type Review,
  type VipTier,
  type WishlistSignal,
} from "./_components/growth-console";

export default async function GrowthPage() {
  try {
    const [campaignsRes, reviewsRes, tiersRes, signalsRes, eventsRes] = await Promise.all([
      serverAdminGet<{ campaigns: Campaign[] }>("/api/admin/growth-campaigns"),
      serverAdminGet<{ reviews: Review[] }>("/api/admin/reviews?limit=100"),
      serverAdminGet<{ tiers: VipTier[] }>("/api/admin/vip-tiers"),
      serverAdminGet<{ signals: WishlistSignal[] }>("/api/admin/wishlist-signals?limit=50"),
      serverAdminGet<{ events: GrowthEvent[] }>("/api/admin/growth-notifications?limit=100"),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <ModuleHeader title="Growth" description="Wishlist, รีวิว, แคมเปญ, VIP และการแจ้งเตือน" />
        <GrowthConsole
          initialCampaigns={campaignsRes.campaigns ?? []}
          initialReviews={reviewsRes.reviews ?? []}
          initialTiers={tiersRes.tiers ?? []}
          initialSignals={signalsRes.signals ?? []}
          initialEvents={eventsRes.events ?? []}
        />
      </div>
    );
  } catch (error) {
    return <ModuleError title="Growth" error={error} />;
  }
}
