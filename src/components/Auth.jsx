import { useState } from "react";
import { supabase } from "../lib/supabase";

const S = {
  bg: {
    background: "#0f1117", color: "#e4e4e7", minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  },
  card: {
    background: "#1a1d27", borderRadius: 12, padding: 32,
    border: "1px solid #2a2d3a", width: 380, maxWidth: "90vw",
  },
  inp: {
    background: "#0f1117", color: "#e4e4e7", border: "1px solid #2a2d3a",
    borderRadius: 6, padding: "10px 14px", fontSize: 14, width: "100%",
    marginBottom: 12, boxSizing: "border-box",
  },
  btn: {
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 6,
    padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600,
    width: "100%", marginTop: 8,
  },
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        setMsg("Check your email for a login link!");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created! Check email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setMsg(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={S.bg}>
      <div style={S.card}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          APC P&L Tracker
        </h1>
        <form onSubmit={handleAuth}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={S.inp} required
          />
          {mode !== "magic" && (
            <input
              type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={S.inp} required minLength={6}
            />
          )}
          <button type="submit" disabled={loading} style={{
            ...S.btn, opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "..." : mode === "login" ? "Sign In"
              : mode === "signup" ? "Create Account" : "Send Magic Link"}
          </button>
        </form>

        {msg && (
          <p style={{
            marginTop: 12, fontSize: 13,
            color: msg.includes("Check") ? "#22c55e" : "#ef4444",
          }}>
            {msg}
          </p>
        )}

        <div style={{
          marginTop: 20, display: "flex", gap: 16,
          justifyContent: "center", fontSize: 12,
        }}>
          {mode !== "login" && (
            <span onClick={() => setMode("login")}
              style={{ color: "#6366f1", cursor: "pointer" }}>
              Sign in
            </span>
          )}
          {mode !== "signup" && (
            <span onClick={() => setMode("signup")}
              style={{ color: "#6366f1", cursor: "pointer" }}>
              Create account
            </span>
          )}
          {mode !== "magic" && (
            <span onClick={() => setMode("magic")}
              style={{ color: "#6366f1", cursor: "pointer" }}>
              Magic link
            </span>
          )}
        </div>
      </div>
    </div>
  );
}