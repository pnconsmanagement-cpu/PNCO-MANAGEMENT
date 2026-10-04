-- ========================================================================
-- CÔNG TY TNHH TƯ VẤN THIẾT KẾ VÀ XÂY DỰNG PHÚC NGUYÊN (PNCONS)
-- HỆ THỐNG QUẢN LÝ CHẤM CÔNG, TÍNH LƯƠNG & BÁO CÁO TÀI CHÍNH
-- SUPABASE DATABASE INITIALIZATION SCRIPT (FULL DDL SCHEMA)
-- Hướng dẫn: Đăng nhập Supabase Dashboard -> SQL Editor -> Dán toàn bộ file này -> Nhấn RUN
-- ========================================================================

-- 1. BẢNG THÔNG TIN CÔNG TY PHÚC NGUYÊN (Company Config)
CREATE TABLE IF NOT EXISTS public.company_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'CÔNG TY TNHH XÂY DỰNG- CƠ ĐIỆN PHÚC NGUYÊN',
  address TEXT DEFAULT '226/22/18 Đường Số 8, KP3, Linh Xuân, Tp. Hồ Chí Minh',
  tax_code TEXT DEFAULT '0315486790',
  phone TEXT DEFAULT '(028) 3896 1234',
  email TEXT DEFAULT 'pncons.management@gmail.com',
  director_name TEXT DEFAULT 'Nguyễn Văn Phúc',
  bank_account TEXT DEFAULT '1903456789012',
  bank_name TEXT DEFAULT 'Techcombank - CN Linh Trung',
  period TEXT DEFAULT 'Kỳ lương tháng 09 năm 2026',
  period_code TEXT DEFAULT '09/2026',
  payment_date TEXT DEFAULT '05/10/2026',
  standard_work_days NUMERIC DEFAULT 26,
  form_number TEXT DEFAULT 'Mẫu số: 02-LĐTL',
  zalo_oa JSONB DEFAULT '{}'::jsonb,
  config_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. BẢNG NHÂN VIÊN CHÍNH THỨC (Sheet: employees / permanent_employees)
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  title TEXT,
  department TEXT,
  phone TEXT,
  email TEXT,
  tax_code TEXT,
  id_card TEXT,
  bank_account TEXT,
  bank_name TEXT,
  join_date TEXT,
  status TEXT DEFAULT 'ACTIVE',
  contract_type TEXT,
  contract_duration TEXT,
  contract_start_date TEXT,
  contract_end_date TEXT,
  contract_number TEXT,
  salary_type TEXT DEFAULT 'MONTHLY',
  base_salary NUMERIC DEFAULT 0,
  daily_rate NUMERIC DEFAULT 0,
  insurance_salary NUMERIC DEFAULT 0,
  standard_work_days NUMERIC DEFAULT 26,
  actual_work_days NUMERIC DEFAULT 0,
  paid_leave_days NUMERIC DEFAULT 0,
  unpaid_leave_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  responsibility_allowance NUMERIC DEFAULT 0,
  project_allowance NUMERIC DEFAULT 0,
  meal_allowance NUMERIC DEFAULT 0,
  phone_travel_allowance NUMERIC DEFAULT 0,
  kpi_bonus NUMERIC DEFAULT 0,
  total_income NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  total_insurance NUMERIC DEFAULT 0,
  union_fee NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  period_code TEXT DEFAULT '09/2026',
  sort_order INTEGER DEFAULT 0,
  employee_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. BẢNG CÔNG NHÂN KỸ THUẬT & NHÂN LỰC THỜI VỤ (Sheet: seasonal_workers)
CREATE TABLE IF NOT EXISTS public.seasonal_workers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trade TEXT,
  skill_level TEXT,
  project TEXT,
  team_name TEXT,
  team_leader TEXT,
  phone TEXT,
  id_card TEXT,
  bank_account TEXT,
  bank_name TEXT,
  payment_method TEXT DEFAULT 'BANK',
  daily_rate NUMERIC DEFAULT 0,
  actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  meal_allowance NUMERIC DEFAULT 0,
  travel_safety_allowance NUMERIC DEFAULT 0,
  other_bonus NUMERIC DEFAULT 0,
  total_income NUMERIC DEFAULT 0,
  has_tax_commitment BOOLEAN DEFAULT TRUE,
  personal_income_tax NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  payroll_cycle_type TEXT DEFAULT '1_WEEK',
  period_code TEXT DEFAULT '09/2026',
  sort_order INTEGER DEFAULT 0,
  worker_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. BẢNG NHÂN VIÊN TỔ ĐỘI THI CÔNG (Sheet: team_workers)
CREATE TABLE IF NOT EXISTS public.team_workers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  leader_name TEXT NOT NULL,
  phone TEXT,
  id_card TEXT,
  bank_account TEXT,
  bank_name TEXT,
  project TEXT,
  worker_count INTEGER DEFAULT 1,
  payment_method TEXT DEFAULT 'BANK',
  rate_type TEXT DEFAULT 'DAILY',
  unit_rate NUMERIC DEFAULT 0,
  actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  salary_by_days NUMERIC DEFAULT 0,
  meal_allowance NUMERIC DEFAULT 0,
  other_bonus NUMERIC DEFAULT 0,
  total_income NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  period_key TEXT DEFAULT '09/2026',
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  team_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. BẢNG DANH SÁCH DỰ ÁN & CÔNG TRÌNH (Sheet: projects)
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  investor TEXT,
  contract_value NUMERIC DEFAULT 0,
  labor_budget NUMERIC DEFAULT 0,
  actual_labor_cost NUMERIC DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  manager_name TEXT,
  status TEXT DEFAULT 'IN_PROGRESS',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. BẢNG BẢN LƯƠNG ỨNG / TẠM ỨNG LƯƠNG (Sheet: salary_advances)
CREATE TABLE IF NOT EXISTS public.salary_advances (
  id TEXT PRIMARY KEY,
  advance_code TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL DEFAULT 'PERMANENT', -- 'PERMANENT', 'SEASONAL', 'TEAM'
  worker_id TEXT NOT NULL,
  worker_code TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_or_project TEXT,
  amount NUMERIC DEFAULT 0,
  request_date TEXT NOT NULL,
  payment_date TEXT,
  reason TEXT,
  payment_method TEXT DEFAULT 'BANK',
  status TEXT DEFAULT 'APPROVED', -- 'PENDING', 'APPROVED', 'DEDUCTED', 'REJECTED'
  approved_by TEXT,
  period_key TEXT NOT NULL DEFAULT '09/2026',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. BẢNG BẢN CHẤM CÔNG CHI TIẾT (Sheet: attendance_records)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY,
  worker_type TEXT NOT NULL DEFAULT 'PERMANENT', -- 'PERMANENT', 'SEASONAL', 'TEAM'
  worker_code TEXT NOT NULL,
  worker_name TEXT,
  project_code TEXT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  period_key TEXT,
  total_work_days NUMERIC DEFAULT 0,
  total_ot_hours NUMERIC DEFAULT 0,
  attendance_data JSONB DEFAULT '{}'::jsonb, -- Dữ liệu 31 ngày chi tiết (workUnits, statusType, shiftType, location, note)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_worker_month_year UNIQUE (worker_code, month, year, period_key)
);

-- TẠO CÁC CHỈ MỤC (INDEXES) TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_employees_code ON public.employees(code);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON public.employees(department);
CREATE INDEX IF NOT EXISTS idx_seasonal_code ON public.seasonal_workers(code);
CREATE INDEX IF NOT EXISTS idx_seasonal_project ON public.seasonal_workers(project);
CREATE INDEX IF NOT EXISTS idx_team_code ON public.team_workers(code);
CREATE INDEX IF NOT EXISTS idx_team_project ON public.team_workers(project);
CREATE INDEX IF NOT EXISTS idx_projects_code ON public.projects(code);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_advances_worker ON public.salary_advances(worker_code);
CREATE INDEX IF NOT EXISTS idx_advances_period ON public.salary_advances(period_key);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON public.attendance_records(worker_code, month, year);

-- KÍCH HOẠT ROW LEVEL SECURITY (RLS) VÀ CHÍNH SÁCH TRUY CẬP (ANON ACCESS)
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Tạo Policies cấp quyền SELECT / INSERT / UPDATE / DELETE cho Anon Key
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['company_config', 'employees', 'seasonal_workers', 'team_workers', 'projects', 'salary_advances', 'attendance_records'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public access to %I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Public access to %I" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END
$$;
