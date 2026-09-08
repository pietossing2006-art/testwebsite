import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { CatalogManager, type Category, type Product } from "./_components/catalog-manager";

export default async function CatalogPage() {
  try {
    const [categoriesRes, productsRes] = await Promise.all([
      serverAdminGet<{ categories: Category[] }>("/api/admin/categories"),
      serverAdminGet<{ products: Product[] }>("/api/admin/products"),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <ModuleHeader title="แค็ตตาล็อก" description="จัดหมวดหมู่สินค้า ราคา รูปภาพ และสถานะการแสดงผล" />
        <CatalogManager initialCategories={categoriesRes.categories ?? []} initialProducts={productsRes.products ?? []} />
      </div>
    );
  } catch (error) {
    return <ModuleError title="แค็ตตาล็อก" error={error} />;
  }
}
