-- Run after the migration inside the SAME transaction; the runner rolls back.
DO $$
DECLARE
  a uuid; l uuid; p uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  other_account uuid; share_id uuid := gen_random_uuid();
BEGIN
  SELECT account_id, id INTO a, l FROM public.contacts LIMIT 1;
  SELECT id INTO other_account FROM public.accounts WHERE id <> a LIMIT 1;
  IF a IS NULL OR other_account IS NULL THEN RAISE EXCEPTION 'Test requires two accounts and one contact'; END IF;
  INSERT INTO public.property_match_projections(account_id, property_id, title, neighborhood)
    VALUES (a, p, 'Lifecycle regression', 'Test'), (other_account, p, 'Other account', 'Test');
  INSERT INTO public.lead_property_matches(id, account_id, lead_id, property_id, match_status)
    VALUES (m, a, l, p, 'enviado');
  INSERT INTO public.property_shares(id, account_id, lead_id, property_id, match_id, tracking_token)
    VALUES (share_id, a, l, p, m, gen_random_uuid()::text);
  PERFORM public.delete_match_property(a, p);
  PERFORM public.delete_match_property(a, p); -- idempotency
  IF EXISTS (SELECT 1 FROM public.lead_property_matches WHERE id = m) THEN RAISE EXCEPTION 'Match survived deletion'; END IF;
  IF EXISTS (SELECT 1 FROM public.property_match_projections WHERE account_id = a AND property_id = p) THEN RAISE EXCEPTION 'Projection survived deletion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_match_projections WHERE account_id = other_account AND property_id = p) THEN RAISE EXCEPTION 'Other account affected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_shares WHERE id = share_id AND match_id IS NULL AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Share history was lost or not revoked'; END IF;
  BEGIN
    INSERT INTO public.property_match_projections(account_id, property_id, title, neighborhood)
      VALUES (a, p, 'Late sync', 'Test');
    RAISE EXCEPTION 'Deleted property was resurrected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.lead_property_matches(account_id, lead_id, property_id) VALUES (a, l, p);
    RAISE EXCEPTION 'Orphan match was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- Direct projection deletions must have the same global lifecycle.
  DELETE FROM public.property_match_projections WHERE account_id = other_account AND property_id = p;
  IF NOT EXISTS (SELECT 1 FROM public.deleted_match_properties WHERE account_id = other_account AND property_id = p) THEN RAISE EXCEPTION 'Direct deletion omitted tombstone'; END IF;
  IF has_function_privilege('authenticated', 'public.delete_match_property(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.delete_match_property(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Deletion RPC exposed to untrusted roles';
  END IF;
END;
$$;
