import { ModuleError, ModuleHeader } from "@/components/adminplus/module-shell";
import { serverAdminGet } from "@/lib/adminplus/server-api";

import { SettingsManager, type AutoAssignConfig, type UiSettings } from "./_components/settings-manager";

export default async function SettingsPage() {
  let settings: UiSettings;
  try {
    settings = await serverAdminGet<UiSettings>("/api/admin/ui-settings");
  } catch (error) {
    return <ModuleError title="ตั้งค่า" error={error} />;
  }

  // The homepage pickers and the auto-assign panel are extras: if either lookup
  // fails the rest of the settings page is still usable.
  const [categories, products, autoAssign] = await Promise.all([
    serverAdminGet<{ categories: { id: number; name: string }[] }>("/api/admin/categories")
      .then((r) => r.categories ?? [])
      .catch(() => []),
    serverAdminGet<{ products: { id: number; name: string }[] }>("/api/admin/products")
      .then((r) => r.products ?? [])
      .catch(() => []),
    serverAdminGet<{ config: AutoAssignConfig }>("/api/admin/auto-assign-config")
      .then((r) => r.config ?? null)
      .catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ModuleHeader title="ตั้งค่า" description="ตั้งค่าหน้าเว็บ branding รูปภาพ SEO ช่องทางเติมเงิน และการมอบหมายงาน" />
      <SettingsManager initialSettings={settings} initialAutoAssign={autoAssign} refs={{ categories, products }} />
    </div>
  );
}
