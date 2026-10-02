import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const email = (process.env.SEED_ADMIN_EMAIL || "admin@jansen.adv.br").trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || "admin1234";
const rounds = Number(process.env.BCRYPT_ROUNDS || 10);

if (!Number.isInteger(rounds) || rounds < 8 || rounds > 14) throw new Error("BCRYPT_ROUNDS deve estar entre 8 e 14.");
if (!email || password.length < 8) throw new Error("Credenciais de desenvolvimento inválidas.");

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const passwordHash = await bcrypt.hash(password, rounds);
const sql = `INSERT INTO users (name, email, password_hash, role, is_active, created_at, updated_at)
VALUES ('Administrador Jansen', ${quote(email)}, ${quote(passwordHash)}, 'ADMIN', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET role = 'ADMIN', is_active = 1, updated_at = CURRENT_TIMESTAMP;`;

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, [wrangler, "d1", "execute", "DB", "--config", "wrangler.jsonc", "--local", "--persist-to", ".wrangler/state", "--command", sql], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status || 1);
console.log(`Usuário de desenvolvimento pronto: ${email}`);
