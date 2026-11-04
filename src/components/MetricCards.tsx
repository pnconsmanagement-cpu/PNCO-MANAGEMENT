import React from 'react';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import { CompanyConfig, Employee, SeasonalWorker } from '../types';
import { getRealCurrentDateInfo } from '../utils/payrollCalculator';

interface MetricCardsProps {
  employees: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  activeCategory?: 'PERMANENT' | 'SEASONAL';
  config?: CompanyConfig;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  employees,
  seasonalWorkers = [],
  activeCategory = 'PERMANENT',
  config,
}) => {
  const { realDateFormatted } = getRealCurrentDateInfo();
  const periodLabel = config?.periodCode || '';

  if (activeCategory === 'SEASONAL') {
    const workingStatusList = seasonalWorkers.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE');
    const participatingList = workingStatusList.filter(
      (w) => (w.actualWorkDays || 0) > 0 || (w.overtimeHours || 0) > 0
    );
    const totalWorkers = workingStatusList.length;
    const activeCount = participatingList.length;
    const projectsCount = new Set(participatingList.map((w) => w.project || w.trade || 'Dự án')).size;

    const totalIncome = participatingList.reduce((sum, w) => sum + (w.totalIncome || 0), 0);
    const totalAdvance = participatingList.reduce((sum, w) => sum + (w.advancePayment || 0), 0);
    const totalDeductions = participatingList.reduce((sum, w) => sum + (w.totalDeductions || 0), 0);
    const totalNet = participatingList.reduce((sum, w) => sum + (w.netSalary || 0), 0);
    const averageNet = activeCount > 0 ? Math.round(totalNet / activeCount) : 0;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>TỔNG THU NHẬP (THỜI VỤ)</span>
            {periodLabel && <span className="text-[10px] text-amber-700 font-black">T{periodLabel}</span>}
          </div>
          <div className="text-xl font-bold text-amber-800 mt-1">
            {formatNumberOnly(totalIncome)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Lương công nhật + phụ cấp + tăng ca
          </div>
        </div>

        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            TỔNG KHẤU TRỪ
          </div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {formatNumberOnly(totalDeductions)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Tạm ứng ({formatNumberOnly(totalAdvance)}) + thuế
          </div>
        </div>

        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            TỔNG THỰC LĨNH
          </div>
          <div className="text-xl font-bold text-[#0f3d64] mt-1">
            {formatNumberOnly(totalNet)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Bình quân {formatNumberOnly(averageNet)} đ/người
          </div>
        </div>

        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>THAM GIA CHẤM CÔNG</span>
            <span className="text-[10px] text-emerald-700 font-bold">{realDateFormatted}</span>
          </div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {activeCount} <span className="text-xs font-normal text-slate-500">/ {totalWorkers}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {projectsCount} dự án / tổ đội tính lương
          </div>
        </div>
      </div>
    );
  }

  // Nhân viên chính thức: chỉ tính lương cho nhân viên đang làm việc VÀ có tham gia chấm công trong kỳ
  const workingEmployees = employees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE');
  const participatingEmployees = workingEmployees.filter(
    (e) => (e.actualWorkDays || 0) > 0 || (e.overtimeHours || 0) > 0 || (e.paidLeaveDays || 0) > 0
  );

  const totalEmployees = workingEmployees.length;
  const activeCount = participatingEmployees.length;
  const departments = new Set(participatingEmployees.map((e) => e.department)).size;

  const totalIncome = participatingEmployees.reduce((sum, e) => sum + (e.totalIncome || 0), 0);
  const totalInsurance = participatingEmployees.reduce((sum, e) => sum + (e.totalInsurance || 0), 0);
  const totalDeductions = participatingEmployees.reduce((sum, e) => sum + (e.totalDeductions || 0), 0);
  const totalNet = participatingEmployees.reduce((sum, e) => sum + (e.netSalary || 0), 0);
  const averageNet = activeCount > 0 ? Math.round(totalNet / activeCount) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      {/* 1. Tổng thu nhập */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>TỔNG THU NHẬP</span>
          {periodLabel && <span className="text-[10px] text-sky-700 font-black">T{periodLabel}</span>}
        </div>
        <div className="text-xl font-bold text-sky-900 mt-1">
          {formatNumberOnly(totalIncome)}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Lương công + phụ cấp + tăng ca
        </div>
      </div>

      {/* 2. Tổng khấu trừ */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          TỔNG KHẤU TRỪ
        </div>
        <div className="text-xl font-bold text-slate-800 mt-1">
          {formatNumberOnly(totalDeductions)}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          BHXH 10.5% ({formatNumberOnly(totalInsurance)}) + tạm ứng
        </div>
      </div>

      {/* 3. Tổng thực lĩnh */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          TỔNG THỰC LĨNH
        </div>
        <div className="text-xl font-bold text-[#0f3d64] mt-1">
          {formatNumberOnly(totalNet)}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Bình quân {formatNumberOnly(averageNet)} đ/người
        </div>
      </div>

      {/* 4. Tổng số người */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>TỔNG SỐ NGƯỜI</span>
          <span className="text-[10px] text-emerald-700 font-bold">Hôm nay: {realDateFormatted}</span>
        </div>
        <div className="text-xl font-bold text-slate-800 mt-1">
          {activeCount} <span className="text-xs font-normal text-slate-500">/ {totalEmployees}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {departments} bộ phận tính lương (Tham gia chấm công)
        </div>
      </div>
    </div>
  );
};
