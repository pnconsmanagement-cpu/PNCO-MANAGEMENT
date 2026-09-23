import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search, Plus, Filter, Edit3, Trash2, History, Users, AlertCircle } from 'lucide-react';
import { CompanyConfig, Employee } from '../types';
import { formatNumberOnly, formatVND } from '../utils/numberToVietnameseWords';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import { MonthYearPicker } from './MonthYearPicker';

interface PayrollTableTabProps {
  employees: Employee[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
}

export const PayrollTableTab: React.FC<PayrollTableTabProps> = ({
  employees,
  config,
  onChangeMonthYear,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [attendanceOnly, setAttendanceOnly] = useState(true);
  const [salaryTypeFilter, setSalaryTypeFilter] = useState<'ALL' | 'MONTHLY' | 'DAILY'>('ALL');
  const [showResignedHistory, setShowResignedHistory] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Phân tách nhân viên đang làm việc và nhân viên đã nghỉ
  const activeEmployees = useMemo(
    () => employees.filter((e) => (e.status || 'ACTIVE') !== 'RESIGNED'),
    [employees]
  );
  const resignedEmployees = useMemo(
    () => employees.filter((e) => e.status === 'RESIGNED'),
    [employees]
  );

  const departments = useMemo(() => {
    const list = showResignedHistory ? resignedEmployees : activeEmployees;
    return Array.from(new Set(list.map((e) => e.department)));
  }, [activeEmployees, resignedEmployees, showResignedHistory]);

  const monthlyCount = useMemo(
    () => activeEmployees.filter((e) => e.salaryType !== 'DAILY').length,
    [activeEmployees]
  );
  const dailyCount = useMemo(
    () => activeEmployees.filter((e) => e.salaryType === 'DAILY').length,
    [activeEmployees]
  );

  // Lọc danh sách: Mặc định nhân viên đã nghỉ TUYỆT ĐỐI KHÔNG hiện lên bảng lương (chỉ xem khi bấm xem Lịch sử)
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const isResigned = e.status === 'RESIGNED';

      if (!showResignedHistory) {
        // Chế độ bảng lương chính: Loại bỏ toàn bộ nhân viên đã nghỉ
        if (isResigned) return false;
        if (attendanceOnly && e.selectedForAttendance === false) {
          return false;
        }
      } else {
        // Chế độ xem lịch sử: Chỉ hiện nhân viên đã nghỉ
        if (!isResigned) return false;
      }

      if (salaryTypeFilter === 'MONTHLY' && e.salaryType === 'DAILY') {
        return false;
      }
      if (salaryTypeFilter === 'DAILY' && e.salaryType !== 'DAILY') {
        return false;
      }
      const matchDept = selectedDept === 'ALL' || e.department === selectedDept;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !term ||
        e.fullName.toLowerCase().includes(term) ||
        e.code.toLowerCase().includes(term) ||
        e.title.toLowerCase().includes(term);
      return matchDept && matchSearch;
    });
  }, [employees, selectedDept, searchTerm, attendanceOnly, salaryTypeFilter, showResignedHistory]);

  // Export to Excel .xlsx
  const handleExportExcel = () => {
    const rows = filtered.map((e, index) => ({
      'STT': index + 1,
      'Mã NV': e.code,
      'Họ và tên': e.fullName,
      'Chức danh': e.title,
      'Bộ phận': e.department,
      'Hình thức tính lương': e.salaryType === 'DAILY' ? 'Theo ngày công' : 'Lương tháng (chia 26)',
      'Lương CB / Đơn giá ngày': e.baseSalary,
      'Công chuẩn': e.standardWorkDays,
      'Công thực tế': e.actualWorkDays,
      'Lương thực tế theo công': e.salaryByActualDays,
      'Giờ tăng ca': e.overtimeHours || 0,
      'Tiền tăng ca (1.5x)': e.overtimePay,
      'PC Trách nhiệm': e.responsibilityAllowance || 0,
      'PC Dự án': e.projectAllowance || 0,
      'PC Ăn ca': e.mealAllowance,
      'PC Xăng xe, ĐT': e.phoneTravelAllowance,
      'Thưởng KPI': e.kpiBonus,
      'TỔNG THU NHẬP': e.totalIncome,
      'Số người phụ thuộc (NPT)': e.dependents,
      'Lương đóng BH': e.insuranceSalary,
      'BHXH (=Lương BH × 10.5%)': e.totalInsurance,
      'BHXH (8%)': e.socialInsurance,
      'BHYT (1.5%)': e.healthInsurance,
      'BHTN (1%)': e.unemploymentInsurance,
      'Tạm ứng': e.advancePayment,
      'Đoàn phí': e.unionFee,
      'TỔNG KHẤU TRỪ': e.totalDeductions,
      'THỰC LĨNH': e.netSalary,
      'Hợp đồng LĐ': e.contractType || 'HĐLĐ Không xác định thời hạn',
      'Thời hạn HĐ': e.contractDuration || 'Vô thời hạn',
      'Số HĐLĐ': e.contractNumber || '',
      'Ngày vào làm': e.joinDate,
      'Số tài khoản': e.bankAccount,
      'Ngân hàng': e.bankName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, showResignedHistory ? 'LichSuLuongNghiViec' : 'BangLuong');
    const prefix = showResignedHistory ? 'LichSuLuong_NhanVienNghiViec' : 'BangLuong';
    XLSX.writeFile(workbook, `${prefix}_${config.periodCode.replace('/', '_')}_${config.name.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-3">
      {/* Top Filter & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            {showResignedHistory ? 'Hồ sơ lưu trữ lịch sử lương nhân viên đã nghỉ' : 'Bảng lương chi tiết'} — {config.period}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            ({filtered.length} {showResignedHistory ? 'nhân sự đã thôi việc' : 'nhân viên đang làm việc'})
          </span>

          {/* Month & Year Picker Text Box */}
          <MonthYearPicker
            month={config.month || 9}
            year={config.year || 2026}
            onChange={onChangeMonthYear}
            label="Chọn kỳ xem lương:"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chế độ xem: Bảng lương chính vs Lịch sử nhân viên đã nghỉ */}
          <div className="flex items-center rounded border border-slate-300 p-0.5 bg-slate-100 text-xs font-semibold">
            <button
              type="button"
              id="btn-payroll-active"
              onClick={() => setShowResignedHistory(false)}
              className={`px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                !showResignedHistory ? 'bg-white text-[#0f3d64] shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Đang làm việc ({activeEmployees.length})</span>
            </button>
            {resignedEmployees.length > 0 && (
              <button
                type="button"
                id="btn-payroll-resigned-history"
                onClick={() => setShowResignedHistory(true)}
                className={`px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                  showResignedHistory ? 'bg-rose-700 text-white shadow-xs font-bold' : 'text-rose-800 hover:bg-rose-50'
                }`}
                title="Xem lại lịch sử bảng lương lúc trước của nhân viên đã thôi việc"
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch sử đã nghỉ ({resignedEmployees.length})</span>
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded w-44 focus:outline-sky-600"
            />
          </div>

          {/* Lọc theo hình thức lương */}
          <div className="flex items-center rounded border border-slate-300 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('ALL')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tất cả ({showResignedHistory ? resignedEmployees.length : activeEmployees.length})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('MONTHLY')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'MONTHLY' ? 'bg-sky-100 text-[#0f3d64] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lương tháng ({monthlyCount})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('DAILY')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'DAILY' ? 'bg-amber-100 text-amber-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lương ngày ({dailyCount})
            </button>
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 bg-white"
          >
            <option value="ALL">Tất cả bộ phận</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {!showResignedHistory && (
            <button
              type="button"
              onClick={() => setAttendanceOnly(!attendanceOnly)}
              className={`px-2.5 py-1 text-xs rounded border font-semibold flex items-center gap-1 transition cursor-pointer ${
                attendanceOnly
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{attendanceOnly ? 'Chỉ hiện NV tính lương' : 'Hiện tất cả'}</span>
            </button>
          )}

          <button
            id="btn-export-excel"
            onClick={handleExportExcel}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Cảnh báo chế độ xem Lịch sử lương của nhân viên đã thôi việc */}
      {showResignedHistory && (
        <div className="bg-rose-50 border border-rose-300 p-3 rounded-lg flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-rose-900">
            <History className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <div className="font-bold uppercase tracking-wide flex items-center gap-2">
                <span>Hồ sơ lưu trữ lịch sử lương nhân viên đã thôi việc ({filtered.length} nhân sự)</span>
                <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-bold text-[10px]">LƯU TRỮ LỊCH SỬ</span>
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5">
                Bảng này chỉ lưu lại thông tin ngày công, tiền lương và phụ cấp trước đây của nhân viên đã thôi việc nhằm phục vụ tra cứu, đối soát quyết toán và giải quyết chế độ. Các nhân sự này không có trong bảng lương phát hành kỳ hiện tại.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowResignedHistory(false)}
            className="px-3 py-1 bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded text-xs font-bold transition cursor-pointer shrink-0"
          >
            Về bảng lương đang làm việc
          </button>
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="border border-slate-200 rounded overflow-x-auto max-h-[620px] relative text-[11px]">
        <table className="w-full border-collapse text-left whitespace-nowrap">
          <thead className="bg-[#0f3d64] text-white sticky top-0 z-20">
            <tr>
              <th className="p-2 border-r border-sky-800 text-center w-10">STT</th>
              <th className="p-2 border-r border-sky-800">Mã NV</th>
              <th className="p-2 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30">Họ và tên</th>
              <th className="p-2 border-r border-sky-800">Chức danh</th>
              <th className="p-2 border-r border-sky-800">Bộ phận</th>
              <th className="p-2 border-r border-sky-800 text-right">
                <div>Lương CB / Đơn giá</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng hoặc Ngày</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-center">Công</th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>Lương theo công</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng / 26 hoặc Theo ngày</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>Tăng ca (1.5x)</div>
                <div className="text-[9px] text-amber-200 font-normal">Hệ số 150%</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>PC Trách nhiệm</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>PC Dự án</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right">PC Khác</th>
              <th className="p-2 border-r border-sky-800 text-right">Thưởng KPI</th>
              <th className="p-2 border-r border-sky-800 text-right bg-sky-900 font-bold">TỔNG THU NHẬP</th>
              <th className="p-2 border-r border-sky-800 text-center w-14 font-bold">NPT</th>
              <th className="p-2 border-r border-sky-800 text-right w-36 font-bold bg-[#144d7d]">
                <div>BHXH (10.5%)</div>
                <div className="text-[9px] text-amber-200 font-normal">(=Lương BH × 10.5%)</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right">Tạm ứng</th>
              <th className="p-2 border-r border-sky-800 text-right">Đoàn phí</th>
              <th className="p-2 border-r border-sky-800 text-right bg-amber-900 font-bold">TỔNG KHẤU TRỪ</th>
              <th className="p-2 border-r border-sky-800 text-right bg-emerald-900 font-bold">THỰC LĨNH</th>
              <th className="p-2 border-r border-sky-800">Số tài khoản</th>
              <th className="p-2">Ngân hàng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={19} className="p-8 text-center text-slate-400">
                  {showResignedHistory
                    ? 'Chưa có nhân sự nào trong danh mục đã nghỉ việc'
                    : 'Không tìm thấy nhân viên đang làm việc phù hợp với bộ lọc'}
                </td>
              </tr>
            ) : (
              filtered.map((emp, index) => (
                <tr
                  key={emp.code}
                  className={`transition-colors ${
                    emp.status === 'RESIGNED'
                      ? 'bg-rose-50/30 hover:bg-rose-50/60'
                      : 'hover:bg-sky-50/50'
                  }`}
                >
                  <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-mono">
                    {index + 1}
                  </td>
                  <td className="p-1.5 border-r border-slate-200 font-semibold text-[#0f3d64]">
                    {emp.code}
                  </td>
                  <td className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 font-bold text-slate-900 z-10">
                    <div className="flex items-center gap-1.5">
                      <span>{emp.fullName}</span>
                      {emp.status === 'RESIGNED' && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 font-bold border border-rose-200 shrink-0">
                          Đã nghỉ
                        </span>
                      )}
                    </div>
                  </td>
                <td className="p-1.5 border-r border-slate-200 text-slate-700">{emp.title}</td>
                <td className="p-1.5 border-r border-slate-200 text-slate-600">{emp.department}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={emp.salaryType === 'DAILY' ? 'font-bold text-amber-900' : 'text-slate-800'}>
                      {formatNumberOnly(emp.baseSalary)}
                    </span>
                    {emp.salaryType === 'DAILY' ? (
                      <span
                        onClick={() => {
                          if (onUpdateEmployee) {
                            const updated = {
                              ...emp,
                              salaryType: 'MONTHLY' as const,
                              baseSalary: (emp.baseSalary || 500000) * 26,
                            };
                            onUpdateEmployee(recomputeEmployeePayroll(updated));
                          }
                        }}
                        title="Đang tính theo Đơn giá ngày công. Bấm để chuyển sang Lương tháng."
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 cursor-pointer"
                      >
                        Theo ngày
                      </span>
                    ) : (
                      <span
                        onClick={() => {
                          if (onUpdateEmployee) {
                            const updated = {
                              ...emp,
                              salaryType: 'DAILY' as const,
                              baseSalary: Math.round((emp.baseSalary || 11500000) / 26),
                            };
                            onUpdateEmployee(recomputeEmployeePayroll(updated));
                          }
                        }}
                        title="Đang tính theo Lương tháng (chia 26). Bấm để chuyển sang Đơn giá ngày."
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-[#0f3d64] border border-sky-200 hover:bg-sky-100 cursor-pointer"
                      >
                        Theo tháng
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-semibold">
                  {emp.actualWorkDays}/{emp.standardWorkDays}
                </td>
                <td
                  className="p-1.5 border-r border-slate-200 text-right font-mono"
                  title={
                    emp.salaryType === 'DAILY'
                      ? `Lương ngày: = ${formatNumberOnly(emp.baseSalary)} đ/ngày × ${emp.actualWorkDays} công = ${formatNumberOnly(emp.salaryByActualDays)} đ`
                      : `Lương tháng: =ROUND(((${formatNumberOnly(emp.baseSalary)} / 26) * ${emp.actualWorkDays}), 0) = ${formatNumberOnly(emp.salaryByActualDays)} đ`
                  }
                >
                  <div className="font-bold text-slate-800">{formatNumberOnly(emp.salaryByActualDays)}</div>
                  <div className="text-[9px] text-slate-500 font-normal">
                    {emp.salaryType === 'DAILY' ? (
                      <span className="text-amber-700 font-semibold">(Đơn giá × {emp.actualWorkDays}c)</span>
                    ) : (
                      <span>(=Lương/26 × {emp.actualWorkDays}c)</span>
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold text-amber-900 bg-amber-50/20" title={`Số giờ OT: ${emp.overtimeHours || 0}h (x1.5)`}>
                  {emp.overtimePay > 0 ? formatNumberOnly(emp.overtimePay) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold text-[#0f3d64]">
                  {(emp.responsibilityAllowance || 0) > 0 ? formatNumberOnly(emp.responsibilityAllowance) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-700">
                  {(emp.projectAllowance || 0) > 0 ? formatNumberOnly(emp.projectAllowance) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {formatNumberOnly(emp.mealAllowance + emp.phoneTravelAllowance)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">{formatNumberOnly(emp.kpiBonus)}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-sky-950 bg-sky-50/70">
                  {formatNumberOnly(emp.totalIncome)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-bold text-slate-700">{emp.dependents}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono" title={`Lương đóng BH: ${formatVND(emp.insuranceSalary || 0)} (10.5% = ${formatVND(emp.totalInsurance)})`}>
                  <div className="font-bold text-rose-900">{formatNumberOnly(emp.totalInsurance)}</div>
                  <div className="text-[9px] text-slate-500 font-normal">
                    {(emp.insuranceSalary || 0) > 0 ? (
                      `(=${formatNumberOnly(emp.insuranceSalary)} × 10.5%)`
                    ) : (
                      '0'
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {emp.advancePayment > 0 ? formatNumberOnly(emp.advancePayment) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">{formatNumberOnly(emp.unionFee)}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-amber-950 bg-amber-50/70">
                  {formatNumberOnly(emp.totalDeductions)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[12px]">
                  {formatNumberOnly(emp.netSalary)}
                </td>
                <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{emp.bankAccount}</td>
                <td className="p-1.5 text-slate-700 font-medium">{emp.bankName}</td>
              </tr>
            )))}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-400">
            <tr>
              <td colSpan={5} className="p-2 text-center uppercase tracking-wide border-r border-slate-300">
                TỔNG CỘNG ({filtered.length} NHÂN VIÊN)
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.baseSalary, 0))}
              </td>
              <td className="p-2 text-center border-r border-slate-300">-</td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.salaryByActualDays, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-semibold text-amber-900 bg-amber-50/40">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.overtimePay || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-semibold text-[#0f3d64]">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.responsibilityAllowance || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-bold text-emerald-800">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.projectAllowance || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.mealAllowance + e.phoneTravelAllowance), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.kpiBonus, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-sky-900 bg-sky-100 font-black">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalIncome, 0))}
              </td>
              <td className="p-2 text-center border-r border-slate-300 font-bold text-slate-700">
                {filtered.reduce((s, e) => s + (e.dependents || 0), 0)}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-bold text-rose-900 bg-rose-50/40">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalInsurance, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.advancePayment, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.unionFee, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-amber-900 bg-amber-100 font-black">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalDeductions, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-emerald-900 bg-emerald-100 font-black text-[12px]">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.netSalary, 0))}
              </td>
              <td colSpan={2} className="p-2 text-center text-slate-500 font-normal">
                Chi trả chuyển khoản ngân hàng
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
