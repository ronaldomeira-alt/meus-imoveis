BEGIN;

-- A deletion is permanent for this identity, including delayed tunnel upserts.
CREATE TABLE IF NOT EXISTS public.deleted_match_properties (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, property_id)
);
ALTER TABLE public.deleted_match_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_match_properties FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_deleted_match_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.account_id::text || NEW.property_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.deleted_match_properties
    WHERE account_id = NEW.account_id AND property_id = NEW.property_id) THEN
    RAISE EXCEPTION 'Imóvel excluído do estoque' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_deleted_match_property ON public.property_match_projections;
CREATE TRIGGER guard_deleted_match_property BEFORE INSERT OR UPDATE
ON public.property_match_projections FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_match_property();

CREATE OR REPLACE FUNCTION public.record_deleted_match_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.deleted_match_properties(account_id, property_id)
    VALUES (OLD.account_id, OLD.property_id) ON CONFLICT DO NOTHING;
  -- Preserve delivery/engagement history, but stop offering a deleted property.
  UPDATE public.property_shares SET revoked_at = COALESCE(revoked_at, now())
    WHERE account_id = OLD.account_id AND property_id = OLD.property_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS record_deleted_match_property ON public.property_match_projections;
CREATE TRIGGER record_deleted_match_property BEFORE DELETE
ON public.property_match_projections FOR EACH ROW EXECUTE FUNCTION public.record_deleted_match_property();

-- Existing orphan matches cannot be displayed or recalculated without a property.
DELETE FROM public.lead_property_matches m WHERE NOT EXISTS (
  SELECT 1 FROM public.property_match_projections p
  WHERE p.account_id = m.account_id AND p.property_id = m.property_id
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lead_property_matches'::regclass
      AND conname = 'lead_property_matches_property_fkey') THEN
    ALTER TABLE public.lead_property_matches
      ADD CONSTRAINT lead_property_matches_property_fkey
      FOREIGN KEY (account_id, property_id)
      REFERENCES public.property_match_projections(account_id, property_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_match_property(p_account_id uuid, p_property_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text || p_property_id::text, 0));
  INSERT INTO public.deleted_match_properties(account_id, property_id)
    VALUES (p_account_id, p_property_id) ON CONFLICT DO NOTHING;
  DELETE FROM public.property_match_projections
    WHERE account_id = p_account_id AND property_id = p_property_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_match_property(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_match_property(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.guard_deleted_match_property() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_deleted_match_property() FROM PUBLIC;

COMMIT;
