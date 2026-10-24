"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PinLogin from "@/components/PinLogin";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (pin) => {
    setError("");
    setLoading(true);
    try {
      // 1) PIN -> email de la cuenta de cantina (RPC con limite de intentos por IP)
      const { data: login, error: rpcError } = await supabase.rpc("cantina_pin_login_v2", { p_pin: pin });
      if (rpcError) {
        setError(rpcError.message?.includes("Demasiados") ? rpcError.message : "Error de conexion");
        setLoading(false);
        return;
      }
      if (!login?.email) {
        setError("PIN incorrecto");
        setLoading(false);
        return;
      }

      // 2) Sesion real de Supabase Auth: todas las queries salen como "authenticated".
      //    El secreto solo llega con PIN correcto, asi el PIN de 4 digitos no se
      //    puede probar por fuerza bruta directo contra Supabase Auth.
      const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
        email: login.email,
        password: `cantina:${login.secret}:${pin}`,
      });
      if (authError || !auth?.user) {
        setError("PIN incorrecto");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id, name, role, cantina_role")
        .eq("id", auth.user.id)
        .single();
      if (!profile) {
        await supabase.auth.signOut();
        setError("Usuario sin perfil");
        setLoading(false);
        return;
      }

      const user = { ...profile, cantinaRole: profile.cantina_role || "staff" };
      sessionStorage.setItem("cantina_user", JSON.stringify(user));
      router.push("/pos");
    } catch {
      setError("Error de conexion");
    }
    setLoading(false);
  };

  return <PinLogin onLogin={handleLogin} error={error} loading={loading} />;
}
