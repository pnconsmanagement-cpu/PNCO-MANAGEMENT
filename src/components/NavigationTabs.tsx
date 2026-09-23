import React from 'react';
import { FileText, PieChart, Table2, Users, CalendarCheck, ShieldAlert, HardHat } from 'lucide-react';

export type TabType =
  | 'PAYSLIP'
  | 'DEPARTMENT'
  | 'PAYROLL_TABLE'
  | 'EMPLOYEE_LIST'
  | 'ATTENDANCE'
  | 'DATA_AUDIT'
  | 'SEASONAL_WORKERS';

interface NavigationTabsProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  auditIssuesCount: number;
  seasonalCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  auditIssuesCount,
  seasonalCount,
}) => {
  interface TabItem {
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const tabs: TabItem[] = [
    { id: 'PAYSLIP', label: 'PHIẾU LƯƠNG', icon: FileText },
    { id: 'DEPARTMENT', label: 'TỔNG HỢP THEO BỘ PHẬN', icon: PieChart },
    { id: 'PAYROLL_TABLE', label: 'BẢNG LƯƠNG', icon: Table2 },
    { id: 'ATTENDANCE', label: 'CHẤM CÔNG', icon: CalendarCheck },
    { id: 'DATA_AUDIT', label: 'KIỂM TRA DỮ LIỆU', icon: ShieldAlert, badge: auditIssuesCount },
    { id: 'EMPLOYEE_LIST', label: 'DANH SÁCH NHÂN VIÊN', icon: Users },
    { id: 'SEASONAL_WORKERS', label: 'NHÂN LỰC THỜI VỤ', icon: HardHat, badge: seasonalCount },
  ];

  return (
    <div className="flex border-b-2 border-slate-200 bg-white px-2 sm:px-4 gap-1 sm:gap-2 mb-3 shadow-xs overflow-x-auto">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            id={`tab-${t.id.toLowerCase()}`}
            onClick={() => onSelectTab(t.id as TabType)}
            className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-xs sm:text-[13px] font-bold uppercase tracking-wider border-b-[3px] transition-all cursor-pointer whitespace-nowrap select-none ${
              isActive
                ? 'border-[#0f3d64] text-[#0f3d64] bg-sky-50/80 font-black shadow-2xs'
                : 'border-transparent text-slate-700 hover:text-[#0f3d64] hover:bg-slate-50 hover:border-slate-300 font-bold'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[#0f3d64] stroke-[2.5]' : 'text-slate-500 stroke-2'}`} />
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black leading-none ml-0.5">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
