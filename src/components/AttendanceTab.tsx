import React, { useState, useEffect, useMemo } from 'react';
import { CompanyConfig, Employee } from '../types';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import { Calendar, Check, Save, RotateCcw, Users, Filter, Eraser, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { MonthYearPicker } from './MonthYearPicker';

interface AttendanceTabProps {
  employees: Employee[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onBatchUpdate: (updated: Employee[]) => void;
  onGoToEmployeeList?: () => void;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  employees,
  config,
  onChangeMonthYear,
  onBatchUpdate,
  onGoToEmployeeList,
}) => {
  const [modifiedEmployees, setModifiedEmployees] = useState<Employee[]>(employees);
  const [onlySelected, setOnlySelected] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    actionLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    setModifiedEmployees(employees);
  }, [employees]);

  const handleWorkDaysChange = (code: string, newDays: number) => {
    setModifiedEmployees((prev) =>
      prev.map((emp) => {
        if (emp.code === code) {
          const updated = { ...emp, actualWorkDays: newDays };
          return recomputeEmployeePayroll(updated);
        }
        return emp;
      })
    );
  };

  const handleOtChange = (code: string, hours: number) => {
    setModifiedEmployees((prev) =>
      prev.map((emp) => {
        if (emp.code === code) {
          const updated = { ...emp, overtimeHours: hours };
          return recomputeEmployeePayroll(updated);
        }
        return emp;
      })
    );
  };

  const handleFillFullWorkDays = () => {
    const std = config.standardWorkDays || 26;
    setConfirmModal({
      title: 'Xác nhận đặt công chuẩn',
      message: `Đặt công thực tế bằng công chuẩn (${std} ngày) cho toàn bộ nhân viên được chọn?`,
      actionLabel: 'Đặt công chuẩn',
      onConfirm: () => {
        const updated = modifiedEmployees.map((emp) => {
          if (onlySelected && emp.selectedForAttendance === false) return emp;
          return recomputeEmployeePayroll({ ...emp, actualWorkDays: std, unpaidLeaveDays: 0 });
        });
        setModifiedEmployees(updated);
        onBatchUpdate(updated);
        setToastMessage(`Đã đặt công chuẩn (${std} ngày) cho nhân viên!`);
      },
    });
  };

  const handleClearAttendance = () => {
    setConfirmModal({
      title: 'Xác nhận xóa trắng chấm công',
      message: 'Bạn có chắc muốn để trống Công thực tế và Giờ OT để nhập mới từ đầu cho kỳ này?',
      actionLabel: 'Xóa trắng',
      onConfirm: () => {
        const updated = modifiedEmployees.map((emp) => {
          if (onlySelected && emp.selectedForAttendance === false) return emp;
          return recomputeEmployeePayroll({
            ...emp,
            actualWorkDays: 0,
            overtimeHours: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
          });
        });
        setModifiedEmployees(updated);
        onBatchUpdate(updated);
        setToastMessage('Đã xóa trắng công thực tế và OT để nhập mới!');
      },
    });
  };

  const handleSaveAttendance = () => {
    onBatchUpdate(modifiedEmployees);
    setToastMessage('Đã cập nhật dữ liệu chấm công và đồng bộ lại bảng lương thành công!');
  };

  const monthFormatted = (config.month || 9) < 10 ? `0${config.month || 9}` : config.month;
  const yearFormatted = config.year || 2026;

  // Filter display list
  const displayedEmployees = useMemo(() => {
    if (!onlySelected) return modifiedEmployees;
    return modifiedEmployees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED');
  }, [modifiedEmployees, onlySelected]);

  const selectedCount = modifiedEmployees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED').length;

  return (
    <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-700" />
              <span>Bảng chấm công tổng hợp tháng {monthFormatted}/{yearFormatted}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cập nhật ngày công thực tế và giờ làm thêm (OT) để tự động tính lại lương
            </p>
          </div>

          {/* Month Year Picker */}
          <MonthYearPicker
            month={config.month || 9}
            year={config.year || 2026}
            onChange={onChangeMonthYear}
            label="Kỳ chấm công:"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle filter */}
          <button
            type="button"
            onClick={() => setOnlySelected(!onlySelected)}
            className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              onlySelected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{onlySelected ? `Chỉ hiện NV chấm công (${selectedCount})` : `Hiện tất cả (${modifiedEmployees.length})`}</span>
          </button>

          {onGoToEmployeeList && (
            <button
              type="button"
              onClick={onGoToEmployeeList}
              className="px-2.5 py-1.5 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Thêm hoặc chọn nhân sự chấm công trong Danh sách nhân viên"
            >
              <Users className="w-3.5 h-3.5 text-sky-700" />
              <span>+ Quản lý nhân sự chấm công</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClearAttendance}
            className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="Để trống toàn bộ công thực tế và giờ OT để tự nhập lại từ đầu"
          >
            <Eraser className="w-3.5 h-3.5 text-amber-700" />
            <span>Để trống để nhập mới</span>
          </button>

          <button
            type="button"
            onClick={handleFillFullWorkDays}
            className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
            title="Điền công chuẩn cho nhân viên đang chọn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Chấm đủ công tất cả</span>
          </button>

          <button
            onClick={handleSaveAttendance}
            className="px-3.5 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Lưu & Đồng bộ bảng lương</span>
          </button>
        </div>
      </div>

      <div className="border border-slate-200 rounded overflow-x-auto max-h-[620px] text-xs">
        <table className="w-full border-collapse text-left whitespace-nowrap">
          <thead className="bg-[#0f3d64] text-white sticky top-0 z-20 text-[11px]">
            <tr>
              <th className="p-2 border-r border-sky-800 text-center w-12">STT</th>
              <th className="p-2 border-r border-sky-800 text-center w-20">Mã NV</th>
              <th className="p-2 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30 min-w-[160px]">Họ và tên</th>
              <th className="p-2 border-r border-sky-800">Bộ phận</th>
              <th className="p-2 border-r border-sky-800 text-center w-28">
                <div>Hình thức lương</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng / Ngày</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-center">Công chuẩn</th>
              <th className="p-2 border-r border-sky-800 text-center w-28">Công thực tế</th>
              <th className="p-2 border-r border-sky-800 text-center w-32">
                <div>Giờ OT (hệ số 1.5)</div>
                <div className="text-[9.5px] text-amber-200 font-normal">Tăng ca 150%</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right w-32 bg-[#144d7d]">
                <div>Tiền tăng ca (1.5x)</div>
                <div className="text-[9.5px] text-amber-200 font-normal">Hệ số 150%</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-center">Nghỉ phép</th>
              <th className="p-2 border-r border-sky-800 text-center">Nghỉ không lương</th>
              <th className="p-2 text-right bg-[#144d7d]">
                <div>Lương theo công</div>
                <div className="text-[9.5px] text-amber-200 font-normal">Tháng / 26 hoặc Theo ngày</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-[12px]">
            {displayedEmployees.map((emp, index) => (
              <tr key={emp.code} className="hover:bg-sky-50/50">
                <td className="p-2 border-r border-slate-200 text-center text-slate-500 font-mono">
                  {index + 1}
                </td>
                <td className="p-2 border-r border-slate-200 font-mono font-semibold text-[#0f3d64] text-center">
                  {emp.code}
                </td>
                <td className="p-2 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 font-bold text-slate-900 z-10">
                  {emp.fullName}
                </td>
                <td className="p-2 border-r border-slate-200 text-slate-600">{emp.department}</td>
                <td className="p-1.5 border-r border-slate-200 text-center">
                  {emp.salaryType === 'DAILY' ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Theo ngày
                      </span>
                      <span className="text-[11px] font-mono text-amber-950 font-bold mt-0.5">
                        {new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-[#0f3d64] border border-sky-200">
                        Theo tháng
                      </span>
                      <span className="text-[11px] font-mono text-slate-700 mt-0.5">
                        {new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ
                      </span>
                    </div>
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-700">
                  {emp.standardWorkDays}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center bg-sky-50/50">
                  <input
                    type="number"
                    min={0}
                    max={31}
                    step={0.5}
                    placeholder="—"
                    value={emp.actualWorkDays === 0 ? '' : emp.actualWorkDays}
                    onChange={(e) =>
                      handleWorkDaysChange(emp.code, e.target.value === '' ? 0 : parseFloat(e.target.value))
                    }
                    className="w-20 px-2 py-1 border border-slate-300 rounded text-center font-bold text-slate-800 bg-white focus:outline-sky-600 focus:bg-sky-50/30 placeholder:text-slate-300 placeholder:font-normal"
                  />
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={0.5}
                    placeholder="—"
                    value={emp.overtimeHours === 0 ? '' : emp.overtimeHours}
                    onChange={(e) =>
                      handleOtChange(emp.code, e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)
                    }
                    className="w-20 px-2 py-1 border border-slate-300 rounded text-center font-semibold text-slate-800 bg-white focus:outline-sky-600 focus:bg-sky-50/30 placeholder:text-slate-300 placeholder:font-normal"
                  />
                </td>
                <td
                  className="p-2 border-r border-slate-200 text-right font-mono font-bold text-amber-900 bg-amber-50/20"
                  title={
                    emp.salaryType === 'DAILY'
                      ? `OT ngày: (${new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} / 8) * 1.5 * ${emp.overtimeHours || 0}h`
                      : `OT tháng: (${new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} / 26 / 8) * 1.5 * ${emp.overtimeHours || 0}h`
                  }
                >
                  {(emp.overtimePay || 0) > 0 ? (
                    `${new Intl.NumberFormat('vi-VN').format(emp.overtimePay)} đ`
                  ) : (
                    <span className="text-slate-400 font-normal">-</span>
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-center text-slate-600">{emp.paidLeaveDays}</td>
                <td className="p-2 border-r border-slate-200 text-center text-slate-600">{emp.unpaidLeaveDays}</td>
                <td
                  className="p-2 text-right font-mono font-bold text-[#0f3d64]"
                  title={
                    emp.salaryType === 'DAILY'
                      ? `Lương ngày: = ${new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ × ${emp.actualWorkDays} công = ${new Intl.NumberFormat('vi-VN').format(emp.salaryByActualDays)} đ`
                      : `Lương tháng: =ROUND(((${new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} / 26) * ${emp.actualWorkDays}), 0) = ${new Intl.NumberFormat('vi-VN').format(emp.salaryByActualDays)} đ`
                  }
                >
                  {emp.actualWorkDays === 0 ? (
                    <span className="text-slate-400 font-normal italic text-[11px]">Chưa nhập công</span>
                  ) : (
                    <div>
                      <div>{new Intl.NumberFormat('vi-VN').format(emp.salaryByActualDays)} đ</div>
                      <div className="text-[9px] text-slate-500 font-normal">
                        {emp.salaryType === 'DAILY' ? '(Đơn giá × công)' : '(=Lương/26 × công)'}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-sky-50 border-b border-sky-200 p-4 flex items-center gap-3 text-sky-950">
              <div className="p-2 bg-sky-100 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5 text-sky-700" />
              </div>
              <h3 className="font-bold text-sm uppercase">{confirmModal.title}</h3>
            </div>
            <div className="p-5 text-xs text-slate-700">
              <p>{confirmModal.message}</p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#0f3d64] hover:bg-[#1a5b94] rounded-lg shadow-sm transition cursor-pointer"
              >
                {confirmModal.actionLabel || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-xs font-bold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
