import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyConfig, Employee, SeasonalWorker } from '../types';

const env = (import.meta as any).env || {};

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
  };
  missingTables: string[];
}

/**
 * Kiểm tra toàn diện kết nối tới Supabase và tình trạng của cả 3 bảng
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
    const [cfgCheck, empCheck, seaCheck] = await Promise.all([
      checkTable('company_config'),
      checkTable('employees'),
      checkTable('seasonal_workers'),
    ]);

    const missing: string[] = [];
    if (!cfgCheck.exists) missing.push('company_config');
    if (!empCheck.exists) missing.push('employees');
    if (!seaCheck.exists) missing.push('seasonal_workers');

    const allExist = missing.length === 0;

    let msg = '';
    if (allExist) {
      msg = `Kết nối Supabase thành công! Cả 3 bảng đều đã sẵn sàng (Config: ${cfgCheck.count}, NV: ${empCheck.count}, Thợ: ${seaCheck.count}).`;
    } else {
      msg = `Đã kết nối Supabase nhưng thiếu bảng: [${missing.join(', ')}]. Hãy chạy file supabase_schema.sql trong SQL Editor.`;
    }

    return {
      connected: allExist,
      message: msg,
      url: currentUrl,
      tables: {
        company_config: cfgCheck,
        employees: empCheck,
        seasonal_workers: seaCheck,
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
}

/**
 * Thực hiện đồng bộ toàn bộ (Cấu hình + Nhân viên + Thời vụ) một cách an toàn và chi tiết
 */
export const syncAllDataToSupabase = async (
  config: CompanyConfig,
  employees: Employee[],
  seasonalWorkers: SeasonalWorker[]
): Promise<FullSyncResult> => {
  const cfgRes = await syncCompanyConfigToSupabase(config);
  const empRes = await syncEmployeesToSupabase(employees, config.periodCode);
  const seaRes = await syncSeasonalWorkersToSupabase(seasonalWorkers, config.periodCode);

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
