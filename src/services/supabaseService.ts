import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyConfig, Employee, SeasonalWorker, TeamWorker, Project, SalaryAdvance } from '../types';

const env = (import.meta as any).env || {};

/**
 * Tự động phát hiện và áp dụng cấu hình Supabase từ URL hash (#sb_url=...&sb_key=...)
 * Giúp người dùng chia sẻ cấu hình giữa 2 máy tính hoặc 2 trình duyệt chỉ bằng 1 cú click!
 */
export const autoApplyUrlConfig = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const hash = window.location.hash;
    const search = window.location.search;
    let url = '';
    let key = '';

    if (hash && (hash.includes('sb_url=') || hash.includes('supabase_url='))) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      url = hashParams.get('sb_url') || hashParams.get('supabase_url') || '';
      key = hashParams.get('sb_key') || hashParams.get('supabase_key') || '';
    } else if (search && (search.includes('sb_url=') || search.includes('supabase_url='))) {
      const searchParams = new URLSearchParams(search);
      url = searchParams.get('sb_url') || searchParams.get('supabase_url') || '';
      key = searchParams.get('sb_key') || searchParams.get('supabase_key') || '';
    }

    if (url && key && url.startsWith('https://')) {
      const cleanUrl = url.trim().replace(/\/+$/, '');
      const cleanKey = key.trim();
      setSupabaseConfig(cleanUrl, cleanKey);
      
      // Dọn dẹp URL trên thanh địa chỉ mà không reload trang
      const cleanHref = window.location.pathname;
      window.history.replaceState(null, '', cleanHref);
      return true;
    }
  } catch (e) {
    console.warn('Cannot auto-apply Supabase URL config:', e);
  }
  return false;
};

/**
 * Tạo link chia sẻ cấu hình Supabase cho máy tính thứ 2
 */
export const getShareableConfigUrl = (): string | null => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#sb_url=${encodeURIComponent(url)}&sb_key=${encodeURIComponent(anonKey)}`;
};

/**
 * Lấy cấu hình Supabase (ưu tiên LocalStorage, sau đó đến .env)
 * Tự động loại bỏ dấu gạch chéo cuối URL (trailing slash) để tránh lỗi API
 */
export const getSupabaseConfig = (): { url: string; anonKey: string } => {
  const savedUrl = localStorage.getItem('supabase_config_url') || '';
  const savedKey = localStorage.getItem('supabase_config_anon_key') || '';
  const envUrl = env.VITE_SUPABASE_URL || '';
  const envKey = env.VITE_SUPABASE_ANON_KEY || '';

  const rawUrl = (savedUrl || envUrl).trim();
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  const cleanKey = (savedKey || envKey).trim();

  return {
    url: cleanUrl,
    anonKey: cleanKey,
  };
};

/**
 * Lưu thông số Supabase vào LocalStorage
 */
export const setSupabaseConfig = (url: string, anonKey: string): void => {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  localStorage.setItem('supabase_config_url', cleanUrl);
  localStorage.setItem('supabase_config_anon_key', cleanKey);
  cachedClient = null; // Reset cached client
};

/**
 * Xóa cấu hình Supabase
 */
export const clearSupabaseConfig = (): void => {
  localStorage.removeItem('supabase_config_url');
  localStorage.removeItem('supabase_config_anon_key');
  cachedClient = null;
};

/**
 * Kiểm tra xem đã có cấu hình Supabase hợp lệ chưa
 */
export const isSupabaseConfigured = (): boolean => {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url &&
      anonKey &&
      !url.includes('your-project-id') &&
      !anonKey.includes('...') &&
      url.startsWith('https://')
  );
};

let cachedClient: SupabaseClient | null = null;

/**
 * Lấy Supabase Client singleton
 */
export const getSupabaseClient = (overrideUrl?: string, overrideKey?: string): SupabaseClient | null => {
  if (overrideUrl && overrideKey) {
    const cleanUrl = overrideUrl.trim().replace(/\/+$/, '');
    const cleanKey = overrideKey.trim();
    if (cleanUrl.startsWith('https://') && cleanKey) {
      try {
        return createClient(cleanUrl, cleanKey, {
          auth: { persistSession: false },
        });
      } catch (e) {
        console.error('Failed to create override Supabase client:', e);
        return null;
      }
    }
  }

  if (cachedClient) return cachedClient;

  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey && url.startsWith('https://')) {
    try {
      cachedClient = createClient(url, anonKey, {
        auth: { persistSession: false },
      });
      return cachedClient;
    } catch (e) {
      console.error('Failed to create Supabase client:', e);
      return null;
    }
  }
  return null;
};

export interface TableCheckStatus {
  exists: boolean;
  count: number;
  error?: string;
}

export interface ConnectionHealth {
  connected: boolean;
  message: string;
  url: string;
  tables: {
    company_config: TableCheckStatus;
    employees: TableCheckStatus;
    seasonal_workers: TableCheckStatus;
    team_workers?: TableCheckStatus;
    projects?: TableCheckStatus;
    salary_advances?: TableCheckStatus;
    attendance_records?: TableCheckStatus;
  };
  missingTables: string[];
}

/**
 * Kiểm tra toàn diện kết nối tới Supabase và tình trạng của tất cả các bảng
 */
export const checkSupabaseConnection = async (
  overrideUrl?: string,
  overrideKey?: string
): Promise<ConnectionHealth> => {
  const client = getSupabaseClient(overrideUrl, overrideKey);
  const currentUrl = overrideUrl || getSupabaseConfig().url;

  const defaultHealth: ConnectionHealth = {
    connected: false,
    message: 'Chưa có thông tin Supabase URL hoặc Anon Key hợp lệ.',
    url: currentUrl,
    tables: {
      company_config: { exists: false, count: 0 },
      employees: { exists: false, count: 0 },
      seasonal_workers: { exists: false, count: 0 },
      team_workers: { exists: false, count: 0 },
      projects: { exists: false, count: 0 },
      salary_advances: { exists: false, count: 0 },
    },
    missingTables: [],
  };

  if (!client) {
    return defaultHealth;
  }

  const checkTable = async (tableName: string): Promise<TableCheckStatus> => {
    try {
      const { count, error } = await client
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        return {
          exists: false,
          count: 0,
          error: error.message,
        };
      }
      return {
        exists: true,
        count: count || 0,
      };
    } catch (e: any) {
      return {
        exists: false,
        count: 0,
        error: e.message || String(e),
      };
    }
  };

  try {
    const [cfgCheck, empCheck, seaCheck, teamCheck, projCheck, advCheck] = await Promise.all([
      checkTable('company_config'),
      checkTable('employees'),
      checkTable('seasonal_workers'),
      checkTable('team_workers'),
      checkTable('projects'),
      checkTable('salary_advances'),
    ]);

    const missing: string[] = [];
    if (!cfgCheck.exists) missing.push('company_config');
    if (!empCheck.exists) missing.push('employees');
    if (!seaCheck.exists) missing.push('seasonal_workers');
    if (!teamCheck.exists) missing.push('team_workers');
    if (!projCheck.exists) missing.push('projects');
    if (!advCheck.exists) missing.push('salary_advances');

    const coreExist = cfgCheck.exists && empCheck.exists && seaCheck.exists;

    let msg = '';
    if (missing.length === 0) {
      msg = `Kết nối Supabase xuất sắc! Toàn bộ 6 bảng dữ liệu đã sẵn sàng: Cấu hình, NV Chính thức (${empCheck.count}), Thời vụ (${seaCheck.count}), Tổ đội (${teamCheck.count}), Dự án (${projCheck.count}), Tạm ứng (${advCheck.count}).`;
    } else if (coreExist) {
      msg = `Đã kết nối Supabase thành công. Một số bảng phụ [${missing.join(', ')}] chưa được tạo, bạn có thể chạy file supabase_schema.sql trong SQL Editor.`;
    } else {
      msg = `Đã kết nối Supabase nhưng thiếu bảng chính: [${missing.join(', ')}]. Hãy chạy file supabase_schema.sql trong SQL Editor.`;
    }

    return {
      connected: coreExist,
      message: msg,
      url: currentUrl,
      tables: {
        company_config: cfgCheck,
        employees: empCheck,
        seasonal_workers: seaCheck,
        team_workers: teamCheck,
        projects: projCheck,
        salary_advances: advCheck,
      },
      missingTables: missing,
    };
  } catch (err: any) {
    return {
      ...defaultHealth,
      message: `Không thể kết nối đến máy chủ Supabase: ${err.message || String(err)}`,
    };
  }
};

/**
 * Lưu hoặc Cập nhật Cấu hình Công ty lên Supabase
 */
export const syncCompanyConfigToSupabase = async (
  config: CompanyConfig
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Chưa cấu hình Supabase Client.' };
  }

  try {
    const { error } = await client.from('company_config').upsert(
      {
        id: 'default',
        name: config.name || '',
        address: config.address || '',
        tax_code: config.taxCode || '',
        phone: config.phone || '',
        email: (config as any).email || '',
        website: (config as any).website || '',
        period: config.period || '',
        period_code: config.periodCode || '',
        payment_date: config.paymentDate || '',
        standard_work_days: config.standardWorkDays || 26,
        zalo_oa: config.zaloOA || {},
        config_json: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('Sync company_config failed:', error);
      return {
        success: false,
        message: `Lỗi bảng company_config: ${error.message}`,
        error: error.message,
      };
    }
    return { success: true, message: 'Đã lưu cấu hình công ty thành công.' };
  } catch (e: any) {
    console.error('Sync company_config exception:', e);
    return {
      success: false,
      message: `Ngoại lệ: ${e.message || String(e)}`,
      error: e.message,
    };
  }
};

/**
 * Tải Cấu hình Công ty từ Supabase
 */
export const loadCompanyConfigFromSupabase = async (): Promise<CompanyConfig | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('company_config')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error || !data) return null;
    return (data.config_json as CompanyConfig) || null;
  } catch {
    return null;
  }
};

/**
 * Đồng bộ danh sách Nhân viên chính thức lên Supabase
 */
export const syncEmployeesToSupabase = async (
  employees: Employee[],
  periodCode?: string
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  }
  if (employees.length === 0) {
    return { success: true, count: 0, message: 'Không có nhân viên nào để đồng bộ.' };
  }

  try {
    const payload = employees.map((emp, idx) => {
      const sortOrder = typeof emp.sortOrder === 'number' ? emp.sortOrder : idx + 1;
      return {
        id: String(emp.id || emp.code || `EMP_${idx + 1}`),
        code: String(emp.code || `PNC${String(idx + 1).padStart(4, '0')}`),
        name: String(emp.fullName || 'Nhân viên'),
        department: String(emp.department || 'Phòng ban'),
        position: String(emp.title || ''),
        phone: String(emp.phone || ''),
        email: String(emp.email || ''),
        tax_code: String(emp.taxCode || ''),
        id_card: String(emp.idCard || ''),
        bank_account: String(emp.bankAccount || ''),
        bank_name: String(emp.bankName || ''),
        join_date: String(emp.joinDate || ''),
        status: String(emp.status || 'ACTIVE'),
        base_salary: Number(emp.baseSalary || 0),
        insurance_salary: Number(emp.insuranceSalary || 0),
        standard_work_days: Number(emp.standardWorkDays || 26),
        actual_work_days: Number(emp.actualWorkDays || 0),
        overtime_hours: Number(emp.overtimeHours || 0),
        advance_payment: Number(emp.advancePayment || 0),
        net_salary: Number(emp.netSalary || 0),
        period_code: String(periodCode || '09/2026'),
        employee_data: {
          ...emp,
          sortOrder,
        },
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await client.from('employees').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.error('Sync employees to Supabase failed:', error);
      return {
        success: false,
        count: 0,
        message: `Lỗi bảng employees: ${error.message}`,
        error: error.message,
      };
    }
    return {
      success: true,
      count: payload.length,
      message: `Đã đồng bộ ${payload.length} nhân viên chính thức lên Supabase.`,
    };
  } catch (e: any) {
    console.error('Sync employees exception:', e);
    return {
      success: false,
      count: 0,
      message: `Ngoại lệ: ${e.message || String(e)}`,
      error: e.message,
    };
  }
};

/**
 * Tải danh sách Nhân viên từ Supabase
 */
export const loadEmployeesFromSupabase = async (
  periodCode?: string
): Promise<Employee[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('employees').select('employee_data');
    if (periodCode) {
      query = query.eq('period_code', periodCode);
    }

    let { data, error } = await query;

    // Nếu lọc theo periodCode không có, lấy toàn bộ nhân sự hiện có
    if (!error && (!data || data.length === 0)) {
      const allRes = await client.from('employees').select('employee_data');
      data = allRes.data;
      error = allRes.error;
    }

    if (error || !data || data.length === 0) return null;

    const list = data
      .map((item) => item.employee_data as Employee)
      .filter((emp) => emp && emp.fullName);

    // Sắp xếp nhất quán tuyệt đối giữa tất cả các máy tính:
    return list.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch {
    return null;
  }
};

/**
 * Đồng bộ danh sách Công nhân thời vụ lên Supabase
 */
export const syncSeasonalWorkersToSupabase = async (
  workers: SeasonalWorker[],
  periodCode?: string
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  }
  if (workers.length === 0) {
    return { success: true, count: 0, message: 'Không có thợ thời vụ nào để đồng bộ.' };
  }

  try {
    const payload = workers.map((w, idx) => {
      const sortOrder = typeof w.sortOrder === 'number' ? w.sortOrder : idx + 1;
      return {
        id: String(w.id || `SW_${idx + 1}`),
        code: String(w.code || `PNC-TV${String(idx + 1).padStart(2, '0')}`),
        name: String(w.fullName || 'Công nhân'),
        trade: String(w.trade || ''),
        skill_level: String(w.skillLevel || ''),
        project: String(w.project || ''),
        team: String(w.teamName || ''),
        phone: String(w.phone || ''),
        id_card: String(w.idCard || ''),
        bank_account: String(w.bankAccount || ''),
        bank_name: String(w.bankName || ''),
        daily_rate: Number(w.dailyRate || 0),
        actual_work_days: Number(w.actualWorkDays || 0),
        overtime_hours: Number(w.overtimeHours || 0),
        advance_payment: Number(w.advancePayment || 0),
        has_tax_commitment: Boolean(w.hasTaxCommitment ?? true),
        payment_method: String(w.paymentMethod || 'BANK'),
        payroll_cycle_type: String(w.payrollCycleType || '1_WEEK'),
        status: String(w.status || 'ACTIVE'),
        net_salary: Number(w.netSalary || 0),
        period_code: String(periodCode || '09/2026'),
        worker_data: {
          ...w,
          sortOrder,
        },
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await client.from('seasonal_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.error('Sync seasonal_workers failed:', error);
      return {
        success: false,
        count: 0,
        message: `Lỗi bảng seasonal_workers: ${error.message}`,
        error: error.message,
      };
    }
    return {
      success: true,
      count: payload.length,
      message: `Đã đồng bộ ${payload.length} công nhân thời vụ lên Supabase.`,
    };
  } catch (e: any) {
    console.error('Sync seasonal_workers exception:', e);
    return {
      success: false,
      count: 0,
      message: `Ngoại lệ: ${e.message || String(e)}`,
      error: e.message,
    };
  }
};

/**
 * Tải danh sách Công nhân thời vụ từ Supabase
 */
export const loadSeasonalWorkersFromSupabase = async (
  periodCode?: string
): Promise<SeasonalWorker[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('seasonal_workers').select('worker_data');
    if (periodCode) {
      query = query.eq('period_code', periodCode);
    }

    let { data, error } = await query;

    // Nếu lọc theo periodCode không có, lấy toàn bộ thợ hiện có
    if (!error && (!data || data.length === 0)) {
      const allRes = await client.from('seasonal_workers').select('worker_data');
      data = allRes.data;
      error = allRes.error;
    }

    if (error || !data || data.length === 0) return null;

    const list = data
      .map((item) => item.worker_data as SeasonalWorker)
      .filter((w) => w && w.fullName);

    // Sắp xếp nhất quán tuyệt đối giữa tất cả các máy tính:
    // 1. Ưu tiên sortOrder được lưu
    // 2. Sắp xếp tự nhiên theo Mã thợ: PNC-TV01 < PNC-TV02 < PNC-TV03 < ... < PNC-TV13
    return list.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch {
    return null;
  }
};

export interface FullSyncResult {
  success: boolean;
  timestamp: string;
  companyConfig: { ok: boolean; message: string; error?: string };
  employees: { ok: boolean; count: number; message: string; error?: string };
  seasonalWorkers: { ok: boolean; count: number; message: string; error?: string };
  teamWorkers?: { ok: boolean; count: number; message: string; error?: string };
  projects?: { ok: boolean; count: number; message: string; error?: string };
  salaryAdvances?: { ok: boolean; count: number; message: string; error?: string };
}

/**
 * Đồng bộ danh sách Nhân viên Tổ Đội lên Supabase (Sheet: team_workers)
 */
export const syncTeamWorkersToSupabase = async (
  teamWorkers: TeamWorker[],
  periodCode?: string
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  }
  if (teamWorkers.length === 0) {
    return { success: true, count: 0, message: 'Không có tổ đội nào để đồng bộ.' };
  }

  try {
    const payload = teamWorkers.map((t, idx) => ({
      id: String(t.id || t.code || `TEAM_${idx + 1}`),
      code: String(t.code || `PNC-TD${String(idx + 1).padStart(2, '0')}`),
      team_name: String(t.teamName || 'Tổ đội thi công'),
      leader_name: String(t.leaderName || 'Đội trưởng'),
      phone: String(t.phone || ''),
      id_card: String(t.idCard || ''),
      bank_account: String(t.bankAccount || ''),
      bank_name: String(t.bankName || ''),
      project: String(t.project || ''),
      worker_count: Number(t.workerCount || 1),
      payment_method: String(t.paymentMethod || 'BANK'),
      rate_type: String(t.rateType || 'DAILY'),
      unit_rate: Number(t.unitRate || 0),
      actual_work_days: Number(t.actualWorkDays || 0),
      overtime_hours: Number(t.overtimeHours || 0),
      overtime_pay: Number(t.overtimePay || 0),
      salary_by_days: Number(t.salaryByDays || 0),
      meal_allowance: Number(t.mealAllowance || 0),
      other_bonus: Number(t.otherBonus || 0),
      total_income: Number(t.totalIncome || 0),
      advance_payment: Number(t.advancePayment || 0),
      total_deductions: Number(t.totalDeductions || 0),
      net_salary: Number(t.netSalary || 0),
      status: String(t.status || 'ACTIVE'),
      period_key: String(periodCode || '09/2026'),
      notes: String(t.notes || ''),
      sort_order: typeof t.sortOrder === 'number' ? t.sortOrder : idx + 1,
      team_data: t,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('team_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.error('Sync team_workers failed:', error);
      return {
        success: false,
        count: 0,
        message: `Lỗi bảng team_workers: ${error.message}`,
        error: error.message,
      };
    }
    return {
      success: true,
      count: payload.length,
      message: `Đã đồng bộ ${payload.length} tổ đội lên Supabase.`,
    };
  } catch (e: any) {
    return {
      success: false,
      count: 0,
      message: `Ngoại lệ: ${e.message || String(e)}`,
      error: e.message,
    };
  }
};

/**
 * Tải danh sách Nhân viên Tổ Đội từ Supabase (Sheet: team_workers)
 */
export const loadTeamWorkersFromSupabase = async (
  periodCode?: string
): Promise<TeamWorker[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('team_workers').select('team_data');
    if (periodCode) {
      query = query.eq('period_key', periodCode);
    }

    let { data, error } = await query;
    if (!error && (!data || data.length === 0)) {
      const allRes = await client.from('team_workers').select('team_data');
      data = allRes.data;
      error = allRes.error;
    }

    if (error || !data || data.length === 0) return null;

    const list = data
      .map((item) => item.team_data as TeamWorker)
      .filter((t) => t && (t.teamName || t.leaderName));

    return list.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch {
    return null;
  }
};

/**
 * Đồng bộ danh sách Dự Án lên Supabase (Sheet: projects)
 */
export const syncProjectsToSupabase = async (
  projects: Project[]
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (projects.length === 0) return { success: true, count: 0, message: 'Danh sách rỗng.' };

  try {
    const payload = projects.map((p) => ({
      id: String(p.id || p.code),
      code: String(p.code),
      name: String(p.name),
      location: String(p.location || ''),
      investor: String(p.investor || ''),
      contract_value: Number(p.contractValue || 0),
      labor_budget: Number(p.laborBudget || 0),
      actual_labor_cost: Number(p.actualLaborCost || 0),
      start_date: String(p.startDate || ''),
      end_date: String(p.endDate || ''),
      manager_name: String(p.managerName || ''),
      status: String(p.status || 'IN_PROGRESS'),
      description: String(p.description || ''),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('projects').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Sync projects failed:', error);
      return { success: false, count: 0, message: error.message, error: error.message };
    }
    return { success: true, count: payload.length, message: `Đã lưu ${payload.length} dự án lên Supabase.` };
  } catch (e: any) {
    return { success: false, count: 0, message: e.message || String(e), error: e.message };
  }
};

/**
 * Tải danh sách Dự Án từ Supabase (Sheet: projects)
 */
export const loadProjectsFromSupabase = async (): Promise<Project[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('projects').select('*').order('code');
    if (error || !data || data.length === 0) return null;

    return data.map((d: any) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      location: d.location || '',
      investor: d.investor || '',
      contractValue: Number(d.contract_value || 0),
      laborBudget: Number(d.labor_budget || 0),
      actualLaborCost: Number(d.actual_labor_cost || 0),
      startDate: d.start_date || '',
      endDate: d.end_date || '',
      managerName: d.manager_name || '',
      status: d.status || 'IN_PROGRESS',
      description: d.description || '',
    }));
  } catch {
    return null;
  }
};

/**
 * Đồng bộ danh sách Bản Lương Ứng lên Supabase (Sheet: salary_advances)
 */
export const syncSalaryAdvancesToSupabase = async (
  advances: SalaryAdvance[],
  periodCode?: string
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (advances.length === 0) return { success: true, count: 0, message: 'Danh sách rỗng.' };

  try {
    const payload = advances.map((a) => ({
      id: String(a.id || a.advanceCode),
      advance_code: String(a.advanceCode),
      target_type: String(a.targetType || 'PERMANENT'),
      worker_id: String(a.workerId),
      worker_code: String(a.workerCode),
      worker_name: String(a.workerName),
      department_or_project: String(a.departmentOrProject || ''),
      amount: Number(a.amount || 0),
      request_date: String(a.requestDate),
      payment_date: a.paymentDate ? String(a.paymentDate) : null,
      reason: String(a.reason || ''),
      payment_method: String(a.paymentMethod || 'BANK'),
      status: String(a.status || 'APPROVED'),
      approved_by: String(a.approvedBy || ''),
      period_key: String(a.periodKey || periodCode || '09/2026'),
      notes: String(a.notes || ''),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('salary_advances').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Sync salary_advances failed:', error);
      return { success: false, count: 0, message: error.message, error: error.message };
    }
    return { success: true, count: payload.length, message: `Đã lưu ${payload.length} phiếu ứng lên Supabase.` };
  } catch (e: any) {
    return { success: false, count: 0, message: e.message || String(e), error: e.message };
  }
};

/**
 * Tải danh sách Bản Lương Ứng từ Supabase (Sheet: salary_advances)
 */
export const loadSalaryAdvancesFromSupabase = async (
  periodCode?: string
): Promise<SalaryAdvance[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('salary_advances').select('*');
    if (periodCode) {
      query = query.eq('period_key', periodCode);
    }
    let { data, error } = await query;
    if (!error && (!data || data.length === 0)) {
      const allRes = await client.from('salary_advances').select('*');
      data = allRes.data;
      error = allRes.error;
    }
    if (error || !data || data.length === 0) return null;

    return data.map((d: any) => ({
      id: d.id,
      advanceCode: d.advance_code,
      targetType: d.target_type || 'PERMANENT',
      workerId: d.worker_id,
      workerCode: d.worker_code,
      workerName: d.worker_name,
      departmentOrProject: d.department_or_project || '',
      amount: Number(d.amount || 0),
      requestDate: d.request_date,
      paymentDate: d.payment_date || undefined,
      reason: d.reason || '',
      paymentMethod: d.payment_method || 'BANK',
      status: d.status || 'APPROVED',
      approvedBy: d.approved_by || undefined,
      periodKey: d.period_key || '09/2026',
      notes: d.notes || undefined,
    }));
  } catch {
    return null;
  }
};

// Aliases cho việc fetch dữ liệu thuận tiện
export const fetchTeamWorkersFromSupabase = loadTeamWorkersFromSupabase;
export const fetchProjectsFromSupabase = loadProjectsFromSupabase;
export const fetchSalaryAdvancesFromSupabase = loadSalaryAdvancesFromSupabase;

/**
 * Thực hiện đồng bộ toàn bộ (Cấu hình + 3 nhóm nhân viên + Dự án + Tạm ứng) một cách an toàn và chi tiết
 */
export const syncAllDataToSupabase = async (
  config: CompanyConfig,
  employees: Employee[],
  seasonalWorkers: SeasonalWorker[],
  teamWorkers?: TeamWorker[],
  projects?: Project[],
  salaryAdvances?: SalaryAdvance[]
): Promise<FullSyncResult> => {
  const cfgRes = await syncCompanyConfigToSupabase(config);
  const empRes = await syncEmployeesToSupabase(employees, config.periodCode);
  const seaRes = await syncSeasonalWorkersToSupabase(seasonalWorkers, config.periodCode);

  let teamRes = { success: true, count: 0, message: '' };
  if (teamWorkers && teamWorkers.length > 0) {
    teamRes = await syncTeamWorkersToSupabase(teamWorkers, config.periodCode);
  }

  let projRes = { success: true, count: 0, message: '' };
  if (projects && projects.length > 0) {
    projRes = await syncProjectsToSupabase(projects);
  }

  let advRes = { success: true, count: 0, message: '' };
  if (salaryAdvances && salaryAdvances.length > 0) {
    advRes = await syncSalaryAdvancesToSupabase(salaryAdvances, config.periodCode);
  }

  const allSuccess = cfgRes.success && empRes.success && seaRes.success;

  if (allSuccess) {
    localStorage.setItem('supabase_last_synced_at', new Date().toISOString());
  }

  return {
    success: allSuccess,
    timestamp: new Date().toLocaleTimeString('vi-VN'),
    companyConfig: { ok: cfgRes.success, message: cfgRes.message, error: cfgRes.error },
    employees: { ok: empRes.success, count: empRes.count, message: empRes.message, error: empRes.error },
    seasonalWorkers: { ok: seaRes.success, count: seaRes.count, message: seaRes.message, error: seaRes.error },
    teamWorkers: { ok: teamRes.success, count: teamRes.count, message: teamRes.message },
    projects: { ok: projRes.success, count: projRes.count, message: projRes.message },
    salaryAdvances: { ok: advRes.success, count: advRes.count, message: advRes.message },
  };
};

/**
 * Lấy thời gian đồng bộ thành công gần nhất
 */
export const getLastSyncedTime = (): string | null => {
  const ts = localStorage.getItem('supabase_last_synced_at');
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return `${d.toLocaleTimeString('vi-VN')} ngày ${d.toLocaleDateString('vi-VN')}`;
  } catch {
    return null;
  }
};

/**
 * Đồng bộ ngay lập tức 1 công nhân thời vụ lên Supabase (không cần chờ debounce)
 */
export const syncSingleSeasonalWorkerToSupabase = async (
  worker: SeasonalWorker,
  periodCode?: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const payload = {
      id: String(worker.id),
      code: String(worker.code || ''),
      name: String(worker.fullName || 'Công nhân'),
      trade: String(worker.trade || ''),
      skill_level: String(worker.skillLevel || ''),
      project: String(worker.project || ''),
      team: String(worker.teamName || ''),
      phone: String(worker.phone || ''),
      id_card: String(worker.idCard || ''),
      bank_account: String(worker.bankAccount || ''),
      bank_name: String(worker.bankName || ''),
      daily_rate: Number(worker.dailyRate || 0),
      actual_work_days: Number(worker.actualWorkDays || 0),
      overtime_hours: Number(worker.overtimeHours || 0),
      advance_payment: Number(worker.advancePayment || 0),
      has_tax_commitment: Boolean(worker.hasTaxCommitment ?? true),
      payment_method: String(worker.paymentMethod || 'BANK'),
      payroll_cycle_type: String(worker.payrollCycleType || '1_WEEK'),
      status: String(worker.status || 'ACTIVE'),
      net_salary: Number(worker.netSalary || 0),
      period_code: String(periodCode || '09/2026'),
      worker_data: worker,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('seasonal_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.error('syncSingleSeasonalWorker error:', error);
      return { success: false, message: error.message, error: error.message };
    }
    return { success: true, message: 'Đã lưu công nhân thời vụ lên Supabase.' };
  } catch (e: any) {
    return { success: false, message: e.message || String(e), error: e.message };
  }
};

/**
 * XÓA TRIỆT ĐỂ 1 công nhân thời vụ trên Supabase Database
 * Khắc phục hoàn toàn lỗi xóa nhưng F5 lại hiện lại!
 */
export const deleteSeasonalWorkerFromSupabase = async (
  id: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const { error } = await client
      .from('seasonal_workers')
      .delete()
      .eq('id', String(id));

    if (error) {
      console.error('deleteSeasonalWorker error:', error);
      return { success: false, message: error.message, error: error.message };
    }
    return { success: true, message: `Đã xóa thợ ID ${id} khỏi Supabase Cloud.` };
  } catch (e: any) {
    return { success: false, message: e.message || String(e), error: e.message };
  }
};

/**
 * XÓA TRIỆT ĐỂ nhiều công nhân thời vụ (hàng loạt) trên Supabase Database
 */
export const deleteBatchSeasonalWorkersFromSupabase = async (
  ids: string[]
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (ids.length === 0) return { success: true, count: 0, message: 'Danh sách rỗng.' };

  try {
    const stringIds = ids.map((id) => String(id));
    const { error } = await client
      .from('seasonal_workers')
      .delete()
      .in('id', stringIds);

    if (error) {
      console.error('deleteBatchSeasonalWorkers error:', error);
      return { success: false, count: 0, message: error.message, error: error.message };
    }
    return { success: true, count: stringIds.length, message: `Đã xóa ${stringIds.length} thợ trên Supabase.` };
  } catch (e: any) {
    return { success: false, count: 0, message: e.message || String(e), error: e.message };
  }
};

/**
 * XÓA TOÀN BỘ thợ thời vụ trên Supabase
 */
export const clearAllSeasonalWorkersFromSupabase = async (
  periodCode?: string
): Promise<{ success: boolean; message: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    let query = client.from('seasonal_workers').delete();
    if (periodCode) {
      query = query.eq('period_code', periodCode);
    } else {
      query = query.neq('id', '___NEVER_MATCH___');
    }
    const { error } = await query;
    if (error) {
      console.error('clearAllSeasonalWorkers error:', error);
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Đã xóa toàn bộ thợ trên Supabase.' };
  } catch (e: any) {
    return { success: false, message: e.message || String(e) };
  }
};

/**
 * Đồng bộ ngay lập tức 1 nhân viên chính thức lên Supabase
 */
export const syncSingleEmployeeToSupabase = async (
  employee: Employee,
  periodCode?: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const payload = {
      id: String(employee.id || employee.code),
      code: String(employee.code || ''),
      name: String(employee.fullName || 'Nhân viên'),
      department: String(employee.department || 'Phòng ban'),
      position: String(employee.title || ''),
      phone: String(employee.phone || ''),
      email: String(employee.email || ''),
      tax_code: String(employee.taxCode || ''),
      id_card: String(employee.idCard || ''),
      bank_account: String(employee.bankAccount || ''),
      bank_name: String(employee.bankName || ''),
      join_date: String(employee.joinDate || ''),
      status: String(employee.status || 'ACTIVE'),
      base_salary: Number(employee.baseSalary || 0),
      insurance_salary: Number(employee.insuranceSalary || 0),
      standard_work_days: Number(employee.standardWorkDays || 26),
      actual_work_days: Number(employee.actualWorkDays || 0),
      overtime_hours: Number(employee.overtimeHours || 0),
      advance_payment: Number(employee.advancePayment || 0),
      net_salary: Number(employee.netSalary || 0),
      period_code: String(periodCode || '09/2026'),
      employee_data: employee,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('employees').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.error('syncSingleEmployee error:', error);
      return { success: false, message: error.message, error: error.message };
    }
    return { success: true, message: 'Đã lưu nhân viên lên Supabase.' };
  } catch (e: any) {
    return { success: false, message: e.message || String(e), error: e.message };
  }
};

/**
 * XÓA TRIỆT ĐỂ 1 nhân viên chính thức trên Supabase Database
 */
export const deleteEmployeeFromSupabase = async (
  id: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const { error } = await client
      .from('employees')
      .delete()
      .eq('id', String(id));

    if (error) {
      console.error('deleteEmployee error:', error);
      return { success: false, message: error.message, error: error.message };
    }
    return { success: true, message: `Đã xóa nhân viên ID ${id} khỏi Supabase Cloud.` };
  } catch (e: any) {
    return { success: false, message: e.message || String(e), error: e.message };
  }
};

/**
 * Đăng ký lắng nghe sự kiện Realtime thay đổi từ Supabase
 * Tự động đồng bộ ngay lập tức giữa các máy tính và trình duyệt khi có dữ liệu mới!
 */
export const subscribeToSupabaseRealtime = (
  onTableChange: (tableName: 'company_config' | 'employees' | 'seasonal_workers', eventType: string, payload: any) => void
): (() => void) => {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  try {
    const channelName = `realtime-payroll-sync-${Date.now()}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seasonal_workers' },
        (payload) => {
          onTableChange('seasonal_workers', payload.eventType, payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        (payload) => {
          onTableChange('employees', payload.eventType, payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_config' },
        (payload) => {
          onTableChange('company_config', payload.eventType, payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Supabase Realtime] Đã kết nối kênh thời gian thực thành công!');
        }
      });

    return () => {
      try {
        client.removeChannel(channel);
      } catch (err) {
        console.warn('Error removing realtime channel:', err);
      }
    };
  } catch (err) {
    console.warn('Failed to subscribe to Supabase Realtime:', err);
    return () => {};
  }
};

