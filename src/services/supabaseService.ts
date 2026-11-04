import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
      
      // Dọn dẹp sb_url, sb_key trên thanh địa chỉ mà không làm mất tham số view=chamcong, worker=...
      try {
        const curSearch = new URLSearchParams(window.location.search);
        curSearch.delete('sb_url');
        curSearch.delete('supabase_url');
        curSearch.delete('sb_key');
        curSearch.delete('supabase_key');
        const newSearchStr = curSearch.toString() ? `?${curSearch.toString()}` : '';

        // Dọn dẹp sb_url, sb_key trong hash nhưng giữ lại phần định tuyến chấm công (như #chamcong&worker=...)
        let newHashStr = '';
        if (window.location.hash) {
          const rawHash = window.location.hash.replace(/^#/, '');
          const hashParts = rawHash.split('&').filter((part) => {
            return (
              !part.startsWith('sb_url=') &&
              !part.startsWith('supabase_url=') &&
              !part.startsWith('sb_key=') &&
              !part.startsWith('supabase_key=')
            );
          });
          if (hashParts.length > 0) {
            newHashStr = `#${hashParts.join('&')}`;
          }
        }

        const cleanHref = `${window.location.pathname}${newSearchStr}${newHashStr}`;
        window.history.replaceState(null, '', cleanHref);
      } catch {}
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
    team_workers: TableCheckStatus;
    projects: TableCheckStatus;
    payroll_records: TableCheckStatus;
    salary_advances: TableCheckStatus;
    attendance_records: TableCheckStatus;
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
      payroll_records: { exists: false, count: 0 },
      salary_advances: { exists: false, count: 0 },
      attendance_records: { exists: false, count: 0 },
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
    const [cfgCheck, empCheck, seaCheck, teamCheck, projCheck, payCheck, advCheck, attCheck] = await Promise.all([
      checkTable('company_config'),
      checkTable('employees'),
      checkTable('seasonal_workers'),
      checkTable('team_workers'),
      checkTable('projects'),
      checkTable('payroll_records'),
      checkTable('salary_advances'),
      checkTable('attendance_records'),
    ]);

    const missing: string[] = [];
    if (!cfgCheck.exists) missing.push('company_config');
    if (!empCheck.exists) missing.push('employees');
    if (!seaCheck.exists) missing.push('seasonal_workers');
    if (!teamCheck.exists) missing.push('team_workers');
    if (!projCheck.exists) missing.push('projects');
    if (!payCheck.exists) missing.push('payroll_records');
    if (!advCheck.exists) missing.push('salary_advances');
    if (!attCheck.exists) missing.push('attendance_records');

    const coreExist = cfgCheck.exists && empCheck.exists && seaCheck.exists;

    let msg = '';
    if (missing.length === 0) {
      msg = `Kết nối Supabase xuất sắc! Toàn bộ 8 bảng dữ liệu đã sẵn sàng: Cấu hình, NV Chính thức (${empCheck.count}), Thời vụ (${seaCheck.count}), Tổ đội (${teamCheck.count}), Dự án (${projCheck.count}), Bảng lương (${payCheck.count}), Tạm ứng (${advCheck.count}), Chấm công (${attCheck.count}).`;
    } else if (coreExist) {
      msg = `Đã kết nối Supabase thành công. Một số bảng [${missing.join(', ')}] chưa được tạo, bạn có thể chạy file supabase_schema.sql trong SQL Editor.`;
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
        payroll_records: payCheck,
        salary_advances: advCheck,
        attendance_records: attCheck,
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
    const { data, error } = await client
      .from('employees')
      .select('id, code, name, department, position, employee_data');

    if (error || !data || data.length === 0) return null;

    let attRecords: any[] = [];
    try {
      const { data: attData } = await client.from('attendance_records').select('*');
      if (attData && Array.isArray(attData)) {
        attRecords = attData;
      }
    } catch {}

    const list = data
      .map((item) => {
        const emp = (item.employee_data || {}) as Employee;
        return {
          ...emp,
          id: String(item.id || emp.id),
          code: String(item.code || emp.code),
          fullName: emp.fullName || item.name || 'Nhân viên',
          department: emp.department || item.department || 'Phòng ban',
          title: emp.title || item.position || 'Nhân viên',
        };
      })
      .filter((emp) => emp && emp.fullName);

    if (attRecords.length > 0) {
      list.forEach((emp) => {
        const matchingAtts = attRecords.filter(
          (a) => a.worker_code === emp.code || a.worker_code === emp.id
        );
        matchingAtts.forEach((att) => {
          const mNum = Number(att.month);
          const yNum = Number(att.year);
          const mStr = String(mNum).padStart(2, '0');
          const monthKey = `${yNum}-${mStr}`;
          if (!emp.monthlyAttendance) emp.monthlyAttendance = {};
          if (
            att.attendance_data &&
            typeof att.attendance_data === 'object' &&
            Object.keys(att.attendance_data).length > 0
          ) {
            emp.monthlyAttendance[monthKey] = {
              monthKey,
              month: mNum,
              year: yNum,
              totalWorkDays: Number(att.total_work_days || 0),
              totalOtHours: Number(att.total_ot_hours || 0),
              days: att.attendance_data,
              lastSubmittedAt: att.updated_at,
              submittedBy: 'WORKER',
            };
          }
        });
      });
    }

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

    // Đồng bộ luôn bảng attendance_records cho các công nhân thời vụ để dữ liệu chấm công (kể cả khi xóa về 0 công) khớp 100%
    try {
      const attPayloads: any[] = [];
      workers.forEach((w, idx) => {
        const workerCode = String(w.code || w.id || `PNC-TV${String(idx + 1).padStart(2, '0')}`).trim();
        if (w.monthlyAttendance) {
          Object.entries(w.monthlyAttendance).forEach(([mKey, mRec]) => {
            if (mRec && mRec.month && mRec.year) {
              const mStr = String(mRec.month).padStart(2, '0');
              attPayloads.push({
                id: `ATT-SEA-${mRec.year}-${mStr}-${workerCode}`,
                worker_type: 'SEASONAL',
                worker_code: workerCode,
                worker_name: String(w.fullName || 'Công nhân'),
                project_code: String(w.project || ''),
                month: Number(mRec.month),
                year: Number(mRec.year),
                period_key: `${mStr}/${mRec.year}`,
                total_work_days: Number(mRec.totalWorkDays || 0),
                total_ot_hours: Number(mRec.totalOtHours || 0),
                attendance_data: mRec.days || {},
                updated_at: mRec.lastSubmittedAt || new Date().toISOString(),
              });
            }
          });
        }
      });
      if (attPayloads.length > 0) {
        await client.from('attendance_records').upsert(attPayloads, { onConflict: 'id' });
      }
    } catch (attErr) {
      console.warn('[Supabase Sync] Sync seasonal attendance_records warning:', attErr);
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
    // Luôn tải toàn bộ danh sách công nhân từ bảng seasonal_workers
    // để đảm bảo mọi thợ và toàn bộ lịch sử chấm công (monthlyAttendance & periodRecords) không bao giờ bị lọc mất
    let { data, error } = await client.from('seasonal_workers').select('id, code, name, trade, project, team, worker_data');

    if (error || !data || data.length === 0) return null;

    // Đồng thời truy vấn thêm bảng attendance_records để tích hợp ngay dữ liệu chấm công từ điện thoại
    let attRecords: any[] = [];
    try {
      const { data: attData } = await client
        .from('attendance_records')
        .select('*')
        .eq('worker_type', 'SEASONAL');
      if (attData && Array.isArray(attData)) {
        attRecords = attData;
      }
    } catch (e) {
      console.warn('[Supabase Sync] Load attendance_records warning:', e);
    }

    const list = data
      .map((item) => {
        const w = (item.worker_data || {}) as SeasonalWorker;
        const canonicalId = item.id || w.id;
        const canonicalCode = item.code || w.code;
        return {
          ...w,
          id: String(canonicalId),
          code: String(canonicalCode),
          fullName: w.fullName || item.name || 'Công nhân',
          trade: w.trade || item.trade || '',
          project: w.project || item.project || '',
          teamName: w.teamName || item.team || '',
        };
      })
      .filter((w) => w && (w.fullName || w.code));

    // Hợp nhất dữ liệu chi tiết từng ngày từ attendance_records vào monthlyAttendance của từng thợ
    // Chỉ áp dụng bản ghi từ attendance_records nếu chưa có hoặc có thời gian cập nhật mới hơn bản ghi trong worker_data
    if (attRecords.length > 0) {
      list.forEach((w) => {
        const workerCode = w.code || w.id;
        const matchingAtts = attRecords.filter(
          (a) => a.worker_code === workerCode || a.worker_code === w.code || a.worker_code === w.id
        );
        matchingAtts.forEach((att) => {
          const mNum = Number(att.month);
          const yNum = Number(att.year);
          const mStr = String(mNum).padStart(2, '0');
          const monthKey = `${yNum}-${mStr}`;
          if (!w.monthlyAttendance) w.monthlyAttendance = {};

          const existingRec = w.monthlyAttendance[monthKey];
          const existingTs = existingRec?.lastSubmittedAt ? new Date(existingRec.lastSubmittedAt).getTime() : 0;
          const attTs = att.updated_at ? new Date(att.updated_at).getTime() : 0;

          if (!existingRec || (attTs > 0 && attTs > existingTs)) {
            if (att.attendance_data && typeof att.attendance_data === 'object') {
              w.monthlyAttendance[monthKey] = {
                monthKey,
                month: mNum,
                year: yNum,
                totalWorkDays: Number(att.total_work_days || 0),
                totalOtHours: Number(att.total_ot_hours || 0),
                days: att.attendance_data,
                lastSubmittedAt: att.updated_at,
                submittedBy: 'WORKER',
              };
            }
          }
        });
      });
    }

    // Sắp xếp nhất quán tuyệt đối giữa tất cả các máy tính:
    // 1. Ưu tiên sortOrder được lưu
    // 2. Sắp xếp tự nhiên theo Mã thợ: PNC-TV01 < PNC-TV02 < PNC-TV03 < ... < PNC-TV13
    return list.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch (err) {
    console.warn('[Supabase Sync] Load seasonal workers exception:', err);
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
  payrollRecords?: { ok: boolean; count: number; message: string; error?: string };
  salaryAdvances?: { ok: boolean; count: number; message: string; error?: string };
  attendanceRecords?: { ok: boolean; count: number; message: string; error?: string };
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
 * Đồng bộ danh sách Bản Lương Đa Chu Kỳ lên Supabase (Sheet: payroll_records - Tuần, Tháng, Quý, Năm)
 */
export const syncPayrollRecordsToSupabase = async (
  records: PayrollRecord[]
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (records.length === 0) return { success: true, count: 0, message: 'Danh sách bảng lương rỗng.' };

  try {
    const payload = records.map((r) => ({
      id: String(r.id),
      period_type: String(r.periodType || 'MONTH'),
      period_code: String(r.periodCode || '09/2026'),
      worker_type: String(r.workerType || 'PERMANENT'),
      worker_id: String(r.workerId),
      worker_code: String(r.workerCode),
      worker_name: String(r.workerName),
      department_or_project: String(r.departmentOrProject || ''),
      standard_work_days: Number(r.standardWorkDays || 26),
      actual_work_days: Number(r.actualWorkDays || 0),
      base_salary_or_rate: Number(r.baseSalaryOrRate || 0),
      salary_by_days: Number(r.salaryByDays || 0),
      overtime_hours: Number(r.overtimeHours || 0),
      overtime_pay: Number(r.overtimePay || 0),
      allowances: Number(r.allowances || 0),
      bonuses: Number(r.bonuses || 0),
      total_income: Number(r.totalIncome || 0),
      insurance_deduction: Number(r.insuranceDeduction || 0),
      tax_deduction: Number(r.taxDeduction || 0),
      advance_payment: Number(r.advancePayment || 0),
      total_deductions: Number(r.totalDeductions || 0),
      net_salary: Number(r.netSalary || 0),
      payment_method: String(r.paymentMethod || 'BANK'),
      bank_account: String(r.bankAccount || ''),
      bank_name: String(r.bankName || ''),
      payment_status: String(r.paymentStatus || 'PENDING'),
      notes: String(r.notes || ''),
      payroll_data: r,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('payroll_records').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Sync payroll_records failed:', error);
      return { success: false, count: 0, message: error.message, error: error.message };
    }
    return { success: true, count: payload.length, message: `Đã lưu ${payload.length} dòng bảng lương lên Supabase.` };
  } catch (e: any) {
    return { success: false, count: 0, message: e.message || String(e), error: e.message };
  }
};

/**
 * Tải danh sách Bản Lương từ Supabase (Sheet: payroll_records)
 */
export const loadPayrollRecordsFromSupabase = async (
  periodCode?: string
): Promise<PayrollRecord[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('payroll_records').select('*');
    if (periodCode) {
      query = query.eq('period_code', periodCode);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    return data.map((d: any) => ({
      id: d.id,
      periodType: d.period_type || 'MONTH',
      periodCode: d.period_code,
      workerType: d.worker_type || 'PERMANENT',
      workerId: d.worker_id,
      workerCode: d.worker_code,
      workerName: d.worker_name,
      departmentOrProject: d.department_or_project || '',
      standardWorkDays: Number(d.standard_work_days || 26),
      actualWorkDays: Number(d.actual_work_days || 0),
      baseSalaryOrRate: Number(d.base_salary_or_rate || 0),
      salaryByDays: Number(d.salary_by_days || 0),
      overtimeHours: Number(d.overtime_hours || 0),
      overtimePay: Number(d.overtime_pay || 0),
      allowances: Number(d.allowances || 0),
      bonuses: Number(d.bonuses || 0),
      totalIncome: Number(d.total_income || 0),
      insuranceDeduction: Number(d.insurance_deduction || 0),
      taxDeduction: Number(d.tax_deduction || 0),
      advancePayment: Number(d.advance_payment || 0),
      totalDeductions: Number(d.total_deductions || 0),
      netSalary: Number(d.net_salary || 0),
      paymentMethod: d.payment_method || 'BANK',
      bankAccount: d.bank_account || '',
      bankName: d.bank_name || '',
      paymentStatus: d.payment_status || 'PENDING',
      notes: d.notes || '',
      payrollData: d.payroll_data,
    }));
  } catch {
    return null;
  }
};
export const fetchPayrollRecordsFromSupabase = loadPayrollRecordsFromSupabase;

/**
 * Đồng bộ danh sách Bản Chấm Công lên Supabase (Sheet: attendance_records)
 */
export const syncAttendanceRecordsToSupabase = async (
  records: AttendanceRecord[]
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (records.length === 0) return { success: true, count: 0, message: 'Danh sách chấm công rỗng.' };

  try {
    const payload = records.map((r) => ({
      id: String(r.id),
      worker_type: String(r.workerType || 'PERMANENT'),
      worker_code: String(r.workerCode),
      worker_name: String(r.workerName),
      project_code: String(r.projectCode || ''),
      month: Number(r.month),
      year: Number(r.year),
      period_key: String(r.periodKey || `${r.month < 10 ? '0' + r.month : r.month}/${r.year}`),
      total_work_days: Number(r.totalWorkDays || 0),
      total_ot_hours: Number(r.totalOtHours || 0),
      attendance_data: r.attendanceData || {},
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('attendance_records').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('Sync attendance_records failed:', error);
      return { success: false, count: 0, message: error.message, error: error.message };
    }
    return { success: true, count: payload.length, message: `Đã lưu ${payload.length} bản ghi chấm công lên Supabase.` };
  } catch (e: any) {
    return { success: false, count: 0, message: e.message || String(e), error: e.message };
  }
};

/**
 * Tải danh sách Bản Chấm Công từ Supabase (Sheet: attendance_records)
 */
export const loadAttendanceRecordsFromSupabase = async (
  month?: number,
  year?: number
): Promise<AttendanceRecord[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client.from('attendance_records').select('*');
    if (month && year) {
      query = query.eq('month', month).eq('year', year);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    return data.map((d: any) => ({
      id: d.id,
      workerType: d.worker_type || 'PERMANENT',
      workerCode: d.worker_code,
      workerName: d.worker_name,
      projectCode: d.project_code || '',
      month: Number(d.month),
      year: Number(d.year),
      periodKey: d.period_key,
      totalWorkDays: Number(d.total_work_days || 0),
      totalOtHours: Number(d.total_ot_hours || 0),
      attendanceData: d.attendance_data,
    }));
  } catch {
    return null;
  }
};
export const fetchAttendanceRecordsFromSupabase = loadAttendanceRecordsFromSupabase;

/**
 * Thực hiện đồng bộ toàn bộ (Cấu hình + 3 nhóm nhân viên + Dự án + Tạm ứng + Bảng lương + Chấm công) một cách an toàn và chi tiết
 */
export const syncAllDataToSupabase = async (
  config: CompanyConfig,
  employees: Employee[],
  seasonalWorkers: SeasonalWorker[],
  teamWorkers?: TeamWorker[],
  projects?: Project[],
  salaryAdvances?: SalaryAdvance[],
  payrollRecords?: PayrollRecord[],
  attendanceRecords?: AttendanceRecord[]
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

  let payRes = { success: true, count: 0, message: '' };
  if (payrollRecords && payrollRecords.length > 0) {
    payRes = await syncPayrollRecordsToSupabase(payrollRecords);
  }

  let attRes = { success: true, count: 0, message: '' };
  if (attendanceRecords && attendanceRecords.length > 0) {
    attRes = await syncAttendanceRecordsToSupabase(attendanceRecords);
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
    payrollRecords: { ok: payRes.success, count: payRes.count, message: payRes.message },
    salaryAdvances: { ok: advRes.success, count: advRes.count, message: advRes.message },
    attendanceRecords: { ok: attRes.success, count: attRes.count, message: attRes.message },
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
    const workerCode = String(worker.code || worker.id).trim();
    let existingRowId: string | null = null;
    let existingWorkerData: SeasonalWorker | null = null;

    // 1. Tìm bản ghi hiện có trong bảng seasonal_workers theo CODE hoặc ID
    // Cực kỳ quan trọng: Trong Postgres, cột code có UNIQUE constraint ("seasonal_workers_code_key").
    // Nếu thiết bị di động có ID khác với máy tính, phải dùng ID hiện có trong DB để UPDATE, tránh lỗi duplicate key!
    try {
      const { data: codeMatches } = await client
        .from('seasonal_workers')
        .select('id, code, worker_data')
        .eq('code', workerCode)
        .limit(1);

      if (codeMatches && codeMatches.length > 0) {
        existingRowId = codeMatches[0].id;
        existingWorkerData = codeMatches[0].worker_data as SeasonalWorker;
      } else if (worker.id) {
        const { data: idMatches } = await client
          .from('seasonal_workers')
          .select('id, code, worker_data')
          .eq('id', String(worker.id))
          .limit(1);
        if (idMatches && idMatches.length > 0) {
          existingRowId = idMatches[0].id;
          existingWorkerData = idMatches[0].worker_data as SeasonalWorker;
        }
      }
    } catch (lookupErr) {
      console.warn('[Supabase Sync] Lookup worker error:', lookupErr);
    }

    const canonicalId = existingRowId || worker.id || workerCode;

    // Hợp nhất dữ liệu chấm công: Không bao giờ để mất các tháng/kỳ đã chấm trước đó
    const mergedMonthlyAttendance = {
      ...(existingWorkerData?.monthlyAttendance || {}),
      ...(worker.monthlyAttendance || {}),
    };
    const mergedPeriodRecords = {
      ...(existingWorkerData?.periodRecords || {}),
      ...(worker.periodRecords || {}),
    };

    const sortOrder = typeof worker.sortOrder === 'number'
      ? worker.sortOrder
      : (typeof existingWorkerData?.sortOrder === 'number' ? existingWorkerData.sortOrder : 99);

    const mergedWorker: SeasonalWorker = {
      ...(existingWorkerData || {}),
      ...worker,
      id: String(canonicalId),
      code: workerCode,
      fullName: worker.fullName || existingWorkerData?.fullName || 'Công nhân',
      trade: worker.trade || existingWorkerData?.trade || '',
      project: worker.project || existingWorkerData?.project || '',
      teamName: worker.teamName || existingWorkerData?.teamName || '',
      sortOrder,
      monthlyAttendance: mergedMonthlyAttendance,
      periodRecords: mergedPeriodRecords,
    };

    const payload = {
      id: String(canonicalId),
      code: String(workerCode),
      name: String(mergedWorker.fullName || 'Công nhân'),
      trade: String(mergedWorker.trade || ''),
      skill_level: String(mergedWorker.skillLevel || ''),
      project: String(mergedWorker.project || ''),
      team: String(mergedWorker.teamName || ''),
      phone: String(mergedWorker.phone || ''),
      id_card: String(mergedWorker.idCard || ''),
      bank_account: String(mergedWorker.bankAccount || ''),
      bank_name: String(mergedWorker.bankName || ''),
      daily_rate: Number(mergedWorker.dailyRate || 0),
      actual_work_days: Number(mergedWorker.actualWorkDays || 0),
      overtime_hours: Number(mergedWorker.overtimeHours || 0),
      advance_payment: Number(mergedWorker.advancePayment || 0),
      has_tax_commitment: Boolean(mergedWorker.hasTaxCommitment ?? true),
      payment_method: String(mergedWorker.paymentMethod || 'BANK'),
      payroll_cycle_type: String(mergedWorker.payrollCycleType || '1_WEEK'),
      status: String(mergedWorker.status || 'ACTIVE'),
      net_salary: Number(mergedWorker.netSalary || 0),
      period_code: String(periodCode || '09/2026'),
      worker_data: mergedWorker,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await client.from('seasonal_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (upsertErr) {
      console.warn('[Supabase Sync] Upsert by ID failed, falling back to update by code:', upsertErr.message);
      const { error: updateErr } = await client
        .from('seasonal_workers')
        .update(payload)
        .eq('code', workerCode);
      if (updateErr) {
        console.error('[Supabase Sync] Update fallback also failed:', updateErr.message);
        return { success: false, message: updateErr.message, error: updateErr.message };
      }
    }

    // 2. Đồng bộ chi tiết ngày công vào bảng attendance_records trên Supabase
    // Đảm bảo dữ liệu chấm công từ điện thoại được lưu vào cả 2 bảng và xóa bỏ các bản ghi trùng lặp cũ
    if (mergedWorker.monthlyAttendance) {
      for (const [mKey, mRec] of Object.entries(mergedWorker.monthlyAttendance)) {
        if (mRec && mRec.month && mRec.year) {
          const mStr = String(mRec.month).padStart(2, '0');
          const attId = `ATT-SEA-${mRec.year}-${mStr}-${workerCode}`;
          const nowIso = mRec.lastSubmittedAt || new Date().toISOString();
          const attPayload = {
            id: attId,
            worker_type: 'SEASONAL',
            worker_code: workerCode,
            worker_name: String(mergedWorker.fullName || 'Công nhân'),
            project_code: String(mergedWorker.project || ''),
            month: Number(mRec.month),
            year: Number(mRec.year),
            period_key: `${mStr}/${mRec.year}`,
            total_work_days: Number(mRec.totalWorkDays || 0),
            total_ot_hours: Number(mRec.totalOtHours || 0),
            attendance_data: mRec.days || {},
            updated_at: nowIso,
          };
          try {
            // Xóa các dòng attendance_records cũ có id khác của cùng worker_code, month, year để không bị bóng ma dữ liệu cũ
            await client
              .from('attendance_records')
              .delete()
              .eq('worker_code', workerCode)
              .eq('month', Number(mRec.month))
              .eq('year', Number(mRec.year))
              .neq('id', attId);
            await client.from('attendance_records').upsert(attPayload, { onConflict: 'id' });
          } catch (e) {
            console.warn('[Supabase Sync] Upsert attendance_records warning:', e);
          }
        }
      }
    }

    return { success: true, message: 'Đã lưu công nhân thời vụ lên Supabase.' };
  } catch (e: any) {
    console.error('[Supabase Sync] syncSingleSeasonalWorker exception:', e);
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
        { event: '*', schema: 'public', table: 'attendance_records' },
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

