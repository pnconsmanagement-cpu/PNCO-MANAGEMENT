import React from 'react';
import { CompanyConfig, Employee } from '../types';
import { formatNumberOnly, numberToVietnameseWords } from '../utils/numberToVietnameseWords';

interface PayslipDocumentProps {
  employee: Employee;
  config: CompanyConfig;
  slipIndex?: number;
  scale?: number;
}

export const PayslipDocument: React.FC<PayslipDocumentProps> = ({
  employee,
  config,
  scale = 1,
}) => {
  const words = numberToVietnameseWords(employee.netSalary);
  const stdDays = employee.standardWorkDays || config.standardWorkDays || 26;
  const periodCodeClean = (config.periodCode || `${String(config.month || 10).padStart(2, '0')}/${config.year || 2026}`).replace('/', '');

  // Đánh số thứ tự động cho các dòng trong bảng thanh toán
  let rowStt = 1;

  const payDateParts = (config.paymentDate || '05/11/2026').split('/');
  const printDay = payDateParts[0] || '05';
  const printMonth = payDateParts[1] || String(config.month || 10).padStart(2, '0');
  const printYear = payDateParts[2] || String(config.year || 2026);

  return (
    <div
      id={`payslip-${employee.code}`}
      style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
      className="bg-white border border-slate-300 p-6 sm:p-8 shadow-sm max-w-[800px] w-full mx-auto text-black text-[12px] leading-[1.38] font-sans printable-payslip transition-transform"
    >
      {/* 1. Header công ty & Logo chuẩn như phiếu nhân viên thời vụ */}
      <div className="flex justify-between items-start border-b-2 border-[#0f3d64] pb-2 mb-3">
        <div>
          <div className="font-black text-[15px] uppercase text-[#0f3d64] tracking-wide">
            {config.name}
          </div>
          <div className="text-[11px] text-slate-700 mt-0.5">
            Địa chỉ: <strong className="text-slate-900">{config.address}</strong>
          </div>
          <div className="text-[11px] text-slate-700 mt-0.5">
            Mã số thuế: <strong className="text-slate-900">{config.taxCode}</strong> — Điện thoại: <strong className="text-slate-900">{config.phone}</strong>
          </div>
        </div>

        <div className="flex flex-col items-end justify-center text-right shrink-0">
          <img
            src="/assets/aistudio/image_1ca8dbc7.png"
            alt="PNCO Construction Logo"
            className="h-11 w-auto object-contain"
          />
        </div>
      </div>

      {/* 2. Tiêu đề phiếu chuẩn như mẫu thời vụ */}
      <div className="text-center my-2.5">
        <h1 className="text-[19px] sm:text-[20px] font-black tracking-wide text-[#0f3d64] uppercase m-0">
          PHIẾU THANH TOÁN TIỀN LƯƠNG
        </h1>
        <p className="text-[11.5px] text-slate-600 italic mt-0.5 font-medium">
          Kỳ thanh toán: <strong className="text-[#0f3d64] font-extrabold">{config.period}</strong>
          {config.paymentDate && (
            <span>
              {' '}— Ngày chi trả: <strong className="text-[#0f3d64]">{config.paymentDate}</strong>
            </span>
          )}
        </p>
      </div>

      {/* 3. Khung thông tin nhân sự & Số phiếu bên phải (Không kèm bảng chấm công chi tiết) */}
      <div className="bg-[#f8fafc] border border-slate-300 rounded p-2.5 sm:p-3 mb-3 text-[11.5px] flex flex-col sm:flex-row justify-between items-start gap-3">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 w-full text-slate-800">
          <div>
            Họ và tên:{' '}
            <strong className="uppercase text-[12.5px] text-slate-950 font-extrabold">
              {employee.fullName}
            </strong>
          </div>
          <div>
            Mã nhân viên:{' '}
            <strong className="font-mono text-[12px] text-[#0f3d64] font-extrabold">
              {employee.code}
            </strong>
          </div>

          <div>
            Chức danh: <strong className="text-slate-900">{employee.title}</strong>
          </div>
          <div>
            Bộ phận: <strong className="text-slate-900">{employee.department}</strong>
          </div>

          <div>
            Hợp đồng LĐ: <span className="font-medium text-slate-800">{employee.contractType || 'HĐLĐ Chính thức'}</span>
          </div>
          <div>
            Điện thoại: <span className="font-mono text-slate-800">{employee.phone || '—'}</span>
          </div>

          <div>
            Hình thức lương:{' '}
            <span>
              {employee.salaryType === 'DAILY'
                ? `Theo ngày công (${formatNumberOnly(employee.baseSalary)} đ/ngày)`
                : `Theo tháng (${formatNumberOnly(employee.baseSalary)} đ/tháng)`}
            </span>
          </div>
          <div>
            Ngày công:{' '}
            <strong className="text-[#0f3d64]">
              {employee.actualWorkDays} / {stdDays} ngày
            </strong>{' '}
            {employee.overtimeHours > 0 ? `(+${employee.overtimeHours}h OT)` : ''}
          </div>

          <div>
            Phụ trách / Quản lý: <span>Ban Giám Đốc / Chỉ huy</span>
          </div>
          <div>
            Chi trả qua:{' '}
            <strong className="text-[#0f3d64]">
              {employee.bankAccount
                ? `${employee.bankName || 'Ngân hàng'} - ${employee.bankAccount}`
                : employee.bankName || 'Chuyển khoản / Tiền mặt'}
            </strong>
          </div>
        </div>

        <div className="text-right shrink-0 sm:border-l sm:border-dashed sm:border-slate-300 sm:pl-3 min-w-[175px]">
          <div className="inline-block px-2.5 py-0.5 bg-white border-[1.5px] border-[#0f3d64] rounded font-extrabold text-[11.5px] text-[#0f3d64]">
            Mẫu: 02-LĐTL
          </div>
          <div className="text-[10px] text-slate-700 mt-1 font-semibold">
            (Ban hành theo TT 200 & TT 133/BTC)
          </div>
          <div className="mt-1 font-mono font-extrabold text-[11.5px] text-black">
            Số phiếu: PLNV-{periodCodeClean}-{employee.code}
          </div>
        </div>
      </div>

      {/* 4. BẢNG CHI TIẾT THANH TOÁN TIỀN LƯƠNG 4 CỘT (GIỐNG HỆT NHÂN VIÊN THỜI VỤ) */}
      <div className="border border-slate-300 mb-2.5">
        <table className="w-full text-left border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-[#0f3d64] text-white">
              <th className="py-1.5 px-2 border border-slate-300 font-bold uppercase tracking-wide text-[10.5px] w-10 text-center">
                STT
              </th>
              <th className="py-1.5 px-2.5 border border-slate-300 font-bold uppercase tracking-wide text-[10.5px]">
                NỘI DUNG THANH TOÁN / GIẢM TRỪ
              </th>
              <th className="py-1.5 px-2 border border-slate-300 text-center font-bold uppercase tracking-wide text-[10.5px] w-36">
                ĐƠN VỊ / SỐ LƯỢNG
              </th>
              <th className="py-1.5 px-2.5 border border-slate-300 text-right font-bold uppercase tracking-wide text-[10.5px] w-44">
                SỐ LIỆU / THÀNH TIỀN (VNĐ)
              </th>
            </tr>
          </thead>
          <tbody>
            {/* PHẦN A: SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO */}
            <tr className="bg-[#e0f2fe] text-[#082f49] font-bold text-[10.5px] border-b border-[#bae6fd]">
              <td className="py-1 px-2 border border-slate-200 text-center">A</td>
              <td className="py-1 px-2.5 border border-slate-200 uppercase" colSpan={2}>
                SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right">
                THỐNG KÊ
              </td>
            </tr>
            <tr>
              <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                {rowStt++}
              </td>
              <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                Số ngày công đi làm thực tế (Công chuẩn: {stdDays} ngày)
              </td>
              <td className="py-1 px-2 border border-slate-200 text-center font-mono font-bold text-[#0f3d64]">
                {employee.actualWorkDays} ngày
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#0f3d64]">
                {employee.actualWorkDays} công
              </td>
            </tr>
            <tr>
              <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                {rowStt++}
              </td>
              <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                Số giờ làm thêm / tăng ca công trình (OT hệ số 150%)
              </td>
              <td className="py-1 px-2 border border-slate-200 text-center font-mono font-bold text-[#c2410c]">
                {employee.overtimeHours || 0} giờ
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#c2410c]">
                {(employee.overtimeHours || 0) > 0 ? `${employee.overtimeHours} giờ OT` : '0 giờ OT'}
              </td>
            </tr>
            {((employee.paidLeaveDays || 0) > 0 || (employee.unpaidLeaveDays || 0) > 0) && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Số ngày nghỉ trong kỳ (Nghỉ phép: {employee.paidLeaveDays || 0} • Không lương: {employee.unpaidLeaveDays || 0})
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center font-mono text-slate-700">
                  {(employee.paidLeaveDays || 0) + (employee.unpaidLeaveDays || 0)} ngày
                </td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono text-slate-700">
                  {(employee.paidLeaveDays || 0) + (employee.unpaidLeaveDays || 0)} ngày
                </td>
              </tr>
            )}

            {/* PHẦN B: CÁC KHOẢN TIỀN CÔNG VÀ THU NHẬP */}
            <tr className="bg-[#f0fdf4] text-[#14532d] font-bold text-[10.5px] border-b border-[#bbf7d0]">
              <td className="py-1 px-2 border border-slate-200 text-center">B</td>
              <td className="py-1 px-2.5 border border-slate-200 uppercase" colSpan={2}>
                CÁC KHOẢN TIỀN CÔNG VÀ THU NHẬP
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold">
                {formatNumberOnly(employee.totalIncome)}
              </td>
            </tr>
            <tr>
              <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                {rowStt++}
              </td>
              <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                {employee.salaryType === 'DAILY'
                  ? `Lương theo đơn giá ngày công (${employee.actualWorkDays} ngày × ${formatNumberOnly(employee.baseSalary)} đ/ngày)`
                  : `Lương theo ngày công thực tế (${formatNumberOnly(employee.baseSalary)} đ / ${stdDays} ngày × ${employee.actualWorkDays} công)`}
              </td>
              <td className="py-1 px-2 border border-slate-200 text-center font-mono">
                {employee.actualWorkDays} công
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                {formatNumberOnly(employee.salaryByActualDays)}
              </td>
            </tr>
            <tr>
              <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                {rowStt++}
              </td>
              <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                Tiền làm thêm giờ / tăng ca ({employee.overtimeHours || 0} giờ × hệ số 150%)
              </td>
              <td className="py-1 px-2 border border-slate-200 text-center font-mono">
                {employee.overtimeHours || 0} giờ
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#c2410c]">
                {formatNumberOnly(employee.overtimePay || 0)}
              </td>
            </tr>
            {(employee.responsibilityAllowance || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Phụ cấp trách nhiệm công việc
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">Theo tháng</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                  {formatNumberOnly(employee.responsibilityAllowance)}
                </td>
              </tr>
            )}
            {(employee.projectAllowance || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Phụ cấp dự án / công trường
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">Theo tháng</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                  {formatNumberOnly(employee.projectAllowance || 0)}
                </td>
              </tr>
            )}
            {(employee.mealAllowance || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Phụ cấp tiền ăn ca / ăn trưa
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">—</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                  {formatNumberOnly(employee.mealAllowance)}
                </td>
              </tr>
            )}
            {(employee.phoneTravelAllowance || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Phụ cấp xăng xe, điện thoại
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">—</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                  {formatNumberOnly(employee.phoneTravelAllowance)}
                </td>
              </tr>
            )}
            {(employee.kpiBonus || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Thưởng chuyên cần / KPI / Vượt tiến độ
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">—</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-black">
                  {formatNumberOnly(employee.kpiBonus)}
                </td>
              </tr>
            )}
            <tr className="bg-[#f8fafc] border-t border-slate-300">
              <td colSpan={2} className="py-1.5 px-2.5 border border-slate-200 text-right uppercase font-extrabold text-black">
                TỔNG THU NHẬP (B):
              </td>
              <td colSpan={2} className="py-1.5 px-2.5 border border-slate-200 text-right font-mono font-black text-[#0f3d64] text-[14px]">
                {formatNumberOnly(employee.totalIncome)} đ
              </td>
            </tr>

            {/* PHẦN C: CÁC KHOẢN GIẢM TRỪ VÀ KHẤU TRỪ */}
            <tr className="bg-[#fef3c7] text-[#78350f] font-bold text-[10.5px] border-b border-[#fde68a]">
              <td className="py-1 px-2 border border-slate-200 text-center">C</td>
              <td className="py-1 px-2.5 border border-slate-200 uppercase" colSpan={2}>
                CÁC KHOẢN GIẢM TRỪ VÀ KHẤU TRỪ
              </td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#991b1b]">
                {formatNumberOnly(employee.totalDeductions)}
              </td>
            </tr>
            {(employee.totalInsurance || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Khấu trừ BHXH (8%), BHYT (1.5%), BHTN (1%)
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center font-mono text-slate-600">
                  10.5%
                </td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#991b1b]">
                  {formatNumberOnly(employee.totalInsurance)}
                </td>
              </tr>
            )}
            {(employee.personalIncomeTax || 0) > 0 && (
              <tr>
                <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                  {rowStt++}
                </td>
                <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                  Thuế thu nhập cá nhân (TNCN)
                </td>
                <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">—</td>
                <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#991b1b]">
                  {formatNumberOnly(employee.personalIncomeTax)}
                </td>
              </tr>
            )}
            <tr>
              <td className="py-1 px-2 border border-slate-200 text-center font-bold">
                {rowStt++}
              </td>
              <td className="py-1 px-2.5 pl-4 border border-slate-200 text-slate-900">
                Tạm ứng tiền lương trong kỳ
              </td>
              <td className="py-1 px-2 border border-slate-200 text-center text-slate-500">—</td>
              <td className="py-1 px-2.5 border border-slate-200 text-right font-mono font-bold text-[#991b1b]">
                {formatNumberOnly(employee.advancePayment || 0)}
              </td>
            </tr>
            <tr className="bg-[#f8fafc] border-t border-slate-300">
              <td colSpan={2} className="py-1.5 px-2.5 border border-slate-200 text-right uppercase font-extrabold text-[#991b1b]">
                TỔNG KHẤU TRỪ (C):
              </td>
              <td colSpan={2} className="py-1.5 px-2.5 border border-slate-200 text-right font-mono font-black text-[#991b1b] text-[14px]">
                {formatNumberOnly(employee.totalDeductions)} đ
              </td>
            </tr>

            {/* HÀNG THỰC LĨNH CHI TRẢ ĐẶC TRƯNG CHUẨN PHIẾU LƯƠNG */}
            <tr className="bg-[#14532d] text-white font-black border-t-2 border-[#0f3d64]">
              <td className="py-2 px-2 text-center text-[13px]">★</td>
              <td className="py-2 px-2.5 uppercase tracking-wide text-[14px]" colSpan={2}>
                THỰC LĨNH CHI TRẢ (B - C)
              </td>
              <td className="py-2 px-2.5 text-right font-mono text-[18px] text-[#f0fdf4] font-black">
                {formatNumberOnly(employee.netSalary)} đ
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 5. Số tiền bằng chữ */}
      <div className="border border-slate-300 bg-[#f8fafc] rounded px-3 py-1.5 mb-2.5 text-[11.5px]">
        <span className="font-extrabold text-black">Số tiền bằng chữ: </span>
        <span className="italic font-bold text-[#0f3d64]">{words}</span>
      </div>

      {/* 6. Chữ ký 4 cột đồng bộ với phiếu lương nhân viên thời vụ */}
      <div className="pt-1">
        <div className="text-right text-[11.5px] italic font-semibold text-slate-800 mb-1.5">
          Tp. Hồ Chí Minh, ngày {printDay} tháng {printMonth} năm {printYear}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[11.5px]">
          <div>
            <div className="font-bold uppercase text-slate-900">NGƯỜI LẬP PHIẾU</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, họ tên)</div>
            <div className="h-12 flex items-end justify-center font-bold text-slate-900">
              Nguyễn Thanh Thúy
            </div>
          </div>

          <div>
            <div className="font-bold uppercase text-slate-900">TỔ TRƯỞNG / CHỈ HUY</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, họ tên)</div>
            <div className="h-12 flex items-end justify-center font-bold text-slate-900">
              Trần Anh Minh
            </div>
          </div>

          <div>
            <div className="font-bold uppercase text-slate-900">KẾ TOÁN TRƯỞNG / ĐD</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, đóng dấu)</div>
            <div className="h-12 flex items-end justify-center font-bold text-slate-900">
              Nguyễn Thanh Thúy
            </div>
          </div>

          <div>
            <div className="font-bold uppercase text-slate-900">NGƯỜI NHẬN TIỀN</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
            <div className="h-12 flex items-end justify-center font-bold text-slate-900 uppercase">
              {employee.fullName}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-1.5 border-t border-slate-300 flex items-center justify-between text-[10.5px] font-semibold text-slate-700">
          <span>Công Ty TNHH Xây Dựng- Cơ Điện Phúc Nguyên &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- https://pncons.com.vn</span>
          <span>1/1</span>
        </div>
      </div>
    </div>
  );
};

