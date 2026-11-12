import React from 'react';
import { Upload, Download, Building2, Calendar, Zap, Settings, Menu, Database, Save, RefreshCw } from 'lucide-react';
import { CompanyConfig } from '../types';
import { isSupabaseConfigured } from '../services/supabaseService';

interface HeaderProps {
  config: CompanyConfig;
  onOpenImport: () => void;
  onOpenBankExport: () => void;
  onEditCompany: () => void;
  onOpenZaloSettings?: () => void;
  onOpenBatchZalo?: () => void;
  onToggleSidebar?: () => void;
  onOpenSupabaseModal?: () => void;
  onReloadCloud?: () => void;
  onManualSync?: () => void;
  onSaveData?: () => void;
  hasUnsavedChanges?: boolean;
  cloudSyncStatus?: 'synced' | 'syncing' | 'error' | 'idle';
  lastSyncedText?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  onOpenImport,
  onOpenBankExport,
  onEditCompany,
  onOpenZaloSettings,
  onOpenBatchZalo,
  onToggleSidebar,
  onOpenSupabaseModal,
  onReloadCloud,
  onManualSync,
  onSaveData,
  hasUnsavedChanges = false,
  cloudSyncStatus = 'idle',
  lastSyncedText,
}) => {
  const isZaloReady = Boolean(config.zaloOA?.oaId && config.zaloOA?.accessToken);
  const triggerSaveData = onSaveData || onManualSync;

  return (
    <header className="bg-[#09233b] text-white shadow-md border-b border-[#13375c] no-print">
      <div className="w-full px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Mobile hamburger & Brand info */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 md:hidden cursor-pointer"
              title="Mở menu"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div
            onClick={onEditCompany}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center cursor-pointer hover:bg-sky-500/30 transition-colors shrink-0"
            title="Chỉnh sửa thông tin công ty"
          >
            <Building2 className="w-5 h-5 text-sky-200" />
          </div>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wide flex items-center gap-2 truncate text-white">
              <span className="truncate">{config.name}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-sky-200 flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5">
              <span className="flex items-center gap-1 font-semibold text-sky-100">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                {config.period}
              </span>
              <span className="opacity-40 hidden sm:inline">•</span>
              <span className="hidden sm:inline">
                Ngày chi trả: <strong className="text-white">{config.paymentDate}</strong>
              </span>
              <span className="opacity-40 hidden md:inline">•</span>
              <span className="hidden md:inline">
                Ngày công chuẩn: <strong className="text-white">{config.standardWorkDays} ngày</strong>
              </span>
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Nút LƯU DATA thủ công chính thức */}
          {triggerSaveData && (
            <button
              id="btn-header-save-data"
              type="button"
              onClick={triggerSaveData}
              disabled={cloudSyncStatus === 'syncing'}
              className={`px-3 sm:px-3.5 py-1.5 rounded text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap border disabled:opacity-60 ${
                cloudSyncStatus === 'syncing'
                  ? 'bg-amber-600 text-white border-amber-300'
                  : hasUnsavedChanges
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-200 ring-2 ring-amber-300/60 shadow-md'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
              }`}
              title={
                hasUnsavedChanges
                  ? 'Có dữ liệu mới nhập chưa lưu — Nhấn để Lưu Data ngay!'
                  : lastSyncedText
                  ? `Nhấn để Lưu Data (Lần lưu cuối: ${lastSyncedText})`
                  : 'Nhấn để Lưu Data'
              }
            >
              <Save className={`w-3.5 h-3.5 ${cloudSyncStatus === 'syncing' ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">
                {cloudSyncStatus === 'syncing'
                  ? 'Đang lưu Data...'
                  : hasUnsavedChanges
                  ? 'Lưu Data (Chưa lưu)'
                  : 'Lưu Data'}
              </span>
              <span className="sm:hidden">
                {cloudSyncStatus === 'syncing' ? 'Đang lưu...' : hasUnsavedChanges ? 'Lưu Data*' : 'Lưu Data'}
              </span>
              {hasUnsavedChanges && cloudSyncStatus !== 'syncing' && (
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              )}
            </button>
          )}

          {/* Zalo OA Buttons */}
          {onOpenBatchZalo && (
            <button
              id="btn-header-batch-zalo"
              onClick={onOpenBatchZalo}
              className="px-2.5 sm:px-3 py-1.5 bg-[#0068FF] hover:bg-[#0052cc] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap border border-blue-400"
              title="Gửi phiếu lương tự động qua Zalo OA cho toàn bộ công nhân & nhân viên"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span className="hidden sm:inline">Gửi Zalo OA</span>
              <span className="sm:hidden">Zalo</span>
            </button>
          )}

          {onOpenZaloSettings && (
            <button
              id="btn-header-zalo-settings"
              onClick={onOpenZaloSettings}
              className="px-2 sm:px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-sky-100 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title="Cấu hình Zalo OA (Access Token, OA ID, Template ZNS)"
            >
              <Settings className="w-3.5 h-3.5 text-sky-200" />
              <span className="hidden md:inline">Cài đặt OA</span>
              {isZaloReady && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="Đã có cấu hình Zalo OA" />
              )}
            </button>
          )}

          {onOpenSupabaseModal && (
            <button
              id="btn-header-supabase"
              onClick={onOpenSupabaseModal}
              className={`px-2.5 sm:px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap border ${
                cloudSyncStatus === 'error'
                  ? 'bg-rose-700 hover:bg-rose-600 text-white border-rose-400'
                  : isSupabaseConfigured()
                  ? 'bg-slate-800 hover:bg-slate-700 text-emerald-200 border-emerald-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-sky-200 border-sky-500/40'
              }`}
              title={
                isSupabaseConfigured()
                  ? `Cấu hình Supabase Cloud • Chế độ lưu thủ công${
                      lastSyncedText ? ` • Lần lưu cuối: ${lastSyncedText}` : ''
                    }`
                  : 'Cấu hình kết nối Supabase Cloud'
              }
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">
                {cloudSyncStatus === 'error'
                  ? 'Lỗi Cloud'
                  : isSupabaseConfigured()
                  ? 'Cấu hình Cloud'
                  : 'Kết Nối Supabase'}
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudSyncStatus === 'error'
                    ? 'bg-rose-300 animate-ping'
                    : isSupabaseConfigured()
                    ? 'bg-emerald-400'
                    : 'bg-amber-300'
                }`}
              />
            </button>
          )}

          {onReloadCloud && isSupabaseConfigured() && (
            <button
              id="btn-header-reload-cloud"
              type="button"
              onClick={onReloadCloud}
              disabled={cloudSyncStatus === 'syncing' || hasUnsavedChanges}
              className="px-2 py-1.5 rounded text-xs font-bold flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-sky-200 border border-sky-500/40 transition shadow-sm cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              title={
                hasUnsavedChanges
                  ? 'Hãy nhấn "Lưu Data" trước khi tải dữ liệu mới từ Cloud'
                  : 'Tải dữ liệu mới nhất từ Supabase Cloud về máy này'
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-300 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          )}

          <button
            id="btn-upload-payroll"
            onClick={onOpenImport}
            className="px-2.5 sm:px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">↑ Nạp bảng lương</span>
            <span className="sm:hidden">Nạp</span>
          </button>
          <button
            id="btn-export-bank"
            onClick={onOpenBankExport}
            className="px-2.5 sm:px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">↓ Xuất CK (CSV)</span>
            <span className="sm:hidden">Xuất CK</span>
          </button>
        </div>
      </div>
    </header>
  );
};


