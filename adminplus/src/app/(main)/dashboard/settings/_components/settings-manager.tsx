"use client";

import { useState } from "react";

import { toast } from "sonner";

import { ImageUploadCropper } from "@/components/adminplus/image-upload-cropper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";

import {
  FaqEditor,
  LinkListEditor,
  NavbarLinksEditor,
  ProductPicker,
  SocialLinksEditor,
  TrustItemsEditor,
  type FaqItem,
  type LinkItem,
  type NavbarLink,
  type SocialItem,
  type TrustItem,
} from "./settings-editors";

export type UiSettings = {
  image_settings: Record<string, unknown>;
  branding_settings: Record<string, unknown>;
  homepage_settings: Record<string, unknown>;
  site_settings: Record<string, unknown>;
  topup_settings: Record<string, unknown>;
};

export type AutoAssignConfig = { enabled: boolean; roles: string[] };

export type SettingsRefs = {
  categories: { id: number; name: string }[];
  products: { id: number; name: string }[];
};

/** Aspect ratios are stored as "w/h" strings; these are the ones worth one click. */
const RATIO_PRESETS = ["16/10", "16/9", "4/3", "1/1", "3/4"];

const RATIO_FIELDS = [
  { key: "home_featured_ratio", label: "รูปสินค้าแนะนำ (หน้าแรก)", fit: "home_featured_force_fit" },
  { key: "home_categories_ratio", label: "รูปหมวดหมู่ (หน้าแรก)", fit: "home_categories_force_fit" },
  { key: "category_products_ratio", label: "รูปสินค้าในหมวดหมู่", fit: "category_products_force_fit" },
  { key: "product_detail_ratio", label: "รูปหน้ารายละเอียดสินค้า", fit: "product_detail_force_fit" },
];

const BRANDING_FIELDS = [
  { key: "site_name", label: "ชื่อเว็บไซต์" },
  { key: "navbar_title", label: "ชื่อบน navbar" },
  { key: "navbar_tagline", label: "คำโปรยบน navbar" },
  { key: "tab_title", label: "ชื่อบนแท็บเบราว์เซอร์" },
];

const HERO_FIELDS = [
  { key: "hero_title", label: "หัวข้อใหญ่ (Hero title)" },
  { key: "hero_subtitle", label: "หัวข้อรอง" },
  { key: "hero_button_text", label: "ข้อความบนปุ่ม" },
  { key: "hero_button_link", label: "ลิงก์ของปุ่ม" },
];

const TOPUP_METHODS = [
  { key: "angpao", label: "ซองอั่งเปา TrueMoney", desc: "ลูกค้าวางลิงก์ซองเพื่อเติมพอยท์" },
  { key: "coupon", label: "โค้ดคูปอง", desc: "เติมพอยท์ด้วยโค้ดที่ออกให้" },
  { key: "promptpay", label: "PromptPay", desc: "โอนผ่าน QR แล้วรอตรวจสอบ" },
];

const ASSIGNABLE_ROLES = ["booster", "support", "admin", "owner"];

function formatPhoneNumber(num: unknown): string {
  const clean = String(num || "").replace(/\D/g, "");
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  if (clean.length === 13) return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  return String(num || "").trim();
}

function str(source: Record<string, unknown>, key: string) {
  const value = source?.[key];
  return value == null ? "" : String(value);
}

function list<T>(source: Record<string, unknown>, key: string): T[] {
  const value = source?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function ids(source: Record<string, unknown>, key: string): number[] {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  desc,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  desc?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(Boolean(c))} disabled={disabled} className="mt-0.5" />
      <span>
        {title}
        {desc && <span className="block text-muted-foreground text-xs">{desc}</span>}
      </span>
    </label>
  );
}

const TABS_CONFIG: { value: string; label: string }[] = [
  { value: "branding", label: "Branding" },
  { value: "homepage", label: "หน้าแรก" },
  { value: "images", label: "รูปภาพ" },
  { value: "site", label: "SEO / ท้ายเว็บ" },
  { value: "topup", label: "เติมเงิน" },
  { value: "ops", label: "มอบหมายงาน" },
];

export function SettingsManager({
  initialSettings,
  initialAutoAssign,
  refs,
}: {
  initialSettings: UiSettings;
  initialAutoAssign: AutoAssignConfig | null;
  refs: SettingsRefs;
}) {
  const [tab, setTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const urlTab = new URLSearchParams(window.location.search).get("tab");
        if (urlTab && TABS_CONFIG.some((t) => t.value === urlTab)) return urlTab;
        const saved = sessionStorage.getItem("adminplus_settings_tab");
        if (saved && TABS_CONFIG.some((t) => t.value === saved)) return saved;
      } catch {}
    }
    return "branding";
  });

  function handleTabChange(value: string) {
    setTab(value);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("adminplus_settings_tab", value);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", value);
        window.history.replaceState(null, "", url.toString());
      } catch {}
    }
  }

  const [image, setImage] = useState<Record<string, unknown>>(initialSettings.image_settings ?? {});
  const [branding, setBranding] = useState<Record<string, unknown>>(initialSettings.branding_settings ?? {});
  const [homepage, setHomepage] = useState<Record<string, unknown>>(initialSettings.homepage_settings ?? {});
  const [site, setSite] = useState<Record<string, unknown>>(initialSettings.site_settings ?? {});
  const [topup, setTopup] = useState<Record<string, unknown>>(initialSettings.topup_settings ?? {});
  const [autoAssign, setAutoAssign] = useState<AutoAssignConfig>(initialAutoAssign ?? { enabled: false, roles: ["booster"] });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await adminApi.put<UiSettings>("/ui-settings", {
        image_settings: image,
        branding_settings: branding,
        homepage_settings: homepage,
        site_settings: site,
        topup_settings: topup,
      });
      toast.success("บันทึกการตั้งค่าทั้งหมดเรียบร้อย");
      // Trust the server's normalised values so the form shows what was actually stored.
      setImage(res.image_settings ?? image);
      setBranding(res.branding_settings ?? branding);
      setHomepage(res.homepage_settings ?? homepage);
      setSite(res.site_settings ?? site);
      setTopup(res.topup_settings ?? topup);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveSection(section: string) {
    setBusy(true);
    try {
      const payload: Partial<UiSettings> = {};
      let label = "";
      if (section === "branding") {
        payload.branding_settings = branding;
        label = "Branding";
      } else if (section === "homepage") {
        payload.homepage_settings = homepage;
        label = "หน้าแรก";
      } else if (section === "images") {
        payload.image_settings = image;
        label = "รูปภาพ";
      } else if (section === "site") {
        payload.site_settings = site;
        label = "SEO / ท้ายเว็บ";
      } else if (section === "topup") {
        payload.topup_settings = topup;
        label = "ระบบเติมเงิน";
      }
      const res = await adminApi.put<UiSettings>("/ui-settings", payload);
      toast.success(`บันทึกส่วน "${label}" เรียบร้อย`);
      if (res.branding_settings) setBranding(res.branding_settings);
      if (res.homepage_settings) setHomepage(res.homepage_settings);
      if (res.image_settings) setImage(res.image_settings);
      if (res.site_settings) setSite(res.site_settings);
      if (res.topup_settings) setTopup(res.topup_settings);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAutoAssign() {
    if (autoAssign.enabled && autoAssign.roles.length === 0) {
      toast.error("เลือกสิทธิ์ที่จะให้รับงานอัตโนมัติอย่างน้อย 1 อย่าง");
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi.put<{ config: AutoAssignConfig }>("/auto-assign-config", { config: autoAssign });
      setAutoAssign(res.config ?? autoAssign);
      toast.success("บันทึกการมอบหมายงานอัตโนมัติเรียบร้อย");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const currentTabLabel = TABS_CONFIG.find((t) => t.value === tab)?.label || "";

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TABS_CONFIG.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={tab === "ops" ? saveAutoAssign : () => saveSection(tab)}
              disabled={busy}
            >
              บันทึกทั้งหมดของหน้านี้ ({currentTabLabel})
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </div>

        {/* ── Branding ─────────────────────────────────────────── */}
        <TabsContent value="branding" className="flex flex-col gap-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ชื่อและโลโก้</CardTitle>
              <CardDescription>ข้อความและรูปที่แสดงบนหัวเว็บและแท็บเบราว์เซอร์</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {BRANDING_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input value={str(branding, f.key)} onChange={(e) => setBranding((s) => ({ ...s, [f.key]: e.target.value }))} disabled={busy} />
                </Field>
              ))}
              <ImageUploadCropper
                label="Favicon (ไอคอนแท็บเบราว์เซอร์)"
                value={str(branding, "favicon_url")}
                onChange={(url) => setBranding((s) => ({ ...s, favicon_url: url }))}
                aspectRatio={1}
                helpText="ไอคอนสี่เหลี่ยมจัตุรัส 1:1"
                disabled={busy}
              />
              <ImageUploadCropper
                label="Logo เว็บไซต์"
                value={str(branding, "logo_url")}
                onChange={(url) => setBranding((s) => ({ ...s, logo_url: url }))}
                aspectRatio={16 / 9}
                helpText="โลโก้หลักของเว็บไซต์"
                disabled={busy}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">เมนูบนหัวเว็บ</CardTitle>
              <CardDescription>เมนูเพิ่มเติมที่แสดงถัดจากเมนูหลัก</CardDescription>
            </CardHeader>
            <CardContent>
              <NavbarLinksEditor
                links={list<NavbarLink>(branding, "navbar_links")}
                onChange={(links) => setBranding((s) => ({ ...s, navbar_links: links }))}
                disabled={busy}
              />
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => saveSection("branding")} disabled={busy}>
              บันทึกทั้งหมดของหน้านี้ (Branding)
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </TabsContent>

        {/* ── Homepage ─────────────────────────────────────────── */}
        <TabsContent value="homepage" className="flex flex-col gap-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">แบนเนอร์ต้อนรับ (Hero)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {HERO_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input value={str(homepage, f.key)} onChange={(e) => setHomepage((s) => ({ ...s, [f.key]: e.target.value }))} disabled={busy} />
                </Field>
              ))}
              <div className="md:col-span-2">
                <Field label="คำอธิบายใต้หัวข้อ">
                  <Textarea
                    rows={2}
                    value={str(homepage, "hero_description")}
                    onChange={(e) => setHomepage((s) => ({ ...s, hero_description: e.target.value }))}
                    disabled={busy}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">สินค้าที่ดันขึ้นหน้าแรก</CardTitle>
              <CardDescription>เลือกเองได้ว่าจะให้สินค้าไหนขึ้นโซนแนะนำและแถบเลื่อน</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="หมวดหมู่ที่ดันขึ้นหน้าแรก">
                <NativeSelect
                  value={str(homepage, "featured_category_id")}
                  onChange={(e) => setHomepage((s) => ({ ...s, featured_category_id: e.target.value ? Number(e.target.value) : null }))}
                  disabled={busy}
                  className="w-full"
                >
                  <NativeSelectOption value="">ไม่ระบุ</NativeSelectOption>
                  {refs.categories.map((c) => (
                    <NativeSelectOption key={c.id} value={String(c.id)}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <ProductPicker
                label="สินค้าแนะนำ"
                selected={ids(homepage, "featured_product_ids")}
                products={refs.products}
                onChange={(next) => setHomepage((s) => ({ ...s, featured_product_ids: next }))}
                max={20}
                disabled={busy}
                hint="เรียงตามลำดับที่เลือก"
              />

              <ProductPicker
                label="สินค้าในแถบเลื่อน (showcase)"
                selected={ids(homepage, "showcase_product_ids")}
                products={refs.products}
                onChange={(next) => setHomepage((s) => ({ ...s, showcase_product_ids: next }))}
                max={50}
                disabled={busy}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">แถบเลื่อนสินค้า (Showcase)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ToggleRow
                checked={homepage.showcase_enabled !== false}
                onChange={(v) => setHomepage((s) => ({ ...s, showcase_enabled: v }))}
                title="เปิดแถบเลื่อนบนหน้าแรก"
                disabled={busy}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="หัวข้อแถบเลื่อน">
                  <Input value={str(homepage, "showcase_title")} onChange={(e) => setHomepage((s) => ({ ...s, showcase_title: e.target.value }))} disabled={busy} />
                </Field>
                <Field label="ความเร็วเลื่อน (มิลลิวินาที)" hint="500–30000">
                  <Input
                    type="number"
                    value={str(homepage, "showcase_scroll_interval")}
                    onChange={(e) => setHomepage((s) => ({ ...s, showcase_scroll_interval: Number(e.target.value) }))}
                    disabled={busy}
                  />
                </Field>
                <Field label="แสดงสูงสุด (ชิ้น)" hint="1–50">
                  <Input
                    type="number"
                    value={str(homepage, "showcase_max_items")}
                    onChange={(e) => setHomepage((s) => ({ ...s, showcase_max_items: Number(e.target.value) }))}
                    disabled={busy}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ความน่าเชื่อถือ &amp; คำถามที่พบบ่อย</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TrustItemsEditor
                items={list<TrustItem>(homepage, "trust_items")}
                onChange={(items) => setHomepage((s) => ({ ...s, trust_items: items }))}
                disabled={busy}
              />
              <FaqEditor items={list<FaqItem>(homepage, "faq_items")} onChange={(items) => setHomepage((s) => ({ ...s, faq_items: items }))} disabled={busy} />
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => saveSection("homepage")} disabled={busy}>
              บันทึกทั้งหมดของหน้านี้ (หน้าแรก)
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </TabsContent>

        {/* ── Images ───────────────────────────────────────────── */}
        <TabsContent value="images" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">สัดส่วนรูปภาพ</CardTitle>
              <CardDescription>กำหนดกรอบรูปแต่ละจุดให้เท่ากันทั้งเว็บ</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {RATIO_FIELDS.map((f) => (
                <div key={f.key} className="flex flex-col gap-2 rounded-lg border p-3">
                  <Field label={f.label}>
                    <Input
                      value={str(image, f.key)}
                      onChange={(e) => setImage((s) => ({ ...s, [f.key]: e.target.value }))}
                      disabled={busy}
                      placeholder="16/10"
                      className="font-mono text-xs"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1">
                    {RATIO_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="xs"
                        variant={str(image, f.key) === preset ? "default" : "outline"}
                        onClick={() => setImage((s) => ({ ...s, [f.key]: preset }))}
                        disabled={busy}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={image[f.fit] !== false} onCheckedChange={(c) => setImage((s) => ({ ...s, [f.fit]: Boolean(c) }))} disabled={busy} />
                    บังคับให้เต็มกรอบ (ครอปส่วนเกิน)
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => saveSection("images")} disabled={busy}>
              บันทึกทั้งหมดของหน้านี้ (รูปภาพ)
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </TabsContent>

        {/* ── SEO / footer ─────────────────────────────────────── */}
        <TabsContent value="site" className="flex flex-col gap-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>ข้อมูลที่ใช้ตอนแชร์ลิงก์และให้ Google เก็บ</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field label="URL เว็บไซต์">
                <Input value={str(site, "site_url")} onChange={(e) => setSite((s) => ({ ...s, site_url: e.target.value }))} disabled={busy} />
              </Field>
              <Field label="คำโปรยท้ายเว็บ">
                <Input value={str(site, "footer_tagline")} onChange={(e) => setSite((s) => ({ ...s, footer_tagline: e.target.value }))} disabled={busy} />
              </Field>
              <div className="md:col-span-2">
                <Field label="คำอธิบายเว็บไซต์">
                  <Textarea rows={2} value={str(site, "site_description")} onChange={(e) => setSite((s) => ({ ...s, site_description: e.target.value }))} disabled={busy} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <ImageUploadCropper
                  label="OG Image (ภาพพรีวิวเมื่อแชร์ลิงก์)"
                  value={str(site, "og_image_url")}
                  onChange={(url) => setSite((s) => ({ ...s, og_image_url: url }))}
                  aspectRatio={1.91}
                  helpText="แนะนำสัดส่วน 1.91:1 (เช่น 1200x630)"
                  disabled={busy}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ท้ายเว็บ</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <LinkListEditor
                label="ลิงก์ท้ายเว็บ"
                links={list<LinkItem>(site, "footer_links")}
                onChange={(links) => setSite((s) => ({ ...s, footer_links: links }))}
                disabled={busy}
              />
              <SocialLinksEditor links={list<SocialItem>(site, "social_links")} onChange={(links) => setSite((s) => ({ ...s, social_links: links }))} disabled={busy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อตกลงการใช้งาน</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={10} value={str(site, "tos_content")} onChange={(e) => setSite((s) => ({ ...s, tos_content: e.target.value }))} disabled={busy} />
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => saveSection("site")} disabled={busy}>
              บันทึกทั้งหมดของหน้านี้ (SEO / ท้ายเว็บ)
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </TabsContent>

        {/* ── Top-up ───────────────────────────────────────────── */}
        <TabsContent value="topup" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ช่องทางเติมเงินและบัญชีรับเงิน</CardTitle>
              <CardDescription>จัดการช่องทางการชำระเงินและหมายเลขบัญชีสำหรับรับเงิน</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Active Status Overview Banner */}
              <div className="border rounded-lg p-3 bg-muted/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-semibold text-foreground">สถานะบัญชีรับเงินที่ใช้งานอยู่:</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${topup.truemoney_phone ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    🎁 TrueMoney: {topup.truemoney_phone ? `ใช้เบอร์ ${formatPhoneNumber(topup.truemoney_phone)}` : "ยังไม่ระบุเบอร์"}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${topup.promptpay_target ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    📱 PromptPay: {topup.promptpay_target ? `ใช้หมายเลข ${formatPhoneNumber(topup.promptpay_target)}` : "ยังไม่ระบุ"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {TOPUP_METHODS.map((method) => (
                  <ToggleRow
                    key={method.key}
                    checked={topup[method.key] !== false}
                    onChange={(v) => setTopup((s) => ({ ...s, [method.key]: v }))}
                    title={method.label}
                    desc={method.desc}
                    disabled={busy}
                  />
                ))}
              </div>

              <div className="border-t pt-4 flex flex-col gap-4">
                <div className="text-sm font-semibold text-foreground">ตั้งค่าบัญชีรับเงิน (PromptPay & TrueMoney)</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="promptpay_target" className="text-xs">
                        หมายเลข PromptPay (เบอร์โทร / บัตรประชาชน / PromptPay ID)
                      </Label>
                      {topup.promptpay_target ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          ✓ ใช้งาน: {formatPhoneNumber(topup.promptpay_target)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          ยังไม่ระบุ
                        </span>
                      )}
                    </div>
                    <Input
                      id="promptpay_target"
                      placeholder="เช่น 0952501621 หรือ 1xxxxxxxxxxxx"
                      value={String(topup.promptpay_target ?? "")}
                      onChange={(e) => setTopup((s) => ({ ...s, promptpay_target: e.target.value }))}
                      disabled={busy}
                    />
                    <p className="text-[11px] text-muted-foreground">ใช้สำหรับสร้าง QR Code พร้อมเพย์รับชำระเงิน</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="promptpay_name" className="text-xs">
                        ชื่อบัญชี PromptPay (แสดงให้ลูกค้าตรวจสอบ)
                      </Label>
                      {Boolean(topup.promptpay_name) && (
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded border">
                          {String(topup.promptpay_name)}
                        </span>
                      )}
                    </div>
                    <Input
                      id="promptpay_name"
                      placeholder="เช่น พร้อมเพย์ (PromptPay) หรือชื่อ-นามสกุล"
                      value={String(topup.promptpay_name ?? "")}
                      onChange={(e) => setTopup((s) => ({ ...s, promptpay_name: e.target.value }))}
                      disabled={busy}
                    />
                    <p className="text-[11px] text-muted-foreground">ชื่อบัญชีที่จะปรากฏบนหน้าสแกน QR เพื่อให้ลูกค้าตรวจสอบ</p>
                  </div>
                </div>

                <div className="space-y-1.5 max-w-md">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="truemoney_phone" className="text-xs">
                      เบอร์โทรศัพท์รับเงิน TrueMoney Wallet (Voucher Phone)
                    </Label>
                    {topup.truemoney_phone ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        ✓ ใช้เบอร์นี้อยู่: {formatPhoneNumber(topup.truemoney_phone)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        ยังไม่ระบุเบอร์
                      </span>
                    )}
                  </div>
                  <Input
                    id="truemoney_phone"
                    placeholder="เช่น 0952501621"
                    value={String(topup.truemoney_phone ?? "")}
                    onChange={(e) => setTopup((s) => ({ ...s, truemoney_phone: e.target.value }))}
                    disabled={busy}
                  />
                  <p className="text-[11px] text-muted-foreground">เบอร์ TrueMoney Wallet ที่ระบบจะใช้ดึงเงินจากซองของขวัญอัตโนมัติ</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={() => saveSection("topup")} disabled={busy}>
              บันทึกทั้งหมดของหน้านี้ (ระบบเติมเงิน)
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy}>
              บันทึกทั้งหมด
            </Button>
          </div>
        </TabsContent>

        {/* ── Auto-assign (its own endpoint, so its own save) ──── */}
        <TabsContent value="ops" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">มอบหมายงานอัตโนมัติ</CardTitle>
              <CardDescription>ให้ระบบจ่ายงานฟาร์มที่เข้ามาใหม่ให้ทีมงานเองโดยไม่ต้องกดมอบหมาย</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ToggleRow
                checked={autoAssign.enabled}
                onChange={(v) => setAutoAssign((c) => ({ ...c, enabled: v }))}
                title="เปิดการมอบหมายงานอัตโนมัติ"
                disabled={busy}
              />
              <Field label="สิทธิ์ที่ให้รับงานอัตโนมัติ">
                <div className="flex flex-wrap gap-1.5">
                  {ASSIGNABLE_ROLES.map((role) => {
                    const on = autoAssign.roles.includes(role);
                    return (
                      <Button
                        key={role}
                        type="button"
                        size="xs"
                        variant={on ? "default" : "outline"}
                        disabled={busy || !autoAssign.enabled}
                        onClick={() =>
                          setAutoAssign((c) => ({
                            ...c,
                            roles: on ? c.roles.filter((r) => r !== role) : [...c.roles, role],
                          }))
                        }
                      >
                        {role}
                      </Button>
                    );
                  })}
                </div>
              </Field>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveAutoAssign} disabled={busy}>
                  บันทึกทั้งหมดของหน้านี้ (มอบหมายงาน)
                </Button>
                <Button variant="outline" size="sm" onClick={save} disabled={busy}>
                  บันทึกทั้งหมด
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-3">
        <span className="text-muted-foreground text-xs">แท็บ &quot;มอบหมายงาน&quot; มีปุ่มบันทึกของตัวเอง</span>
        <Button onClick={save} disabled={busy}>
          บันทึกการตั้งค่าทั้งหมด
        </Button>
      </div>
    </div>
  );
}
