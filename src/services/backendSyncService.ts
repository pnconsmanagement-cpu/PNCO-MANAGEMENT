import { CompanyConfig, Employee, SeasonalWorker } from '../types';

export interface ServerSyncData {
  lastUpdated: number;
  config: CompanyConfig | null;
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
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
    // 1. Nếu người dùng cấu hình URL tùy chỉnh
    try {
      const custom = localStorage.getItem('payroll_public_app_url');
      if (custom && custom.startsWith('http')) {
        return custom.replace(/\/$/, '');
      }
    } catch {}

    const origin = window.location.origin || '';

    // 2. Nếu đang mở trực tiếp trên app (*.run.app hoặc localhost)
    if (origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    // 3. Nếu đang trong AI Studio preview (aistudio.google.com), dùng VITE_APP_URL từ server
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
export async function fetchServerData(): Promise<ServerSyncData | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/sync`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.lastUpdated === 'number') {
      if (data.lastUpdated > 0) {
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
 * Lưu toàn bộ dữ liệu lên máy chủ
 */
export async function saveAllToServer(
  config: CompanyConfig,
  employees: Employee[],
  seasonalWorkers: SeasonalWorker[]
): Promise<boolean> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, employees, seasonalWorkers }),
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
    const serverData = await fetchServerData();
    if (serverData && serverData.lastUpdated > 0) {
      if (serverData.lastUpdated > lastSyncedTimestamp) {
        lastSyncedTimestamp = serverData.lastUpdated;
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

  pollingInterval = setInterval(checkUpdates, 3000);

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
