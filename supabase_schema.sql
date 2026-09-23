-- ========================================================================
-- PNCONS M&E - HỆ THỐNG QUẢN LÝ CHẤM CÔNG & TÍNH LƯƠNG
-- SUPABASE DATABASE INITIALIZATION SCRIPT (SQL DDL)
-- Hướng dẫn: Copy toàn bộ nội dung file này và chạy trong SQL Editor của Supabase
-- ========================================================================

-- 1. Bảng Cấu hình Công ty (Company Config)
CREATE TABLE IF NOT EXISTS public.company_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN',
  address TEXT,
  tax_code TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  period TEXT,
  period_code TEXT,
  payment_date TEXT,
  standard_work_days NUMERIC DEFAULT 26,
  zalo_oa JSONB DEFAULT '{}'::jsonb,
  config_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Bảng Nhân viên chính thức (Employees)
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  position TEXT,
  phone TEXT,
  email TEXT,
  tax_code TEXT,
  id_card TEXT,
  bank_account TEXT,
  bank_name TEXT,
  join_date TEXT,
  status TEXT DEFAULT 'ACTIVE',
  base_salary NUMERIC DEFAULT 0,
  insurance_salary NUMERIC DEFAULT 0,
  standard_work_days NUMERIC DEFAULT 26,
  actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  period_code TEXT DEFAULT '09/2026',
  employee_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Bảng Công nhân kỹ thuật & Thời vụ công trình (Seasonal Workers)
CREATE TABLE IF NOT EXISTS public.seasonal_workers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  trade TEXT,
  skill_level TEXT,
  project TEXT,
  team TEXT,
  phone TEXT,
  id_card TEXT,
  bank_account TEXT,
  bank_name TEXT,
  daily_rate NUMERIC DEFAULT 0,
  actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  has_tax_commitment BOOLEAN DEFAULT TRUE,
  payment_method TEXT DEFAULT 'BANK',
  payroll_cycle_type TEXT DEFAULT '1_WEEK',
  status TEXT DEFAULT 'ACTIVE',
  net_salary NUMERIC DEFAULT 0,
  period_code TEXT DEFAULT '09/2026',
  worker_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- TẠO CHỈ MỤC (INDEXES) TỐI ƯU HIỆU SUẤT TÌM KIẾM
CREATE INDEX IF NOT EXISTS idx_employees_code ON public.employees(code);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_period ON public.employees(period_code);

CREATE INDEX IF NOT EXISTS idx_seasonal_code ON public.seasonal_workers(code);
CREATE INDEX IF NOT EXISTS idx_seasonal_project ON public.seasonal_workers(project);
CREATE INDEX IF NOT EXISTS idx_seasonal_period ON public.seasonal_workers(period_code);

-- CẤU HÌNH BẢO MẬT ROW LEVEL SECURITY (RLS)
-- Cho phép ứng dụng Frontend truy xuất và đồng bộ dữ liệu qua Supabase Anon Key
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_workers ENABLE ROW LEVEL SECURITY;

-- Tạo policies cho phép SELECT / INSERT / UPDATE / DELETE với anon key
DROP POLICY IF EXISTS "Public access to company_config" ON public.company_config;
CREATE POLICY "Public access to company_config"
  ON public.company_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to employees" ON public.employees;
CREATE POLICY "Public access to employees"
  ON public.employees
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to seasonal_workers" ON public.seasonal_workers;
CREATE POLICY "Public access to seasonal_workers"
  ON public.seasonal_workers
  FOR ALL
  USING (true)
  WITH CHECK (true);
