-- 053_cantina_real_auth.sql  (fase 1: aditiva, no rompe nada)
-- Prepara el cambio de la cantina de "anon + PIN chequeado en el navegador"
-- a sesiones reales de Supabase Auth. Las cuentas de cantina se crean aparte
-- con create_cantina_account() (sin PINs en el repo).

-- 1. Toda policy que hoy solo tiene anon recibe una copia para authenticated,
--    asi la cantina logueada tiene exactamente el mismo acceso que tenia.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public' AND roles = ARRAY['anon']::name[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = p.tablename AND policyname = p.policyname || '_auth'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO authenticated %s %s',
        p.policyname || '_auth', p.tablename, p.permissive, p.cmd,
        CASE WHEN p.qual IS NOT NULL THEN 'USING (' || p.qual || ')' ELSE '' END,
        CASE WHEN p.with_check IS NOT NULL THEN 'WITH CHECK (' || p.with_check || ')' ELSE '' END);
    END IF;
  END LOOP;
END $$;

-- 2. Cuentas de login de cantina (PIN guardado como hash bcrypt)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_cantina_login boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS pin_hash text;

-- 3. Intentos de login para frenar fuerza bruta (por IP)
CREATE TABLE IF NOT EXISTS public.cantina_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip text NOT NULL,
  ok boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cantina_login_attempts_ip ON public.cantina_login_attempts (ip, created_at);
ALTER TABLE public.cantina_login_attempts ENABLE ROW LEVEL SECURITY;  -- sin policies: solo la funcion la toca

-- 4. PIN -> email de la cuenta de cantina. Es lo UNICO que anon puede ejecutar.
--    No devuelve el PIN ni datos del perfil. 10 fallos / 15 min por IP.
CREATE OR REPLACE FUNCTION public.cantina_pin_login(p_pin text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ip text := coalesce(nullif(btrim(split_part(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  v_email text;
BEGIN
  IF (SELECT count(*) FROM cantina_login_attempts
      WHERE ip = v_ip AND NOT ok AND created_at > now() - interval '15 minutes') >= 10 THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera 15 minutos.' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email INTO v_email
  FROM user_profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.is_cantina_login AND coalesce(p.is_active, true)
    AND p.pin_hash IS NOT NULL AND p.pin_hash = crypt(p_pin, p.pin_hash)
  LIMIT 1;

  INSERT INTO cantina_login_attempts (ip, ok) VALUES (v_ip, v_email IS NOT NULL);
  DELETE FROM cantina_login_attempts WHERE created_at < now() - interval '1 day';
  RETURN v_email;
END $$;
REVOKE ALL ON FUNCTION public.cantina_pin_login(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cantina_pin_login(text) TO anon, authenticated;

-- 5. Crear/rotar una cuenta de cantina. Solo service_role / SQL editor.
--    La contrasena de Auth es 'cantina:' || pin (el cliente la deriva igual).
CREATE OR REPLACE FUNCTION public.create_cantina_account(
  p_email text, p_name text, p_role text, p_cantina_role text, p_pin text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_pin !~ '^\d{6}$' THEN RAISE EXCEPTION 'El PIN debe tener 6 digitos'; END IF;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE is_cantina_login AND pin_hash = crypt(p_pin, pin_hash)
             AND id NOT IN (SELECT id FROM auth.users WHERE email = p_email)) THEN
    RAISE EXCEPTION 'PIN ya usado por otra cuenta';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE email = p_email;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, email_change_confirm_status, is_sso_user, is_anonymous)
    VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
      crypt('cantina:' || p_pin, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name), now(), now(),
      '', '', '', '', '', '', '', '', 0, false, false);
    INSERT INTO auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
    INSERT INTO user_profiles (id, name, role, cantina_role, is_active, is_cantina_login, pin_hash)
    VALUES (v_id, p_name, p_role, p_cantina_role, true, true, crypt(p_pin, gen_salt('bf')));
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('cantina:' || p_pin, gen_salt('bf')), updated_at = now()
    WHERE id = v_id;
    UPDATE user_profiles SET pin_hash = crypt(p_pin, gen_salt('bf')), is_cantina_login = true,
      name = p_name, role = p_role, cantina_role = p_cantina_role, is_active = true
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_cantina_account(text, text, text, text, text) FROM public, anon, authenticated;

-- 6. Reset de PIN desde Admin de la cantina: solo owner (cantina) u owner/admin (sistema).
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
  IF p_pin !~ '^\d{6}$' THEN RAISE EXCEPTION 'El PIN debe tener 6 digitos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id AND is_cantina_login) THEN
    RAISE EXCEPTION 'Ese usuario no tiene login de cantina';
  END IF;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE is_cantina_login AND id <> p_user_id
             AND pin_hash = crypt(p_pin, pin_hash)) THEN
    RAISE EXCEPTION 'PIN ya usado por otra cuenta';
  END IF;
  UPDATE user_profiles SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = p_user_id;
  UPDATE auth.users SET encrypted_password = crypt('cantina:' || p_pin, gen_salt('bf')), updated_at = now()
  WHERE id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.reset_cantina_pin(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_cantina_pin(uuid, text) TO authenticated;
