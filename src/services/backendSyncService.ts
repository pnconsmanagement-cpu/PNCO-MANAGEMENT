import { CompanyConfig, Employee, SeasonalWorker, Project, TeamWorker, SalaryAdvance } from '../types';

export interface ServerSyncData {
  lastUpdated: number;
  config: CompanyConfig | null;
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  projects?: Project[];
  teamWorkers?: TeamWorker[];
  salaryAdvances?: SalaryAdvance[];
}

let lastSyncedTimestamp = 0;
let lastSyncTimeString: string | null = null;
let syncListeners: Array<(data: ServerSyncData) => void> = [];
let isPollingActive = false;
let pollingInterval: any = null;

/**
 * Lấy URL gốc của API Backend
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    if (
      origin.includes('.run.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('.vercel.app')
    ) {
      return '';
    }
    const envAppUrl = (import.meta as any).env?.VITE_APP_URL;
    if (envAppUrl && envAppUrl.startsWith('http')) {
      return envAppUrl.replace(/\/$/, '');
    }
  }
  return '';
}

/**
 * Lấy toàn bộ dữ liệu mới nhất từ máy chủ
 */
export async function fetchServerData(updateLocalTimestamp: boolean = true): Promise<ServerSyncData | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/sync`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.lastUpdated === 'number') {
      // Tự động đồng bộ cấu hình Supabase từ máy chủ sang máy tính mới nếu máy này chưa có
      if (data.config?.supabaseUrl && data.config?.supabaseAnonKey) {
        try {
          const curUrl = localStorage.getItem('supabase_config_url') || '';
          const curKey = localStorage.getItem('supabase_config_anon_key') || '';
          if (!curUrl || !curKey) {
            localStorage.setItem('supabase_config_url', String(data.config.supabaseUrl).trim());
            localStorage.setItem('supabase_config_anon_key', String(data.config.supabaseAnonKey).trim());
          }
        } catch {}
      }
      if (data.lastUpdated > 0 && (updateLocalTimestamp || lastSyncedTimestamp === 0)) {
        lastSyncedTimestamp = data.lastUpdated;
        lastSyncTimeString = new Date(data.lastUpdated).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[Sync] Cannot fetch from server:', err);
    return null;
  }
}

/**
 * Lưu toàn bộ dữ liệu lên máy chủ (đính kèm tự động thông tin kết nối Supabase để các máy tính khác tự nhận)
 */
export async function saveAllToServer(
  config: CompanyConfig,
  employees: Employee[],
  seasonalWorkers: SeasonalWorker[],
  projects?: Project[],
  teamWorkers?: TeamWorker[],
  salaryAdvances?: SalaryAdvance[]
): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    let enrichedConfig: any = { ...config };
    try {
      const sbUrl = localStorage.getItem('supabase_config_url') || '';
      const sbKey = localStorage.getItem('supabase_config_anon_key') || '';
      if (sbUrl && sbKey) {
        enrichedConfig = {
          ...enrichedConfig,
          supabaseUrl: sbUrl.trim(),
          supabaseAnonKey: sbKey.trim(),
        };
      }
    } catch {}

    const res = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: enrichedConfig,
        employees,
        seasonalWorkers,
        ...(projects !== undefined ? { projects } : {}),
        ...(teamWorkers !== undefined ? { teamWorkers } : {}),
        ...(salaryAdvances !== undefined ? { salaryAdvances } : {}),
      }),
    });
    if (!res.ok) return false;
    const result = await res.json();
    if (result && result.lastUpdated) {
      lastSyncedTimestamp = result.lastUpdated;
      lastSyncTimeString = new Date(result.lastUpdated).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return true;
  } catch (err) {
    console.warn('[Sync] Cannot save all to server:', err);
    return false;
  }
}

/**
 * Lưu chấm công công nhân từ điện thoại lên máy chủ ngay lập tức
 */
export async function saveAttendanceToServer(worker: SeasonalWorker): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker }),
    });
    if (!res.ok) return false;
    const result = await res.json();
    if (result && result.lastUpdated) {
      lastSyncedTimestamp = result.lastUpdated;
      lastSyncTimeString = new Date(result.lastUpdated).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return true;
  } catch (err) {
    console.warn('[Sync] Cannot save attendance to server:', err);
    return false;
  }
}

/**
 * Cập nhật một công nhân lên máy chủ
 */
export async function saveSingleWorkerToServer(worker: SeasonalWorker): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/seasonal-workers/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Sync] Cannot save single worker:', err);
    return false;
  }
}

/**
 * Đăng ký nhận thông báo khi máy chủ có dữ liệu mới
 */
export function subscribeToSync(listener: (data: ServerSyncData) => void): () => void {
  syncListeners.push(listener);
  startPolling();

  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
    if (syncListeners.length === 0) {
      stopPolling();
    }
  };
}

/**
 * Bắt đầu cơ chế polling định kỳ 3 giây để đồng bộ tức thời giữa điện thoại và máy tính
 */
function startPolling() {
  if (isPollingActive) return;
  isPollingActive = true;

  const checkUpdates = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return; // Tiết kiệm tài nguyên khi tab ẩn
    }
    // Khi đã kết nối Supabase Cloud thì ưu tiên kênh Supabase Realtime WebSocket, không lặp polling 3s gây quá tải
    try {
      const sbUrl = localStorage.getItem('supabase_config_url') || '';
      const sbKey = localStorage.getItem('supabase_config_anon_key') || '';
      if (sbUrl.startsWith('https://') && sbKey) {
        return;
      }
    } catch {}

    const prevTs = lastSyncedTimestamp;
    const serverData = await fetchServerData(false);
    if (serverData && serverData.lastUpdated > 0) {
      if (serverData.lastUpdated > prevTs) {
        lastSyncedTimestamp = serverData.lastUpdated;
        lastSyncTimeString = new Date(serverData.lastUpdated).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        syncListeners.forEach((listener) => {
          try {
            listener(serverData);
          } catch (e) {
            console.error('[Sync] Error in sync listener callback:', e);
          }
        });
      }
    }
  };

  pollingInterval = setInterval(checkUpdates, 12000);

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', checkUpdates);
    document.addEventListener('visibilitychange', checkUpdates);
  }
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPollingActive = false;
}

export function getLastSyncedTime(): string | null {
  return lastSyncTimeString;
}

export function getLastSyncedTimestamp(): number {
  return lastSyncedTimestamp;
}

export function setLocalSyncedTimestamp(ts: number) {
  lastSyncedTimestamp = ts;
}
