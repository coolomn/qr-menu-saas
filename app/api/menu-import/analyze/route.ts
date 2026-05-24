import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  assertImportStoragePath,
  isLegacyImportPath,
  MENU_IMPORTS_BUCKET,
  resolveImportDownloadTarget,
} from "@/lib/menu-import/paths";
import { isImageMime, isPdfMime } from "@/lib/menu-import/mime";
import {
  structureMenuFromImageBase64,
  structureMenuFromText,
} from "@/lib/menu-import/openai-menu";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  restaurantId?: string;
  storagePath?: string;
  mimeType?: string;
};

async function cleanupImportFile(
  admin: SupabaseClient,
  storagePath: string,
  userId: string
): Promise<void> {
  if (isLegacyImportPath(storagePath, userId)) {
    return;
  }
  const { error } = await admin.storage.from(MENU_IMPORTS_BUCKET).remove([storagePath]);
  if (error) {
    console.error("Import file cleanup failed:", storagePath, error.message);
  }
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  let admin: SupabaseClient | undefined;
  let storagePathForCleanup: string | null = null;
  let userIdForCleanup: string | null = null;

  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    admin = svc.client;

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const restaurantId = body.restaurantId?.trim();
    const storagePath = body.storagePath?.trim();
    const mimeType = (body.mimeType || "").trim().toLowerCase();

    if (!restaurantId || !storagePath) {
      return NextResponse.json({ error: "restaurantId ve storagePath zorunlu." }, { status: 400 });
    }

    assertImportStoragePath(storagePath, restaurantId, user.id);
    storagePathForCleanup = storagePath;
    userIdForCleanup = user.id;

    const { data: restaurant, error: resErr } = await admin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (resErr || !restaurant) {
      return NextResponse.json({ error: "Restoran bulunamadı veya yetkiniz yok." }, { status: 403 });
    }

    if (!isPdfMime(mimeType) && !isImageMime(mimeType)) {
      return NextResponse.json(
        { error: "Yalnızca PDF veya JPEG/PNG/WebP/GIF desteklenir." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Sunucu yapılandırması eksik: OPENAI_API_KEY." },
        { status: 503 }
      );
    }

    const { data: jobRow, error: jobInsertErr } = await admin
      .from("menu_import_jobs")
      .insert({
        restaurant_id: restaurantId,
        user_id: user.id,
        status: "processing",
        storage_path: storagePath,
        file_mime: mimeType || null,
      })
      .select("id")
      .single();

    if (jobInsertErr || !jobRow) {
      console.error(jobInsertErr);
      const msg = jobInsertErr?.message || "";
      const code = (jobInsertErr as { code?: string }).code;
      if (
        /relation|does not exist|42P01|menu_import_jobs|schema cache|PGRST205/i.test(msg) ||
        code === "PGRST205"
      ) {
        return NextResponse.json(
          {
            error:
              "Veritabanında menu_import_jobs tablosu yok. Supabase Dashboard → SQL Editor’da proje klasöründeki supabase/migrations/20260513140000_menu_import_jobs_v1.sql dosyasının tamamını yapıştırıp Çalıştırın. Sonra 10–30 sn bekleyip tekrar deneyin.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "İş kaydı oluşturulamadı." }, { status: 500 });
    }
    jobId = jobRow.id;

    const { bucket, path: downloadPath } = resolveImportDownloadTarget(storagePath, user.id);
    const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(downloadPath);
    if (dlErr || !blob) {
      throw new Error(dlErr?.message || "Dosya indirilemedi.");
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length > 12 * 1024 * 1024) {
      throw new Error("Dosya çok büyük (en fazla 12 MB).");
    }

    let payload;
    if (isPdfMime(mimeType)) {
      const { extractTextFromPdf } = await import("@/lib/menu-import/extract");
      const text = await extractTextFromPdf(buffer);
      if (!text.trim()) {
        throw new Error("PDF içinden metin çıkarılamadı (taranmış PDF olabilir). Görüntü olarak yükleyin.");
      }
      payload = await structureMenuFromText(text);
    } else {
      const b64 = buffer.toString("base64");
      payload = await structureMenuFromImageBase64(mimeType, b64);
    }

    await admin
      .from("menu_import_jobs")
      .update({
        status: "completed",
        parsed_json: payload,
        error_message: null,
      })
      .eq("id", jobId);

    await cleanupImportFile(admin, storagePath, user.id);

    return NextResponse.json({ ok: true, jobId, payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bilinmeyen hata";
    if (jobId && admin) {
      await admin
        .from("menu_import_jobs")
        .update({
          status: "failed",
          error_message: message.slice(0, 2000),
        })
        .eq("id", jobId);
    }
    if (admin && storagePathForCleanup && userIdForCleanup) {
      await cleanupImportFile(admin, storagePathForCleanup, userIdForCleanup);
    }
    console.error(e);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
