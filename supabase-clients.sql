-- ============================================
-- CDS Space: Clients / Brands Table
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create the clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  industry TEXT,
  company_address TEXT,
  contact_person TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'lead', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Indexes for fast lookups (used by the picker)
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients(lower(name));
CREATE INDEX IF NOT EXISTS idx_clients_brand_name ON public.clients(lower(brand_name));

-- 3. Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 4. Public read for picker / display lookups
DROP POLICY IF EXISTS "Allow read on clients" ON public.clients;
CREATE POLICY "Allow read on clients"
  ON public.clients FOR SELECT USING (true);

-- 5. Authenticated write
DROP POLICY IF EXISTS "Allow authenticated write on clients" ON public.clients;
CREATE POLICY "Allow authenticated write on clients"
  ON public.clients FOR ALL USING (true) WITH CHECK (true);

-- 6. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.clients_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_updated_at_trigger ON public.clients;
CREATE TRIGGER clients_updated_at_trigger
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_set_updated_at();

-- ============================================
-- Bank Statement Upload (for Financial Audit)
-- ============================================

CREATE TABLE IF NOT EXISTS public.finance_bank_statements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  period_start DATE,
  period_end DATE,
  total_credit NUMERIC(14,2) DEFAULT 0,
  total_debit NUMERIC(14,2) DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.finance_bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id UUID REFERENCES public.finance_bank_statements(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  txn_type TEXT CHECK (txn_type IN ('credit', 'debit')),
  category TEXT,                       -- auto-classified: revenue, expense, payroll, transfer, etc.
  matched_invoice_id UUID REFERENCES public.finance_invoices(id) ON DELETE SET NULL,
  matched_expenditure_id UUID REFERENCES public.finance_expenditures(id) ON DELETE SET NULL,
  reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_txns_statement ON public.finance_bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_txns_date ON public.finance_bank_transactions(txn_date);

ALTER TABLE public.finance_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read on bank_statements" ON public.finance_bank_statements;
CREATE POLICY "Allow read on bank_statements"
  ON public.finance_bank_statements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write on bank_statements" ON public.finance_bank_statements;
CREATE POLICY "Allow write on bank_statements"
  ON public.finance_bank_statements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read on bank_transactions" ON public.finance_bank_transactions;
CREATE POLICY "Allow read on bank_transactions"
  ON public.finance_bank_transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write on bank_transactions" ON public.finance_bank_transactions;
CREATE POLICY "Allow write on bank_transactions"
  ON public.finance_bank_transactions FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for raw bank statement files
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated upload to bank-statements" ON storage.objects;
CREATE POLICY "Allow authenticated upload to bank-statements"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bank-statements');

DROP POLICY IF EXISTS "Allow authenticated read on bank-statements" ON storage.objects;
CREATE POLICY "Allow authenticated read on bank-statements"
  ON storage.objects FOR SELECT USING (bucket_id = 'bank-statements');
