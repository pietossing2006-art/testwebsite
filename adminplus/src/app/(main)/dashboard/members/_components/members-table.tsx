"use client";

import { useState } from "react";

import { Coins } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/adminplus/format";
import { getInitials } from "@/lib/utils";

import { canAdjustPoints, type ManagementUser } from "./types";
import { UserDetailDialog } from "./user-detail-dialog";

type MemberRow = Pick<
  ManagementUser,
  "id" | "email" | "username" | "role" | "is_banned" | "display_name" | "avatar_url" | "created_at" | "balance" | "orders_count"
>;

export function MembersTable({ items, viewerRole }: { items: MemberRow[]; viewerRole: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ userId: number | null; open: boolean; tab: string }>({
    userId: null,
    open: false,
    tab: "profile",
  });
  const canFinance = canAdjustPoints(viewerRole);

  function openDetail(userId: number, tab = "profile") {
    setSheet({ userId, open: true, tab });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No members match this filter.
              </TableCell>
            </TableRow>
          )}
          {items.map((member) => {
            const name = member.display_name || member.username || member.email;
            return (
              <TableRow key={member.id} className="cursor-pointer" onClick={() => openDetail(member.id)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage src={member.avatar_url ?? undefined} alt={name} />
                      <AvatarFallback>{getInitials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{name}</div>
                      <div className="truncate text-muted-foreground text-xs">{member.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="capitalize">{member.role}</TableCell>
                <TableCell>
                  <Badge variant={member.is_banned ? "destructive" : "secondary"}>{member.is_banned ? "Banned" : "Active"}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1">
                    {formatNumber(member.balance)}
                    {canFinance && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="ปรับแต้มให้ผู้ใช้คนนี้"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(member.id, "points");
                        }}
                      >
                        <Coins />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{member.orders_count}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{new Date(member.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <UserDetailDialog
        userId={sheet.userId}
        open={sheet.open}
        initialTab={sheet.tab}
        onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
        viewerRole={viewerRole}
        onMutated={() => router.refresh()}
      />
    </>
  );
}
