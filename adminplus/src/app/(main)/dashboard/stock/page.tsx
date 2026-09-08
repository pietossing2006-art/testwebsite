import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { StockManager, type StockPool, type StockProduct } from "./_components/stock-manager";

export default async function StockPage() {
  try {
    const productsRes = await serverAdminGet<{ products: StockProduct[] }>("/api/admin/products");

    let pools: StockPool[] = [];
    try {
      const poolsRes = await serverAdminGet<{ pools: StockPool[] }>("/api/admin/stock-pools?limit=200&offset=0");
      pools = poolsRes.pools ?? [];
    } catch {
      pools = [];
    }

    return (
      <div className="flex flex-col gap-4">
        <ModuleHeader title="สต็อก" description="ดูแลสต็อกดิจิทัล pool และการผูกตัวเลือกสินค้า" />
        <StockManager initialProducts={productsRes.products ?? []} initialPools={pools} />
      </div>
    );
  } catch (error) {
    return <ModuleError title="สต็อก" error={error} />;
  }
}
