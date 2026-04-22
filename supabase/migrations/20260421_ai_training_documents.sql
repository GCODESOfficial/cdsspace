CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('cdocs','project','role','chat','resume','custom')),
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_text TEXT,
  content_excerpt TEXT,
  file_name TEXT,
  file_path TEXT,
  file_mime TEXT,
  file_size_bytes INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_category
  ON public.ai_knowledge_documents (category, is_active, updated_at DESC);

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_knowledge_documents" ON public.ai_knowledge_documents;
CREATE POLICY "allow_all_ai_knowledge_documents" ON public.ai_knowledge_documents
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ai_knowledge_documents_bump_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.content_excerpt IS NULL OR NEW.content_excerpt = '' THEN
    NEW.content_excerpt := left(coalesce(NEW.content_text, NEW.description, ''), 900);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_knowledge_documents_bump_updated ON public.ai_knowledge_documents;
CREATE TRIGGER trg_ai_knowledge_documents_bump_updated
  BEFORE INSERT OR UPDATE ON public.ai_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.ai_knowledge_documents_bump_updated();

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-training-docs', 'ai-training-docs', false)
ON CONFLICT (id) DO NOTHING;
