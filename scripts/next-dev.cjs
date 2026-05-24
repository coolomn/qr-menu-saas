/**
 * Port 3000 doluysa Next sessizce 3001'e geçer; tarayıcıda 3000 açık kalırsa beyaz ekran olur.
 * Bu script 3000 müsait değilse uyarı verip çıkar — böylece her zaman terminaldeki URL ile aynı portu kullanırsınız.
 */
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = 3000;

function canBindPort(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, HOST, () => {
      s.close(() => resolve(true));
    });
  });
}

async function main() {
  if (!(await canBindPort(PORT))) {
    console.error("\n\x1b[31m╔════════════════════════════════════════════════════════════╗\x1b[0m");
    console.error("\x1b[31m║  Port 3000 zaten kullanımda.                               ║\x1b[0m");
    console.error("\x1b[31m╠════════════════════════════════════════════════════════════╣\x1b[0m");
    console.error("\x1b[33m║  Tarayıcıda http://127.0.0.1:3000 açmak ESKİ süreci        ║\x1b[0m");
    console.error("\x1b[33m║  gösterebilir (beyaz sayfa / boş yanıt).                  ║\x1b[0m");
    console.error("\x1b[31m╠════════════════════════════════════════════════════════════╣\x1b[0m");
    console.error("\x1b[36m║  Çözüm: Eski Next / node sürecini kapatın, sonra tekrar:   ║\x1b[0m");
    console.error("\x1b[36m║    lsof -ti :3000 | xargs kill -9                          ║\x1b[0m");
    console.error("\x1b[36m║  Ardından: npm run dev                                      ║\x1b[0m");
    console.error("\x1b[31m╚════════════════════════════════════════════════════════════╝\x1b[0m\n");
    process.exit(1);
  }

  const root = path.join(__dirname, "..");
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

  const child = spawn(process.execPath, [nextCli, "dev", "-H", HOST, "--webpack", "-p", String(PORT)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
