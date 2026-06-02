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
import { optimizeImageForAnalyze } from "@/lib/menu-import/image-optimize";
import { structureMenuFromImageBase64 } from "@/lib/menu-import/openai-menu";

const PDF_UNSUPPORTED_MESSAGE =
  "PDF metin çıkarımı şu anda desteklenmiyor. Lütfen menüyü görsel olarak yükleyin.";

const GENERIC_ANALYZE_ERROR =
  "Analiz sırasında bir hata oluştu. Lütfen tekrar deneyin.";

function isPlatformErrorMessage(message: string): boolean {
  const m = message.trim();
  return (
    /^An error /i.test(m) ||
    /^Internal Server Error/i.test(m) ||
    /^A server error/i.test(m) ||
    m.includes("<!DOCTYPE") ||
    m.includes("<html")
  );
}

function userFacingAnalyzeError(rawMessage: string): { message: string; status: number } {
  const trimmed = rawMessage.trim() || "Bilinmeyen hata";
  if (isPlatformErrorMessage(trimmed) || trimmed === "Bilinmeyen hata") {
    return { message: GENERIC_ANALYZE_ERROR, status: 500 };
  }
  return { message: trimmed.slice(0, 2000), status: 422 };
}

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

async function handleAnalyzePost(request: Request): Promise<NextResponse> {
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

    if (isPdfMime(mimeType)) {
      return NextResponse.json({ error: PDF_UNSUPPORTED_MESSAGE }, { status: 422 });
    }

    if (!isImageMime(mimeType)) {
      return NextResponse.json(
        { error: "Yalnızca JPEG, PNG, WebP veya GIF desteklenir." },
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

    const optimizedImage = await optimizeImageForAnalyze(buffer);
    console.info("[menu-import/analyze] image size", {
      originalBytes: optimizedImage.originalBytes,
      optimizedBytes: optimizedImage.optimizedBytes,
      originalWidth: optimizedImage.originalWidth,
      originalHeight: optimizedImage.originalHeight,
      optimizedWidth: optimizedImage.optimizedWidth,
      optimizedHeight: optimizedImage.optimizedHeight,
      optimized: optimizedImage.optimized,
    });

    const b64 = optimizedImage.buffer.toString("base64");
    const payload = await structureMenuFromImageBase64(optimizedImage.mime, b64);

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
    const rawMessage = e instanceof Error ? e.message : "Bilinmeyen hata";
    console.error("menu-import/analyze failed:", e);

    if (jobId && admin) {
      try {
        await admin
          .from("menu_import_jobs")
          .update({
            status: "failed",
            error_message: rawMessage.slice(0, 2000),
          })
          .eq("id", jobId);
      } catch (jobUpdateErr) {
        console.error("menu-import/analyze job status update failed:", jobUpdateErr);
      }
    }
    if (admin && storagePathForCleanup && userIdForCleanup) {
      try {
        await cleanupImportFile(admin, storagePathForCleanup, userIdForCleanup);
      } catch (cleanupErr) {
        console.error("menu-import/analyze cleanup failed:", cleanupErr);
      }
    }

    const { message, status } = userFacingAnalyzeError(rawMessage);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    return await handleAnalyzePost(request);
  } catch (e) {
    console.error("menu-import/analyze unhandled:", e);
    return NextResponse.json({ ok: false, error: GENERIC_ANALYZE_ERROR }, { status: 500 });
  }
}
