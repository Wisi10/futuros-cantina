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
      const { data, error: dbError } = await supabase
        .from("user_profiles")
        .select("id, name, role")
        .eq("pin", pin)
        .eq("is_active", true)
        .not("pin", "is", null);

      if (dbError || !data || data.length === 0) {
        setError("PIN incorrecto");
        setLoading(false);
        return;
      }

      // Use first match (pins should be unique)
      const user = data[0];

      sessionStorage.setItem("cantina_user", JSON.stringify(user));
      router.push("/pos");
    } catch {
      setError("Error de conexion");
    }
    setLoading(false);
  };

  return <PinLogin onLogin={handleLogin} error={error} loading={loading} />;
}
