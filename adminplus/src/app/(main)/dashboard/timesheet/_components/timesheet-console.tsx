"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage, staffApi } from "@/lib/adminplus/api-client";
import { formatDateTime } from "@/lib/adminplus/format";

export type ClockSession = {
  id: number;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number | null;
  auto_clock_out_at: string | null;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
};

const DURATION_OPTIONS = [
  { minutes: 0, label: "ไม่กำหนด" },
  { minutes: 60, label: "1 ชม." },
  { minutes: 240, label: "4 ชม." },
  { minutes: 480, label: "8 ชม." },
];

function formatDuration(seconds: number | null) {
  const s = Number(seconds) || 0;
  if (s <= 0) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} ชม. ${m} น.` : `${m} นาที`;
}

export function TimesheetConsole({
  clockedIn,
  clockIn,
  autoClockOutAt,
  mySessions,
  allSessions,
}: {
  clockedIn: boolean;
  clockIn: string | null;
  autoClockOutAt: string | null;
  mySessions: ClockSession[];
  allSessions: ClockSession[] | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(0);

  async function doClockIn() {
    setBusy(true);
    try {
      await staffApi.post("/clock-in", duration ? { duration_minutes: duration } : {});
      toast.success("ลงเวลาเข้างานเรียบร้อย");
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function doClockOut() {
    setBusy(true);
    try {
      await staffApi.post("/clock-out");
      toast.success("ลงเวลาออกงานเรียบร้อย");
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={clockedIn ? "secondary" : "outline"}>{clockedIn ? "กำลังทำงาน" : "ยังไม่เข้างาน"}</Badge>
              {clockedIn && clockIn && <span className="text-muted-foreground text-sm">เข้างานเมื่อ {formatDateTime(clockIn)}</span>}
            </div>
            {clockedIn && autoClockOutAt && (
              <p className="mt-1 text-muted-foreground text-xs">ระบบจะออกงานอัตโนมัติเวลา {formatDateTime(autoClockOutAt)}</p>
            )}
          </div>

          {!clockedIn && (
            <div className="flex flex-wrap items-center gap-1.5">
              {DURATION_OPTIONS.map((o) => (
                <Button
                  key={o.minutes}
                  variant={duration === o.minutes ? "default" : "outline"}
                  size="xs"
                  onClick={() => setDuration(o.minutes)}
                  disabled={busy}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          )}

          {clockedIn ? (
            <Button variant="destructive" onClick={doClockOut} disabled={busy}>
              ลงเวลาออกงาน
            </Button>
          ) : (
            <Button onClick={doClockIn} disabled={busy}>
              ลงเวลาเข้างาน
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-base">รอบงานของฉัน ({mySessions.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SessionTable sessions={mySessions} />
        </CardContent>
      </Card>

      {allSessions && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">รอบงานทีมงานทั้งหมด ({allSessions.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <SessionTable sessions={allSessions} showStaff />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SessionTable({ sessions, showStaff }: { sessions: ClockSession[]; showStaff?: boolean }) {
  return (
    <div className="max-h-96 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showStaff && <TableHead>ทีมงาน</TableHead>}
            <TableHead>เข้างาน</TableHead>
            <TableHead>ออกงาน</TableHead>
            <TableHead>รวมเวลา</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 && (
            <TableRow>
              <TableCell colSpan={showStaff ? 4 : 3} className="py-8 text-center text-muted-foreground">
                ยังไม่มีรอบงาน
              </TableCell>
            </TableRow>
          )}
          {sessions.map((s) => (
            <TableRow key={s.id}>
              {showStaff && (
                <TableCell>
                  <div className="text-sm">{s.display_name || s.email}</div>
                  <div className="text-muted-foreground text-xs capitalize">{s.role}</div>
                </TableCell>
              )}
              <TableCell className="text-xs">{formatDateTime(s.clock_in)}</TableCell>
              <TableCell className="text-xs">{s.clock_out ? formatDateTime(s.clock_out) : <Badge variant="secondary">กำลังทำงาน</Badge>}</TableCell>
              <TableCell className="text-xs">{formatDuration(s.duration_seconds)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
