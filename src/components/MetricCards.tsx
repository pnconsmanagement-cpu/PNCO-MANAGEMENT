import React from 'react';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import { Employee } from '../types';

interface MetricCardsProps {
  employees: Employee[];
}

export const MetricCards: React.FC<MetricCardsProps> = ({ employees }) => {
  const activeEmployees = employees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED');
  const totalEmployees = employees.length;
  const activeCount = activeEmployees.length;
  const departments = new Set(activeEmployees.map((e) => e.department)).size;

  const totalIncome = activeEmployees.reduce((sum, e) => sum + (e.totalIncome || 0), 0);
  const totalInsurance = activeEmployees.reduce((sum, e) => sum + (e.totalInsurance || 0), 0);

  const totalDeductions = activeEmployees.reduce((sum, e) => sum + (e.totalDeductions || 0), 0);
  const totalNet = activeEmployees.reduce((sum, e) => sum + (e.netSalary || 0), 0);
  const averageNet = activeCount > 0 ? Math.round(totalNet / activeCount) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
      {/* 1. Tổng thu nhập */}
      <div className="bg-white rounded border border-slate-200 p-3 shadow-xs">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          TỔNG THU NHẬP
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
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          TỔNG SỐ NGƯỜI
        </div>
        <div className="text-xl font-bold text-slate-800 mt-1">
          {activeCount} <span className="text-xs font-normal text-slate-500">/ {totalEmployees}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {departments} bộ phận tính lương
        </div>
      </div>
    </div>
  );
};
