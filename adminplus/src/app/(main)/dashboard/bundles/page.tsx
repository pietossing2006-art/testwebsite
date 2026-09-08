import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { BundlesManager, type Bundle, type BundleProduct } from "./_components/bundles-manager";

export default async function BundlesPage() {
  try {
    const [bundlesRes, productsRes] = await Promise.all([
      serverAdminGet<{ bundles: Bundle[] }>("/api/admin/bundles"),
      serverAdminGet<{ products: BundleProduct[] }>("/api/admin/products"),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <ModuleHeader title="Bundle" description="สร้างชุดสินค้าและแคมเปญแบบ bundle" />
        <BundlesManager initialBundles={bundlesRes.bundles ?? []} products={productsRes.products ?? []} />
      </div>
    );
  } catch (error) {
    return <ModuleError title="Bundle" error={error} />;
  }
}
