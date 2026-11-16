export type DbError = { message?: string; code?: string };

/** PostgREST/Postgres "kolon yok" hatası (migration uygulanmamış ortam). Başka hatalarda geri dönüş YAPILMAZ. */
export function isMissingColumnError(error: DbError): boolean {
  return error.code === "42703" || /column .* does not exist|schema cache/i.test(error.message ?? "");
}
