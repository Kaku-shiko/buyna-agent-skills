
-- Create admin@buyna.ai user with password 'buyna.ai' and remove all other users
DO $$
DECLARE
  new_id uuid := gen_random_uuid();
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM auth.users WHERE email = 'admin@buyna.ai';

  IF existing_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
      'admin@buyna.ai', crypt('buyna.ai', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', 'admin@buyna.ai', 'email_verified', true),
            'email', new_id::text, now(), now(), now());
    existing_id := new_id;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('buyna.ai', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = existing_id;
  END IF;

  -- Ensure admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (existing_id, 'admin')
  ON CONFLICT DO NOTHING;

  -- Delete all other auth users (cascades to identities, user_roles, merchants via FK)
  DELETE FROM public.user_roles WHERE user_id <> existing_id;
  DELETE FROM auth.users WHERE id <> existing_id;
END $$;
