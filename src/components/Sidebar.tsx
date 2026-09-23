import React from 'react';
import {
  FileText,
  PieChart,
  Table2,
  CalendarCheck,
  ShieldAlert,
  Users,
  HardHat,
  Building2,
  ChevronRight,
  Zap,
  Calendar,
  Layers,
  X,
  Database,
  Cloud,
} from 'lucide-react';
import { TabType } from './NavigationTabs';
import { CompanyConfig } from '../types';
import { isSupabaseConfigured } from '../services/supabaseService';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  auditIssuesCount: number;
  seasonalCount: number;
  employeeCount: number;
  config: CompanyConfig;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenBatchZalo?: () => void;
  onOpenCompanyModal?: () => void;
  onOpenSupabaseModal?: () => void;
  cloudSyncStatus?: 'synced' | 'syncing' | 'error' | 'idle';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  auditIssuesCount,
  seasonalCount,
  employeeCount,
  config,
  isOpenMobile = false,
  onCloseMobile,
  onOpenBatchZalo,
  onOpenCompanyModal,
  onOpenSupabaseModal,
  cloudSyncStatus = 'idle',
}) => {
  interface NavMenuItem {
    id: TabType;
    label: string;
    sublabel?: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }

  // 7 tab theo đúng yêu cầu người dùng:
  // Phiếu Lương, Tổng Hợp Theo Bộ Phận, Bảng Lương, Chấm Công, Kiểm Tra Dữ Liệu, Danh sách nhân viên, Nhân Lực Thời Vụ
  const menuItems: NavMenuItem[] = [
    {
      id: 'PAYSLIP',
      label: 'Phiếu Lương',
      sublabel: 'Mẫu 02-LĐTL & Gửi Zalo/In',
      icon: FileText,
    },
    {
      id: 'DEPARTMENT',
      label: 'Tổng Hợp Theo Bộ Phận',
      sublabel: 'Báo cáo chi phí phòng ban',
      icon: PieChart,
    },
    {
      id: 'PAYROLL_TABLE',
      label: 'Bảng Lương',
      sublabel: 'Bảng tính lương chi tiết',
      icon: Table2,
    },
    {
      id: 'ATTENDANCE',
      label: 'Chấm Công',
      sublabel: 'Bảng công & tăng ca',
      icon: CalendarCheck,
    },
    {
      id: 'DATA_AUDIT',
      label: 'Kiểm Tra Dữ Liệu',
      sublabel: 'Rà soát tài khoản & lương',
      icon: ShieldAlert,
      badge: auditIssuesCount,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'EMPLOYEE_LIST',
      label: 'Danh Sách Nhân Viên',
      sublabel: 'Hồ sơ nhân sự chính thức',
      icon: Users,
      badge: employeeCount,
      badgeColor: 'bg-sky-500/20 text-sky-200 border border-sky-400/30',
    },
    {
      id: 'SEASONAL_WORKERS',
      label: 'Nhân Lực Thời Vụ',
      sublabel: 'Lương tuần / công trình',
      icon: HardHat,
      badge: seasonalCount,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed md:sticky top-0 left-0 h-screen z-50 md:z-20 w-72 shrink-0 bg-[#09233b] text-white flex flex-col border-r border-[#13375c] shadow-xl transition-transform duration-200 ease-in-out no-print select-none ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand / Header */}
        <div className="p-4 border-b border-[#13375c] bg-[#071d32] flex items-center justify-between">
          <div
            onClick={onOpenCompanyModal}
            className="flex items-center gap-3 cursor-pointer group"
            title="Nhấp để xem/chỉnh sửa thông tin công ty"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-black shadow-md group-hover:scale-105 transition-transform">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-black tracking-wider uppercase text-sky-100 flex items-center gap-1.5 truncate">
                <span>PNCONS M&E</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold border border-sky-400/30">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate max-w-[170px]" title={config.name}>
                {config.name || 'Xây Dựng & Cơ Điện'}
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10 md:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Current Period Badge */}
        <div className="px-4 py-2.5 bg-[#0a2744] border-b border-[#13375c]/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-sky-200">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold">{config.periodCode || '09/2026'}</span>
          </div>
          <span className="text-[11px] text-slate-300 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60 font-medium">
            Công chuẩn: <strong>{config.standardWorkDays || 26}d</strong>
          </span>
        </div>

        {/* Navigation Menu Section */}
        <div className="px-3 pt-3 pb-1">
          <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-sky-400" />
            <span>MENU ĐIỀU HƯỚNG</span>
          </div>
        </div>

        {/* Navigation Tabs List */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-1 custom-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                id={`sidebar-nav-${item.id.toLowerCase()}`}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group ${
                  isActive
                    ? 'bg-gradient-to-r from-[#174877] to-[#12385c] text-white font-bold border-l-4 border-sky-400 shadow-md ring-1 ring-white/10'
                    : 'text-slate-300 hover:text-white hover:bg-white/5 font-medium border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-sky-500 text-white shadow-xs'
                        : 'bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] leading-tight truncate">
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div
                        className={`text-[10px] truncate leading-none mt-1 ${
                          isActive ? 'text-sky-200' : 'text-slate-400'
                        }`}
                      >
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold leading-none ${
                        item.badgeColor || 'bg-sky-600 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive ? (
                    <ChevronRight className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Quick Zalo OA Banner in Sidebar */}
        {onOpenBatchZalo && (
          <div className="p-2.5 mx-2.5 mb-2 rounded-lg bg-gradient-to-r from-blue-900/60 to-[#0068FF]/30 border border-blue-500/30 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="text-[11px] font-bold text-sky-100 flex items-center gap-1 truncate">
                <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                <span>Gửi Zalo OA Tự Động</span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">Gửi phiếu lương tức thì</p>
            </div>
            <button
              onClick={onOpenBatchZalo}
              className="px-2 py-1 bg-[#0068FF] hover:bg-blue-600 text-white rounded text-[11px] font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              Gửi ngay
            </button>
          </div>
        )}

        {/* Supabase Cloud Connection Box */}
        {onOpenSupabaseModal && (
          <div className="mx-2.5 mb-2 p-2.5 rounded-lg bg-gradient-to-br from-[#062035] to-[#0a2e4a] border border-emerald-500/40 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>KẾT NỐI SUPABASE</span>
              </div>
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudSyncStatus === 'syncing'
                    ? 'bg-amber-300 animate-pulse'
                    : cloudSyncStatus === 'error'
                    ? 'bg-rose-400 animate-ping'
                    : isSupabaseConfigured()
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-amber-400'
                }`}
                title={
                  cloudSyncStatus === 'syncing'
                    ? 'Đang đồng bộ lên Supabase...'
                    : cloudSyncStatus === 'error'
                    ? 'Lỗi đồng bộ'
                    : isSupabaseConfigured()
                    ? 'Đã liên kết Supabase'
                    : 'Chưa cấu hình Supabase'
                }
              />
            </div>
            <p className="text-[10px] text-slate-300 mb-2 leading-tight">
              {cloudSyncStatus === 'syncing'
                ? 'Đang đồng bộ dữ liệu lên Cloud...'
                : cloudSyncStatus === 'error'
                ? 'Có lỗi đồng bộ • Bấm để xem chi tiết'
                : isSupabaseConfigured()
                ? 'Đã liên kết DB đám mây • Tự động lưu'
                : 'Lưu trữ online & Deploy Vercel'}
            </p>
            <button
              onClick={onOpenSupabaseModal}
              className={`w-full py-1.5 px-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                cloudSyncStatus === 'syncing'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{isSupabaseConfigured() ? 'Quản lý Supabase Cloud' : 'Cấu hình kết nối ngay'}</span>
            </button>
          </div>
        )}

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#13375c] bg-[#071d32] text-[11px] text-slate-400 flex items-center justify-between">
          <div className="truncate">
            <span className="font-semibold text-slate-300">Tổng nhân sự:</span>{' '}
            <span className="text-white font-bold">{employeeCount + seasonalCount}</span>
          </div>
          <div className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded">
            v2.4
          </div>
        </div>
      </aside>
    </>
  );
};
