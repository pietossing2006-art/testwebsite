import {
  Archive,
  Bell,
  BookText,
  ChartLine,
  ClipboardList,
  Clock,
  Gauge,
  Gift,
  Mail,
  MessageSquareText,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
  Tag,
  Truck,
  Users,
  Workflow,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/**
 * Mirrors MODULES / MODULE_SECTIONS from the old admin panel
 * (client/src/pages/AdminV3/helpers.js) so the same modules live in the same
 * sections, with Admin+'s design instead of AdminLTE's.
 */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "หลัก",
    items: [
      { id: "dashboard", title: "แดชบอร์ด", url: "/dashboard/default", icon: Gauge },
      { id: "members", title: "ผู้ใช้", url: "/dashboard/members", icon: Users },
    ],
  },
  {
    id: 2,
    label: "ปฏิบัติการ",
    items: [
      { id: "support", title: "ซัพพอร์ต", url: "/dashboard/support", icon: MessageSquareText },
      { id: "catalog", title: "แค็ตตาล็อก", url: "/dashboard/catalog", icon: Package },
      { id: "stock", title: "สต็อก", url: "/dashboard/stock", icon: Archive },
      { id: "fulfillment", title: "บริการงานจ้าง", url: "/dashboard/fulfillment", icon: Truck },
      { id: "orders", title: "ติดตาม Orders", url: "/dashboard/orders", icon: ClipboardList },
      { id: "timesheet", title: "ลงเวลางาน", url: "/dashboard/timesheet", icon: Clock },
      { id: "automation", title: "อัตโนมัติ", url: "/dashboard/automation", icon: Workflow },
    ],
  },
  {
    id: 3,
    label: "ธุรกิจ",
    items: [
      { id: "bundles", title: "Bundle", url: "/dashboard/bundles", icon: Gift },
      { id: "promotions", title: "โปรโมชัน", url: "/dashboard/promotions", icon: Tag },
      { id: "growth", title: "Growth", url: "/dashboard/growth", icon: ChartLine },
      { id: "announcements", title: "ประกาศ", url: "/dashboard/announcements", icon: Bell },
      { id: "messages", title: "ข้อความ", url: "/dashboard/messages", icon: Mail },
    ],
  },
  {
    id: 4,
    label: "ระบบ",
    items: [
      { id: "logs", title: "บันทึกการใช้งาน", url: "/dashboard/logs", icon: BookText },
      { id: "settings", title: "ตั้งค่า", url: "/dashboard/settings", icon: SlidersHorizontal },
    ],
  },
  {
    id: 5,
    label: "Owner Only",
    items: [{ id: "owner", title: "Owner Panel", url: "/dashboard/owner", icon: ShieldCheck }],
  },
];
