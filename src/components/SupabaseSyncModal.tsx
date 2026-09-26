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
  getLastSyncedTime,
  getShareableConfigUrl,
  ConnectionHealth,
  FullSyncResult,
} from '../services/supabaseService';
import { CompanyConfig, Employee, SeasonalWorker } from '../types';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CompanyConfig;
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  onDataLoadedFromCloud?: (data: {
    config?: CompanyConfig;
    employees?: Employee[];
    seasonalWorkers?: SeasonalWorker[];
  }) => void;
  onSyncSuccess?: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  employees,
  seasonalWorkers,
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
        const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
        setSyncReport(report);
        setLastSynced(getLastSyncedTime());

        if (report.success) {
          setSaveSuccessMsg(`Đã đồng bộ 100% lên Supabase Cloud (${report.employees.count} NV • ${report.seasonalWorkers.count} Thợ)!`);
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
      const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
      setSyncReport(report);
      setLastSynced(getLastSyncedTime());

      // Cập nhật lại số đếm trong health
      if (healthResult) {
        setHealthResult({
          ...healthResult,
          tables: {
            company_config: { exists: true, count: 1 },
            employees: { exists: true, count: employees.length },
            seasonal_workers: { exists: true, count: seasonalWorkers.length },
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
    setLoadStatus('Đang kéo dữ liệu từ Supabase Cloud về máy...');

    try {
      const [cloudCfg, cloudEmp, cloudSea] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(config.periodCode),
        loadSeasonalWorkersFromSupabase(config.periodCode),
      ]);

      if (onDataLoadedFromCloud) {
        onDataLoadedFromCloud({
          config: cloudCfg || undefined,
          employees: cloudEmp || undefined,
          seasonalWorkers: cloudSea || undefined,
        });
      }

      setLoadStatus(
        `Nạp thành công: ${cloudEmp?.length || 0} nhân sự chính thức, ${
          cloudSea?.length || 0
        } công nhân thời vụ từ Supabase!`
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
-- PNCONS M&E - SUPABASE SCHEMA CHO QUẢN LÝ LƯƠNG & CHẤM CÔNG
-- Chạy đoạn mã này trong SQL Editor của Supabase để tạo đủ 3 bảng & phân quyền
-- ========================================================================

-- 1. Bảng Cấu hình Công ty
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

-- 2. Bảng Nhân viên chính thức
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

-- 3. Bảng Công nhân thời vụ công trình
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

-- Bật Row Level Security (RLS) & Cho phép truy cập dữ liệu qua Anon Key
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to company_config" ON public.company_config;
CREATE POLICY "Public access to company_config" ON public.company_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to employees" ON public.employees;
CREATE POLICY "Public access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to seasonal_workers" ON public.seasonal_workers;
CREATE POLICY "Public access to seasonal_workers" ON public.seasonal_workers FOR ALL USING (true) WITH CHECK (true);

-- BẬT SUPABASE REALTIME ĐỒNG BỘ TỨC THÌ ĐA MÁY TÍNH & ĐA TRÌNH DUYỆT
ALTER TABLE public.company_config REPLICA IDENTITY FULL;
ALTER TABLE public.employees REPLICA IDENTITY FULL;
ALTER TABLE public.seasonal_workers REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.company_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seasonal_workers;`;

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
                  <span>Trạng thái 3 bảng dữ liệu trên Supabase:</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {healthResult.connected ? '✅ Cả 3 bảng đều đã sẵn sàng' : '⚠️ Thiếu bảng'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. company_config */}
                <div
                  className={`p-2.5 rounded-lg border text-xs ${
                    healthResult.tables.company_config.exists
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>1. company_config</span>
                    {healthResult.tables.company_config.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    )}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    {healthResult.tables.company_config.exists
                      ? `Đang có: ${healthResult.tables.company_config.count} bản ghi`
                      : 'Chưa có bảng! Cần chạy SQL'}
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
                    <span>2. employees</span>
                    {healthResult.tables.employees.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    )}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    {healthResult.tables.employees.exists
                      ? `Đang có: ${healthResult.tables.employees.count} nhân viên`
                      : 'Chưa có bảng! Cần chạy SQL'}
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
                    <span>3. seasonal_workers</span>
                    {healthResult.tables.seasonal_workers.exists ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    )}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    {healthResult.tables.seasonal_workers.exists
                      ? `Đang có: ${healthResult.tables.seasonal_workers.count} thợ`
                      : 'Chưa có bảng! Cần chạy SQL'}
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
                  Đẩy dữ liệu hiện tại lên Supabase ({employees.length} NV + {seasonalWorkers.length} Thợ)
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
                <ul className="space-y-1 text-slate-700 pl-5 list-disc text-[11px]">
                  <li>
                    Cấu hình công ty: <strong>{syncReport.companyConfig.ok ? '✅ Thành công' : `❌ ${syncReport.companyConfig.error}`}</strong>
                  </li>
                  <li>
                    Nhân viên chính thức: <strong>{syncReport.employees.ok ? `✅ Thành công (${syncReport.employees.count}/${employees.length} bản ghi)` : `❌ ${syncReport.employees.error}`}</strong>
                  </li>
                  <li>
                    Công nhân thời vụ: <strong>{syncReport.seasonalWorkers.ok ? `✅ Thành công (${syncReport.seasonalWorkers.count}/${seasonalWorkers.length} bản ghi)` : `❌ ${syncReport.seasonalWorkers.error}`}</strong>
                  </li>
                </ul>
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
