// Run locally: never publish .env or copy its contents into a conversation.
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
if (existsSync(".env"))
  throw Error(
    ".env já existe. Preserve suas configurações; nenhum arquivo foi substituído.",
  );
if (!process.stdin.isTTY)
  throw Error(
    "Execute este comando em um terminal interativo no seu computador.",
  );
const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question(
  "URL pública do CRM (Enter = http://localhost:8888): ",
  (answer) => {
    const origin = new URL(answer.trim() || "http://localhost:8888").origin;
    process.stdout.write(
      "Defina uma senha do CRM (mínimo 12 caracteres, entrada oculta): ",
    );
    rl.close();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let password = "";
    process.stdin.on("data", (data) => {
      for (const c of data.toString()) {
        if (c === "\u0003") process.exit(1);
        if (c === "\r" || c === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          if (password.length < 12) {
            process.stderr.write("\nSenha curta; execute novamente.\n");
            process.exit(1);
          }
          const salt = randomBytes(16).toString("hex");
          const config = {
            CRM_ORIGIN: origin,
            CRM_OWNER_PASSWORD_HASH: `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`,
            CRM_SIGNING_SECRET: randomBytes(32).toString("hex"),
            CRM_OAUTH_CLIENT_ID: "colmeia-" + randomBytes(8).toString("hex"),
            CRM_OAUTH_CLIENT_SECRET: randomBytes(32).toString("hex"),
            CRM_OAUTH_REDIRECT_URIS:
              "https://chatgpt.com/connector_platform_oauth_redirect,https://chat.openai.com/aip/plugin/oauth/callback",
          };
          writeFileSync(
            ".env",
            Object.entries(config)
              .map(([k, v]) => `${k}='${v}'`)
              .join("\n") + "\n",
            { mode: 0o600, flag: "wx" },
          );
          password = "";
          console.log(
            "\nConfiguração gravada em .env, ignorada pelo Git. Guarde sua senha. Não publique este arquivo.",
          );
          process.exit(0);
        } else if (c === "\u007f" || c === "\b")
          password = password.slice(0, -1);
        else if (c >= " ") password += c;
      }
    });
  },
);
