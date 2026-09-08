import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { FulfillmentConsole, type Booster, type FarmRequest, type FarmSummary } from "./_components/fulfillment-console";

export default async function FulfillmentPage() {
  let requests: FarmRequest[] = [];
  let summary: FarmSummary | null = null;
  let boosters: Booster[] = [];

  try {
    const [requestsRes, ...staffResults] = await Promise.all([
      serverAdminGet<{ items: FarmRequest[]; summary: FarmSummary }>("/api/admin/farm-requests?limit=200"),
      serverAdminGet<{ users: Booster[] }>("/api/admin/users?role=booster&limit=200"),
      serverAdminGet<{ users: Booster[] }>("/api/admin/users?role=admin&limit=200"),
      serverAdminGet<{ users: Booster[] }>("/api/admin/users?role=owner&limit=200"),
    ]);
    requests = requestsRes.items ?? [];
    summary = requestsRes.summary ?? null;

    const seen = new Map<number, Booster>();
    for (const res of staffResults) {
      for (const u of res.users ?? []) if (!seen.has(u.id)) seen.set(u.id, u);
    }
    boosters = [...seen.values()];
  } catch (error) {
    return <ModuleError title="บริการงานจ้าง" error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="บริการงานจ้าง" description="ติดตามงานบริการที่รอดำเนินการและงานที่กำลังทำ" />
      <FulfillmentConsole initialRequests={requests} initialSummary={summary} boosters={boosters} />
    </div>
  );
}
