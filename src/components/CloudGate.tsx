import { useState } from "react";
import { Hexagon, Lock, ArrowRight } from "lucide-react";
import { login } from "../cloud";
export default function CloudGate({
  onLogin,
  message,
}: {
  onLogin: () => void;
  message?: string;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(message || ""),
    [busy, setBusy] = useState(false);
  return (
    <div className="cloud-gate">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await login(password);
            setPassword("");
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="gate-brand">
          <Hexagon /> colmeia CRM
        </span>
        <h1>Sua Colmeia, conectada.</h1>
        <p>
          Entre para acessar seus salões, clientes e próximos passos, com o
          mesmo banco usado pelo ChatGPT.
        </p>
        <label>
          Sua senha do CRM
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={256}
          />
        </label>
        {error && (
          <div className="warning" role="alert">
            {error}
          </div>
        )}
        <button disabled={busy} className="btn primary full">
          {busy ? "Entrando…" : "Entrar na Colmeia"}
          <ArrowRight size={16} />
        </button>
        <small>
          <Lock size={13} /> A senha é verificada no servidor. Dados locais
          antigos são preservados até você migrar.
        </small>
      </form>
    </div>
  );
}
