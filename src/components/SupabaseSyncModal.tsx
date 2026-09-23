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
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  clearSupabaseConfig,
  checkSupabaseConnection,
  syncCompanyConfigToSupabase,
  syncEmployeesToSupabase,
  syncSeasonalWorkersToSupabase,
  loadCompanyConfigFromSupabase,
  loadEmployeesFromSupabase,
  loadSeasonalWorkersFromSupabase,
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
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  employees,
  seasonalWorkers,
  onDataLoadedFromCloud,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const { url, anonKey } = getSupabaseConfig();
      setUrlInput(url);
      setKeyInput(anonKey);
      setIsConfigured(isSupabaseConfigured());
      if (url && anonKey) {
        handleTest(url, anonKey);
      }
    }
  }, [isOpen]);

  const handleTest = async (testUrl?: string, testKey?: string) => {
    setIsTesting(true);
    setTestResult(null);
    setSaveSuccessMsg(null);
    const result = await checkSupabaseConnection(testUrl || urlInput, testKey || keyInput);
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSaveAndConnect = async () => {
    if (!urlInput.trim() || !keyInput.trim()) {
      setTestResult({
        connected: false,
        message: 'Vui lòng điền đầy đủ cả Supabase Project URL và Anon Public Key.',
      });
      return;
    }

    if (!urlInput.trim().startsWith('https://')) {
      setTestResult({
        connected: false,
        message: 'Supabase URL phải bắt đầu bằng https:// (ví dụ: https://xyz.supabase.co)',
      });
      return;
    }

    setSupabaseConfig(urlInput.trim(), keyInput.trim());
    setIsConfigured(true);
    setIsTesting(true);
    setSaveSuccessMsg('Đang lưu thông tin và kiểm tra kết nối...');

    const result = await checkSupabaseConnection(urlInput.trim(), keyInput.trim());
    setTestResult(result);
    setIsTesting(false);

    if (result.connected) {
      setSaveSuccessMsg('Đã lưu cấu hình và kết nối thành công tới Supabase!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } else {
      setSaveSuccessMsg(null);
    }
  };

  const handleClear = () => {
    if (window.confirm('Bạn có chắc muốn xóa cấu hình Supabase và chuyển về lưu trên máy (LocalStorage)?')) {
      clearSupabaseConfig();
      setUrlInput('');
      setKeyInput('');
      setIsConfigured(false);
      setTestResult(null);
      setSaveSuccessMsg('Đã xóa thông số Supabase. Hệ thống đang chạy ở chế độ Offline/LocalStorage.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleSyncToCloud = async () => {
    setIsSyncing(true);
    setSyncStatus('Đang đẩy toàn bộ dữ liệu lên cơ sở dữ liệu Supabase...');

    try {
      const cfgOk = await syncCompanyConfigToSupabase(config);
      const empOk = await syncEmployeesToSupabase(employees, config.periodCode);
      const seaOk = await syncSeasonalWorkersToSupabase(
        seasonalWorkers,
        config.periodCode
      );

      if (cfgOk && empOk && seaOk) {
        setSyncStatus(`Đồng bộ thành công! Đã đẩy ${employees.length} nhân viên và ${seasonalWorkers.length} thợ lên Supabase.`);
      } else {
        setSyncStatus('Đồng bộ hoàn tất một phần (vui lòng kiểm tra lại bảng trong Supabase).');
      }
    } catch (e: any) {
      setSyncStatus(`Lỗi khi đồng bộ: ${e.message || String(e)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadFromCloud = async () => {
    setIsSyncing(true);
    setSyncStatus('Đang tải dữ liệu từ Supabase về...');

    try {
      const cloudCfg = await loadCompanyConfigFromSupabase();
      const cloudEmp = await loadEmployeesFromSupabase(config.periodCode);
      const cloudSea = await loadSeasonalWorkersFromSupabase(config.periodCode);

      if (onDataLoadedFromCloud) {
        onDataLoadedFromCloud({
          config: cloudCfg || undefined,
          employees: cloudEmp || undefined,
          seasonalWorkers: cloudSea || undefined,
        });
      }

      setSyncStatus(
        `Đã nạp thành công: ${cloudEmp?.length || 0} nhân sự chính thức, ${
          cloudSea?.length || 0
        } thợ thời vụ từ Supabase!`
      );
    } catch (e: any) {
      setSyncStatus(`Lỗi khi tải dữ liệu: ${e.message || String(e)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const copySqlSchema = () => {
    const sqlContent = `-- Bảng Cấu hình Công ty
CREATE TABLE IF NOT EXISTS public.company_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN',
  address TEXT, tax_code TEXT, phone TEXT, period TEXT, period_code TEXT,
  payment_date TEXT, standard_work_days NUMERIC DEFAULT 26,
  zalo_oa JSONB DEFAULT '{}'::jsonb, config_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng Nhân viên chính thức
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
  department TEXT, position TEXT, phone TEXT, email TEXT,
  tax_code TEXT, id_card TEXT, bank_account TEXT, bank_name TEXT,
  join_date TEXT, status TEXT DEFAULT 'ACTIVE',
  base_salary NUMERIC DEFAULT 0, insurance_salary NUMERIC DEFAULT 0,
  standard_work_days NUMERIC DEFAULT 26, actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0, advance_payment NUMERIC DEFAULT 0,
  net_salary NUMERIC DEFAULT 0, period_code TEXT DEFAULT '09/2026',
  employee_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng Công nhân thời vụ
CREATE TABLE IF NOT EXISTS public.seasonal_workers (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
  trade TEXT, skill_level TEXT, project TEXT, team TEXT, phone TEXT,
  id_card TEXT, bank_account TEXT, bank_name TEXT,
  daily_rate NUMERIC DEFAULT 0, actual_work_days NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0, advance_payment NUMERIC DEFAULT 0,
  has_tax_commitment BOOLEAN DEFAULT TRUE, payment_method TEXT DEFAULT 'BANK',
  payroll_cycle_type TEXT DEFAULT '1_WEEK', status TEXT DEFAULT 'ACTIVE',
  net_salary NUMERIC DEFAULT 0, period_code TEXT DEFAULT '09/2026',
  worker_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Quyền RLS
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to company_config" ON public.company_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to seasonal_workers" ON public.seasonal_workers FOR ALL USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(sqlContent);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs no-print">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#09233b] text-white px-5 py-4 flex items-center justify-between border-b border-[#13375c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  Cấu Hình Kết Nối Supabase Cloud
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  testResult?.connected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                }`}>
                  {testResult?.connected ? 'Online Cloud' : 'Chưa kết nối'}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Điền thông tin trực tiếp để lưu trữ dữ liệu vĩnh viễn & chuẩn bị Deploy Vercel
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
          {/* Form Nhập Thông Tin Kết Nối Trực Tiếp */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Nhập thông tin kết nối Supabase của bạn</span>
              </label>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
              >
                <span>Mở Supabase</span>
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
                placeholder="https://your-project-id.supabase.co"
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

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveAndConnect}
                disabled={isTesting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isTesting ? 'Đang kiểm tra...' : 'Lưu & Kết Nối Ngay'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleTest()}
                disabled={isTesting || !urlInput}
                className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Kiểm tra lại</span>
              </button>

              {isConfigured && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa thông số</span>
                </button>
              )}
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold">
                {saveSuccessMsg}
              </div>
            )}
          </div>

          {/* Status Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                testResult.connected
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <div className="font-bold">
                  {testResult.connected
                    ? 'Kết nối Supabase hoàn tất!'
                    : 'Chưa thể kết nối tới cơ sở dữ liệu Supabase'}
                </div>
                <p className="mt-0.5">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Sync actions when connected */}
          {testResult?.connected && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
              <div className="font-bold text-sky-950 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-600" />
                <span>Đồng bộ dữ liệu trực tuyến</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSyncToCloud}
                  disabled={isSyncing}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Đẩy dữ liệu hiện tại lên Supabase ({employees.length} NV + {seasonalWorkers.length} Thợ)</span>
                </button>
                <button
                  onClick={handleLoadFromCloud}
                  disabled={isSyncing}
                  className="px-3.5 py-2 bg-white border border-sky-300 text-sky-800 hover:bg-sky-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>Tải dữ liệu từ Supabase về</span>
                </button>
              </div>
              {syncStatus && (
                <p className="text-xs text-sky-900 font-semibold bg-sky-100 p-2 rounded">
                  {syncStatus}
                </p>
              )}
            </div>
          )}

          {/* Copy SQL Schema Box */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <FileCode className="w-4 h-4" />
                <span>Mã SQL Tạo Bảng (Nếu chưa tạo trên Supabase)</span>
              </div>
              <button
                type="button"
                onClick={copySqlSchema}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã Copy SQL</span>
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
              Nếu bạn mới tạo dự án Supabase, bấm nút <strong>"Copy toàn bộ mã SQL"</strong> ở trên, sau đó vào <strong>SQL Editor</strong> trên Supabase dán vào và nhấn <strong>Run</strong> để tự động khởi tạo đủ 3 bảng dữ liệu.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Trạng thái hiện tại:{' '}
            <strong className={testResult?.connected ? 'text-emerald-700' : 'text-slate-700'}>
              {testResult?.connected ? 'Đã kết nối Supabase Cloud' : 'Chạy Offline / LocalStorage'}
            </strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
