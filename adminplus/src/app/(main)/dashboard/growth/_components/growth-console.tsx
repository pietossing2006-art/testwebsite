"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { formatDateTime, formatNumber } from "@/lib/adminplus/format";

export type Campaign = {
  id: number;
  kind: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  discount_type: string | null;
  discount_value: number | null;
  quantity_limit: number | null;
  vip_early_access_tier: string | null;
  targets?: { target_type: string; target_id: number; sort_order?: number }[];
};

export type Review = {
  id: number;
  product_id: number;
  product_name: string | null;
  rating: number;
  comment: string | null;
  reviewer_name: string | null;
  user_email: string | null;
  status: string;
  created_at?: string;
};

export type VipTier = {
  id: number;
  code: string;
  name: string;
  threshold_points_spent: number;
  discount_percent: number | null;
  early_access_minutes: number | null;
  is_active: boolean;
};

export type WishlistSignal = {
  product_id: number;
  product_name?: string | null;
  wishlist_count?: number;
  [key: string]: unknown;
};

export type GrowthEvent = {
  id: number;
  event_type: string;
  target_type: string | null;
  target_id: number | null;
  status: string | null;
  delivered_count: number | null;
  failed_count: number | null;
  created_at: string;
};

/** Same payload the old GrowthModule sent when toggling a campaign. */
function buildCampaignToggleBody(campaign: Campaign) {
  const discountValue = campaign.discount_value == null ? null : Number(campaign.discount_value);
  const quantityLimit = campaign.quantity_limit == null ? null : Number(campaign.quantity_limit);
  return {
    kind: campaign.kind === "limited_drop" ? "limited_drop" : "flash_deal",
    title: String(campaign.title || "Campaign").trim(),
    description: String(campaign.description || "").trim(),
    badge_text: String(campaign.badge_text || "").trim(),
    is_active: !campaign.is_active,
    starts_at: campaign.starts_at || null,
    ends_at: campaign.ends_at || null,
    discount_type: ["none", "percent", "amount_points"].includes(String(campaign.discount_type)) ? campaign.discount_type : "none",
    discount_value: Number.isFinite(discountValue) ? discountValue : null,
    quantity_limit: Number.isFinite(quantityLimit) ? quantityLimit : null,
    vip_early_access_tier: campaign.vip_early_access_tier || null,
    targets: (campaign.targets ?? [])
      .map((t, index) => ({
        target_type: t.target_type === "bundle" ? "bundle" : "product",
        target_id: Number(t.target_id),
        sort_order: Number.isFinite(Number(t.sort_order)) ? Number(t.sort_order) : index,
      }))
      .filter((t) => Number.isFinite(t.target_id) && t.target_id > 0),
  };
}

export function GrowthConsole({
  initialCampaigns,
  initialReviews,
  initialTiers,
  initialSignals,
  initialEvents,
}: {
  initialCampaigns: Campaign[];
  initialReviews: Review[];
  initialTiers: VipTier[];
  initialSignals: WishlistSignal[];
  initialEvents: GrowthEvent[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [reviews, setReviews] = useState(initialReviews);
  const [tiers] = useState(initialTiers);
  const [signals] = useState(initialSignals);
  const [events] = useState(initialEvents);
  const [busy, setBusy] = useState(false);

  async function reloadCampaigns() {
    try {
      const res = await adminApi.get<{ campaigns: Campaign[] }>("/growth-campaigns");
      setCampaigns(res.campaigns ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function reloadReviews() {
    try {
      const res = await adminApi.get<{ reviews: Review[] }>("/reviews?limit=100");
      setReviews(res.reviews ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function toggleCampaign(campaign: Campaign) {
    const body = buildCampaignToggleBody(campaign);
    if (body.targets.length === 0) {
      toast.error("แคมเปญต้องมีสินค้าเป้าหมายอย่างน้อย 1 รายการก่อนเปิด/ปิด");
      return;
    }
    setBusy(true);
    try {
      await adminApi.put(`/growth-campaigns/${campaign.id}`, body);
      toast.success("อัปเดตแคมเปญเรียบร้อย");
      await reloadCampaigns();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setReviewStatus(reviewId: number, status: string) {
    setBusy(true);
    try {
      await adminApi.patch(`/reviews/${reviewId}`, { status });
      toast.success("อัปเดตรีวิวเรียบร้อย");
      await reloadReviews();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tabs defaultValue="reviews">
      <TabsList>
        <TabsTrigger value="reviews">รีวิว</TabsTrigger>
        <TabsTrigger value="campaigns">แคมเปญ</TabsTrigger>
        <TabsTrigger value="vip">VIP tiers</TabsTrigger>
        <TabsTrigger value="signals">Wishlist</TabsTrigger>
        <TabsTrigger value="events">การแจ้งเตือน</TabsTrigger>
      </TabsList>

      <TabsContent value="reviews" className="pt-4">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">
              รีวิวสินค้า ({reviews.length}) · รออนุมัติ {reviews.filter((r) => r.status === "pending").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สินค้า</TableHead>
                  <TableHead>คะแนน</TableHead>
                  <TableHead>ความเห็น</TableHead>
                  <TableHead>ผู้รีวิว</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีรีวิว
                    </TableCell>
                  </TableRow>
                )}
                {reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-40 truncate text-sm">{r.product_name ?? `#${r.product_id}`}</TableCell>
                    <TableCell className="tabular-nums">{r.rating}/5</TableCell>
                    <TableCell className="max-w-64 truncate text-xs">{r.comment}</TableCell>
                    <TableCell className="max-w-32 truncate text-xs">{r.reviewer_name || r.user_email}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "approved" ? "secondary" : r.status === "rejected" ? "destructive" : "default"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="outline" disabled={busy || r.status === "approved"} onClick={() => setReviewStatus(r.id, "approved")}>
                          อนุมัติ
                        </Button>
                        <Button size="xs" variant="outline" disabled={busy || r.status === "rejected"} onClick={() => setReviewStatus(r.id, "rejected")}>
                          ปฏิเสธ
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="campaigns" className="pt-4">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">แคมเปญ ({campaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>แคมเปญ</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>ส่วนลด</TableHead>
                  <TableHead>ช่วงเวลา</TableHead>
                  <TableHead className="text-right">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีแคมเปญ
                    </TableCell>
                  </TableRow>
                )}
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="max-w-56 truncate font-medium text-sm">{c.title}</div>
                      <div className="max-w-56 truncate text-muted-foreground text-xs">{c.description}</div>
                    </TableCell>
                    <TableCell className="text-xs">{c.kind}</TableCell>
                    <TableCell className="text-xs">
                      {c.discount_type === "percent"
                        ? `${formatNumber(c.discount_value)}%`
                        : c.discount_type === "amount_points"
                          ? `${formatNumber(c.discount_value)} พอยท์`
                          : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {c.starts_at || c.ends_at ? `${formatDateTime(c.starts_at)} → ${formatDateTime(c.ends_at)}` : "ตลอดเวลา"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="xs" variant="outline" disabled={busy} onClick={() => toggleCampaign(c)}>
                        {c.is_active ? "ปิด" : "เปิด"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vip" className="pt-4">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">VIP tiers ({tiers.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ระดับ</TableHead>
                  <TableHead className="text-right">ยอดใช้จ่ายขั้นต่ำ</TableHead>
                  <TableHead>ส่วนลด</TableHead>
                  <TableHead>Early access</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      ยังไม่มี VIP tier
                    </TableCell>
                  </TableRow>
                )}
                {tiers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="font-mono text-muted-foreground text-xs">{t.code}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(t.threshold_points_spent)}</TableCell>
                    <TableCell className="text-xs">{t.discount_percent ? `${t.discount_percent}%` : "-"}</TableCell>
                    <TableCell className="text-xs">{t.early_access_minutes ? `${t.early_access_minutes} นาที` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? "secondary" : "outline"}>{t.is_active ? "เปิด" : "ปิด"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="signals" className="pt-4">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">Wishlist signals ({signals.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สินค้า</TableHead>
                  <TableHead className="text-right">จำนวนที่อยากได้</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีข้อมูล
                    </TableCell>
                  </TableRow>
                )}
                {signals.map((s) => (
                  <TableRow key={s.product_id}>
                    <TableCell className="text-sm">{s.product_name ?? `#${s.product_id}`}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.wishlist_count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="events" className="pt-4">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">การแจ้งเตือน growth ({events.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เหตุการณ์</TableHead>
                  <TableHead>เป้าหมาย</TableHead>
                  <TableHead>ส่งสำเร็จ / ล้มเหลว</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>เวลา</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีเหตุการณ์
                    </TableCell>
                  </TableRow>
                )}
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.event_type}</TableCell>
                    <TableCell className="text-xs">{e.target_type ? `${e.target_type} #${e.target_id}` : "-"}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {e.delivered_count ?? 0} / {e.failed_count ?? 0}
                    </TableCell>
                    <TableCell className="text-xs">{e.status ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDateTime(e.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
