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
import { buildSeasonalMonthlyAttendanceRecord } from '../data/mockSeasonalWorkers';
import {
  buildMonthlyAttendanceRecord,
  sanitizeEmployeeMonthlyAttendance,
  normalizeEmpName,
} from '../utils/payrollCalculator';

const env = (import.meta as any).env || {};

/**
 * Kiểm tra xem object attendance_data có phải là bản đồ ngày công hợp lệ (key từ 1..31) hay không.
 * Ngăn chặn lỗi ghi đè toàn bộ monthlyAttendance hoặc object rỗng {} lên dữ liệu ngày công thực tế.
 */
export const isValidDailyAttendanceMap = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.some((k) => {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > 31) return false;
    const val = obj[k];
    return val && typeof val === 'object' && ('workUnits' in val || 'otHours' in val || 'statusType' in val || 'day' in val);
  });
};

/**
 * Nhận diện bản ghi Tháng 11/2026 bị tự động sao chép nhầm từ Tháng 10/2026
 * (do hàm buildSeasonalMonthlyAttendanceRecord tự sinh hoặc trùng khớp 100% số công & OT của Tháng 10).
 */
export const isLeakedNov2026Record = (novRec: any, octRec?: any): boolean => {
  if (!novRec) return false;
  const novWork = Number(novRec.totalWorkDays ?? novRec.total_work_days ?? 0);
  const novOt = Number(novRec.totalOtHours ?? novRec.total_ot_hours ?? 0);
  if (novWork === 0 && novOt === 0) return false;

  const daysObj = novRec.days || novRec.attendance_data || {};
  const dayValues = Object.values(daysObj) as any[];

  // Bản ghi do buildSeasonalMonthlyAttendanceRecord tự sinh luôn có note = 'Thi công tại công trình'
  if (
    dayValues.length > 0 &&
    dayValues.every(
      (d) =>
        d &&
        (d.note === 'Thi công tại công trình' ||
          d.note === 'Thi công bình thường' ||
          (typeof d.note === 'string' && d.note.startsWith('Thi công + ')))
    )
  ) {
    return true;
  }

  if (octRec) {
    const octWork = Number(octRec.totalWorkDays ?? octRec.total_work_days ?? 0);
    const octOt = Number(octRec.totalOtHours ?? octRec.total_ot_hours ?? 0);
    if (octWork > 0 && novWork === octWork && novOt === octOt) {
      return true;
    }
  }

  return false;
};

/**
 * Đảm bảo dữ liệu ngày công & tăng ca của công nhân thời vụ trong từng tháng đã có
 * được cụ thể hóa đầy đủ vào monthlyAttendance[monthKey].days mà TUYỆT ĐỐI KHÔNG sao chép công từ tháng này sang tháng khác.
 */
export const materializeSeasonalMonthlyAttendance = (
  worker: SeasonalWorker,
  _periodCode?: string
): SeasonalWorker => {
  const nextMonthly: Record<string, any> = { ...(worker.monthlyAttendance || {}) };
  const nextPeriodRecords: Record<string, any> = { ...(worker.periodRecords || {}) };

  // Loại bỏ triệt để dữ liệu Tháng 11/2026 bị sao chép nhầm từ Tháng 10/2026
  if (
    nextMonthly['2026-11'] &&
    isLeakedNov2026Record(nextMonthly['2026-11'], nextMonthly['2026-10'])
  ) {
    delete nextMonthly['2026-11'];
    Object.keys(nextPeriodRecords).forEach((k) => {
      if (k.startsWith('2026-11_')) {
        delete nextPeriodRecords[k];
      }
    });
  }

  // Kiểm tra thêm nếu periodRecords['2026-11_MONTH'] bị dính công sao chép từ Tháng 10
  const octWork = Number(
    nextMonthly['2026-10']?.totalWorkDays ??
      nextPeriodRecords['2026-10_MONTH']?.actualWorkDays ??
      0
  );
  const octOt = Number(
    nextMonthly['2026-10']?.totalOtHours ??
      nextPeriodRecords['2026-10_MONTH']?.overtimeHours ??
      0
  );
  if (nextPeriodRecords['2026-11_MONTH']) {
    const novPRec = nextPeriodRecords['2026-11_MONTH'];
    const novPWork = Number(novPRec.actualWorkDays || 0);
    const novPOt = Number(novPRec.overtimeHours || 0);
    if (
      !nextMonthly['2026-11'] ||
      (octWork > 0 && novPWork === octWork && novPOt === octOt)
    ) {
      Object.keys(nextPeriodRecords).forEach((k) => {
        if (k.startsWith('2026-11_')) {
          delete nextPeriodRecords[k];
        }
      });
    }
  }

  const w: SeasonalWorker = {
    ...worker,
    monthlyAttendance: nextMonthly,
    periodRecords: nextPeriodRecords,
  };

  // 1. Phục hồi các tháng trong monthlyAttendance có totalWorkDays > 0 hoặc totalOtHours > 0 nhưng bị mất chi tiết days
  Object.entries(w.monthlyAttendance || {}).forEach(([mKey, mRec]) => {
    if (!mRec) return;
    const mNum = Number(mRec.month || mKey.split('-')[1] || 0);
    const yNum = Number(mRec.year || mKey.split('-')[0] || 0);
    if (!mNum || !yNum) return;
    const workDays = Number(mRec.totalWorkDays || 0);
    const otHours = Number(mRec.totalOtHours || 0);
    if ((workDays > 0 || otHours > 0) && !isValidDailyAttendanceMap(mRec.days)) {
      w.monthlyAttendance![mKey] = buildSeasonalMonthlyAttendanceRecord(
        w,
        mNum,
        yNum,
        workDays,
        otHours,
        mRec.lastSubmittedAt || '2026-10-01T00:00:00.000Z'
      );
    }
  });

  // 2. Đồng bộ từ periodRecords của các tháng lịch sử (2026-09, 2026-10) sang monthlyAttendance nếu tháng đó chưa có chi tiết ngày
  Object.entries(w.periodRecords || {}).forEach(([pKey, pRec]) => {
    if (!pRec) return;
    const match = pKey.match(/^(\d{4})-(\d{2})_(.+)$/);
    if (!match) return;
    const yNum = Number(match[1]);
    const mNum = Number(match[2]);
    const suffix = match[3];
    const mKey = `${yNum}-${String(mNum).padStart(2, '0')}`;
    if (mKey === '2026-11') return;
    const workDays = Number(pRec.actualWorkDays || 0);
    const otHours = Number(pRec.overtimeHours || 0);
    if (suffix === 'MONTH' && (workDays > 0 || otHours > 0)) {
      const existing = w.monthlyAttendance![mKey];
      if (!existing || (!isValidDailyAttendanceMap(existing.days) && Number(existing.totalWorkDays || 0) === 0)) {
        w.monthlyAttendance![mKey] = buildSeasonalMonthlyAttendanceRecord(
          w,
          mNum,
          yNum,
          workDays,
          otHours,
          existing?.lastSubmittedAt || '2026-10-01T00:00:00.000Z'
        );
      }
    }
  });

  return w;
};


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
    // 1. Tra cứu các dòng hiện có trong bảng employees để đồng nhất ID theo CODE, tránh lỗi duplicate key employees_code_key
    const existingByCode = new Map<string, { id: string; employee_data?: Employee }>();
    const existingById = new Map<string, { id: string; employee_data?: Employee }>();
    try {
      const { data: existingRows } = await client
        .from('employees')
        .select('id, code, employee_data');
      if (existingRows && Array.isArray(existingRows)) {
        existingRows.forEach((row: any) => {
          if (row.code) existingByCode.set(String(row.code).trim(), row);
          if (row.id) existingById.set(String(row.id).trim(), row);
        });
      }
    } catch {}

    const payload = employees.map((rawEmp, idx) => {
      const emp = sanitizeEmployeeMonthlyAttendance(rawEmp);
      const sortOrder = typeof emp.sortOrder === 'number' ? emp.sortOrder : idx + 1;
      const empCode = String(emp.code || `PNC${String(idx + 1).padStart(4, '0')}`).trim();
      const matched = existingByCode.get(empCode) || existingById.get(String(emp.id || '').trim());
      const canonicalId = matched?.id ? String(matched.id) : String(emp.id || empCode || `EMP_${idx + 1}`);
      const existingData = matched?.employee_data
        ? sanitizeEmployeeMonthlyAttendance(matched.employee_data)
        : undefined;
      const samePerson =
        existingData &&
        normalizeEmpName(existingData.fullName) === normalizeEmpName(emp.fullName);

      // Hợp nhất lịch sử chấm công các tháng (chỉ gộp nếu cùng 1 nhân sự, ưu tiên bản ghi mới hơn)
      const mergedMonthly = samePerson ? { ...(existingData?.monthlyAttendance || {}) } : {};
      if (!emp.monthlyAttendance?.['2026-11']) {
        delete mergedMonthly['2026-11'];
      }
      Object.entries(emp.monthlyAttendance || {}).forEach(([mKey, mRec]) => {
        if (!mRec) return;
        const oldRec = mergedMonthly[mKey];
        if (!oldRec) {
          mergedMonthly[mKey] = mRec;
        } else {
          const oldIsDefault = oldRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
          const newIsDefault = mRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
          const oldTs = oldRec.lastSubmittedAt ? new Date(oldRec.lastSubmittedAt).getTime() : 0;
          const newTs = mRec.lastSubmittedAt ? new Date(mRec.lastSubmittedAt).getTime() : 0;
          if (!newIsDefault && oldIsDefault) {
            mergedMonthly[mKey] = mRec;
          } else if (newIsDefault && !oldIsDefault) {
            mergedMonthly[mKey] = oldRec;
          } else if (newTs >= oldTs) {
            mergedMonthly[mKey] = mRec;
          }
        }
      });

      const mergedEmp: Employee = sanitizeEmployeeMonthlyAttendance({
        ...(samePerson ? existingData || {} : {}),
        ...emp,
        id: canonicalId,
        code: empCode,
        sortOrder,
        monthlyAttendance: mergedMonthly,
        periodRecords: samePerson
          ? {
              ...(existingData?.periodRecords || {}),
              ...(emp.periodRecords || {}),
            }
          : emp.periodRecords || {},
      });

      return {
        id: canonicalId,
        code: empCode,
        name: String(mergedEmp.fullName || 'Nhân viên'),
        department: String(mergedEmp.department || 'Phòng ban'),
        position: String(mergedEmp.title || ''),
        phone: String(mergedEmp.phone || ''),
        email: String(mergedEmp.email || ''),
        tax_code: String(mergedEmp.taxCode || ''),
        id_card: String(mergedEmp.idCard || ''),
        bank_account: String(mergedEmp.bankAccount || ''),
        bank_name: String(mergedEmp.bankName || ''),
        join_date: String(mergedEmp.joinDate || ''),
        status: String(mergedEmp.status || 'ACTIVE'),
        base_salary: Number(mergedEmp.baseSalary || 0),
        insurance_salary: Number(mergedEmp.insuranceSalary || 0),
        standard_work_days: Number(mergedEmp.standardWorkDays || 26),
        actual_work_days: Number(mergedEmp.actualWorkDays || 0),
        overtime_hours: Number(mergedEmp.overtimeHours || 0),
        advance_payment: Number(mergedEmp.advancePayment || 0),
        net_salary: Number(mergedEmp.netSalary || 0),
        period_code: String(periodCode || '09/2026'),
        employee_data: mergedEmp,
        updated_at: new Date().toISOString(),
      };
    });

    let { error } = await client.from('employees').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      const retryByCode = await client.from('employees').upsert(payload, {
        onConflict: 'code',
      });
      error = retryByCode.error;
    }

    if (error) {
      console.error('Sync employees to Supabase failed:', error);
      return {
        success: false,
        count: 0,
        message: `Lỗi bảng employees: ${error.message}`,
        error: error.message,
      };
    }

    // Đồng bộ chi tiết ngày công nhân viên chính thức vào bảng attendance_records
    try {
      const existingAttMap = new Map<string, string>();
      try {
        const { data: exAtt } = await client
          .from('attendance_records')
          .select('id, worker_code, month, year')
          .eq('worker_type', 'PERMANENT');
        if (exAtt && Array.isArray(exAtt)) {
          exAtt.forEach((r: any) => {
            existingAttMap.set(`${r.worker_code}_${r.year}_${r.month}`, String(r.id));
          });
        }
      } catch {}

      const attPayloads: any[] = [];
      payload.forEach((p) => {
        const emp = p.employee_data;
        if (emp?.monthlyAttendance) {
          Object.entries(emp.monthlyAttendance).forEach(([, mRec]) => {
            if (mRec && mRec.month && mRec.year) {
              const mStr = String(mRec.month).padStart(2, '0');
              const mapKey = `${p.code}_${mRec.year}_${Number(mRec.month)}`;
              const canonicalAttId = existingAttMap.get(mapKey) || `ATT-EMP-${mRec.year}-${mStr}-${p.code}`;
              attPayloads.push({
                id: canonicalAttId,
                worker_type: 'PERMANENT',
                worker_code: p.code,
                worker_name: p.name,
                project_code: p.department,
                month: Number(mRec.month),
                year: Number(mRec.year),
                period_key: `${mStr}/${mRec.year}`,
                total_work_days: Number(mRec.totalWorkDays || 0),
                total_ot_hours: Number(mRec.totalOtHours || 0),
                attendance_data: isValidDailyAttendanceMap(mRec.days) ? mRec.days : {},
                updated_at: mRec.lastSubmittedAt || new Date().toISOString(),
              });
            }
          });
        }
      });
      if (attPayloads.length > 0) {
        await client.from('attendance_records').upsert(attPayloads, { onConflict: 'id' });
      }
    } catch {}

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
      .select('*');

    if (error || !data || data.length === 0) return null;

    let attRecords: any[] = [];
    try {
      const { data: attData } = await client.from('attendance_records').select('*');
      if (attData && Array.isArray(attData)) {
        attRecords = attData;
      }
    } catch {}

    const list = data
      .map((item: any) => {
        const emp = (item.employee_data || {}) as Employee;
        return {
          ...emp,
          id: String(item.id || emp.id),
          code: String(item.code || emp.code),
          fullName: emp.fullName || item.name || 'Nhân viên',
          department: emp.department || item.department || 'Phòng ban',
          title: emp.title || item.position || 'Nhân viên',
          bankAccount: emp.bankAccount || item.bank_account || '',
          bankName: emp.bankName || item.bank_name || 'Vietcombank',
        };
      })
      .filter((emp) => emp && emp.fullName);

    if (attRecords.length > 0) {
      list.forEach((emp) => {
        const empNormName = normalizeEmpName(emp.fullName);
        const matchingAtts = attRecords.filter((a) => {
          const codeMatch = a.worker_code === emp.code || a.worker_code === emp.id;
          if (!codeMatch) return false;
          if (a.worker_name && normalizeEmpName(a.worker_name) !== empNormName) {
            return false;
          }
          return true;
        });
        matchingAtts.forEach((att) => {
          const mNum = Number(att.month);
          const yNum = Number(att.year);
          const mStr = String(mNum).padStart(2, '0');
          const monthKey = `${yNum}-${mStr}`;
          if (!emp.monthlyAttendance) emp.monthlyAttendance = {};

          const existingRec = emp.monthlyAttendance[monthKey];
          const existingTs = existingRec?.lastSubmittedAt ? new Date(existingRec.lastSubmittedAt).getTime() : 0;
          const attTs = att.updated_at ? new Date(att.updated_at).getTime() : 0;

          if (isValidDailyAttendanceMap(att.attendance_data)) {
            if (!existingRec || (attTs > 0 && attTs > existingTs)) {
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
          }
        });
      });
    }

    return list
      .map((emp) => sanitizeEmployeeMonthlyAttendance(emp))
      .sort((a, b) => {
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
    // 1. Tra cứu các dòng hiện có trong seasonal_workers theo CODE & ID để đồng nhất ID
    // Tránh tuyệt đối lỗi "duplicate key value violates unique constraint seasonal_workers_code_key" khi lưu hàng loạt!
    const existingByCode = new Map<string, { id: string; code: string; worker_data?: SeasonalWorker }>();
    const existingById = new Map<string, { id: string; code: string; worker_data?: SeasonalWorker }>();
    try {
      const { data: existingRows } = await client
        .from('seasonal_workers')
        .select('id, code, worker_data');
      if (existingRows && Array.isArray(existingRows)) {
        existingRows.forEach((row: any) => {
          if (row.code) existingByCode.set(String(row.code).trim(), row);
          if (row.id) existingById.set(String(row.id).trim(), row);
        });
      }
    } catch (lookupErr) {
      console.warn('[Supabase Sync] Lookup existing seasonal_workers warning:', lookupErr);
    }

    const materializedWorkers: SeasonalWorker[] = [];

    const payload = workers.map((w, idx) => {
      const sortOrder = typeof w.sortOrder === 'number' ? w.sortOrder : idx + 1;
      const workerCode = String(w.code || `PNC-TV${String(idx + 1).padStart(2, '0')}`).trim();
      const matched = existingByCode.get(workerCode) || existingById.get(String(w.id || '').trim());
      const canonicalId = matched?.id ? String(matched.id) : String(w.id || `SW_${idx + 1}`);
      const existingData = matched?.worker_data;

      // Hợp nhất lịch sử chấm công các tháng giữa Cloud và máy hiện tại (đã lọc sạch bản ghi 2026-11 bị rò rỉ)
      const cleanedExisting = existingData ? materializeSeasonalMonthlyAttendance(existingData) : undefined;
      const cleanedLocal = materializeSeasonalMonthlyAttendance(w);
      const mergedMonthlyAttendance: Record<string, any> = {
        ...(cleanedExisting?.monthlyAttendance || {}),
      };
      // Nếu ở máy hiện tại đã xóa 2026-11 thì không lấy lại 2026-11 cũ từ Cloud
      if (!cleanedLocal.monthlyAttendance?.['2026-11']) {
        delete mergedMonthlyAttendance['2026-11'];
      }
      Object.entries(cleanedLocal.monthlyAttendance || {}).forEach(([mKey, newRec]) => {
        if (!newRec) return;
        const oldRec = mergedMonthlyAttendance[mKey];
        if (!oldRec) {
          mergedMonthlyAttendance[mKey] = newRec;
        } else {
          const oldHasDays = isValidDailyAttendanceMap(oldRec.days);
          const oldIsDefault = oldRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
          const newIsDefault = newRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';

          if (newIsDefault && !oldIsDefault && (oldHasDays || Number(oldRec.totalWorkDays || 0) > 0)) {
            // Không để dữ liệu mẫu khởi tạo ghi đè lên dữ liệu chấm công thật đã có trên Cloud
            mergedMonthlyAttendance[mKey] = oldRec;
          } else {
            mergedMonthlyAttendance[mKey] = newRec;
          }
        }
      });

      const mergedPeriodRecords = {
        ...(cleanedExisting?.periodRecords || {}),
        ...(cleanedLocal.periodRecords || {}),
      };
      if (!cleanedLocal.monthlyAttendance?.['2026-11']) {
        Object.keys(mergedPeriodRecords).forEach((k) => {
          if (k.startsWith('2026-11_')) delete mergedPeriodRecords[k];
        });
      }

      const fullWorker = materializeSeasonalMonthlyAttendance(
        {
          ...(cleanedExisting || {}),
          ...cleanedLocal,
          id: canonicalId,
          code: workerCode,
          sortOrder,
          monthlyAttendance: mergedMonthlyAttendance,
          periodRecords: mergedPeriodRecords,
        },
        periodCode
      );

      materializedWorkers.push(fullWorker);

      return {
        id: canonicalId,
        code: workerCode,
        name: String(fullWorker.fullName || 'Công nhân'),
        trade: String(fullWorker.trade || ''),
        skill_level: String(fullWorker.skillLevel || ''),
        project: String(fullWorker.project || ''),
        team: String(fullWorker.teamName || ''),
        phone: String(fullWorker.phone || ''),
        id_card: String(fullWorker.idCard || ''),
        bank_account: String(fullWorker.bankAccount || ''),
        bank_name: String(fullWorker.bankName || ''),
        daily_rate: Number(fullWorker.dailyRate || 0),
        actual_work_days: Number(fullWorker.actualWorkDays || 0),
        overtime_hours: Number(fullWorker.overtimeHours || 0),
        advance_payment: Number(fullWorker.advancePayment || 0),
        has_tax_commitment: Boolean(fullWorker.hasTaxCommitment ?? true),
        payment_method: String(fullWorker.paymentMethod || 'BANK'),
        payroll_cycle_type: String(fullWorker.payrollCycleType || '1_WEEK'),
        status: String(fullWorker.status || 'ACTIVE'),
        net_salary: Number(fullWorker.netSalary || 0),
        period_code: String(periodCode || '09/2026'),
        worker_data: fullWorker,
        updated_at: new Date().toISOString(),
      };
    });

    let { error } = await client.from('seasonal_workers').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      console.warn('Sync seasonal_workers by id failed, retrying onConflict code:', error.message);
      const retryByCode = await client.from('seasonal_workers').upsert(payload, {
        onConflict: 'code',
      });
      error = retryByCode.error;
    }

    if (error) {
      console.warn('Sync seasonal_workers full payload failed, trying minimal core payload:', error.message);
      const minimalPayload = payload.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        trade: p.trade,
        project: p.project,
        bank_account: p.bank_account,
        bank_name: p.bank_name,
        daily_rate: p.daily_rate,
        worker_data: p.worker_data,
        updated_at: p.updated_at,
      }));
      let { error: retryErr } = await client.from('seasonal_workers').upsert(minimalPayload, {
        onConflict: 'id',
      });
      if (retryErr) {
        const retryCodeMin = await client.from('seasonal_workers').upsert(minimalPayload, {
          onConflict: 'code',
        });
        retryErr = retryCodeMin.error;
      }
      if (retryErr) {
        console.error('Sync seasonal_workers minimal fallback failed:', retryErr);
        return {
          success: false,
          count: 0,
          message: `Lỗi bảng seasonal_workers: ${retryErr.message}`,
          error: retryErr.message,
        };
      }
    }

    // 2. Đồng bộ luôn bảng attendance_records cho các công nhân thời vụ để dữ liệu chấm công khớp 100%
    try {
      const existingAttMap = new Map<string, string>();
      try {
        const { data: exAtt } = await client
          .from('attendance_records')
          .select('id, worker_code, month, year');
        if (exAtt && Array.isArray(exAtt)) {
          exAtt.forEach((r: any) => {
            if (r.worker_code && r.year && r.month) {
              existingAttMap.set(`${String(r.worker_code).trim()}_${Number(r.year)}_${Number(r.month)}`, String(r.id));
            }
          });
        }
      } catch {}

      const attPayloads: any[] = [];
      materializedWorkers.forEach((w, idx) => {
        const workerCode = String(w.code || w.id || `PNC-TV${String(idx + 1).padStart(2, '0')}`).trim();
        if (w.monthlyAttendance) {
          Object.entries(w.monthlyAttendance).forEach(([, mRec]) => {
            if (mRec && mRec.month && mRec.year) {
              const mStr = String(mRec.month).padStart(2, '0');
              const mapKey = `${workerCode}_${Number(mRec.year)}_${Number(mRec.month)}`;
              const canonicalAttId = existingAttMap.get(mapKey) || `ATT-SEA-${mRec.year}-${mStr}-${workerCode}`;
              attPayloads.push({
                id: canonicalAttId,
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
        const { error: attErr } = await client.from('attendance_records').upsert(attPayloads, { onConflict: 'id' });
        if (attErr) {
          await client.from('attendance_records').upsert(attPayloads, { onConflict: 'worker_code,month,year' });
        }
      }
    } catch (attErr) {
      console.warn('[Supabase Sync] Sync seasonal attendance_records warning:', attErr);
    }

    return {
      success: true,
      count: payload.length,
      message: `Đã đồng bộ ${payload.length} công nhân thời vụ và toàn bộ chấm công lên Supabase.`,
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
    // để đảm bảo mọi thợ, thông tin STK ngân hàng và toàn bộ lịch sử chấm công không bao giờ bị lọc mất
    let { data, error } = await client.from('seasonal_workers').select('*');

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
      .map((item: any) => {
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
          teamName: w.teamName || item.team || item.team_name || '',
          bankAccount: w.bankAccount || item.bank_account || '',
          bankName:
            w.bankName ||
            item.bank_name ||
            ((w.paymentMethod || item.payment_method) === 'CASH' ? 'Tiền mặt' : 'Vietcombank'),
          paymentMethod: w.paymentMethod || item.payment_method || 'BANK',
          phone: w.phone || item.phone || '',
          idCard: w.idCard || item.id_card || '',
          actualWorkDays: Number(w.actualWorkDays ?? item.actual_work_days ?? 0),
          overtimeHours: Number(w.overtimeHours ?? item.overtime_hours ?? 0),
          dailyRate: Number(w.dailyRate ?? item.daily_rate ?? 0),
        };
      })
      .filter((w) => w && (w.fullName || w.code));

    // Hợp nhất dữ liệu chi tiết từng ngày từ attendance_records vào monthlyAttendance của từng thợ
    // Bảo vệ tuyệt đối: không bao giờ để bản ghi attendance_data rỗng {} ghi đè mất dữ liệu ngày công thực tế!
    if (attRecords.length > 0) {
      const leakedAttIdsToDelete: string[] = [];
      list.forEach((w) => {
        const workerCode = w.code || w.id;
        const matchingAtts = attRecords.filter(
          (a) => a.worker_code === workerCode || a.worker_code === w.code || a.worker_code === w.id
        );
        const octAtt = matchingAtts.find((a) => Number(a.month) === 10 && Number(a.year) === 2026);
        matchingAtts.forEach((att) => {
          const mNum = Number(att.month);
          const yNum = Number(att.year);
          const mStr = String(mNum).padStart(2, '0');
          const monthKey = `${yNum}-${mStr}`;
          if (!w.monthlyAttendance) w.monthlyAttendance = {};

          // Nếu là bản ghi Tháng 11/2026 bị tự động sao chép nhầm từ Tháng 10/2026 -> bỏ qua và đánh dấu xóa trên DB
          if (
            mNum === 11 &&
            yNum === 2026 &&
            isLeakedNov2026Record(att, w.monthlyAttendance['2026-10'] || octAtt)
          ) {
            if (att.id) leakedAttIdsToDelete.push(String(att.id));
            return;
          }

          const existingRec = w.monthlyAttendance[monthKey];
          const existingTs = existingRec?.lastSubmittedAt ? new Date(existingRec.lastSubmittedAt).getTime() : 0;
          const attTs = att.updated_at ? new Date(att.updated_at).getTime() : 0;
          const attHasValidDays = isValidDailyAttendanceMap(att.attendance_data);
          const existingHasValidDays = isValidDailyAttendanceMap(existingRec?.days);
          const attWorkDays = Number(att.total_work_days || 0);
          const attOtHours = Number(att.total_ot_hours || 0);

          if (attHasValidDays) {
            if (!existingRec || !existingHasValidDays || (attTs > 0 && attTs >= existingTs)) {
              w.monthlyAttendance[monthKey] = {
                monthKey,
                month: mNum,
                year: yNum,
                totalWorkDays: attWorkDays,
                totalOtHours: attOtHours,
                days: att.attendance_data,
                lastSubmittedAt: att.updated_at,
                submittedBy: 'WORKER',
              };
            }
          } else if (!existingRec && (attWorkDays > 0 || attOtHours > 0) && monthKey !== '2026-11') {
            // Nếu bảng attendance_records có lưu tổng ngày công / tăng ca của các tháng trước nhưng thiếu chi tiết từng ngày -> tái tạo chi tiết ngày
            w.monthlyAttendance[monthKey] = buildSeasonalMonthlyAttendanceRecord(
              w,
              mNum,
              yNum,
              attWorkDays,
              attOtHours,
              att.updated_at || '2026-10-01T00:00:00.000Z'
            );
          }
        });
      });

      if (leakedAttIdsToDelete.length > 0) {
        client
          .from('attendance_records')
          .delete()
          .in('id', leakedAttIdsToDelete)
          .then(() => {});
      }
    }

    // Cụ thể hóa đầy đủ monthlyAttendance cho mọi công nhân (phục hồi các tháng có công trong periodRecords hoặc totalWorkDays > 0)
    const healedList = list.map((w) => materializeSeasonalMonthlyAttendance(w, periodCode));

    // Sắp xếp nhất quán tuyệt đối giữa tất cả các máy tính:
    // 1. Ưu tiên sortOrder được lưu
    // 2. Sắp xếp tự nhiên theo Mã thợ: PNC-TV01 < PNC-TV02 < PNC-TV03 < ... < PNC-TV13
    return healedList.sort((a, b) => {
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
    const existingAttMap = new Map<string, string>();
    try {
      const { data: exAtt } = await client
        .from('attendance_records')
        .select('id, worker_code, month, year');
      if (exAtt && Array.isArray(exAtt)) {
        exAtt.forEach((r: any) => {
          if (r.worker_code && r.year && r.month) {
            existingAttMap.set(`${String(r.worker_code).trim()}_${Number(r.year)}_${Number(r.month)}`, String(r.id));
          }
        });
      }
    } catch {}

    const payload = records.map((r) => {
      const workerCode = String(r.workerCode || '').trim();
      const mNum = Number(r.month);
      const yNum = Number(r.year);
      const mapKey = `${workerCode}_${yNum}_${mNum}`;
      const canonicalId = existingAttMap.get(mapKey) || String(r.id);
      return {
        id: canonicalId,
        worker_type: String(r.workerType || 'PERMANENT'),
        worker_code: workerCode,
        worker_name: String(r.workerName),
        project_code: String(r.projectCode || ''),
        month: mNum,
        year: yNum,
        period_key: String(r.periodKey || `${mNum < 10 ? '0' + mNum : mNum}/${yNum}`),
        total_work_days: Number(r.totalWorkDays || 0),
        total_ot_hours: Number(r.totalOtHours || 0),
        attendance_data: r.attendanceData || {},
        updated_at: new Date().toISOString(),
      };
    });

    let { error } = await client.from('attendance_records').upsert(payload, { onConflict: 'id' });
    if (error) {
      const retry = await client.from('attendance_records').upsert(payload, { onConflict: 'worker_code,month,year' });
      error = retry.error;
    }
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

    // Hợp nhất dữ liệu chấm công: Không bao giờ để mất các tháng/kỳ đã chấm trước đó (đã lọc sạch 2026-11 bị rò rỉ)
    const cleanedExisting = existingWorkerData
      ? materializeSeasonalMonthlyAttendance(existingWorkerData)
      : undefined;
    const cleanedLocal = materializeSeasonalMonthlyAttendance(worker);
    const mergedMonthlyAttendance: Record<string, any> = {
      ...(cleanedExisting?.monthlyAttendance || {}),
    };
    if (!cleanedLocal.monthlyAttendance?.['2026-11']) {
      delete mergedMonthlyAttendance['2026-11'];
    }
    Object.entries(cleanedLocal.monthlyAttendance || {}).forEach(([mKey, newRec]) => {
      if (!newRec) return;
      const oldRec = mergedMonthlyAttendance[mKey];
      if (!oldRec) {
        mergedMonthlyAttendance[mKey] = newRec;
      } else {
        const oldHasDays = isValidDailyAttendanceMap(oldRec.days);
        const oldIsDefault = oldRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
        const newIsDefault = newRec.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
        if (newIsDefault && !oldIsDefault && (oldHasDays || Number(oldRec.totalWorkDays || 0) > 0)) {
          mergedMonthlyAttendance[mKey] = oldRec;
        } else {
          mergedMonthlyAttendance[mKey] = newRec;
        }
      }
    });

    const mergedPeriodRecords = {
      ...(cleanedExisting?.periodRecords || {}),
      ...(cleanedLocal.periodRecords || {}),
    };
    if (!cleanedLocal.monthlyAttendance?.['2026-11']) {
      Object.keys(mergedPeriodRecords).forEach((k) => {
        if (k.startsWith('2026-11_')) delete mergedPeriodRecords[k];
      });
    }
    const effectiveDailyRate = Number(worker.dailyRate || existingWorkerData?.dailyRate || 0);
    if (effectiveDailyRate > 0) {
      Object.keys(mergedPeriodRecords).forEach((k) => {
        const r = mergedPeriodRecords[k];
        if (!r) return;
        const sByDays = Math.round(effectiveDailyRate * Number(r.actualWorkDays || 0));
        const otPay = Math.round((effectiveDailyRate / 8) * Number(r.overtimeHours || 0) * 1.5);
        const totInc =
          sByDays +
          otPay +
          Number(r.mealAllowance || 0) +
          Number(r.travelSafetyAllowance || 0) +
          Number(r.otherBonus || 0);
        const tax = !(r.hasTaxCommitment ?? true) && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
        const totDed = tax + Number(r.advancePayment || 0);
        mergedPeriodRecords[k] = {
          ...r,
          dailyRate: effectiveDailyRate,
          salaryByDays: sByDays,
          overtimePay: otPay,
          totalIncome: totInc,
          personalIncomeTax: tax,
          totalDeductions: totDed,
          netSalary: totInc - totDed,
        };
      });
    }

    const sortOrder = typeof worker.sortOrder === 'number'
      ? worker.sortOrder
      : (typeof existingWorkerData?.sortOrder === 'number' ? existingWorkerData.sortOrder : 99);

    const hasExplicitBankEdit = Boolean((worker as any).bankUpdatedAt);
    const effectiveBankAccount = hasExplicitBankEdit
      ? String(worker.bankAccount || '').trim()
      : String(worker.bankAccount || existingWorkerData?.bankAccount || '').trim();
    const effectiveBankName = hasExplicitBankEdit
      ? String(worker.bankName || '').trim()
      : String(worker.bankName || existingWorkerData?.bankName || 'Vietcombank').trim();
    const effectivePaymentMethod = hasExplicitBankEdit
      ? (worker.paymentMethod || 'BANK')
      : (worker.paymentMethod || existingWorkerData?.paymentMethod || 'BANK');

    const mergedWorker = materializeSeasonalMonthlyAttendance(
      {
        ...(existingWorkerData || {}),
        ...worker,
        id: String(canonicalId),
        code: workerCode,
        fullName: worker.fullName || existingWorkerData?.fullName || 'Công nhân',
        trade: worker.trade || existingWorkerData?.trade || '',
        project: worker.project || existingWorkerData?.project || '',
        teamName: worker.teamName || existingWorkerData?.teamName || '',
        bankAccount: effectiveBankAccount,
        bankName: effectiveBankName,
        paymentMethod: effectivePaymentMethod,
        dailyRate: effectiveDailyRate > 0 ? effectiveDailyRate : Number(worker.dailyRate || 0),
        sortOrder,
        monthlyAttendance: mergedMonthlyAttendance,
        periodRecords: mergedPeriodRecords,
      },
      periodCode
    );

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
        // Fallback tối giản tương thích với mọi phiên bản schema seasonal_workers
        const minimalPayload = {
          id: String(canonicalId),
          code: String(workerCode),
          name: String(mergedWorker.fullName || 'Công nhân'),
          trade: String(mergedWorker.trade || ''),
          project: String(mergedWorker.project || ''),
          bank_account: String(mergedWorker.bankAccount || ''),
          bank_name: String(mergedWorker.bankName || ''),
          daily_rate: Number(mergedWorker.dailyRate || 0),
          worker_data: mergedWorker,
          updated_at: new Date().toISOString(),
        };
        const { error: minUpsertErr } = await client
          .from('seasonal_workers')
          .upsert(minimalPayload, { onConflict: 'id' });
        if (minUpsertErr) {
          await client
            .from('seasonal_workers')
            .update({ worker_data: mergedWorker, updated_at: new Date().toISOString() })
            .eq('code', workerCode);
        }
      }
    }

    // 2. Đồng bộ chi tiết ngày công vào bảng attendance_records trên Supabase
    // Đảm bảo dữ liệu chấm công từ điện thoại được lưu vào cả 2 bảng và xóa bỏ các bản ghi trùng lặp cũ
    if (mergedWorker.monthlyAttendance) {
      for (const [, mRec] of Object.entries(mergedWorker.monthlyAttendance)) {
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
  id: string,
  code?: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const strId = String(id).trim();
    const strCode = code ? String(code).trim() : '';

    const { error } = await client
      .from('seasonal_workers')
      .delete()
      .eq('id', strId);

    if (strCode) {
      await client
        .from('seasonal_workers')
        .delete()
        .eq('code', strCode);
    }

    const attCodes = Array.from(new Set([strId, strCode].filter(Boolean)));
    if (attCodes.length > 0) {
      await client
        .from('attendance_records')
        .delete()
        .in('worker_code', attCodes);
    }

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
  ids: string[],
  codes?: string[]
): Promise<{ success: boolean; count: number; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, message: 'Chưa cấu hình Supabase Client.' };
  if (ids.length === 0 && (!codes || codes.length === 0)) {
    return { success: true, count: 0, message: 'Danh sách rỗng.' };
  }

  try {
    const stringIds = ids.map((id) => String(id).trim()).filter(Boolean);
    const stringCodes = (codes || []).map((c) => String(c).trim()).filter(Boolean);

    let error: any = null;
    if (stringIds.length > 0) {
      const res = await client
        .from('seasonal_workers')
        .delete()
        .in('id', stringIds);
      error = res.error;
    }

    if (stringCodes.length > 0) {
      await client
        .from('seasonal_workers')
        .delete()
        .in('code', stringCodes);
    }

    const attCodes = Array.from(new Set([...stringIds, ...stringCodes]));
    if (attCodes.length > 0) {
      await client
        .from('attendance_records')
        .delete()
        .in('worker_code', attCodes);
    }

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
    const empCode = String(employee.code || employee.id).trim();
    let existingRowId: string | null = null;
    let existingEmpData: Employee | null = null;

    try {
      const { data: codeMatches } = await client
        .from('employees')
        .select('id, code, employee_data')
        .eq('code', empCode)
        .limit(1);
      if (codeMatches && codeMatches.length > 0) {
        existingRowId = codeMatches[0].id;
        existingEmpData = codeMatches[0].employee_data as Employee;
      }
    } catch {}

    const canonicalId = existingRowId || String(employee.id || empCode);
    const cleanedExisting = existingEmpData
      ? sanitizeEmployeeMonthlyAttendance(existingEmpData)
      : undefined;
    const cleanedLocal = sanitizeEmployeeMonthlyAttendance(employee);
    const samePerson =
      cleanedExisting &&
      normalizeEmpName(cleanedExisting.fullName) === normalizeEmpName(cleanedLocal.fullName);

    const mergedMonthly = samePerson
      ? {
          ...(cleanedExisting?.monthlyAttendance || {}),
          ...(cleanedLocal.monthlyAttendance || {}),
        }
      : { ...(cleanedLocal.monthlyAttendance || {}) };
    if (!cleanedLocal.monthlyAttendance?.['2026-11']) {
      delete mergedMonthly['2026-11'];
    }

    const mergedEmployee: Employee = sanitizeEmployeeMonthlyAttendance({
      ...(samePerson ? cleanedExisting || {} : {}),
      ...cleanedLocal,
      id: String(canonicalId),
      code: empCode,
      monthlyAttendance: mergedMonthly,
      periodRecords: samePerson
        ? {
            ...(cleanedExisting?.periodRecords || {}),
            ...(cleanedLocal.periodRecords || {}),
          }
        : cleanedLocal.periodRecords || {},
    });

    const payload = {
      id: String(canonicalId),
      code: empCode,
      name: String(mergedEmployee.fullName || 'Nhân viên'),
      department: String(mergedEmployee.department || 'Phòng ban'),
      position: String(mergedEmployee.title || ''),
      phone: String(mergedEmployee.phone || ''),
      email: String(mergedEmployee.email || ''),
      tax_code: String(mergedEmployee.taxCode || ''),
      id_card: String(mergedEmployee.idCard || ''),
      bank_account: String(mergedEmployee.bankAccount || ''),
      bank_name: String(mergedEmployee.bankName || ''),
      join_date: String(mergedEmployee.joinDate || ''),
      status: String(mergedEmployee.status || 'ACTIVE'),
      base_salary: Number(mergedEmployee.baseSalary || 0),
      insurance_salary: Number(mergedEmployee.insuranceSalary || 0),
      standard_work_days: Number(mergedEmployee.standardWorkDays || 26),
      actual_work_days: Number(mergedEmployee.actualWorkDays || 0),
      overtime_hours: Number(mergedEmployee.overtimeHours || 0),
      advance_payment: Number(mergedEmployee.advancePayment || 0),
      net_salary: Number(mergedEmployee.netSalary || 0),
      period_code: String(periodCode || '09/2026'),
      employee_data: mergedEmployee,
      updated_at: new Date().toISOString(),
    };

    let { error } = await client.from('employees').upsert(payload, {
      onConflict: 'id',
    });

    if (error) {
      const retry = await client.from('employees').upsert(payload, {
        onConflict: 'code',
      });
      error = retry.error;
    }

    if (error) {
      console.error('syncSingleEmployee error:', error);
      return { success: false, message: error.message, error: error.message };
    }

    if (mergedEmployee.monthlyAttendance) {
      for (const [, mRec] of Object.entries(mergedEmployee.monthlyAttendance)) {
        if (mRec && mRec.month && mRec.year) {
          const mStr = String(mRec.month).padStart(2, '0');
          const attId = `ATT-EMP-${mRec.year}-${mStr}-${empCode}`;
          const attPayload = {
            id: attId,
            worker_type: 'PERMANENT',
            worker_code: empCode,
            worker_name: String(mergedEmployee.fullName || 'Nhân viên'),
            project_code: String(mergedEmployee.department || ''),
            month: Number(mRec.month),
            year: Number(mRec.year),
            period_key: `${mStr}/${mRec.year}`,
            total_work_days: Number(mRec.totalWorkDays || 0),
            total_ot_hours: Number(mRec.totalOtHours || 0),
            attendance_data: isValidDailyAttendanceMap(mRec.days) ? mRec.days : {},
            updated_at: mRec.lastSubmittedAt || new Date().toISOString(),
          };
          try {
            await client
              .from('attendance_records')
              .delete()
              .eq('worker_code', empCode)
              .eq('month', Number(mRec.month))
              .eq('year', Number(mRec.year))
              .neq('id', attId);
            await client.from('attendance_records').upsert(attPayload, { onConflict: 'id' });
          } catch {}
        }
      }
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
  id: string,
  code?: string
): Promise<{ success: boolean; message: string; error?: string }> => {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: 'Chưa cấu hình Supabase Client.' };

  try {
    const strId = String(id).trim();
    const strCode = code ? String(code).trim() : '';

    const { error } = await client
      .from('employees')
      .delete()
      .eq('id', strId);

    if (strCode) {
      await client
        .from('employees')
        .delete()
        .eq('code', strCode);
    }

    const attCodes = Array.from(new Set([strId, strCode].filter(Boolean)));
    if (attCodes.length > 0) {
      await client
        .from('attendance_records')
        .delete()
        .in('worker_code', attCodes);
    }

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

