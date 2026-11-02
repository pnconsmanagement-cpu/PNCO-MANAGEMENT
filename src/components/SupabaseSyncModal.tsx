import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  FileCode,
  X,
  ExternalLink,
  Copy,
  Check,
  Key,
  Globe,
  Trash2,
  Sparkles,
  Server,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  clearSupabaseConfig,
  checkSupabaseConnection,
  syncAllDataToSupabase,
  loadCompanyConfigFromSupabase,
  loadEmployeesFromSupabase,
  loadSeasonalWorkersFromSupabase,
  fetchTeamWorkersFromSupabase,
  fetchProjectsFromSupabase,
  fetchSalaryAdvancesFromSupabase,
  getLastSyncedTime,
  getShareableConfigUrl,
  ConnectionHealth,
  FullSyncResult,
} from '../services/supabaseService';
import {
  CompanyConfig,
  Employee,
  SeasonalWorker,
  TeamWorker,
  Project,
  SalaryAdvance,
  PayrollRecord,
  AttendanceRecord,
} from '../types';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CompanyConfig;
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  projects?: Project[];
  salaryAdvances?: SalaryAdvance[];
  onDataLoadedFromCloud?: (data: {
    config?: CompanyConfig;
    employees?: Employee[];
    seasonalWorkers?: SeasonalWorker[];
    teamWorkers?: TeamWorker[];
    projects?: Project[];
    salaryAdvances?: SalaryAdvance[];
  }) => void;
  onSyncSuccess?: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  employees,
  seasonalWorkers,
  teamWorkers = [],
  projects = [],
  salaryAdvances = [],
  onDataLoadedFromCloud,
  onSyncSuccess,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [healthResult, setHealthResult] = useState<ConnectionHealth | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<FullSyncResult | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);

  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const { url, anonKey } = getSupabaseConfig();
      setUrlInput(url);
      setKeyInput(anonKey);
      setIsConfigured(isSupabaseConfigured());
      setLastSynced(getLastSyncedTime());

      if (url && anonKey) {
        handleRunCheck(url, anonKey);
      }
    }
  }, [isOpen]);

  const handleRunCheck = async (testUrl?: string, testKey?: string) => {
    setIsTesting(true);
    setSaveSuccessMsg(null);
    const health = await checkSupabaseConnection(testUrl || urlInput, testKey || keyInput);
    setHealthResult(health);
    setIsTesting(false);
    return health;
  };

  /**
   * Lưu cấu hình, kiểm tra kết nối và TỰ ĐỘNG ĐỒNG BỘ DỮ LIỆU NGAY LẬP TỨC
   */
  const handleSaveAndSyncNow = async () => {
    const rawUrl = urlInput.trim().replace(/\/+$/, '');
    const rawKey = keyInput.trim();

    if (!rawUrl || !rawKey) {
      setHealthResult({
        connected: false,
        message: 'Vui lòng điền đầy đủ cả Supabase Project URL và Anon Public Key.',
        url: rawUrl,
        tables: {
          company_config: { exists: false, count: 0 },
          employees: { exists: false, count: 0 },
          seasonal_workers: { exists: false, count: 0 },
        },
        missingTables: [],
      });
      return;
    }

    if (!rawUrl.startsWith('https://')) {
      alert('Supabase Project URL phải bắt đầu bằng https:// (Ví dụ: https://xfoanlqycihmoxyweyqr.supabase.co)');
      return;
    }

    setSupabaseConfig(rawUrl, rawKey);
    setIsConfigured(true);
    setUrlInput(rawUrl);

    setIsTesting(true);
    setSaveSuccessMsg('Đang kiểm tra kết nối tới cơ sở dữ liệu Supabase...');

    const health = await checkSupabaseConnection(rawUrl, rawKey);
    setHealthResult(health);
    setIsTesting(false);

    if (health.connected) {
      // Tự động đẩy toàn bộ dữ liệu lên Cloud luôn!
      setIsSyncing(true);
      setSaveSuccessMsg('Kết nối thành công! Đang tự động đồng bộ toàn bộ dữ liệu lên Supabase...');

      try {
        const report = await syncAllDataToSupabase(
          config,
          employees,
          seasonalWorkers,
          teamWorkers,
          projects,
          salaryAdvances
        );
        setSyncReport(report);
        setLastSynced(getLastSyncedTime());

        if (report.success) {
          setSaveSuccessMsg(`Đã đồng bộ 100% lên Supabase Cloud (${report.employees.count} NV • ${report.seasonalWorkers.count} Thợ • ${teamWorkers.length} Tổ đội • ${projects.length} Dự án)!`);
          if (onSyncSuccess) onSyncSuccess();
        } else {
          setSaveSuccessMsg('Có bảng chưa đồng bộ hoàn tất, vui lòng xem chi tiết bên dưới.');
        }
      } catch (err: any) {
        setSaveSuccessMsg(`Lỗi khi đẩy dữ liệu: ${err.message || String(err)}`);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setSaveSuccessMsg(null);
    }
  };

  /**
   * Đẩy dữ liệu hiện tại lên Cloud thủ công
   */
  const handlePushCurrentData = async () => {
    setIsSyncing(true);
    setSaveSuccessMsg(null);
    try {
      // Tạo danh sách bản ghi bảng lương đồng bộ lên payroll_records
      const payrollPayload: PayrollRecord[] = [
        ...employees.map((e) => ({
          id: `PR-EMP-${config.periodCode.replace('/', '_')}-${e.code}`,
          periodType: 'MONTH' as const,
          periodCode: config.periodCode,
          workerType: 'PERMANENT' as const,
          workerId: e.id,
          workerCode: e.code,
          workerName: e.fullName,
          departmentOrProject: e.department,
          standardWorkDays: e.standardWorkDays || 26,
          actualWorkDays: e.actualWorkDays || 0,
          baseSalaryOrRate: e.baseSalary || 0,
          salaryByDays: e.salaryByActualDays || 0,
          overtimeHours: e.overtimeHours || 0,
          overtimePay: e.overtimePay || 0,
          allowances: (e.responsibilityAllowance || 0) + (e.projectAllowance || 0) + (e.mealAllowance || 0) + (e.phoneTravelAllowance || 0),
          bonuses: e.kpiBonus || 0,
          totalIncome: e.totalIncome || 0,
          insuranceDeduction: e.totalInsurance || 0,
          taxDeduction: e.personalIncomeTax || 0,
          advancePayment: e.advancePayment || 0,
          totalDeductions: e.totalDeductions || 0,
          netSalary: e.netSalary || 0,
          bankAccount: e.bankAccount,
          bankName: e.bankName,
        })),
        ...seasonalWorkers.map((w) => ({
          id: `PR-SEA-${config.periodCode.replace('/', '_')}-${w.code}`,
          periodType: 'MONTH' as const,
          periodCode: config.periodCode,
          workerType: 'SEASONAL' as const,
          workerId: w.id,
          workerCode: w.code,
          workerName: w.fullName,
          departmentOrProject: w.project || w.trade,
          standardWorkDays: 26,
          actualWorkDays: w.actualWorkDays || 0,
          baseSalaryOrRate: w.dailyRate || 0,
          salaryByDays: w.salaryByDays || 0,
          overtimeHours: w.overtimeHours || 0,
          overtimePay: w.overtimePay || 0,
          allowances: (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0),
          bonuses: w.otherBonus || 0,
          totalIncome: w.totalIncome || 0,
          taxDeduction: w.personalIncomeTax || 0,
          advancePayment: w.advancePayment || 0,
          totalDeductions: w.totalDeductions || 0,
          netSalary: w.netSalary || 0,
          bankAccount: w.bankAccount,
          bankName: w.bankName,
        })),
        ...teamWorkers.map((t) => ({
          id: `PR-TEAM-${config.periodCode.replace('/', '_')}-${t.code}`,
          periodType: 'MONTH' as const,
          periodCode: config.periodCode,
          workerType: 'TEAM' as const,
          workerId: t.id,
          workerCode: t.code,
          workerName: t.teamName,
          departmentOrProject: t.project || 'Công trình',
          actualWorkDays: t.actualWorkDays || 0,
          baseSalaryOrRate: t.unitRate || 0,
          salaryByDays: t.salaryByDays || 0,
          overtimeHours: t.overtimeHours || 0,
          overtimePay: t.overtimePay || 0,
          allowances: t.mealAllowance || 0,
          bonuses: t.otherBonus || 0,
          totalIncome: t.totalIncome || 0,
          advancePayment: t.advancePayment || 0,
          totalDeductions: t.totalDeductions || 0,
          netSalary: t.netSalary || 0,
          bankAccount: t.bankAccount,
          bankName: t.bankName,
        })),
      ];

      // Tạo danh sách bản ghi chấm công đồng bộ lên attendance_records
      const attendancePayload: AttendanceRecord[] = [
        ...employees.map((e) => ({
          id: `ATT-EMP-${config.year}-${config.month}-${e.code}`,
          workerType: 'PERMANENT' as const,
          workerCode: e.code,
          workerName: e.fullName,
          projectCode: e.department,
          month: config.month || 9,
          year: config.year || 2026,
          periodKey: config.periodCode,
          totalWorkDays: e.actualWorkDays || 0,
          totalOtHours: e.overtimeHours || 0,
          attendanceData: e.monthlyAttendance || {},
        })),
        ...seasonalWorkers.map((w) => ({
          id: `ATT-SEA-${config.year}-${config.month}-${w.code}`,
          workerType: 'SEASONAL' as const,
          workerCode: w.code,
          workerName: w.fullName,
          projectCode: w.project,
          month: config.month || 9,
          year: config.year || 2026,
          periodKey: config.periodCode,
          totalWorkDays: w.actualWorkDays || 0,
          totalOtHours: w.overtimeHours || 0,
          attendanceData: w.dailyAttendance || {},
        })),
        ...teamWorkers.map((t) => ({
          id: `ATT-TEAM-${config.year}-${config.month}-${t.code}`,
          workerType: 'TEAM' as const,
          workerCode: t.code,
          workerName: t.teamName,
          projectCode: t.project,
          month: config.month || 9,
          year: config.year || 2026,
          periodKey: config.periodCode,
          totalWorkDays: t.actualWorkDays || 0,
          totalOtHours: t.overtimeHours || 0,
          attendanceData: t.monthlyAttendance || {},
        })),
      ];

      const report = await syncAllDataToSupabase(
        config,
        employees,
        seasonalWorkers,
        teamWorkers,
        projects,
        salaryAdvances,
        payrollPayload,
        attendancePayload
      );
      setSyncReport(report);
      setLastSynced(getLastSyncedTime());

      // Cập nhật lại số đếm trong health cho cả 8 bảng
      if (healthResult) {
        setHealthResult({
          ...healthResult,
          tables: {
            company_config: { exists: true, count: 1 },
            employees: { exists: true, count: employees.length },
            seasonal_workers: { exists: true, count: seasonalWorkers.length },
            team_workers: { exists: true, count: teamWorkers.length },
            projects: { exists: true, count: projects.length },
            payroll_records: { exists: true, count: payrollPayload.length },
            salary_advances: { exists: true, count: salaryAdvances.length },
            attendance_records: { exists: true, count: attendancePayload.length },
          },
        });
      }

      if (onSyncSuccess) onSyncSuccess();
    } catch (e: any) {
      alert(`Lỗi khi đẩy dữ liệu: ${e.message || String(e)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Kéo dữ liệu từ Cloud về
   */
  const handleLoadFromCloud = async () => {
    setIsSyncing(true);
    setLoadStatus('Đang kéo toàn bộ dữ liệu từ Supabase Cloud về máy...');

    try {
      const [cloudCfg, cloudEmp, cloudSea, cloudTeam, cloudProj, cloudAdv] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(config.periodCode),
        loadSeasonalWorkersFromSupabase(config.periodCode),
        fetchTeamWorkersFromSupabase(config.periodCode),
        fetchProjectsFromSupabase(),
        fetchSalaryAdvancesFromSupabase(config.periodCode),
      ]);

      if (onDataLoadedFromCloud) {
        onDataLoadedFromCloud({
          config: cloudCfg || undefined,
          employees: cloudEmp || undefined,
          seasonalWorkers: cloudSea || undefined,
          teamWorkers: cloudTeam || undefined,
          projects: cloudProj || undefined,
          salaryAdvances: cloudAdv || undefined,
        });
      }

      setLoadStatus(
        `Nạp thành công: ${cloudEmp?.length || 0} nhân sự chính thức, ${
          cloudSea?.length || 0
        } công nhân thời vụ, ${cloudTeam?.length || 0} tổ đội, ${cloudProj?.length || 0} dự án!`
      );
    } catch (e: any) {
      setLoadStatus(`Lỗi khi nạp dữ liệu: ${e.message || String(e)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClear = () => {
    if (window.confirm('Bạn có chắc muốn xóa cấu hình Supabase? Ứng dụng sẽ trở về dùng LocalStorage trên máy tính này.')) {
      clearSupabaseConfig();
      setUrlInput('');
      setKeyInput('');
      setIsConfigured(false);
      setHealthResult(null);
      setSyncReport(null);
      setSaveSuccessMsg('Đã hủy cấu hình Supabase. Hệ thống đang dùng lưu trữ cục bộ.');
    }
  };

  const copySqlSchema = () => {
    const sqlContent = `-- ========================================================================
-- CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN (PNCONS)
-- HỆ THỐNG SUPABASE SCHEMA TOÀN DIỆN CHO 8 BẢNG / SHEETS RIÊNG BIỆT
-- 1. company_config   : Cấu hình thông tin công ty Phúc Nguyên
-- 2. employees        : Danh sách nhân viên chính thức
-- 3. seasonal_workers : Danh sách nhân lực thời vụ
-- 4. team_workers     : Danh sách nhân viên tổ đội
-- 5. projects         : Danh sách dự án & công trình
-- 6. payroll_records  : Bản lương đa chu kỳ (Tuần, Tháng, Quý, Năm)
-- 7. salary_advances  : Bản lương ứng theo nhân viên
-- 8. attendance_records: Bản chấm công chi tiết 3 khối nhân sự
-- ========================================================================

-- 1. BẢNG THÔNG TIN CÔNG TY PHÚC NGUYÊN
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

-- 2. BẢNG NHÂN VIÊN CHÍNH THỨC
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
  salary_type TEXT DEFAULT 'MONTHLY',
  base_salary NUMERIC DEFAULT 0,
  insurance_salary NUMERIC DEFAULT 0,
  standard_work_days NUMERIC DEFAULT 26,
  actual_work_days NUMERIC DEFAULT 0,
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

-- 3. BẢNG NHÂN LỰC THỜI VỤ
CREATE TABLE IF NOT EXISTS public.seasonal_workers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trade TEXT,
  skill_level TEXT,
  project TEXT,
  team_name TEXT,
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
  advance_payment NUMERIC DEFAULT 0,
  personal_income_tax NUMERIC DEFAULT 0,
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

-- 4. BẢNG NHÂN VIÊN TỔ ĐỘI
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

-- 5. BẢNG DANH SÁCH DỰ ÁN
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

-- 6. BẢNG BẢN LƯƠNG ĐA CHU KỲ (Tuần, Tháng, Quý, Năm)
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL DEFAULT 'MONTH',
  period_code TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'PERMANENT',
  worker_id TEXT NOT NULL,
  worker_code TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_or_project TEXT,
  standard_work_days NUMERIC DEFAULT 26,
  actual_work_days NUMERIC DEFAULT 0,
  base_salary_or_rate NUMERIC DEFAULT 0,
  salary_by_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  allowances NUMERIC DEFAULT 0,
  bonuses NUMERIC DEFAULT 0,
  total_income NUMERIC DEFAULT 0,
  insurance_deduction NUMERIC DEFAULT 0,
  tax_deduction NUMERIC DEFAULT 0,
  advance_payment NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'BANK',
  bank_account TEXT,
  bank_name TEXT,
  payment_status TEXT DEFAULT 'PENDING',
  notes TEXT,
  payroll_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. BẢNG BẢN LƯƠNG ỨNG / TẠM ỨNG
CREATE TABLE IF NOT EXISTS public.salary_advances (
  id TEXT PRIMARY KEY,
  advance_code TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL DEFAULT 'PERMANENT',
  worker_id TEXT NOT NULL,
  worker_code TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_or_project TEXT,
  amount NUMERIC DEFAULT 0,
  request_date TEXT NOT NULL,
  payment_date TEXT,
  reason TEXT,
  payment_method TEXT DEFAULT 'BANK',
  status TEXT DEFAULT 'APPROVED',
  approved_by TEXT,
  period_key TEXT NOT NULL DEFAULT '09/2026',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. BẢNG BẢN CHẤM CÔNG CHI TIẾT
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY,
  worker_type TEXT NOT NULL DEFAULT 'PERMANENT',
  worker_code TEXT NOT NULL,
  worker_name TEXT,
  project_code TEXT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  period_key TEXT,
  total_work_days NUMERIC DEFAULT 0,
  total_ot_hours NUMERIC DEFAULT 0,
  attendance_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_worker_month_year UNIQUE (worker_code, month, year, period_key)
);

-- KÍCH HOẠT ROW LEVEL SECURITY (RLS) VÀ CHÍNH SÁCH TRUY CẬP
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['company_config', 'employees', 'seasonal_workers', 'team_workers', 'projects', 'payroll_records', 'salary_advances', 'attendance_records'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public access to %I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Public access to %I" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END
$$;`;

    navigator.clipboard.writeText(sqlContent);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs no-print">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#09233b] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#13375c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  Cấu Hình Kết Nối Supabase Cloud
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    healthResult?.connected
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  }`}
                >
                  {healthResult?.connected ? 'Online Cloud' : 'Chưa kết nối'}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Lưu trữ dữ liệu thời gian thực & Chuẩn bị biến môi trường cho Vercel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
          {/* Form Nhập Thông Tin Kết Nối */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Nhập thông tin dự án Supabase của bạn</span>
              </label>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
              >
                <span>Mở Supabase Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* 1. Supabase URL Input */}
            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Supabase Project URL (VITE_SUPABASE_URL)</span>
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://xfoanlqycihmoxyweyqr.supabase.co"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
              <p className="text-[11px] text-slate-600 mt-1">
                Lấy tại: Supabase &rarr; <strong>Project Settings</strong> &rarr; <strong>API</strong> &rarr; mục <strong>Project URL</strong>
              </p>
            </div>

            {/* 2. Supabase Anon Key Input */}
            <div>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>2. Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY)</span>
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
              <p className="text-[11px] text-slate-600 mt-1">
                Lấy tại: Supabase &rarr; <strong>Project Settings</strong> &rarr; <strong>API</strong> &rarr; mục <strong>Project API Keys (anon public)</strong>
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveAndSyncNow}
                disabled={isTesting || isSyncing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isTesting || isSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>
                  {isSyncing
                    ? 'Đang đồng bộ dữ liệu...'
                    : isTesting
                    ? 'Đang kiểm tra...'
                    : 'Lưu & Đồng Bộ Ngay Lập Tức'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleRunCheck()}
                disabled={isTesting || !urlInput}
                className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Kiểm tra lại</span>
              </button>

              {isConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    const shareLink = getShareableConfigUrl();
                    if (shareLink) {
                      navigator.clipboard.writeText(shareLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 4000);
                    }
                  }}
                  className="px-3 py-2 bg-sky-50 border border-sky-300 hover:bg-sky-100 text-sky-800 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Sao chép đường dẫn chứa cấu hình để dán và mở ngay trên Máy tính thứ 2 hoặc trình duyệt khác (không cần gõ lại URL & Anon Key)"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-sky-600" />}
                  <span>{copiedLink ? 'Đã sao chép link Máy 2!' : 'Sao chép link Máy 2'}</span>
                </button>
              )}

              {isConfigured && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hủy cấu hình</span>
                </button>
              )}
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Chi tiết tình trạng các bảng trên Supabase */}
          {healthResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  <span>Trạng thái 8 bảng dữ liệu trên Supabase Cloud:</span>
                </span>
                <span className="text-[11px] font-bold text-slate-600">
                  {healthResult.connected ? '✅ Đã kết nối Supabase Cloud' : '⚠️ Cần kiểm tra'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {/* 1. company_config */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.company_config.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">1. company_config</span>
                    {healthResult.tables.company_config.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Cấu hình Cty Phúc Nguyên</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.company_config.exists
                      ? `Đang có: ${healthResult.tables.company_config.count} bản ghi`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 2. employees */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.employees.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">2. employees</span>
                    {healthResult.tables.employees.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Nhân viên chính thức</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.employees.exists
                      ? `Đang có: ${healthResult.tables.employees.count} nhân viên`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 3. seasonal_workers */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.seasonal_workers.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">3. seasonal_workers</span>
                    {healthResult.tables.seasonal_workers.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Nhân lực thời vụ</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.seasonal_workers.exists
                      ? `Đang có: ${healthResult.tables.seasonal_workers.count} thợ`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 4. team_workers */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.team_workers.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">4. team_workers</span>
                    {healthResult.tables.team_workers.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Nhân viên tổ đội</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.team_workers.exists
                      ? `Đang có: ${healthResult.tables.team_workers.count} tổ đội`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 5. projects */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.projects.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">5. projects</span>
                    {healthResult.tables.projects.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Danh sách dự án</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.projects.exists
                      ? `Đang có: ${healthResult.tables.projects.count} dự án`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 6. payroll_records */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.payroll_records.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">6. payroll_records</span>
                    {healthResult.tables.payroll_records.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Bảng lương đa chu kỳ</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.payroll_records.exists
                      ? `Đang có: ${healthResult.tables.payroll_records.count} dòng lương`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 7. salary_advances */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.salary_advances.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">7. salary_advances</span>
                    {healthResult.tables.salary_advances.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Bản lương tạm ứng</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.salary_advances.exists
                      ? `Đang có: ${healthResult.tables.salary_advances.count} phiếu ứng`
                      : 'Chưa có bảng'}
                  </div>
                </div>

                {/* 8. attendance_records */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.attendance_records.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">8. attendance_records</span>
                    {healthResult.tables.attendance_records.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Bản chấm công chi tiết</div>
                  <div className="text-[11px] mt-1 font-semibold">
                    {healthResult.tables.attendance_records.exists
                      ? `Đang có: ${healthResult.tables.attendance_records.count} bản chấm công`
                      : 'Chưa có bảng'}
                  </div>
                </div>
              </div>

              {healthResult.missingTables.length > 0 && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-lg text-xs">
                  <strong>Chú ý:</strong> Dự án Supabase của bạn đang thiếu các bảng: [
                  <strong>{healthResult.missingTables.join(', ')}</strong>]. Bạn hãy bấm nút{' '}
                  <strong>"Copy toàn bộ mã SQL"</strong> ở bên dưới, sau đó mở SQL Editor trên Supabase dán vào và bấm <strong>Run</strong> để hoàn tất tạo bảng!
                </div>
              )}
            </div>
          )}

          {/* Khu vực Đồng Bộ Dữ Liệu Hai Chiều */}
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sky-950 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-600" />
                <span>Đồng bộ dữ liệu hai chiều (Cloud & Local)</span>
              </div>
              {lastSynced && (
                <span className="text-[11px] text-sky-800 bg-sky-100 px-2 py-0.5 rounded font-medium">
                  Đồng bộ lần cuối: {lastSynced}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handlePushCurrentData}
                disabled={isSyncing || !healthResult?.connected}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  Đẩy dữ liệu hiện tại lên Supabase (Toàn bộ 8 bảng: NV, Thời vụ, Tổ đội, Dự án, Lương, Tạm ứng, Chấm công)
                </span>
              </button>

              <button
                onClick={handleLoadFromCloud}
                disabled={isSyncing || !healthResult?.connected}
                className="px-3.5 py-2.5 bg-white border border-sky-300 text-sky-800 hover:bg-sky-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Tải dữ liệu từ Supabase về máy</span>
              </button>
            </div>

            {/* Báo cáo kết quả đồng bộ chi tiết */}
            {syncReport && (
              <div className="mt-3 p-3 bg-white border border-sky-300 rounded-lg text-xs space-y-1.5">
                <div className="font-bold text-sky-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Kết quả đồng bộ lúc {syncReport.timestamp}:</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-slate-700 text-[11px] pt-1">
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>1. Thông tin Cty Phúc Nguyên:</span>
                    <strong>{syncReport.companyConfig.ok ? '✅ Thành công' : `❌ ${syncReport.companyConfig.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>2. Nhân viên chính thức:</span>
                    <strong>{syncReport.employees.ok ? `✅ Thành công (${syncReport.employees.count} NV)` : `❌ ${syncReport.employees.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>3. Nhân lực thời vụ:</span>
                    <strong>{syncReport.seasonalWorkers.ok ? `✅ Thành công (${syncReport.seasonalWorkers.count} thợ)` : `❌ ${syncReport.seasonalWorkers.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>4. Nhân viên tổ đội:</span>
                    <strong>{syncReport.teamWorkers?.ok ? `✅ Thành công (${syncReport.teamWorkers.count} tổ)` : `❌ ${syncReport.teamWorkers?.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>5. Danh sách dự án:</span>
                    <strong>{syncReport.projects?.ok ? `✅ Thành công (${syncReport.projects.count} DA)` : `❌ ${syncReport.projects?.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>6. Bản lương 4 chu kỳ:</span>
                    <strong>{syncReport.payrollRecords?.ok ? `✅ Thành công (${syncReport.payrollRecords.count} dòng)` : `❌ ${syncReport.payrollRecords?.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>7. Bản lương tạm ứng:</span>
                    <strong>{syncReport.salaryAdvances?.ok ? `✅ Thành công (${syncReport.salaryAdvances.count} phiếu)` : `❌ ${syncReport.salaryAdvances?.error}`}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-0.5">
                    <span>8. Bản chấm công chi tiết:</span>
                    <strong>{syncReport.attendanceRecords?.ok ? `✅ Thành công (${syncReport.attendanceRecords.count} bảng)` : `❌ ${syncReport.attendanceRecords?.error}`}</strong>
                  </div>
                </div>
              </div>
            )}

            {loadStatus && (
              <div className="p-2.5 bg-white border border-sky-200 rounded text-xs text-sky-900 font-semibold">
                {loadStatus}
              </div>
            )}
          </div>

          {/* Copy SQL Schema Box */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <FileCode className="w-4 h-4" />
                <span>Mã SQL Tạo Bảng & Phân Quyền (Chạy trên Supabase)</span>
              </div>
              <button
                type="button"
                onClick={copySqlSchema}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã Copy Toàn Bộ Mã SQL!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy toàn bộ mã SQL</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Nếu bảng chưa tạo hoặc có lỗi phân quyền: Bấm nút <strong>"Copy toàn bộ mã SQL"</strong> ở trên &rarr; Mở Supabase &rarr; Chọn <strong>SQL Editor</strong> &rarr; Dán vào và bấm <strong>Run</strong>. Toàn bộ 3 bảng sẽ được tạo chỉ trong 2 giây!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Trạng thái hiện tại:{' '}
            <strong className={healthResult?.connected ? 'text-emerald-700' : 'text-slate-700'}>
              {healthResult?.connected
                ? 'Đã kết nối Supabase Cloud (Online)'
                : 'Chạy Offline / LocalStorage'}
            </strong>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
