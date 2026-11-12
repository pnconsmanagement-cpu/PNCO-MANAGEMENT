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
  Smartphone,
  Save,
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
  teamCount?: number;
  projectCount?: number;
  advanceCount?: number;
  config: CompanyConfig;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenBatchZalo?: () => void;
  onOpenCompanyModal?: () => void;
  onOpenSupabaseModal?: () => void;
  onOpenMobileAttendance?: () => void;
  onSaveData?: () => void;
  hasUnsavedChanges?: boolean;
  permanentSubTab?: 'LIST' | 'ATTENDANCE' | 'PAYROLL' | 'ADVANCES';
  seasonalSubTab?: 'LIST' | 'ATTENDANCE' | 'PAYROLL' | 'ADVANCES';
  onSelectSubTab?: (parentTab: 'PERMANENT_EMPLOYEES' | 'SEASONAL_WORKERS', subTab: 'LIST' | 'ATTENDANCE' | 'PAYROLL' | 'ADVANCES') => void;
  cloudSyncStatus?: 'synced' | 'syncing' | 'error' | 'idle';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  permanentSubTab = 'LIST',
  seasonalSubTab = 'LIST',
  onSelectSubTab,
  auditIssuesCount,
  seasonalCount,
  employeeCount,
  teamCount = 0,
  projectCount = 0,
  advanceCount = 0,
  config,
  isOpenMobile = false,
  onCloseMobile,
  onOpenBatchZalo,
  onOpenCompanyModal,
  onOpenSupabaseModal,
  onOpenMobileAttendance,
  onSaveData,
  hasUnsavedChanges = false,
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

  // Cấu trúc 4 trụ cột phân tách rõ ràng theo yêu cầu:
  // 1. Bản Nhân viên chính thức
  // 2. Bản Nhân viên thời vụ
  // 3. Bản Lương nhân viên chính thức
  // 4. Bản Lương nhân viên thời vụ
  const menuItems: NavMenuItem[] = [
    {
      id: 'PERMANENT_EMPLOYEES',
      label: '1. Bản Nhân Viên Chính Thức',
      sublabel: 'Hợp đồng, phòng ban & bảo hiểm',
      icon: Users,
      badge: employeeCount,
      badgeColor: 'bg-sky-500 text-white font-black',
    },
    {
      id: 'SEASONAL_WORKERS',
      label: '2. Bản Nhân Viên Thời Vụ',
      sublabel: 'Thợ công trình, chấm công & QR',
      icon: HardHat,
      badge: seasonalCount,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
    {
      id: 'PERMANENT_PAYROLL',
      label: '3. Bản Lương Chính Thức',
      sublabel: 'Lương tháng, BHXH 10.5% & thuế TNCN',
      icon: Table2,
      badgeColor: 'bg-sky-600 text-white font-black',
    },
    {
      id: 'SEASONAL_PAYROLL',
      label: '4. Bản Lương Thời Vụ',
      sublabel: 'Lương tuần/2 tuần/tháng & thuế 10%',
      icon: Table2,
      badgeColor: 'bg-amber-600 text-white font-black',
    },
    {
      id: 'PROJECTS',
      label: '5. Danh Sách Dự Án',
      sublabel: 'Công trình, ngân sách & nhân lực',
      icon: Building2,
      badge: projectCount,
      badgeColor: 'bg-emerald-500 text-white font-black',
    },
    {
      id: 'SALARY_ADVANCES',
      label: '6. Bản Lương Ứng',
      sublabel: 'Quản lý tạm ứng & cấn trừ',
      icon: Zap,
      badge: advanceCount,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
    {
      id: 'ATTENDANCE',
      label: '7. Bảng Chấm Công',
      sublabel: 'Chấm trực tiếp & QR di động',
      icon: CalendarCheck,
    },
    {
      id: 'FINANCIAL_REPORT',
      label: '8. Báo Cáo Tài Chính',
      sublabel: 'Dòng tiền & Chi phí lương',
      icon: PieChart,
    },
    {
      id: 'PAYSLIP',
      label: '9. Phiếu Lương In/Gửi',
      sublabel: 'Mẫu 02-LĐTL & Zalo',
      icon: FileText,
    },
    {
      id: 'DEPARTMENT',
      label: 'Tổng Hợp Bộ Phận',
      sublabel: 'Cơ cấu chi phí nội bộ',
      icon: Layers,
    },
    {
      id: 'DATA_AUDIT',
      label: 'Kiểm Tra Dữ Liệu',
      sublabel: 'Rà soát tài khoản & lương',
      icon: ShieldAlert,
      badge: auditIssuesCount,
      badgeColor: 'bg-rose-500 text-white',
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
          {/* TAB 1: NHÂN VIÊN CHÍNH THỨC */}
          <div className="space-y-1">
            <button
              type="button"
              id="sidebar-nav-permanent_employees"
              onClick={() => {
                onSelectTab('PERMANENT_EMPLOYEES');
                if (onSelectSubTab) onSelectSubTab('PERMANENT_EMPLOYEES', 'LIST');
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group ${
                activeTab === 'PERMANENT_EMPLOYEES' || activeTab === 'EMPLOYEE_LIST'
                  ? 'bg-gradient-to-r from-[#174877] to-[#12385c] text-white font-bold border-l-4 border-sky-400 shadow-md ring-1 ring-white/10'
                  : 'text-slate-300 hover:text-white hover:bg-white/5 font-medium border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    activeTab === 'PERMANENT_EMPLOYEES' || activeTab === 'EMPLOYEE_LIST'
                      ? 'bg-sky-500 text-white shadow-xs'
                      : 'bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight truncate">
                    1. Nhân Viên Chính Thức
                  </div>
                  <div className="text-[10px] text-sky-200 truncate leading-none mt-1">
                    Danh sách, Chấm công, Lương, Ứng
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold leading-none bg-sky-500 text-white font-black">
                  {employeeCount}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeTab === 'PERMANENT_EMPLOYEES' ? 'text-sky-300 rotate-90' : 'text-slate-500'}`} />
              </div>
            </button>

            {/* 4 Sub-tabs của Nhân viên chính thức */}
            {(activeTab === 'PERMANENT_EMPLOYEES' || activeTab === 'EMPLOYEE_LIST') && (
              <div className="ml-5 pl-3 border-l-2 border-sky-400/40 space-y-0.5 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('PERMANENT_EMPLOYEES');
                    if (onSelectSubTab) onSelectSubTab('PERMANENT_EMPLOYEES', 'LIST');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    permanentSubTab === 'LIST'
                      ? 'bg-sky-500/20 text-sky-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>1.1 Danh Sách Nhân Viên</span>
                  <span className="text-[10px] text-slate-400 font-normal">({employeeCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('PERMANENT_EMPLOYEES');
                    if (onSelectSubTab) onSelectSubTab('PERMANENT_EMPLOYEES', 'ATTENDANCE');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    permanentSubTab === 'ATTENDANCE'
                      ? 'bg-sky-500/20 text-sky-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>1.2 Bản Chấm Công</span>
                  <span className="text-[10px] text-emerald-400 font-bold">Thực tế</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('PERMANENT_EMPLOYEES');
                    if (onSelectSubTab) onSelectSubTab('PERMANENT_EMPLOYEES', 'PAYROLL');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    permanentSubTab === 'PAYROLL'
                      ? 'bg-sky-500/20 text-sky-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>1.3 Bản Lương</span>
                  <span className="text-[10px] text-sky-300 font-bold">BHXH + Thuế</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('PERMANENT_EMPLOYEES');
                    if (onSelectSubTab) onSelectSubTab('PERMANENT_EMPLOYEES', 'ADVANCES');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    permanentSubTab === 'ADVANCES'
                      ? 'bg-sky-500/20 text-sky-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>1.4 Bản Ứng Lương</span>
                  <span className="text-[10px] text-amber-300 font-bold">Tạm ứng</span>
                </button>
              </div>
            )}
          </div>

          {/* TAB 2: NHÂN VIÊN THỜI VỤ */}
          <div className="space-y-1">
            <button
              type="button"
              id="sidebar-nav-seasonal_workers"
              onClick={() => {
                onSelectTab('SEASONAL_WORKERS');
                if (onSelectSubTab) onSelectSubTab('SEASONAL_WORKERS', 'LIST');
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group ${
                activeTab === 'SEASONAL_WORKERS'
                  ? 'bg-gradient-to-r from-amber-900/80 to-[#12385c] text-white font-bold border-l-4 border-amber-500 shadow-md ring-1 ring-white/10'
                  : 'text-slate-300 hover:text-white hover:bg-white/5 font-medium border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    activeTab === 'SEASONAL_WORKERS'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'bg-white/5 text-slate-300 group-hover:bg-white/10 group-hover:text-white'
                  }`}
                >
                  <HardHat className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight truncate">
                    2. Nhân Viên Thời Vụ
                  </div>
                  <div className="text-[10px] text-amber-200 truncate leading-none mt-1">
                    Danh sách, Chấm công, Lương, Ứng
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold leading-none bg-amber-500 text-slate-950 font-black">
                  {seasonalCount}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeTab === 'SEASONAL_WORKERS' ? 'text-amber-300 rotate-90' : 'text-slate-500'}`} />
              </div>
            </button>

            {/* 4 Sub-tabs của Nhân viên thời vụ */}
            {activeTab === 'SEASONAL_WORKERS' && (
              <div className="ml-5 pl-3 border-l-2 border-amber-500/40 space-y-0.5 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('SEASONAL_WORKERS');
                    if (onSelectSubTab) onSelectSubTab('SEASONAL_WORKERS', 'LIST');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    seasonalSubTab === 'LIST'
                      ? 'bg-amber-500/20 text-amber-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>2.1 Danh Sách Thời Vụ</span>
                  <span className="text-[10px] text-slate-400 font-normal">({seasonalCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('SEASONAL_WORKERS');
                    if (onSelectSubTab) onSelectSubTab('SEASONAL_WORKERS', 'ATTENDANCE');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    seasonalSubTab === 'ATTENDANCE'
                      ? 'bg-amber-500/20 text-amber-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>2.2 Bản Chấm Công</span>
                  <span className="text-[10px] text-amber-300 font-bold">Ngày / OT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('SEASONAL_WORKERS');
                    if (onSelectSubTab) onSelectSubTab('SEASONAL_WORKERS', 'PAYROLL');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    seasonalSubTab === 'PAYROLL'
                      ? 'bg-amber-500/20 text-amber-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>2.3 Bản Lương</span>
                  <span className="text-[10px] text-amber-300 font-bold">Thực nhận</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('SEASONAL_WORKERS');
                    if (onSelectSubTab) onSelectSubTab('SEASONAL_WORKERS', 'ADVANCES');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                    seasonalSubTab === 'ADVANCES'
                      ? 'bg-amber-500/20 text-amber-200 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>2.4 Bản Ứng Lương</span>
                  <span className="text-[10px] text-amber-300 font-bold">Tạm ứng</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 pb-1">
            <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Báo Cáo & Dự Án
            </div>
          </div>

          {/* CÁC MỤC BÁO CÁO & DỰ ÁN */}
          {[
            {
              id: 'PROJECTS' as TabType,
              label: '3. Danh Sách Dự Án',
              sublabel: 'Công trình & ngân sách',
              icon: Building2,
              badge: projectCount,
              badgeColor: 'bg-emerald-500 text-white font-black',
            },
            {
              id: 'FINANCIAL_REPORT' as TabType,
              label: '4. Báo Cáo Tài Chính',
              sublabel: 'Dòng tiền & Chi phí lương',
              icon: PieChart,
            },
            {
              id: 'PAYSLIP' as TabType,
              label: '5. Phiếu Lương In/Gửi',
              sublabel: 'Mẫu 02-LĐTL & Zalo',
              icon: FileText,
            },
            {
              id: 'DATA_AUDIT' as TabType,
              label: '6. Kiểm Tra Dữ Liệu',
              sublabel: 'Rà soát tài khoản & lương',
              icon: ShieldAlert,
              badge: auditIssuesCount,
              badgeColor: 'bg-rose-500 text-white',
            },
          ].map((item) => {
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

        {/* Nút Chấm Công Di Động */}
        {onOpenMobileAttendance && (
          <div className="p-2.5 mx-2.5 mb-2 rounded-lg bg-gradient-to-r from-emerald-900/60 to-teal-900/60 border border-emerald-500/40 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="text-[11px] font-bold text-emerald-200 flex items-center gap-1.5 truncate">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Chấm Công Di Động</span>
              </div>
              <p className="text-[10px] text-emerald-200/70 truncate">Điện thoại thợ & tổ đội</p>
            </div>
            <button
              onClick={onOpenMobileAttendance}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              Mở app
            </button>
          </div>
        )}

        {/* Supabase Cloud Connection & Manual Save Box */}
        {(onOpenSupabaseModal || onSaveData) && (
          <div className="mx-2.5 mb-2 p-2.5 rounded-lg bg-gradient-to-br from-[#062035] to-[#0a2e4a] border border-emerald-500/40 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>LƯU DATA & CLOUD</span>
              </div>
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudSyncStatus === 'syncing'
                    ? 'bg-amber-300 animate-pulse'
                    : hasUnsavedChanges
                    ? 'bg-amber-400 animate-ping'
                    : cloudSyncStatus === 'error'
                    ? 'bg-rose-400 animate-ping'
                    : isSupabaseConfigured()
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-sky-400'
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-300 leading-tight">
              {cloudSyncStatus === 'syncing'
                ? 'Đang lưu Data...'
                : hasUnsavedChanges
                ? 'Có dữ liệu mới chưa lưu • Nhấn Lưu Data!'
                : cloudSyncStatus === 'error'
                ? 'Có lỗi lưu Cloud • Bấm để kiểm tra'
                : 'Chế độ thủ công • Nhấn nút Lưu Data để lưu'}
            </p>
            {onSaveData && (
              <button
                type="button"
                onClick={onSaveData}
                disabled={cloudSyncStatus === 'syncing'}
                className={`w-full py-1.5 px-2 rounded text-xs font-black transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 ${
                  hasUnsavedChanges
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {cloudSyncStatus === 'syncing'
                    ? 'Đang lưu Data...'
                    : hasUnsavedChanges
                    ? 'Lưu Data (Chưa lưu)'
                    : 'Lưu Data'}
                </span>
              </button>
            )}
            {onOpenSupabaseModal && (
              <button
                type="button"
                onClick={onOpenSupabaseModal}
                className="w-full py-1 px-2 rounded text-[11px] font-semibold transition flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer"
              >
                <Cloud className="w-3 h-3 text-emerald-300" />
                <span>{isSupabaseConfigured() ? 'Quản lý Supabase Cloud' : 'Cấu hình kết nối Cloud'}</span>
              </button>
            )}
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
