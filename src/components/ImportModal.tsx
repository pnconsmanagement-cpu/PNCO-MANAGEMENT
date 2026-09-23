import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, FileSpreadsheet, Check, RefreshCw } from 'lucide-react';
import { Employee } from '../types';
import { initialEmployees } from '../data/mockPayrollData';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (newEmployees: Employee[]) => void;
  onResetDefault: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  onResetDefault,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg('Đang đọc dữ liệu bảng tính...');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          alert('File không có dữ liệu!');
          setLoading(false);
          return;
        }

        // Map columns
        const imported: Employee[] = rawData.map((row, index) => {
          const baseSalary = Number(row['Lương cơ bản'] || row['baseSalary'] || 12000000);
          const actualDays = Number(row['Công thực tế'] || row['actualWorkDays'] || 26);
          const totalInc = Number(row['TỔNG THU NHẬP'] || row['totalIncome'] || baseSalary);
          const totalDed = Number(row['TỔNG KHẤU TRỪ'] || row['totalDeductions'] || 1500000);
          const net = Number(row['THỰC LĨNH'] || row['netSalary'] || totalInc - totalDed);

          const rawEmp: Employee = {
            id: String(index + 1),
            code: String(row['Mã NV'] || row['code'] || `PNC${String(index + 1).padStart(4, '0')}`),
            fullName: String(row['Họ và tên'] || row['fullName'] || `Nhân viên ${index + 1}`),
            title: String(row['Chức danh'] || row['title'] || 'Nhân viên'),
            department: String(row['Bộ phận'] || row['department'] || 'Phòng Kinh doanh'),
            joinDate: String(row['Ngày vào làm'] || row['joinDate'] || '01/01/2022'),
            email: String(row['Email'] || row['email'] || ''),
            phone: String(row['Số điện thoại'] || row['SĐT'] || row['Điện thoại'] || row['phone'] || ''),
            bankAccount: String(row['Số tài khoản'] || row['bankAccount'] || '9876543210'),
            bankName: String(row['Ngân hàng'] || row['bankName'] || 'BIDV'),
            dependents: Number(row['Số người phụ thuộc'] || row['dependents'] || 0),
            standardWorkDays: 26,
            actualWorkDays: actualDays,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            overtimeHours: Number(row['Tiền làm thêm (OT)'] ? 5 : (row['overtimeHours'] || 0)),
            baseSalary,
            salaryByActualDays: 0,
            responsibilityAllowance: Number(row['PC Trách nhiệm'] || row['Phụ cấp trách nhiệm'] || row['responsibilityAllowance'] || 0),
            projectAllowance: Number(row['PC Dự án'] || row['Phụ cấp dự án'] || row['projectAllowance'] || 0),
            mealAllowance: Number(row['PC Ăn ca'] || 780000),
            phoneTravelAllowance: Number(row['PC Xăng xe, ĐT'] || 500000),
            kpiBonus: Number(row['Thưởng KPI'] || 0),
            overtimePay: 0,
            otherIncome: 0,
            totalIncome: 0,
            insuranceSalary: Number(row['Lương đóng BH'] || Math.round(baseSalary * 0.85)),
            socialInsurance: 0,
            healthInsurance: 0,
            unemploymentInsurance: 0,
            totalInsurance: 0,
            unionFee: 0,
            taxExemptIncome: 0,
            taxableIncome: 0,
            personalIncomeTax: 0,
            advancePayment: Number(row['Tạm ứng'] || 0),
            totalDeductions: 0,
            netSalary: 0,
          };

          return recomputeEmployeePayroll(rawEmp);
        });

        onImportSuccess(imported);
        setLoading(false);
        onClose();
        alert(`Nhập thành công ${imported.length} nhân viên vào hệ thống!`);
      } catch (err) {
        console.error(err);
        alert('Có lỗi khi đọc file Excel. Vui lòng kiểm tra lại cấu trúc file.');
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="font-bold text-sm uppercase text-[#0f3d64] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-sky-700" />
            <span>Nạp bảng lương tháng mới (Excel / CSV)</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-sky-300 hover:border-sky-500 rounded-lg p-6 text-center cursor-pointer bg-sky-50/50 hover:bg-sky-50 transition"
        >
          <Upload className="w-8 h-8 text-sky-600 mx-auto mb-2" />
          <div className="text-xs font-bold text-slate-800">
            Nhấn để chọn file Excel (.xlsx) hoặc CSV
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Hỗ trợ file xuất từ Excel, phần mềm chấm công máy vân tay
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {loading && (
          <div className="text-xs text-sky-700 text-center font-medium">
            {statusMsg}
          </div>
        )}

        <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-xs">
          <button
            onClick={() => {
              if (confirm('Khôi phục lại dữ liệu mẫu 45 nhân viên chuẩn theo video?')) {
                onResetDefault();
                onClose();
              }
            }}
            className="text-slate-600 hover:text-[#0f3d64] flex items-center gap-1 cursor-pointer font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tải lại 45 nhân viên mẫu</span>
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
