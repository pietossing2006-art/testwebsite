export type OrderItemRow = {
  id: number;
  ref: string | null;
  status: string;
  total_points: number;
  created_at: string;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  order_item_id: number;
  qty: number;
  unit_price_points: number;
  product_option: string | null;
  product_id: number;
  product_name: string;
  product_image_url: string | null;
  fulfillment_type: string;
  category_name: string | null;
  delivery_id: number | null;
  delivery_status: string | null;
  claimed_at: string | null;
  farm_request_id: number | null;
  farm_status: string | null;
  assigned_staff_name: string | null;
};

export type GroupedOrder = {
  id: number;
  ref: string | null;
  status: string;
  total_points: number;
  created_at: string;
  user_email: string;
  user_display_name: string | null;
  fulfillment_type: string;
  productNames: string[];
  itemCount: number;
  deliveries: { status: string | null; farm_status: string | null; assigned_staff_name: string | null }[];
  stage: string;
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending_fulfillment: "รอเตรียมสินค้า",
  pending_claim: "รอลูกค้ารับ",
  claimed: "รับแล้ว",
  cancelled: "ยกเลิก",
};

export const FARM_STATUS_LABEL: Record<string, string> = {
  pending: "รอมอบหมาย",
  in_progress: "กำลังดำเนินการ",
  fulfilled: "งานเสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export const FULFILLMENT_TYPE_LABEL: Record<string, string> = {
  digital: "ดิจิทัล",
  digital_stock: "ดิจิทัล",
  farm_form: "งานบริการ",
  mystery_box: "กล่องสุ่ม",
};

export const STAGE_META: Record<string, { label: string; detail: string; progress: number; danger?: boolean }> = {
  cancelled: { label: "ยกเลิก", detail: "ออเดอร์หรือรายการถูกยกเลิก", progress: 100 },
  needs_assign: { label: "ต้องมอบหมาย", detail: "งานบริการยังไม่มีคนรับผิดชอบ", progress: 30, danger: true },
  in_progress: { label: "กำลังทำงาน", detail: "ทีมกำลังดำเนินการรายการนี้", progress: 60 },
  preparing: { label: "เตรียมสินค้า", detail: "ระบบกำลังเตรียมของให้ลูกค้า", progress: 40 },
  ready: { label: "รอลูกค้ารับ", detail: "สินค้าเข้ากล่องรับของแล้ว", progress: 80 },
  claimed: { label: "รับแล้ว", detail: "ลูกค้ากดรับสินค้าแล้ว", progress: 100 },
  completed: { label: "เสร็จสิ้น", detail: "ออเดอร์เสร็จสมบูรณ์", progress: 100 },
  pending: { label: "รอดำเนินการ", detail: "กำลังรอขั้นตอนถัดไป", progress: 20 },
};

/** Same stage rules as the old AdminV3 OrdersModule.computeStage. */
export function computeStage(order: { status: string; deliveries: { status: string | null; farm_status: string | null; assigned_staff_name: string | null }[] }) {
  if (order.status === "cancelled") return "cancelled";
  const deliveries = order.deliveries;
  if (deliveries.some((d) => d.status === "cancelled" || d.farm_status === "cancelled")) return "cancelled";
  if (deliveries.some((d) => d.farm_status === "in_progress")) return "in_progress";
  if (deliveries.some((d) => d.farm_status === "pending" && !d.assigned_staff_name)) return "needs_assign";
  if (deliveries.some((d) => d.status === "pending_fulfillment")) return "preparing";
  if (deliveries.some((d) => d.status === "pending_claim")) return "ready";
  if (deliveries.length > 0 && deliveries.every((d) => d.status === "claimed")) return "claimed";
  if (order.status === "completed") return "completed";
  return "pending";
}

/** Collapses the flat order-item rows the API returns into one row per order. */
export function groupOrders(items: OrderItemRow[]): GroupedOrder[] {
  const map = new Map<number, GroupedOrder & { _productKeys: Set<string>; _deliveryKeys: Set<string> }>();

  for (const row of items) {
    let order = map.get(row.id);
    if (!order) {
      order = {
        id: row.id,
        ref: row.ref,
        status: row.status,
        total_points: row.total_points,
        created_at: row.created_at,
        user_email: row.user_email,
        user_display_name: row.user_display_name,
        fulfillment_type: row.fulfillment_type,
        productNames: [],
        itemCount: 0,
        deliveries: [],
        stage: "pending",
        _productKeys: new Set(),
        _deliveryKeys: new Set(),
      };
      map.set(row.id, order);
    }

    const productKey = `${row.order_item_id}:${row.product_name}`;
    if (!order._productKeys.has(productKey)) {
      order._productKeys.add(productKey);
      order.productNames.push(row.product_name);
      order.itemCount += Number(row.qty) || 1;
    }

    const deliveryKey = `${row.delivery_id ?? "none"}:${row.farm_request_id ?? "none"}`;
    if (row.delivery_id !== null && !order._deliveryKeys.has(deliveryKey)) {
      order._deliveryKeys.add(deliveryKey);
      order.deliveries.push({
        status: row.delivery_status,
        farm_status: row.farm_status,
        assigned_staff_name: row.assigned_staff_name,
      });
    }
  }

  return [...map.values()].map(({ _productKeys, _deliveryKeys, ...order }) => ({
    ...order,
    stage: computeStage(order),
  }));
}

export function getOptionLabel(option: unknown): string {
  if (!option) return "";
  if (typeof option === "object") {
    const o = option as { label?: string; name?: string; id?: string };
    return o.label || o.name || o.id || "";
  }
  try {
    const parsed = JSON.parse(String(option));
    return parsed?.label || parsed?.name || parsed?.id || "";
  } catch {
    return String(option);
  }
}
