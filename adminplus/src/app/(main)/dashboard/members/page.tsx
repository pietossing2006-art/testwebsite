import { cookies } from "next/headers";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SESSION_COOKIE, SPLITWISE_API_BASE } from "@/lib/adminplus/config";
import { getCurrentAdminUser } from "@/server/auth-actions";

import { MembersTable } from "./_components/members-table";
import type { ManagementUser } from "./_components/types";

type MembersResponse = {
  ok: boolean;
  items: ManagementUser[];
  total: number;
  summary: {
    total: number;
    active: number;
    banned: number;
    admins: number;
    total_balance: number;
  } | null;
};

const PAGE_SIZE = 20;
const ROLE_OPTIONS = ["all", "owner", "admin", "finance", "booster", "support", "user"];
const STATUS_OPTIONS = ["all", "active", "banned"];

async function fetchMembers(
  token: string,
  params: { search: string; role: string; status: string; page: number },
): Promise<MembersResponse> {
  const offset = (params.page - 1) * PAGE_SIZE;
  const url = new URL("/api/admin/users", SPLITWISE_API_BASE);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.role !== "all") url.searchParams.set("role", params.role);
  if (params.status !== "all") url.searchParams.set("status", params.status);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `request_failed_${res.status}`);
  }
  return data as MembersResponse;
}

function buildQuery(next: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value === "" || value === "all" || value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const viewer = await getCurrentAdminUser();

  const search = sp.search ?? "";
  const role = sp.role ?? "all";
  const status = sp.status ?? "all";
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  if (!token) {
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground text-sm">กรุณาเข้าสู่ระบบก่อนเข้าถึงหน้านี้</CardContent>
      </Card>
    );
  }

  let data: MembersResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await fetchMembers(token, { search, role, status, page });
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "unknown_error";
  }

  if (errorMessage || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Live data from splitwise server/ (/api/admin/users)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">โหลดข้อมูลผู้ใช้ไม่สำเร็จ: {errorMessage}</p>
          <p className="mt-2 text-muted-foreground text-xs">
            ตรวจสอบว่า splitwise server รันอยู่ที่ {SPLITWISE_API_BASE} และบัญชีที่ล็อกอินมีสิทธิ์ staff ขึ้นไป
          </p>
        </CardContent>
      </Card>
    );
  }

  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {data.summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total members</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.summary.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.summary.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Banned</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.summary.banned}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Staff (admin/owner)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.summary.admins}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Members</CardTitle>
          <CardDescription>Live data from splitwise server/ (/api/admin/users) — {data.total} total</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0 pt-4">
          <form className="flex flex-wrap items-center gap-2 px-4" method="GET">
            <Input name="search" defaultValue={search} placeholder="Search by email, username, id…" className="h-8 w-full sm:w-64" />
            <NativeSelect name="role" defaultValue={role} size="sm" className="capitalize">
              {ROLE_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option} className="capitalize">
                  {option === "all" ? "All roles" : option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={status} size="sm" className="capitalize">
              {STATUS_OPTIONS.map((option) => (
                <NativeSelectOption key={option} value={option} className="capitalize">
                  {option === "all" ? "All statuses" : option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm">
              Filter
            </Button>
            {(search || role !== "all" || status !== "all") && (
              <Button asChild variant="ghost" size="sm">
                <a href="/dashboard/members">Clear</a>
              </Button>
            )}
          </form>

          <div className="overflow-x-auto">
            <MembersTable items={data.items} viewerRole={viewer?.role ?? "user"} />
          </div>

          <div className="flex items-center justify-between px-4">
            <div className="text-muted-foreground text-xs">
              Page {page} of {pageCount}
            </div>
            <div className="flex gap-2">
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href={`/dashboard/members${buildQuery({ search, role, status, page: page - 1 })}`}>Previous</a>
                </Button>
              )}
              {page >= pageCount ? (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href={`/dashboard/members${buildQuery({ search, role, status, page: page + 1 })}`}>Next</a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
