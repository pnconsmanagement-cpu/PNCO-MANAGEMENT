import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, X, Building2, CheckCircle2 } from 'lucide-react';
import { CompanyConfig, Employee } from '../types';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';

interface BankExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  config: CompanyConfig;
}

export const BankExportModal: React.FC<BankExportModalProps> = ({
  isOpen,
  onClose,
  employees,
  config,
}) => {
  const [bankFormat, setBankFormat] = useState<'STANDARD' | 'BIDV' | 'VCB' | 'TCB'>('STANDARD');

  if (!isOpen) return null;

  const payableEmployees = employees.filter(
    (e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED' && e.netSalary > 0
  );
  const totalNet = payableEmployees.reduce((s, e) => s + e.netSalary, 0);

  const handleDownloadCSV = () => {
    let headers = ['STT', 'Mã NV', 'Họ và tên', 'Số tài khoản', 'Ngân hàng', 'Số tiền (VNĐ)', 'Nội dung chuyển khoản'];
    let rows = payableEmployees.map((e, idx) => [
      idx + 1,
      e.code,
      e.fullName,
      `'${e.bankAccount}`,
      e.bankName,
      e.netSalary,
      `Chi tra luong ${config.periodCode} - ${e.fullName}`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((val) => `"${val}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bang_Chuyen_Khoan_Luong_${config.periodCode.replace('/', '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleDownloadExcel = () => {
    const data = payableEmployees.map((e, idx) => ({
      'STT': idx + 1,
      'Mã Nhân Viên': e.code,
      'Họ Và Tên': e.fullName,
      'Số Tài Khoản': e.bankAccount,
      'Tên Ngân Hàng': e.bankName,
      'Số Tiền Chuyển': e.netSalary,
      'Nội Dung': `Chi tra luong ${config.periodCode} - ${e.fullName}`,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ChuyenKhoan');
    XLSX.writeFile(wb, `Bang_Chi_Luong_Ngan_Hang_${config.periodCode.replace('/', '_')}.xlsx`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="font-bold text-sm uppercase text-[#0f3d64] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <span>Xuất file chi lương chuyển khoản ngân hàng</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-600">Kỳ lương:</span>
            <span className="font-semibold text-slate-800">{config.period}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tổng số người thụ hưởng:</span>
            <span className="font-semibold text-slate-800">{employees.length} người</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tổng số tiền chi trả:</span>
            <span className="font-bold text-emerald-700 font-mono text-sm">{formatNumberOnly(totalNet)} đ</span>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <label className="font-semibold text-slate-700">Định dạng file ngân hàng:</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'STANDARD', name: 'Chuẩn CSV / Excel', desc: 'Mọi ngân hàng VN' },
              { id: 'BIDV', name: 'Mẫu BIDV iBank', desc: 'Đúng chuẩn BIDV' },
              { id: 'VCB', name: 'Mẫu VCB DigiBiz', desc: 'Vietcombank' },
              { id: 'TCB', name: 'Mẫu Techcombank', desc: 'Business Banking' },
            ].map((fmt) => (
              <div
                key={fmt.id}
                onClick={() => setBankFormat(fmt.id as any)}
                className={`p-2 border rounded cursor-pointer transition ${
                  bankFormat === fmt.id
                    ? 'border-[#0f3d64] bg-sky-50/60 font-semibold'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-slate-900">{fmt.name}</div>
                <div className="text-[10px] text-slate-500">{fmt.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 text-xs">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Đóng
          </button>
          <button
            onClick={handleDownloadCSV}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file CSV</span>
          </button>
          <button
            onClick={handleDownloadExcel}
            className="px-3.5 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải file Excel (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
