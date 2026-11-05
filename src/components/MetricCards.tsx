import React from 'react';
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

    const totalWorkDays = Number(
      participatingList.reduce((sum, w) => sum + (Number(w.actualWorkDays) || 0), 0).toFixed(1)
    );
    const totalOvertimeHours = Number(
      participatingList.reduce((sum, w) => sum + (Number(w.overtimeHours) || 0), 0).toFixed(1)
    );

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>NHÂN VIÊN THAM GIA CHẤM CÔNG</span>
            <span className="text-[10px] text-emerald-700 font-bold">{realDateFormatted}</span>
          </div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {activeCount} <span className="text-xs font-normal text-slate-500">/ {totalWorkers} nhân viên</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {projectsCount} dự án / tổ đội có chấm công
          </div>
        </div>

        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>SỐ NGÀY CÔNG TRONG THÁNG</span>
            {periodLabel && <span className="text-[10px] text-amber-700 font-black">T{periodLabel}</span>}
          </div>
          <div className="text-xl font-bold text-[#0f3d64] mt-1">
            {totalWorkDays} <span className="text-xs font-normal text-slate-500">ngày công</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Tổng ngày công đi làm thực tế trong tháng
          </div>
        </div>

        <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>SỐ GIỜ TĂNG CA TRONG THÁNG</span>
            {periodLabel && <span className="text-[10px] text-amber-700 font-black">T{periodLabel}</span>}
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1">
            {totalOvertimeHours} <span className="text-xs font-normal text-slate-500">giờ tăng ca (OT)</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Tổng số giờ làm thêm trong tháng
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

  const totalWorkDays = Number(
    participatingEmployees.reduce((sum, e) => sum + (Number(e.actualWorkDays) || 0), 0).toFixed(1)
  );
  const totalOvertimeHours = Number(
    participatingEmployees.reduce((sum, e) => sum + (Number(e.overtimeHours) || 0), 0).toFixed(1)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      {/* 1. Nhân viên tham gia chấm công */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>NHÂN VIÊN THAM GIA CHẤM CÔNG</span>
          <span className="text-[10px] text-emerald-700 font-bold">{realDateFormatted}</span>
        </div>
        <div className="text-xl font-bold text-slate-800 mt-1">
          {activeCount} <span className="text-xs font-normal text-slate-500">/ {totalEmployees} nhân viên</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {departments} bộ phận có tham gia chấm công
        </div>
      </div>

      {/* 2. Số ngày công trong tháng */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>SỐ NGÀY CÔNG TRONG THÁNG</span>
          {periodLabel && <span className="text-[10px] text-sky-700 font-black">T{periodLabel}</span>}
        </div>
        <div className="text-xl font-bold text-[#0f3d64] mt-1">
          {totalWorkDays} <span className="text-xs font-normal text-slate-500">ngày công</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Tổng ngày công đi làm thực tế trong tháng
        </div>
      </div>

      {/* 3. Số giờ tăng ca trong tháng */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
          <span>SỐ GIỜ TĂNG CA TRONG THÁNG</span>
          {periodLabel && <span className="text-[10px] text-sky-700 font-black">T{periodLabel}</span>}
        </div>
        <div className="text-xl font-bold text-amber-700 mt-1">
          {totalOvertimeHours} <span className="text-xs font-normal text-slate-500">giờ tăng ca (OT)</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Tổng số giờ làm thêm trong tháng
        </div>
      </div>
    </div>
  );
};
