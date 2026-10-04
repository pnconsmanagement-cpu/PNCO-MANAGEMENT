import React from 'react';
import {
  FileText,
  PieChart,
  Table2,
  Users,
  CalendarCheck,
  ShieldAlert,
  HardHat,
  Building,
  CreditCard,
  TrendingUp,
} from 'lucide-react';

export type TabType =
  | 'EMPLOYEE_LIST'
  | 'PROJECTS'
  | 'PAYROLL_TABLE'
  | 'SALARY_ADVANCES'
  | 'ATTENDANCE'
  | 'FINANCIAL_REPORT'
  | 'PAYSLIP'
  | 'DEPARTMENT'
  | 'DATA_AUDIT'
  | 'SEASONAL_WORKERS';

interface NavigationTabsProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  auditIssuesCount: number;
  seasonalCount?: number;
  teamCount?: number;
  projectCount?: number;
  advanceCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  auditIssuesCount,
  seasonalCount,
  teamCount,
  projectCount,
  advanceCount,
}) => {
  interface TabItem {
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }

  const tabs: TabItem[] = [
    { id: 'EMPLOYEE_LIST', label: '1. DANH SÁCH NHÂN VIÊN', icon: Users },
    { id: 'PROJECTS', label: '2. DỰ ÁN', icon: Building, badge: projectCount },
    { id: 'PAYROLL_TABLE', label: '3. BẢNG LƯƠNG', icon: Table2 },
    { id: 'SALARY_ADVANCES', label: '4. LƯƠNG ỨNG', icon: CreditCard, badge: advanceCount },
    { id: 'ATTENDANCE', label: '5. CHẤM CÔNG', icon: CalendarCheck },
    { id: 'FINANCIAL_REPORT', label: '6. BÁO CÁO TÀI CHÍNH', icon: TrendingUp },
    { id: 'PAYSLIP', label: '7. PHIẾU LƯƠNG', icon: FileText },
    { id: 'DEPARTMENT', label: 'BỘ PHẬN', icon: PieChart },
    { id: 'DATA_AUDIT', label: 'KIỂM TRA', icon: ShieldAlert, badge: auditIssuesCount },
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
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ml-0.5 ${t.badgeColor || 'bg-amber-500 text-white'}`}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
