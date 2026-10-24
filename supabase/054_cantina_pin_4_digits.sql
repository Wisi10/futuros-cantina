-- 054_cantina_pin_4_digits.sql
-- PIN de 4 digitos. Para que 10.000 combinaciones no se puedan probar
-- directo contra Supabase Auth, la contrasena de Auth incluye un secreto
-- aleatorio por cuenta (login_secret) que solo devuelve cantina_pin_login_v2
-- cuando el PIN es correcto (y esa funcion limita 10 fallos / 15 min por IP).
-- Contrasena de Auth = 'cantina:' || login_secret || ':' || pin

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS login_secret text;
REVOKE SELECT (login_secret) ON public.user_profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cantina_pin_login_v2(p_pin text)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ip text := coalesce(nullif(btrim(split_part(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  v_email text;
  v_secret text;
BEGIN
  IF (SELECT count(*) FROM cantina_login_attempts
      WHERE ip = v_ip AND NOT ok AND created_at > now() - interval '15 minutes') >= 10 THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera 15 minutos.' USING ERRCODE = 'P0001';
  END IF;
  SELECT u.email, p.login_secret INTO v_email, v_secret
  FROM user_profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.is_cantina_login AND coalesce(p.is_active, true)
    AND p.pin_hash IS NOT NULL AND p.login_secret IS NOT NULL
    AND p.pin_hash = crypt(p_pin, p.pin_hash)
  LIMIT 1;
  INSERT INTO cantina_login_attempts (ip, ok) VALUES (v_ip, v_email IS NOT NULL);
  DELETE FROM cantina_login_attempts WHERE created_at < now() - interval '1 day';
  IF v_email IS NULL THEN RETURN NULL; END IF;
  RETURN json_build_object('email', v_email, 'secret', v_secret);
END $$;
REVOKE ALL ON FUNCTION public.cantina_pin_login_v2(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cantina_pin_login_v2(text) TO anon, authenticated;

-- El login viejo (6 digitos, sin secreto) queda deshabilitado.
REVOKE EXECUTE ON FUNCTION public.cantina_pin_login(text) FROM anon, authenticated;

-- Fija PIN + secreto nuevo para una cuenta existente (uso interno).
CREATE OR REPLACE FUNCTION public.set_cantina_pin_internal(p_user_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_secret text := encode(gen_random_bytes(18), 'hex');
BEGIN
  IF p_pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'El PIN debe tener 4 digitos'; END IF;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE is_cantina_login AND id <> p_user_id
             AND pin_hash = crypt(p_pin, pin_hash)) THEN
    RAISE EXCEPTION 'PIN ya usado por otra cuenta';
  END IF;
  UPDATE user_profiles SET pin_hash = crypt(p_pin, gen_salt('bf')), login_secret = v_secret,
    is_cantina_login = true
  WHERE id = p_user_id;
  UPDATE auth.users SET encrypted_password = crypt('cantina:' || v_secret || ':' || p_pin, gen_salt('bf')),
    updated_at = now()
  WHERE id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.set_cantina_pin_internal(uuid, text) FROM public, anon, authenticated;

-- Reset desde Admin (solo owner): ahora 4 digitos + secreto nuevo.
CREATE OR REPLACE FUNCTION public.reset_cantina_pin(p_user_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND coalesce(is_active, true)
                 AND (cantina_role = 'owner' OR role IN ('owner', 'admin'))) THEN
    RAISE EXCEPTION 'Solo el owner puede cambiar PINs' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id AND is_cantina_login) THEN
    RAISE EXCEPTION 'Ese usuario no tiene login de cantina';
  END IF;
  PERFORM set_cantina_pin_internal(p_user_id, p_pin);
END $$;
REVOKE ALL ON FUNCTION public.reset_cantina_pin(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_cantina_pin(uuid, text) TO authenticated;
