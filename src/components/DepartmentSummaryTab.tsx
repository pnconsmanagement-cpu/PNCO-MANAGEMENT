import React, { useMemo } from 'react';
import { Employee, DepartmentSummary } from '../types';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import { Building2, Users, CreditCard, ShieldCheck } from 'lucide-react';

interface DepartmentSummaryTabProps {
  employees: Employee[];
}

export const DepartmentSummaryTab: React.FC<DepartmentSummaryTabProps> = ({ employees }) => {
  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== 'RESIGNED'), [employees]);

  const summaries: DepartmentSummary[] = useMemo(() => {
    const deptMap: { [key: string]: Employee[] } = {};
    activeEmployees.forEach((emp) => {
      if (!deptMap[emp.department]) deptMap[emp.department] = [];
      deptMap[emp.department].push(emp);
    });

    return Object.entries(deptMap).map(([name, list]) => {
      const totalIncome = list.reduce((s, e) => s + e.totalIncome, 0);
      const totalInsurance = list.reduce((s, e) => s + e.totalInsurance, 0);
      const totalNet = list.reduce((s, e) => s + e.netSalary, 0);
      return {
        name,
        employeeCount: list.length,
        totalIncome,
        totalInsurance,
        totalNet,
        averageNet: Math.round(totalNet / list.length),
      };
    });
  }, [employees]);

  const grandTotalNet = summaries.reduce((s, d) => s + d.totalNet, 0);

  return (
    <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Báo cáo tổng hợp chi phí lương theo bộ phận
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân bổ quỹ lương và bảo hiểm cho {summaries.length} bộ phận
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map((d) => {
          const percent = grandTotalNet > 0 ? ((d.totalNet / grandTotalNet) * 100).toFixed(1) : '0';
          return (
            <div key={d.name} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 hover:bg-white hover:shadow-xs transition">
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-[#0f3d64]">{d.name}</span>
                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-bold">
                  {d.employeeCount} nhân sự
                </span>
              </div>

              <div className="mt-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Quỹ thực lĩnh:</span>
                  <span className="font-bold text-slate-900 font-mono">{formatNumberOnly(d.totalNet)} đ</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Bình quân / người:</span>
                  <span className="font-medium text-slate-800 font-mono">{formatNumberOnly(d.averageNet)} đ</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>BHXH (10.5%):</span>
                  <span className="font-mono text-rose-800">{formatNumberOnly(d.totalInsurance)} đ</span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>Tỷ trọng quỹ lương:</span>
                  <span className="font-bold text-slate-700">{percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0f3d64] rounded-full"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Table */}
      <div className="border border-slate-200 rounded overflow-hidden mt-4 text-xs">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#0f3d64] text-white">
            <tr>
              <th className="p-2.5 font-semibold">Bộ phận</th>
              <th className="p-2.5 text-center">Số NV</th>
              <th className="p-2.5 text-right">Tổng thu nhập</th>
              <th className="p-2.5 text-right">BHXH (10.5%)</th>
              <th className="p-2.5 text-right">Tổng thực lĩnh</th>
              <th className="p-2.5 text-right">Lương bình quân</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {summaries.map((s) => (
              <tr key={s.name} className="hover:bg-slate-50">
                <td className="p-2 font-semibold text-slate-800">{s.name}</td>
                <td className="p-2 text-center text-slate-700">{s.employeeCount}</td>
                <td className="p-2 text-right font-mono">{formatNumberOnly(s.totalIncome)}</td>
                <td className="p-2 text-right font-mono text-rose-800">{formatNumberOnly(s.totalInsurance)}</td>
                <td className="p-2 text-right font-mono font-bold text-emerald-800">{formatNumberOnly(s.totalNet)}</td>
                <td className="p-2 text-right font-mono">{formatNumberOnly(s.averageNet)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
            <tr>
              <td className="p-2.5 uppercase">TỔNG TOÀN CÔNG TY</td>
              <td className="p-2.5 text-center">{employees.length}</td>
              <td className="p-2.5 text-right font-mono">{formatNumberOnly(summaries.reduce((s, d) => s + d.totalIncome, 0))}</td>
              <td className="p-2.5 text-right font-mono text-rose-900">{formatNumberOnly(summaries.reduce((s, d) => s + d.totalInsurance, 0))}</td>
              <td className="p-2.5 text-right font-mono text-emerald-900 font-black">{formatNumberOnly(grandTotalNet)}</td>
              <td className="p-2.5 text-right font-mono">{formatNumberOnly(Math.round(grandTotalNet / employees.length))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
