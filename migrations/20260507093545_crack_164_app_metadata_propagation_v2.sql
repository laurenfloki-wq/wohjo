CREATE OR REPLACE FUNCTION public.provision_tenant_from_checkout(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_email text,
  p_company_name text,
  p_abn_digits text,
  p_pricing_tier text,
  p_signup_metadata jsonb,
  p_admin_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_stripe_customer_id IS NULL OR length(p_stripe_customer_id) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_stripe_customer_id is required';
  END IF;
  IF p_email IS NULL OR length(p_email) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_email is required';
  END IF;
  IF p_company_name IS NULL OR length(p_company_name) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_company_name is required';
  END IF;
  IF p_pricing_tier IS NULL OR p_pricing_tier NOT IN
       ('founding','standard','growth','scale','enterprise') THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_pricing_tier must be one of founding|standard|growth|scale|enterprise';
  END IF;
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_admin_user_id is required';
  END IF;

  SELECT id INTO v_company_id
    FROM public.companies
    WHERE stripe_customer_id = p_stripe_customer_id;

  IF NOT FOUND THEN
    INSERT INTO public.companies (
      name, abn, abn_digits, contact_email, billing_contact_email,
      stripe_customer_id, stripe_subscription_id, pricing_tier,
      signup_step, accepted_terms_at, is_active
    ) VALUES (
      p_company_name, p_abn_digits, p_abn_digits, p_email, p_email,
      p_stripe_customer_id, p_stripe_subscription_id, p_pricing_tier,
      'site', now(), true
    )
    RETURNING id INTO v_company_id;

    INSERT INTO public.admins (user_id, company_id, role)
    VALUES (p_admin_user_id, v_company_id, 'director');
  END IF;

  -- CRACK 164 closure — propagate company_id to auth.users.raw_app_meta_data
  -- so authenticated-role JWTs carry the claim. Phase 2 RLS depends on this.
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('company_id', v_company_id::text)
  WHERE id = p_admin_user_id;

  RETURN v_company_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
) TO service_role;