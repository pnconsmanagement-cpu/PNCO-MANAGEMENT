import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyConfig, Employee, SeasonalWorker } from '../types';

const env = (import.meta as any).env || {};

export const getSupabaseConfig = (): { url: string; anonKey: string } => {
  const savedUrl = localStorage.getItem('supabase_config_url') || '';
  const savedKey = localStorage.getItem('supabase_config_anon_key') || '';
  const envUrl = env.VITE_SUPABASE_URL || '';
  const envKey = env.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: savedUrl || envUrl,
    anonKey: savedKey || envKey,
  };
};

export const setSupabaseConfig = (url: string, anonKey: string): void => {
  localStorage.setItem('supabase_config_url', url.trim());
  localStorage.setItem('supabase_config_anon_key', anonKey.trim());
  cachedClient = null; // Reset cached client
};

export const clearSupabaseConfig = (): void => {
  localStorage.removeItem('supabase_config_url');
  localStorage.removeItem('supabase_config_anon_key');
  cachedClient = null;
};

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

export const getSupabaseClient = (): SupabaseClient | null => {
  if (cachedClient) return cachedClient;
  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey && url.startsWith('https://')) {
    try {
      cachedClient = createClient(url, anonKey);
      return cachedClient;
    } catch (e) {
      console.error('Failed to create Supabase client:', e);
      return null;
    }
  }
  return null;
};

/**
 * Kiểm tra kết nối tới Supabase
 */
export const checkSupabaseConnection = async (
  overrideUrl?: string,
  overrideKey?: string
): Promise<{
  connected: boolean;
  message: string;
}> => {
  let client: SupabaseClient | null = null;

  if (overrideUrl && overrideKey) {
    try {
      client = createClient(overrideUrl.trim(), overrideKey.trim());
    } catch (e: any) {
      return {
        connected: false,
        message: `Thông số không hợp lệ: ${e.message}`,
      };
    }
  } else {
    client = getSupabaseClient();
  }

  if (!client) {
    return {
      connected: false,
      message: 'Chưa có thông tin Supabase URL hoặc Anon Key.',
    };
  }

  try {
    const { error } = await client.from('company_config').select('id').limit(1);
    if (error) {
      // Nếu lỗi bảng chưa tồn tại (table does not exist), báo rõ để người dùng chạy SQL
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          connected: false,
          message: 'Kết nối được Supabase nhưng chưa tạo bảng! Vui lòng copy file supabase_schema.sql chạy trong SQL Editor của Supabase.',
        };
      }
      return {
        connected: false,
        message: `Lỗi kết nối: ${error.message}`,
      };
    }
    return {
      connected: true,
      message: 'Kết nối Supabase thành công! Cơ sở dữ liệu đã sẵn sàng.',
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Không thể kết nối: ${err.message || String(err)}`,
    };
  }
};

/**
 * Lưu hoặc Cập nhật Cấu hình Công ty lên Supabase
 */
export const syncCompanyConfigToSupabase = async (
  config: CompanyConfig
): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('company_config').upsert({
      id: 'default',
      name: config.name,
      address: config.address,
      tax_code: config.taxCode,
      phone: config.phone,
      period: config.period,
      period_code: config.periodCode,
      payment_date: config.paymentDate,
      standard_work_days: config.standardWorkDays,
      zalo_oa: config.zaloOA || {},
      config_json: config,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Sync company_config failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Sync company_config exception:', e);
    return false;
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
): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client || employees.length === 0) return false;

  try {
    const payload = employees.map((emp) => ({
      id: emp.id || emp.code,
      code: emp.code,
      name: emp.fullName,
      department: emp.department,
      position: emp.title,
      phone: emp.phone || '',
      email: emp.email || '',
      tax_code: emp.taxCode || '',
      id_card: emp.idCard || '',
      bank_account: emp.bankAccount || '',
      bank_name: emp.bankName || '',
      join_date: emp.joinDate || '',
      status: emp.status || 'ACTIVE',
      base_salary: emp.baseSalary || 0,
      insurance_salary: emp.insuranceSalary || 0,
      standard_work_days: emp.standardWorkDays || 26,
      actual_work_days: emp.actualWorkDays || 0,
      overtime_hours: emp.overtimeHours || 0,
      advance_payment: emp.advancePayment || 0,
      net_salary: emp.netSalary || 0,
      period_code: periodCode || '09/2026',
      employee_data: emp,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('employees').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.warn('Sync employees to Supabase failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Sync employees exception:', e);
    return false;
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

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    return data.map((item) => item.employee_data as Employee);
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
): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client || workers.length === 0) return false;

  try {
    const payload = workers.map((w) => ({
      id: String(w.id),
      code: w.code,
      name: w.fullName,
      trade: w.trade,
      skill_level: w.skillLevel,
      project: w.project,
      team: w.teamName,
      phone: w.phone || '',
      id_card: w.idCard || '',
      bank_account: w.bankAccount || '',
      bank_name: w.bankName || '',
      daily_rate: w.dailyRate || 0,
      actual_work_days: w.actualWorkDays || 0,
      overtime_hours: w.overtimeHours || 0,
      advance_payment: w.advancePayment || 0,
      has_tax_commitment: w.hasTaxCommitment ?? true,
      payment_method: w.paymentMethod || 'BANK',
      payroll_cycle_type: w.payrollCycleType || '1_WEEK',
      status: w.status || 'ACTIVE',
      net_salary: w.netSalary || 0,
      period_code: periodCode || '09/2026',
      worker_data: w,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('seasonal_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.warn('Sync seasonal_workers failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Sync seasonal_workers exception:', e);
    return false;
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

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    return data.map((item) => item.worker_data as SeasonalWorker);
  } catch {
    return null;
  }
};
