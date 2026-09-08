"use client";

import { useRef, useState } from "react";

import { ArrowLeft, ArrowRight, Crop, Images, Link2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { BatchCropDialog, CropDialog, type BatchItem } from "@/components/adminplus/image-upload-cropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi, getErrorMessage } from "@/lib/adminplus/api-client";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
    reader.readAsDataURL(file);
  });

/**
 * Multi-image gallery for one product — the Admin+ port of AdminV3's gallery_images
 * editor. Images can arrive three ways: picked and cropped in a batch, uploaded
 * straight through without cropping, or pasted as a URL.
 */
export function GalleryImagesEditor({
  images,
  onChange,
  aspectRatio = 16 / 10,
  disabled,
  label = "แกลเลอรีรูปภาพ (หลายรูป)",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  aspectRatio?: number;
  disabled?: boolean;
  label?: string;
}) {
  const batchInputRef = useRef<HTMLInputElement>(null);
  const directInputRef = useRef<HTMLInputElement>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [cropTarget, setCropTarget] = useState<{ src: string; index: number } | null>(null);

  /** Files picked here go through the batch cropper before upload. */
  async function pickForBatch(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    try {
      const loaded: BatchItem[] = [];
      for (const file of files) loaded.push({ src: await readAsDataUrl(file), name: file.name });
      setBatchItems(loaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อ่านไฟล์ภาพไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  /** Straight upload, no cropping — keeps the original framing. */
  async function uploadDirect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const dataUrl = await readAsDataUrl(file);
        const res = await adminApi.post<{ ok: boolean; url: string }>("/media/upload", { image_data: dataUrl });
        if (res.url) uploaded.push(res.url);
      }
      if (uploaded.length) {
        onChange([...images, ...uploaded]);
        toast.success(`อัปโหลด ${uploaded.length} รูปเรียบร้อย`);
      }
    } catch (err) {
      if (uploaded.length) onChange([...images, ...uploaded]);
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    onChange([...images, url]);
    setUrlDraft("");
  }

  function removeAt(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  /** Re-crop an image already in the gallery (fetched server-side to dodge CORS). */
  async function recrop(index: number) {
    const url = images[index];
    if (!url) return;
    if (url.startsWith("data:image/")) {
      setCropTarget({ src: url, index });
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi.post<{ ok: boolean; data_url?: string }>("/media/fetch-remote", { url });
      setCropTarget({ src: res.data_url || url, index });
    } catch {
      setCropTarget({ src: url, index });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block font-normal text-muted-foreground text-xs">
        {label} · {images.length} รูป
      </Label>

      <div className="flex flex-wrap gap-2">
        <input ref={batchInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={pickForBatch} />
        <input ref={directInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={uploadDirect} />

        <Button type="button" size="sm" variant="outline" onClick={() => batchInputRef.current?.click()} disabled={disabled || busy}>
          <Images /> เลือกหลายรูป + ตัด
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => directInputRef.current?.click()} disabled={disabled || busy}>
          <Upload /> อัปโหลดตรง (ไม่ตัด)
        </Button>
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="วาง URL รูปภาพแล้วกด Enter"
          disabled={disabled || busy}
          className="h-8"
        />
        <Button type="button" size="sm" variant="outline" onClick={addUrl} disabled={disabled || busy || !urlDraft.trim()}>
          <Link2 /> เพิ่ม
        </Button>
      </div>

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`รูปที่ ${index + 1}`} className="h-24 w-full object-cover" />

              <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{index + 1}</span>

              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button type="button" size="icon-xs" variant="ghost" className="text-white hover:text-white" onClick={() => move(index, -1)} disabled={disabled || busy || index === 0}>
                  <ArrowLeft />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" className="text-white hover:text-white" onClick={() => recrop(index)} disabled={disabled || busy}>
                  <Crop />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" className="text-white hover:text-white" onClick={() => move(index, 1)} disabled={disabled || busy || index === images.length - 1}>
                  <ArrowRight />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" className="text-white hover:text-white" onClick={() => removeAt(index)} disabled={disabled || busy}>
                  <X />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BatchCropDialog
        items={batchItems}
        initialRatio={aspectRatio}
        open={batchItems.length > 0}
        onOpenChange={(open) => !open && setBatchItems([])}
        onComplete={(urls) => onChange([...images, ...urls])}
      />

      <CropDialog
        imageSrc={cropTarget?.src ?? ""}
        initialRatio={aspectRatio}
        open={cropTarget !== null}
        onOpenChange={(open) => !open && setCropTarget(null)}
        onCropped={(url) => {
          if (!cropTarget) return;
          const next = [...images];
          next[cropTarget.index] = url;
          onChange(next);
        }}
      />
    </div>
  );
}
