"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, KeyRound, Mail, Shield } from "lucide-react";
import type { MasterCreateRestaurantResponse } from "@/lib/master-admin/create-response";
import { CopyButton } from "./copy-button";

function formatInviteTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type CreateSuccessPanelProps = {
  data: MasterCreateRestaurantResponse;
  onCreateAnother: () => void;
};

export function CreateSuccessPanel({ data, onCreateAnother }: CreateSuccessPanelProps) {
  const {
    restaurant,
    owner_email,
    login_username,
    owner_creation_mode,
    owner_invited,
    owner_exists,
    login_url,
    invite_sent_at,
    temporary_password,
  } = data;

  const isTemporaryPassword =
    owner_creation_mode === "temporary_password" && Boolean(temporary_password);

  const credentialsBlock = isTemporaryPassword
    ? `TapMenu giriş bilgileri\nE-posta: ${owner_email}\nKullanıcı adı: ${login_username}\nGeçici şifre: ${temporary_password}\nGiriş: ${login_url}\n\nBu şifre yalnızca bir kez gösterilir. İlk girişten sonra şifresini değiştirmesini önerin.`
    : "";

  const shareBlurb = isTemporaryPassword
    ? credentialsBlock
    : owner_invited
      ? `TapMenu paneliniz hazır.\n1) ${owner_email} adresine gelen davet mailini açın\n2) Davet linkinden şifrenizi oluşturun\n3) Sonraki girişler: ${login_url}\nKullanıcı adı: ${login_username}`
      : `TapMenu paneliniz hazır.\nGiriş adresi: ${login_url}\nE-posta: ${owner_email}\nKullanıcı adı: ${login_username}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="text-green-600 shrink-0" size={32} />
          <div>
            <h2 className="text-xl font-black text-gray-900">Restoran oluşturuldu</h2>
            <p className="text-gray-700 mt-1">
              <span className="font-semibold">{restaurant.name}</span> (
              <span className="font-mono text-sm">{restaurant.slug}</span>) kaydı tamamlandı.
            </p>
          </div>
        </div>
      </div>

      {isTemporaryPassword && (
        <section className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-amber-800 font-black text-xs uppercase tracking-wider">
            <KeyRound size={14} />
            Geçici giriş bilgileri
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              <span className="font-bold">Bu şifre yalnızca bir kez gösterilir.</span> Sayfadan
              ayrıldıktan sonra tekrar görüntülenemez. Müşteriye güvenli kanaldan iletin.
            </p>
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold text-gray-500 uppercase">E-posta</dt>
              <dd className="font-mono text-gray-900 mt-0.5 break-all">{owner_email}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-gray-500 uppercase">Kullanıcı adı</dt>
              <dd className="font-mono text-gray-900 mt-0.5 break-all">{login_username}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-gray-500 uppercase">Geçici şifre</dt>
              <dd className="font-mono text-lg font-bold text-gray-900 mt-0.5 tracking-wide break-all">
                {temporary_password}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-gray-500 uppercase">Panel giriş adresi</dt>
              <dd className="font-mono text-gray-900 mt-0.5 break-all">{login_url}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <CopyButton text={credentialsBlock} label="Giriş bilgilerini kopyala" variant="primary" />
            <CopyButton text={login_url} label="Yalnızca giriş adresi" />
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-wider">
          <Shield size={14} />
          Owner durumu
        </div>

        {isTemporaryPassword ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{owner_email}</span> için hesap geçici şifre ile
            oluşturuldu. Davet e-postası gönderilmedi.
          </p>
        ) : owner_exists ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">Bu kullanıcı zaten sistemde kayıtlıydı.</p>
            <p className="mt-1 text-amber-800/90">
              <span className="font-semibold">{owner_email}</span> hesabı mevcut kullanıcıya
              bağlandı. Yeni davet e-postası gönderilmedi.
            </p>
          </div>
        ) : owner_invited ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 space-y-3">
            <p className="font-bold flex items-center gap-2">
              <Mail size={16} />
              Davet e-postası gönderildi
            </p>
            {invite_sent_at && (
              <p className="text-xs text-blue-800/80">
                Gönderim: {formatInviteTime(invite_sent_at)}
              </p>
            )}
            <ol className="list-decimal list-inside space-y-1.5 text-blue-900/95">
              <li>
                Müşteri <span className="font-semibold">{owner_email}</span> gelen kutusunu kontrol
                etsin.
              </li>
              <li>Davet linkinden şifresini oluştursun.</li>
              <li>Sonraki girişler için panel adresini kullansın.</li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-gray-600">Owner hesabı restoranla ilişkilendirildi.</p>
        )}

        {!isTemporaryPassword && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Panel giriş adresi</p>
            <p className="font-mono text-sm text-gray-900 break-all rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              {login_url}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <CopyButton text={login_url} label="Bağlantıyı kopyala" variant="primary" />
              <CopyButton text={shareBlurb} label="Müşteri metnini kopyala" />
            </div>
          </div>
        )}

        {!isTemporaryPassword && (
          <div className="flex items-center gap-2">
            <span
              title="Yakında"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-bold cursor-not-allowed"
            >
              <Mail size={14} />
              Davet mailini tekrar gönder
              <span className="ml-1 px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 text-[10px] uppercase">
                Yakında
              </span>
            </span>
          </div>
        )}
      </section>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <Link
          href={`/admin/master/${restaurant.id}`}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700"
        >
          Restoran detayına git
        </Link>
        <button
          type="button"
          onClick={onCreateAnother}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50"
        >
          Başka restoran oluştur
        </button>
        <Link
          href="/admin/master"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50"
        >
          Listeye dön
        </Link>
      </div>
    </div>
  );
}
