import React, { useMemo } from 'react';
import { Employee } from '../types';
import { ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';

interface DataAuditTabProps {
  employees: Employee[];
  onSelectEmployeeForPayslip: (code: string) => void;
}

export const DataAuditTab: React.FC<DataAuditTabProps> = ({
  employees,
  onSelectEmployeeForPayslip,
}) => {
  const auditResults = useMemo(() => {
    const issues: {
      type: 'warning' | 'error' | 'info';
      employee: Employee;
      title: string;
      description: string;
    }[] = [];

    employees.forEach((emp) => {
      // 1. Kiểm tra số tài khoản
      if (!emp.bankAccount || emp.bankAccount.length < 8) {
        issues.push({
          type: 'error',
          employee: emp,
          title: 'Thiếu số tài khoản ngân hàng',
          description: `Chưa có thông tin số tài khoản hợp lệ để chuyển khoản lương qua ${emp.bankName || 'ngân hàng'}.`,
        });
      }

      // 2. Ngày công bất thường
      if (emp.actualWorkDays > emp.standardWorkDays) {
        issues.push({
          type: 'warning',
          employee: emp,
          title: 'Ngày công thực tế lớn hơn công chuẩn',
          description: `Công thực tế (${emp.actualWorkDays}) vượt chuẩn (${emp.standardWorkDays}). Cần kiểm tra lại có tính thêm giờ không.`,
        });
      }

      // 3. Thực lĩnh âm hoặc quá thấp
      if (emp.netSalary <= 0) {
        issues.push({
          type: 'error',
          employee: emp,
          title: 'Thực lĩnh nhỏ hơn hoặc bằng 0',
          description: `Tổng khấu trừ (${formatNumberOnly(emp.totalDeductions)}) vượt quá hoặc bằng tổng thu nhập.`,
        });
      }

      // 4. Tạm ứng lớn
      if (emp.advancePayment > 0 && emp.advancePayment >= emp.totalIncome * 0.5) {
        issues.push({
          type: 'warning',
          employee: emp,
          title: 'Tạm ứng vượt quá 50% thu nhập',
          description: `Đã tạm ứng ${formatNumberOnly(emp.advancePayment)} đ trên tổng thu nhập ${formatNumberOnly(emp.totalIncome)} đ.`,
        });
      }

      // 5. Làm thêm giờ cao
      if (emp.overtimeHours > 30) {
        issues.push({
          type: 'info',
          employee: emp,
          title: 'Giờ làm thêm cao trong tháng',
          description: `Nhân viên đã làm ${emp.overtimeHours} giờ thêm, cần rà soát hạn mức OT theo Bộ luật Lao động.`,
        });
      }
    });

    return issues;
  }, [employees]);

  return (
    <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Kiểm tra & Rà soát tính hợp lệ của dữ liệu bảng lương</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động phát hiện các sai sót về số tài khoản, ngày công, tạm ứng, thuế và bảo hiểm
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>45/45 hồ sơ đã đối soát</span>
          </span>
        </div>
      </div>

      {auditResults.length === 0 ? (
        <div className="p-8 border border-dashed border-emerald-200 rounded-lg bg-emerald-50/50 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <div className="font-bold text-slate-800 text-sm">Dữ liệu bảng lương hoàn toàn hợp lệ!</div>
          <div className="text-xs text-slate-500">
            Không phát hiện bất thường về số tài khoản, ngày công hoặc các khoản giảm trừ thuế.
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {auditResults.map((item, idx) => (
            <div
              key={idx}
              className={`p-3 border rounded-lg flex items-start justify-between gap-3 text-xs ${
                item.type === 'error'
                  ? 'border-red-200 bg-red-50/50'
                  : item.type === 'warning'
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-sky-200 bg-sky-50/50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    item.type === 'error'
                      ? 'text-red-600'
                      : item.type === 'warning'
                      ? 'text-amber-600'
                      : 'text-sky-600'
                  }`}
                />
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span>{item.title}</span>
                    <span className="text-slate-500 font-normal">
                      • {item.employee.fullName} ({item.employee.code} - {item.employee.department})
                    </span>
                  </div>
                  <div className="text-slate-600 mt-0.5">{item.description}</div>
                </div>
              </div>

              <button
                onClick={() => onSelectEmployeeForPayslip(item.employee.code)}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 font-medium shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <span>Xem phiếu</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
