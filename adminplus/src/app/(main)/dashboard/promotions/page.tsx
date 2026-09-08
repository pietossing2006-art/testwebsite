import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import {
  PromotionsManager,
  type DiscountCoupon,
  type PointCoupon,
  type Promotion,
  type SimpleCategory,
  type SimpleProduct,
} from "./_components/promotions-manager";

export default async function PromotionsPage() {
  try {
    const [couponsRes, promotionsRes, discountRes, productsRes, categoriesRes] = await Promise.all([
      serverAdminGet<{ coupons: PointCoupon[] }>("/api/admin/coupons"),
      serverAdminGet<{ promotions: Promotion[] }>("/api/admin/promotions"),
      serverAdminGet<{ coupons: DiscountCoupon[] }>("/api/admin/discount-coupons"),
      serverAdminGet<{ products: SimpleProduct[] }>("/api/admin/products"),
      serverAdminGet<{ categories: SimpleCategory[] }>("/api/admin/categories"),
    ]);

    return (
      <div className="flex flex-col gap-4">
        <ModuleHeader title="โปรโมชัน" description="จัดการคูปอง โปรโมชัน และส่วนลด" />
        <PromotionsManager
          initialCoupons={couponsRes.coupons ?? []}
          initialPromotions={promotionsRes.promotions ?? []}
          initialDiscountCoupons={discountRes.coupons ?? []}
          products={productsRes.products ?? []}
          categories={categoriesRes.categories ?? []}
        />
      </div>
    );
  } catch (error) {
    return <ModuleError title="โปรโมชัน" error={error} />;
  }
}
