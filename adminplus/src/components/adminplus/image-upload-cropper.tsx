"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Crop, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; width: number; height: number };
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";
export type CropSelection = { box: Rect; bounds: Rect; img: HTMLImageElement | null };
export type BatchItem = { src: string; name: string };

const MIN_SIZE = 32;
const STAGE_HEIGHT = 380;
/** Exported crop width, matching AdminV3's cropper. */
const EXPORT_WIDTH = 1280;

const ASPECT_PRESETS = [
  { label: "16:10", value: 16 / 10, hint: "สินค้า / ปก" },
  { label: "4:3", value: 4 / 3, hint: "ปกเกม" },
  { label: "1:1", value: 1, hint: "จัตุรัส / โลโก้" },
  { label: "16:9", value: 16 / 9, hint: "แบนเนอร์" },
  { label: "อิสระ", value: 0, hint: "ปรับเองอิสระ" },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Resizes the crop box for one handle drag. With a locked ratio the corner/edge
 * opposite the handle stays put and the box is capped so it can never leave the image.
 */
function resizeBox(handle: Exclude<Handle, "move">, start: Rect, dx: number, dy: number, ratio: number, bounds: Rect): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (west) left = start.x + dx;
  if (east) right = start.x + start.width + dx;
  if (north) top = start.y + dy;
  if (south) bottom = start.y + start.height + dy;

  const boundsRight = bounds.x + bounds.width;
  const boundsBottom = bounds.y + bounds.height;

  left = clamp(left, bounds.x, right - MIN_SIZE);
  top = clamp(top, bounds.y, bottom - MIN_SIZE);
  right = clamp(right, left + MIN_SIZE, boundsRight);
  bottom = clamp(bottom, top + MIN_SIZE, boundsBottom);

  if (ratio <= 0) {
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Anchor the untouched edges, then size the box to the ratio within what's left.
  const anchorX = west ? right : left;
  const anchorY = north ? bottom : top;
  const maxWidth = west ? anchorX - bounds.x : boundsRight - anchorX;
  const maxHeight = north ? anchorY - bounds.y : boundsBottom - anchorY;

  let width = east || west ? right - left : (bottom - top) * ratio;
  width = Math.min(width, maxWidth, maxHeight * ratio);
  width = Math.max(width, MIN_SIZE);
  const height = width / ratio;

  return {
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    width,
    height,
  };
}

/**
 * Renders the selected region to a canvas at EXPORT_WIDTH and returns a JPEG data URL.
 * Throws when the source image tainted the canvas (external URL without CORS headers).
 */
function cropToDataUrl(selection: CropSelection | null, fallbackRatio: number): string | null {
  if (!selection?.img || selection.bounds.width <= 0) return null;
  const { box, bounds, img } = selection;

  const scaleX = img.naturalWidth / bounds.width;
  const scaleY = img.naturalHeight / bounds.height;
  const sx = Math.max(0, Math.round((box.x - bounds.x) * scaleX));
  const sy = Math.max(0, Math.round((box.y - bounds.y) * scaleY));
  const sw = Math.min(img.naturalWidth - sx, Math.round(box.width * scaleX));
  const sh = Math.min(img.naturalHeight - sy, Math.round(box.height * scaleY));

  const boxRatio = box.width > 0 && box.height > 0 ? box.width / box.height : fallbackRatio || 16 / 10;
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.round(EXPORT_WIDTH / boxRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถสร้าง canvas ได้");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  try {
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    throw new Error("ตัดภาพจากลิงก์ภายนอกที่ติด CORS ไม่ได้ กรุณาอัปโหลดไฟล์จากเครื่องแทน");
  }
}

/** Uploads a cropped data URL and returns the stored path. */
async function uploadDataUrl(dataUrl: string): Promise<string> {
  const res = await adminApi.post<{ ok: boolean; url: string }>("/media/upload", { image_data: dataUrl });
  if (!res.url) throw new Error("อัปโหลดภาพไม่สำเร็จ");
  return res.url;
}

function AspectPresetRow({ ratio, onChange, disabled }: { ratio: number; onChange: (r: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-muted-foreground text-xs">สัดส่วนกรอบ:</span>
      {ASPECT_PRESETS.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          size="xs"
          variant={ratio === preset.value ? "default" : "outline"}
          onClick={() => onChange(preset.value)}
          title={preset.hint}
          disabled={disabled}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}

function CropStage({
  imageSrc,
  ratio,
  onChange,
}: {
  imageSrc: string;
  ratio: number;
  onChange: (payload: CropSelection) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const boundsRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  const [bounds, setBounds] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [box, setBox] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);

  const commit = useCallback(
    (next: Rect) => {
      boxRef.current = next;
      setBox(next);
      onChange({ box: next, bounds: boundsRef.current, img: imgRef.current });
    },
    [onChange],
  );

  /** Centres a fresh crop box of the requested ratio inside the image. */
  const centreBox = useCallback(
    (nextRatio: number, area: Rect) => {
      if (area.width <= 0 || area.height <= 0) return;
      let width = area.width * 0.92;
      let height = area.height * 0.92;
      if (nextRatio > 0) {
        if (area.width / area.height > nextRatio) {
          height = area.height * 0.92;
          width = height * nextRatio;
        } else {
          width = area.width * 0.92;
          height = width / nextRatio;
        }
      }
      commit({
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width: Math.round(width),
        height: Math.round(height),
      });
    },
    [commit],
  );

  const measure = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img || !stage || !img.naturalWidth) return;

    const stageRect = stage.getBoundingClientRect();
    const maxW = Math.max(100, stageRect.width - 32);
    const maxH = Math.max(100, STAGE_HEIGHT - 32);
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const width = Math.max(40, Math.round(img.naturalWidth * scale));
    const height = Math.max(40, Math.round(img.naturalHeight * scale));

    const area: Rect = {
      x: Math.round((stageRect.width - width) / 2),
      y: Math.round((STAGE_HEIGHT - height) / 2),
      width,
      height,
    };
    boundsRef.current = area;
    setBounds(area);
    centreBox(ratio, area);
  }, [centreBox, ratio]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Re-centre whenever the operator picks a different aspect preset.
  useEffect(() => {
    if (boundsRef.current.width > 0) centreBox(ratio, boundsRef.current);
  }, [ratio, centreBox]);

  function startDrag(event: React.PointerEvent, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);

    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...boxRef.current };
    const area = boundsRef.current;

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (handle === "move") {
        commit({
          ...start,
          x: clamp(start.x + dx, area.x, area.x + area.width - start.width),
          y: clamp(start.y + dy, area.y, area.y + area.height - start.height),
        });
        return;
      }
      commit(resizeBox(handle, start, dx, dy, ratio, area));
    };

    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const handles: { id: Exclude<Handle, "move">; className: string; cursor: string }[] = [
    { id: "nw", className: "-top-1.5 -left-1.5", cursor: "nwse-resize" },
    { id: "n", className: "-top-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
    { id: "ne", className: "-top-1.5 -right-1.5", cursor: "nesw-resize" },
    { id: "e", className: "top-1/2 -right-1.5 -translate-y-1/2", cursor: "ew-resize" },
    { id: "se", className: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
    { id: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
    { id: "sw", className: "-bottom-1.5 -left-1.5", cursor: "nesw-resize" },
    { id: "w", className: "top-1/2 -left-1.5 -translate-y-1/2", cursor: "ew-resize" },
  ];

  return (
    <div
      ref={stageRef}
      className="relative w-full select-none overflow-hidden rounded-lg bg-neutral-900"
      style={{ height: STAGE_HEIGHT }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="ภาพที่กำลังตัด"
        onLoad={measure}
        crossOrigin="anonymous"
        className="pointer-events-none absolute select-none"
        style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      />

      {bounds.width > 0 && (
        <>
          {/* dim everything outside the crop box */}
          <div className="pointer-events-none absolute inset-0 bg-black/55" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${box.x}px ${box.y}px, ${box.x}px ${box.y + box.height}px, ${box.x + box.width}px ${box.y + box.height}px, ${box.x + box.width}px ${box.y}px, ${box.x}px ${box.y}px)` }} />

          <div
            className={cn("absolute border-2 border-white/90", dragging && "border-primary")}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height, cursor: "move" }}
            onPointerDown={(e) => startDrag(e, "move")}
          >
            {/* rule-of-thirds guides */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border-white/25 [&:not(:nth-child(3n))]:border-r [&:nth-child(-n+6)]:border-b" />
              ))}
            </div>

            {handles.map((handle) => (
              <span
                key={handle.id}
                onPointerDown={(e) => startDrag(e, handle.id)}
                style={{ cursor: handle.cursor }}
                className={cn("absolute size-3 rounded-full border-2 border-primary bg-white shadow", handle.className)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CropDialog({
  imageSrc,
  initialRatio = 16 / 10,
  open,
  onOpenChange,
  onCropped,
}: {
  imageSrc: string;
  initialRatio?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (url: string) => void;
}) {
  const [ratio, setRatio] = useState(initialRatio);
  const [uploading, setUploading] = useState(false);
  const cropRef = useRef<CropSelection | null>(null);

  useEffect(() => {
    if (open) setRatio(initialRatio);
  }, [open, initialRatio]);

  async function performCrop() {
    setUploading(true);
    try {
      const dataUrl = cropToDataUrl(cropRef.current, ratio);
      if (!dataUrl) {
        toast.error("กรุณารอโหลดรูปภาพให้เสร็จสมบูรณ์");
        return;
      }
      onCropped(await uploadDataUrl(dataUrl));
      onOpenChange(false);
      toast.success("บันทึกรูปภาพเรียบร้อย");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Crop className="size-4" /> ปรับแต่งและตัดรูปภาพ
          </DialogTitle>
          <DialogDescription>ลากกรอบเพื่อย้าย หรือลากจุดกลมตามมุม/ขอบเพื่อปรับขนาด</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-5 py-4">
          <AspectPresetRow ratio={ratio} onChange={setRatio} disabled={uploading} />

          {imageSrc && <CropStage imageSrc={imageSrc} ratio={ratio} onChange={(payload) => (cropRef.current = payload)} />}

          <p className="text-muted-foreground text-xs">ความละเอียดส่งออก: {EXPORT_WIDTH}px (คุณภาพสูง)</p>
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            ยกเลิก
          </Button>
          <Button size="sm" onClick={performCrop} disabled={uploading}>
            {uploading ? "กำลังบันทึก…" : "ยืนยันและใช้ภาพนี้"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Crops a whole batch of picked files one at a time, then uploads them together.
 * Each image's crop is remembered as you step through, so you can go back and redo one.
 */
export function BatchCropDialog({
  items,
  initialRatio = 16 / 10,
  open,
  onOpenChange,
  onComplete,
}: {
  items: BatchItem[];
  initialRatio?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (urls: string[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [ratio, setRatio] = useState(initialRatio);
  const [cropped, setCropped] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const cropRef = useRef<CropSelection | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setCropped({});
      setRatio(initialRatio);
      setProgress("");
    }
  }, [open, initialRatio]);

  const current = items[index];
  const isLast = index >= items.length - 1;

  /** Remembers the current crop (falling back to the untouched image) and moves on. */
  function captureCurrent(): Record<number, string> {
    let dataUrl: string | null = null;
    try {
      dataUrl = cropToDataUrl(cropRef.current, ratio);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ตัดภาพไม่สำเร็จ");
    }
    const next = { ...cropped, [index]: dataUrl ?? current?.src ?? "" };
    setCropped(next);
    return next;
  }

  function goNext() {
    captureCurrent();
    setIndex((i) => Math.min(items.length - 1, i + 1));
  }

  function goPrev() {
    captureCurrent();
    setIndex((i) => Math.max(0, i - 1));
  }

  async function uploadAll() {
    const map = captureCurrent();
    setUploading(true);
    const urls: string[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        setProgress(`กำลังอัปโหลด ${i + 1}/${items.length}…`);
        const dataUrl = map[i] ?? items[i].src;
        urls.push(await uploadDataUrl(dataUrl));
      }
      onComplete(urls);
      onOpenChange(false);
      toast.success(`อัปโหลด ${urls.length} รูปเรียบร้อย`);
    } catch (err) {
      // Keep whatever already uploaded so the operator doesn't lose the whole batch.
      if (urls.length > 0) onComplete(urls);
      toast.error(err instanceof Error && err.message ? err.message : getErrorMessage(err));
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Crop className="size-4" /> ตัดรูปภาพหลายรูป ({index + 1}/{items.length})
          </DialogTitle>
          <DialogDescription className="truncate">{current?.name ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-5 py-4">
          <AspectPresetRow ratio={ratio} onChange={setRatio} disabled={uploading} />

          {current && <CropStage key={index} imageSrc={current.src} ratio={ratio} onChange={(p) => (cropRef.current = p)} />}

          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <button
                key={`${item.name}-${i}`}
                type="button"
                onClick={() => {
                  captureCurrent();
                  setIndex(i);
                }}
                disabled={uploading}
                className={cn(
                  "size-10 overflow-hidden rounded border-2",
                  i === index ? "border-primary" : cropped[i] ? "border-emerald-500" : "border-transparent opacity-60",
                )}
                title={item.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cropped[i] || item.src} alt={item.name} className="size-full object-cover" />
              </button>
            ))}
          </div>

          {progress && <p className="text-muted-foreground text-xs">{progress}</p>}
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            ยกเลิก
          </Button>
          <Button size="sm" variant="outline" onClick={goPrev} disabled={uploading || index === 0}>
            ก่อนหน้า
          </Button>
          {!isLast && (
            <Button size="sm" variant="outline" onClick={goNext} disabled={uploading}>
              ถัดไป
            </Button>
          )}
          <Button size="sm" onClick={uploadAll} disabled={uploading}>
            {uploading ? "กำลังอัปโหลด…" : `อัปโหลดทั้งหมด (${items.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * URL field + upload + crop, the Admin+ port of AdminV3's ImageUploadCropper.
 * Uploads land on the splitwise server via /api/admin/media/upload.
 */
export function ImageUploadCropper({
  value,
  onChange,
  label = "รูปภาพ",
  aspectRatio = 16 / 10,
  helpText,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspectRatio?: number;
  helpText?: string;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WebP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  /** Existing images are re-fetched server-side so the canvas isn't CORS-tainted. */
  async function cropExisting() {
    if (!value) return;
    if (value.startsWith("data:image/")) {
      setCropSrc(value);
      return;
    }
    setLoadingRemote(true);
    try {
      const res = await adminApi.post<{ ok: boolean; data_url?: string }>("/media/fetch-remote", { url: value });
      setCropSrc(res.data_url || value);
    } catch {
      setCropSrc(value);
    } finally {
      setLoadingRemote(false);
    }
  }

  return (
    <div>
      {label && <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">{label}</Label>}

      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… หรืออัปโหลดไฟล์" disabled={disabled} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled} title="อัปโหลดภาพจากเครื่อง">
          <Upload /> อัปโหลด
        </Button>
        {value && (
          <Button type="button" variant="outline" size="sm" onClick={cropExisting} disabled={disabled || loadingRemote} title="ตัดแต่งรูปภาพ">
            <Crop /> {loadingRemote ? "กำลังโหลด…" : "Crop"}
          </Button>
        )}
      </div>

      {helpText && <p className="mt-1 text-muted-foreground text-xs">{helpText}</p>}

      {value && (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="ตัวอย่าง" className="h-12 w-20 rounded border object-cover" />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="xs" onClick={cropExisting} disabled={disabled}>
              <Crop /> ตัดขอบอีกครั้ง
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange("")} disabled={disabled}>
              <Trash2 /> ลบรูป
            </Button>
          </div>
        </div>
      )}

      <CropDialog
        imageSrc={cropSrc ?? ""}
        initialRatio={aspectRatio}
        open={cropSrc !== null}
        onOpenChange={(open) => !open && setCropSrc(null)}
        onCropped={onChange}
      />
    </div>
  );
}
