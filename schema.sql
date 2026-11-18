-- =============================================================================
-- SCHEMA.SQL — Suivi de sous-traitance de pièces
-- Idempotent : peut être collé plusieurs fois dans le SQL Editor Supabase
-- =============================================================================

-- =============================================================================
-- 1. Extensions
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 2. Table profiles (liée à auth.users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'subcontractor')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. Table models
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. Table states
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  "order" INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. Table price_rules
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.price_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_state_id UUID NOT NULL REFERENCES public.states(id),
  to_state_id UUID NOT NULL REFERENCES public.states(id),
  price_per_piece NUMERIC(10,2) NOT NULL CHECK (price_per_piece >= 0),
  model_id UUID REFERENCES public.models(id), -- NULL = règle générale
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_state_id, to_state_id, model_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_price_rules_lookup
  ON public.price_rules (from_state_id, to_state_id, model_id, valid_from DESC);

-- =============================================================================
-- 6. Table batches
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID REFERENCES public.models(id), -- Optionnel si lot multi-modèles
  from_state_id UUID NOT NULL REFERENCES public.states(id),
  expected_state_id UUID NOT NULL REFERENCES public.states(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subcontractor_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','open','completed','closed')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_subcontractor ON public.batches (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches (status);
CREATE INDEX IF NOT EXISTS idx_batches_model ON public.batches (model_id);

-- =============================================================================
-- 6.bis Table batch_models (composition multi-modèles d'un lot)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batch_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_models_batch ON public.batch_models (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_models_model ON public.batch_models (model_id);

-- =============================================================================
-- 7. Table batch_updates
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batch_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  model_id UUID REFERENCES public.models(id), -- modèle spécifique de la pièce traitée
  to_state_id UUID NOT NULL REFERENCES public.states(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_piece NUMERIC(10,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  duration_seconds INTEGER,
  corrected_by UUID REFERENCES public.profiles(id),
  comment TEXT,
  original_update_id UUID REFERENCES public.batch_updates(id), -- si correction
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8. Table audit_log
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','CORRECTION')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 9. Fonction RPC record_batch_update (SECURITY DEFINER)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_batch_update(
  p_batch_id UUID,
  p_updates JSONB,  -- [{to_state_id: uuid, quantity: int, model_id?: uuid}, ...]
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch batches%ROWTYPE;
  v_remaining INTEGER;
  v_total_new INTEGER;
  v_update JSONB;
  v_to_state_id UUID;
  v_model_id UUID;
  v_qty INTEGER;
  v_price NUMERIC(10,2);
  v_amount NUMERIC(12,2);
  v_new_id UUID;
  v_result JSONB := '[]'::JSONB;
  v_duration INTEGER;
BEGIN
  -- Verrou sur le lot
  SELECT * INTO v_batch FROM batches WHERE id = p_batch_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot introuvable';
  END IF;

  -- Vérification droits : admin ou sous-traitant assigné
  IF auth.uid() != v_batch.subcontractor_id AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Vérification statut
  IF v_batch.status NOT IN ('sent','open') THEN
    RAISE EXCEPTION 'Le lot n''est pas ouvert (statut: %)', v_batch.status;
  END IF;

  -- Ouvrir le lot si encore "sent"
  IF v_batch.status = 'sent' THEN
    UPDATE batches SET status = 'open', opened_at = NOW(), updated_at = NOW()
    WHERE id = p_batch_id;
    v_batch.opened_at := NOW();
  END IF;

  -- Calculer durée depuis ouverture
  v_duration := EXTRACT(EPOCH FROM (NOW() - v_batch.opened_at))::INTEGER;

  -- Quantité restante globale du lot
  SELECT v_batch.quantity - COALESCE(SUM(quantity), 0)
  INTO v_remaining
  FROM batch_updates
  WHERE batch_id = p_batch_id;

  -- Vérifier total des nouvelles mises à jour
  SELECT COALESCE(SUM((u->>'quantity')::INTEGER), 0)
  INTO v_total_new
  FROM jsonb_array_elements(p_updates) AS u;

  IF v_total_new > v_remaining THEN
    RAISE EXCEPTION 'Quantité dépasse le restant (% disponibles, % demandés)', v_remaining, v_total_new;
  END IF;

  -- Traiter chaque mise à jour
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    v_to_state_id := (v_update->>'to_state_id')::UUID;
    v_qty := (v_update->>'quantity')::INTEGER;
    
    -- Modèle ciblé : soit envoyé dans la mise à jour, soit le modèle par défaut du lot
    IF (v_update ? 'model_id') AND (v_update->>'model_id') IS NOT NULL AND (v_update->>'model_id') != '' THEN
      v_model_id := (v_update->>'model_id')::UUID;
    ELSE
      v_model_id := v_batch.model_id;
    END IF;

    -- Trouver le prix le plus spécifique (model+transition > transition seule)
    SELECT price_per_piece INTO v_price
    FROM price_rules
    WHERE from_state_id = v_batch.from_state_id
      AND to_state_id = v_to_state_id
      AND (model_id = v_model_id OR model_id IS NULL)
      AND valid_from <= NOW()
    ORDER BY
      (model_id IS NOT NULL) DESC,  -- préfère règle spécifique au modèle
      valid_from DESC               -- règle la plus récente
    LIMIT 1;

    IF NOT FOUND THEN
      v_price := 0; -- pas de règle = gratuit
    END IF;

    v_amount := v_price * v_qty;

    INSERT INTO batch_updates (batch_id, model_id, to_state_id, quantity, price_per_piece, amount, duration_seconds, comment)
    VALUES (p_batch_id, v_model_id, v_to_state_id, v_qty, v_price, v_amount, v_duration, p_comment)
    RETURNING id INTO v_new_id;

    -- Audit
    INSERT INTO audit_log (table_name, row_id, action, new_data, user_id)
    VALUES ('batch_updates', v_new_id, 'INSERT',
      jsonb_build_object('batch_id', p_batch_id, 'model_id', v_model_id, 'to_state_id', v_to_state_id, 'quantity', v_qty, 'price', v_price, 'amount', v_amount),
      auth.uid());

    v_result := v_result || jsonb_build_object('id', v_new_id, 'amount', v_amount, 'price_per_piece', v_price);
  END LOOP;

  -- Vérifier si lot complet (toutes pièces traitées)
  IF v_total_new = v_remaining THEN
    UPDATE batches SET status = 'completed', updated_at = NOW() WHERE id = p_batch_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'updates', v_result);
END;
$$;

-- =============================================================================
-- 10. Fonction correct_batch_update (SECURITY DEFINER, admin seulement)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.correct_batch_update(
  p_update_id UUID,
  p_new_to_state_id UUID,
  p_new_quantity INTEGER,
  p_comment TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old batch_updates%ROWTYPE;
  v_batch batches%ROWTYPE;
  v_price NUMERIC(10,2);
  v_amount NUMERIC(12,2);
  v_new_id UUID;
BEGIN
  -- Admin seulement
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Réservé aux admins';
  END IF;

  IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
    RAISE EXCEPTION 'Un commentaire est obligatoire pour les corrections';
  END IF;

  SELECT * INTO v_old FROM batch_updates WHERE id = p_update_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mise à jour introuvable'; END IF;

  SELECT * INTO v_batch FROM batches WHERE id = v_old.batch_id;

  -- Recalculer le prix selon la nouvelle transition
  SELECT price_per_piece INTO v_price
  FROM price_rules
  WHERE from_state_id = v_batch.from_state_id
    AND to_state_id = p_new_to_state_id
    AND (model_id = v_batch.model_id OR model_id IS NULL)
    AND valid_from <= NOW()
  ORDER BY (model_id IS NOT NULL) DESC, valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN v_price := 0; END IF;

  v_amount := v_price * p_new_quantity;

  -- Marquer l'ancienne comme corrigée
  UPDATE batch_updates
  SET corrected_by = auth.uid(), comment = p_comment
  WHERE id = p_update_id;

  -- Insérer la correction
  INSERT INTO batch_updates (batch_id, to_state_id, quantity, price_per_piece, amount, duration_seconds, corrected_by, comment, original_update_id)
  VALUES (v_old.batch_id, p_new_to_state_id, p_new_quantity, v_price, v_amount, v_old.duration_seconds, auth.uid(), p_comment, p_update_id)
  RETURNING id INTO v_new_id;

  -- Audit
  INSERT INTO audit_log (table_name, row_id, action, old_data, new_data, user_id)
  VALUES ('batch_updates', p_update_id, 'CORRECTION',
    row_to_json(v_old)::JSONB,
    jsonb_build_object('new_update_id', v_new_id, 'new_to_state_id', p_new_to_state_id, 'new_quantity', p_new_quantity, 'comment', p_comment),
    auth.uid());

  RETURN jsonb_build_object('success', true, 'new_update_id', v_new_id);
END;
$$;

-- =============================================================================
-- 11. Fonction get_earnings_summary (SECURITY DEFINER)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_earnings_summary(
  p_subcontractor_id UUID DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_model_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();

  -- Déterminer le sous-traitant cible
  IF v_is_admin AND p_subcontractor_id IS NOT NULL THEN
    v_target_id := p_subcontractor_id;
  ELSIF v_is_admin AND p_subcontractor_id IS NULL THEN
    v_target_id := NULL; -- Tous les sous-traitants
  ELSE
    v_target_id := auth.uid(); -- Sous-traitant voit seulement ses données
  END IF;

  SELECT jsonb_build_object(
    'total_day', COALESCE((
      SELECT SUM(bu.amount) FROM batch_updates bu
      JOIN batches b ON bu.batch_id = b.id
      WHERE (v_target_id IS NULL OR b.subcontractor_id = v_target_id)
        AND bu.created_at >= NOW() - INTERVAL '1 day'
        AND (p_model_id IS NULL OR COALESCE(bu.model_id, b.model_id) = p_model_id)
        AND bu.original_update_id IS NULL
    ), 0),
    'total_week', COALESCE((
      SELECT SUM(bu.amount) FROM batch_updates bu
      JOIN batches b ON bu.batch_id = b.id
      WHERE (v_target_id IS NULL OR b.subcontractor_id = v_target_id)
        AND bu.created_at >= NOW() - INTERVAL '7 days'
        AND (p_model_id IS NULL OR COALESCE(bu.model_id, b.model_id) = p_model_id)
        AND bu.original_update_id IS NULL
    ), 0),
    'total_month', COALESCE((
      SELECT SUM(bu.amount) FROM batch_updates bu
      JOIN batches b ON bu.batch_id = b.id
      WHERE (v_target_id IS NULL OR b.subcontractor_id = v_target_id)
        AND bu.created_at >= NOW() - INTERVAL '30 days'
        AND (p_model_id IS NULL OR COALESCE(bu.model_id, b.model_id) = p_model_id)
        AND bu.original_update_id IS NULL
    ), 0),
    'by_model', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT m.name AS model_name, SUM(bu.amount) AS total
        FROM batch_updates bu
        JOIN batches b ON bu.batch_id = b.id
        JOIN models m ON COALESCE(bu.model_id, b.model_id) = m.id
        WHERE (v_target_id IS NULL OR b.subcontractor_id = v_target_id)
          AND (p_from_date IS NULL OR bu.created_at >= p_from_date)
          AND (p_to_date IS NULL OR bu.created_at <= p_to_date)
          AND bu.original_update_id IS NULL
        GROUP BY m.name
        ORDER BY total DESC
      ) t
    ),
    'by_transition', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT s1.name AS from_state, s2.name AS to_state,
          SUM(bu.amount) AS total, COUNT(*) AS count
        FROM batch_updates bu
        JOIN batches b ON bu.batch_id = b.id
        JOIN states s1 ON b.from_state_id = s1.id
        JOIN states s2 ON bu.to_state_id = s2.id
        WHERE (v_target_id IS NULL OR b.subcontractor_id = v_target_id)
          AND (p_from_date IS NULL OR bu.created_at >= p_from_date)
          AND (p_to_date IS NULL OR bu.created_at <= p_to_date)
          AND bu.original_update_id IS NULL
        GROUP BY s1.name, s2.name
        ORDER BY total DESC
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 11.bis Helper function pour vérifier le rôle admin (évite la récursion RLS)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated, anon;

-- =============================================================================
-- 12. RLS — Row Level Security
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- profiles : chacun voit son propre profil ; admin voit tout
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (
    public.is_admin()
  );

-- models : lecture par tous les authentifiés ; écriture par admin
DROP POLICY IF EXISTS "models_select_auth" ON public.models;
CREATE POLICY "models_select_auth" ON public.models
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "models_admin_write" ON public.models;
CREATE POLICY "models_admin_write" ON public.models
  FOR ALL USING (
    public.is_admin()
  );

-- states : lecture par tous les authentifiés ; écriture par admin
DROP POLICY IF EXISTS "states_select_auth" ON public.states;
CREATE POLICY "states_select_auth" ON public.states
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "states_admin_write" ON public.states;
CREATE POLICY "states_admin_write" ON public.states
  FOR ALL USING (
    public.is_admin()
  );

-- price_rules : admin seulement
DROP POLICY IF EXISTS "price_rules_admin" ON public.price_rules;
CREATE POLICY "price_rules_admin" ON public.price_rules
  FOR ALL USING (
    public.is_admin()
  );

-- batches : sous-traitant voit ses lots ; admin voit tout
DROP POLICY IF EXISTS "batches_own" ON public.batches;
CREATE POLICY "batches_own" ON public.batches
  FOR SELECT USING (
    subcontractor_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "batches_admin_write" ON public.batches;
CREATE POLICY "batches_admin_write" ON public.batches
  FOR ALL USING (
    public.is_admin()
  );

-- batch_models : sous-traitant voit les modèles de ses lots ; admin voit tout
DROP POLICY IF EXISTS "batch_models_own" ON public.batch_models;
CREATE POLICY "batch_models_own" ON public.batch_models
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.batches
      WHERE id = batch_id
        AND (
          subcontractor_id = auth.uid()
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "batch_models_admin_write" ON public.batch_models;
CREATE POLICY "batch_models_admin_write" ON public.batch_models
  FOR ALL USING (
    public.is_admin()
  );

-- batch_updates : sous-traitant voit ses mises à jour via ses lots
DROP POLICY IF EXISTS "batch_updates_own" ON public.batch_updates;
CREATE POLICY "batch_updates_own" ON public.batch_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.batches
      WHERE id = batch_id
        AND (
          subcontractor_id = auth.uid()
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "batch_updates_admin_write" ON public.batch_updates;
CREATE POLICY "batch_updates_admin_write" ON public.batch_updates
  FOR ALL USING (
    public.is_admin()
  );

-- audit_log : admin seulement
DROP POLICY IF EXISTS "audit_log_admin" ON public.audit_log;
CREATE POLICY "audit_log_admin" ON public.audit_log
  FOR ALL USING (
    public.is_admin()
  );

-- =============================================================================
-- 13. Trigger updated_at automatique
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS batches_updated_at ON public.batches;
CREATE TRIGGER batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 14. Trigger new_user → profiles
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'subcontractor')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 15. Données de démo (idempotent — UUIDs fixes + ON CONFLICT DO NOTHING)
-- =============================================================================
DO $$ DECLARE
  s_2nd UUID := 'a0000001-0000-0000-0000-000000000001';
  s_com UUID := 'a0000001-0000-0000-0000-000000000002';
  s_1st UUID := 'a0000001-0000-0000-0000-000000000003';
  s_reb UUID := 'a0000001-0000-0000-0000-000000000004';
  m_sil UUID := 'b0000001-0000-0000-0000-000000000001';
  m_hou UUID := 'b0000001-0000-0000-0000-000000000002';
  m_cry UUID := 'b0000001-0000-0000-0000-000000000003';
BEGIN
  -- États
  INSERT INTO public.states (id, name, "order", color, is_final) VALUES
    (s_2nd, '2ème choix',       1, '#ef4444', false),
    (s_com, 'Choix commercial',  2, '#f97316', false),
    (s_1st, '1er choix',         3, '#22c55e', true),
    (s_reb, 'Rebut',             4, '#6b7280', true)
  ON CONFLICT (id) DO NOTHING;

  -- Modèles
  INSERT INTO public.models (id, name, description) VALUES
    (m_sil, 'SILEX',   'Pièces de type SILEX'),
    (m_hou, 'HOUDA',   'Pièces de type HOUDA'),
    (m_cry, 'CRYSTAL', 'Pièces de type CRYSTAL')
  ON CONFLICT (id) DO NOTHING;

  -- Grille de prix générale
  INSERT INTO public.price_rules (from_state_id, to_state_id, price_per_piece, model_id, valid_from) VALUES
    (s_2nd, s_1st, 0.50, NULL,  '2024-01-01'),
    (s_2nd, s_com, 0.25, NULL,  '2024-01-01'),
    (s_2nd, s_reb, 0.05, NULL,  '2024-01-01'),
    (s_com, s_1st, 0.30, NULL,  '2024-01-01'),
    -- Surcharge SILEX
    (s_2nd, s_1st, 0.60, m_sil, '2024-01-01'),
    (s_2nd, s_com, 0.30, m_sil, '2024-01-01')
  ON CONFLICT (from_state_id, to_state_id, model_id, valid_from) DO NOTHING;
END $$;

-- =============================================================================
-- 16. GRANT permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.record_batch_update TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_batch_update TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_earnings_summary TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
