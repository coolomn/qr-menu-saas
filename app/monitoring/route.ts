// Tarayıcıdaki hata kayıtlarını reklam engelleyicilere takılmadan Sentry'ye iletir.
// Yalnızca olay içeriği iletilir; çerez/başlık iletilmez. Sadece bizim DSN kabul edilir.
export { POST } from "@sentry/nextjs/tunnel";
