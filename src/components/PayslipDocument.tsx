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

  return (
    <div
      id={`payslip-${employee.code}`}
      style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
      className="bg-white border border-slate-300 p-7 sm:p-9 shadow-sm max-w-[800px] mx-auto text-slate-800 text-[12.5px] font-sans printable-payslip transition-transform"
    >
      {/* Top Header */}
      <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-3">
        <div>
          <div className="font-bold text-[14px] uppercase text-[#0f3d64] tracking-wide">
            {config.name}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 italic">
            {config.address}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5">
            MST: {config.taxCode} | ĐT: {config.phone}
          </div>
        </div>

        <div className="text-right text-[11px] text-slate-600">
          <div className="font-semibold">{config.formNumber}</div>
          <div className="mt-1">
            Số phiếu: <span className="font-bold text-slate-800">PL{config.periodCode.replace('/', '')}-{employee.code}</span>
          </div>
        </div>
      </div>

      {/* Payslip Title */}
      <div className="text-center my-3">
        <h2 className="text-2xl font-black tracking-wider text-[#0f3d64] uppercase">
          PHIẾU LƯƠNG
        </h2>
        <p className="text-xs text-slate-600 italic mt-1 font-medium">
          {config.period} — Ngày chi trả: {config.paymentDate}
        </p>
      </div>

      {/* Employee Info Grid */}
      <div className="bg-slate-50 border border-slate-200 rounded p-3 sm:p-3.5 mb-3.5 text-[12px] grid grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Họ và tên:</span>
          <span className="font-bold text-slate-900">{employee.fullName}</span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Mã nhân viên:</span>
          <span className="font-bold text-[#0f3d64]">{employee.code}</span>
        </div>

        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Chức danh:</span>
          <span className="font-medium text-slate-800">{employee.title}</span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Bộ phận:</span>
          <span className="font-medium text-slate-800">{employee.department}</span>
        </div>

        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Hình thức lương:</span>
          <span className="font-semibold text-slate-800">
            {employee.salaryType === 'DAILY'
              ? `Theo ngày công (${formatNumberOnly(employee.baseSalary)} đ/ngày)`
              : `Lương tháng (${formatNumberOnly(employee.baseSalary)} đ/tháng)`}
          </span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Ngày vào làm:</span>
          <span className="text-slate-800">{employee.joinDate}</span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Ngày công (thực/chuẩn):</span>
          <span className="font-bold text-slate-800">
            {employee.actualWorkDays} / {employee.standardWorkDays} ngày
          </span>
        </div>

        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">HĐ Lao động:</span>
          <span className="font-medium text-slate-800 truncate">
            {employee.contractType || 'HĐLĐ Không xác định thời hạn'}
          </span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Thời hạn HĐ:</span>
          <span className="font-medium text-slate-800 truncate">
            {employee.contractDuration || 'Vô thời hạn'}
            {employee.contractEndDate && ` (hết ${employee.contractEndDate})`}
          </span>
        </div>

        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Số tài khoản:</span>
          <span className="font-semibold text-slate-800">
            {employee.bankAccount} — {employee.bankName}
          </span>
        </div>
        <div className="flex">
          <span className="w-28 text-slate-600 shrink-0">Số người phụ thuộc:</span>
          <span className="font-medium text-slate-800">{employee.dependents} người</span>
        </div>

        {(employee.email || employee.phone) && (
          <>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Email:</span>
              <span className="text-slate-800 truncate">{employee.email || '—'}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Điện thoại:</span>
              <span className="text-slate-800">{employee.phone || '—'}</span>
            </div>
          </>
        )}
      </div>

      {/* Details Table */}
      <div className="border border-slate-300 rounded overflow-hidden mb-3">
        <table className="w-full text-left border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#0f3d64] text-white">
              <th className="py-2 px-3 font-semibold uppercase tracking-wider text-[11px]">
                NỘI DUNG
              </th>
              <th className="py-2 px-3 text-right font-semibold uppercase tracking-wider text-[11px] w-52">
                SỐ LIỆU / THÀNH TIỀN (VNĐ)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {/* Group A: SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO */}
            <tr className="bg-sky-100/90 font-bold text-sky-950 border-b border-sky-200">
              <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]">
                A. SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO (TỪ BẢNG CÔNG)
              </td>
              <td className="py-1.5 px-3 text-right text-[10.5px] font-semibold text-sky-900">
                THỐNG KÊ
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">
                Số ngày công đi làm thực tế
              </td>
              <td className="py-1 px-3 text-right font-mono font-bold text-[#0f3d64]">
                {employee.actualWorkDays} / {employee.standardWorkDays} ngày
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-1 pr-1">
                  <span className="font-medium text-slate-800">Số giờ làm thêm / tăng ca (OT)</span>
                  <span className="text-[10px] text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 font-medium">
                    📌 Chủ nhật tính 8h tăng ca
                  </span>
                </div>
              </td>
              <td className="py-1 px-3 text-right font-mono font-bold text-emerald-700">
                {employee.overtimeHours} giờ
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">
                Số ngày nghỉ trong kỳ (phép: {employee.paidLeaveDays || 0} / không lương: {employee.unpaidLeaveDays || 0})
              </td>
              <td className="py-1 px-3 text-right font-mono text-slate-700">
                {(employee.unpaidLeaveDays || 0) + (employee.paidLeaveDays || 0)} ngày
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700 font-medium">
                Số tiền tạm ứng trong tháng
              </td>
              <td className="py-1 px-3 text-right font-mono font-semibold text-slate-800">
                {formatNumberOnly(employee.advancePayment || 0)} đ
              </td>
            </tr>

            {/* Group B */}
            <tr className="bg-sky-50 font-bold text-sky-950">
              <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]">
                B. CÁC KHOẢN THU NHẬP
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-sky-950">
                {formatNumberOnly(employee.totalIncome)}
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">
                {employee.salaryType === 'DAILY' ? (
                  <span>
                    Lương theo đơn giá ngày công ({employee.actualWorkDays} ngày × {formatNumberOnly(employee.baseSalary)} đ/ngày)
                  </span>
                ) : (
                  <span>
                    Lương theo ngày công thực tế ({formatNumberOnly(employee.baseSalary)} đ / 26 × {employee.actualWorkDays} ngày)
                  </span>
                )}
              </td>
              <td className="py-1 px-3 text-right font-mono font-bold text-slate-800">{formatNumberOnly(employee.salaryByActualDays)}</td>
            </tr>
            {employee.responsibilityAllowance > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">Phụ cấp trách nhiệm</td>
                <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.responsibilityAllowance)}</td>
              </tr>
            )}
            {(employee.projectAllowance || 0) > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700 font-semibold text-emerald-900">Phụ cấp dự án</td>
                <td className="py-1 px-3 text-right font-mono font-semibold text-emerald-800">{formatNumberOnly(employee.projectAllowance || 0)}</td>
              </tr>
            )}
            {employee.mealAllowance > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">Phụ cấp ăn ca</td>
                <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.mealAllowance)}</td>
              </tr>
            )}
            {employee.phoneTravelAllowance > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">Phụ cấp xăng xe, điện thoại</td>
                <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.phoneTravelAllowance)}</td>
              </tr>
            )}
            {employee.kpiBonus > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">Thưởng KPI / Hoa hồng</td>
                <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.kpiBonus)}</td>
              </tr>
            )}
            {employee.overtimePay > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-1 pr-2">
                    <span>Tiền làm thêm giờ ({employee.overtimeHours} giờ x 150%)</span>
                    <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 italic font-medium">
                      Chủ nhật tính 8h tăng ca
                    </span>
                  </div>
                </td>
                <td className="py-1 px-3 text-right font-mono align-top">{formatNumberOnly(employee.overtimePay)}</td>
              </tr>
            )}
            <tr className="font-semibold bg-slate-50">
              <td className="py-1 px-3 pl-6 text-slate-900">Tổng thu nhập (B)</td>
              <td className="py-1 px-3 text-right font-bold font-mono text-sky-900">{formatNumberOnly(employee.totalIncome)}</td>
            </tr>

            {/* Group C */}
            <tr className="bg-amber-50 font-bold text-amber-950">
              <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]">
                C. CÁC KHOẢN KHẤU TRỪ
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-950">
                {formatNumberOnly(employee.totalDeductions)}
              </td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">Bảo hiểm xã hội (8%)</td>
              <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.socialInsurance)}</td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">Bảo hiểm y tế (1,5%)</td>
              <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.healthInsurance)}</td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">Bảo hiểm thất nghiệp (1%)</td>
              <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.unemploymentInsurance)}</td>
            </tr>
            <tr>
              <td className="py-1 px-3 pl-6 text-slate-700">Đoàn phí công đoàn</td>
              <td className="py-1 px-3 text-right font-mono">{formatNumberOnly(employee.unionFee)}</td>
            </tr>
            {employee.advancePayment > 0 && (
              <tr>
                <td className="py-1 px-3 pl-6 text-slate-700">Khấu trừ tạm ứng trong tháng</td>
                <td className="py-1 px-3 text-right font-mono text-amber-900 font-semibold">{formatNumberOnly(employee.advancePayment)}</td>
              </tr>
            )}
            <tr className="font-semibold bg-slate-50">
              <td className="py-1 px-3 pl-6 text-slate-900">Tổng khấu trừ (C)</td>
              <td className="py-1 px-3 text-right font-bold font-mono text-amber-900">{formatNumberOnly(employee.totalDeductions)}</td>
            </tr>

            {/* THỰC LĨNH (B - C) */}
            <tr className="bg-[#14532d] text-white font-bold text-[13.5px]">
              <td className="py-2.5 px-3 pl-4 uppercase tracking-wide">
                THỰC LĨNH (B - C)
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-lg text-emerald-100 font-black">
                {formatNumberOnly(employee.netSalary)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Number in Vietnamese Words */}
      <div className="mb-2.5 text-[12px]">
        <span className="font-bold text-slate-800">Số tiền bằng chữ: </span>
        <span className="italic text-slate-700">{words}</span>
      </div>

      {/* Notes / Insurance details */}
      <div className="text-[11px] text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded p-2.5 leading-normal">
        <span>Ghi chú: </span>
        <span>
          Lương đóng bảo hiểm (10.5%): {formatNumberOnly(employee.insuranceSalary)} đ • Ngày công chuẩn: {employee.standardWorkDays} • Ngày công thực tế: {employee.actualWorkDays}
        </span>
      </div>

      {/* Signatures */}
      <div className="pt-1">
        <div className="text-right text-[11px] italic text-slate-600 mb-2">
          Tp. Hồ Chí Minh, ngày {config.paymentDate.split('/')[0]} tháng {config.paymentDate.split('/')[1]} năm {config.paymentDate.split('/')[2] || '2026'}
        </div>
        <div className="grid grid-cols-3 text-center text-[12px]">
          <div>
            <div className="font-bold uppercase text-slate-800">Người lập phiếu</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
            <div className="h-14 flex items-end justify-center font-medium text-slate-700">
              Đặng Bích Ngọc
            </div>
          </div>

          <div>
            <div className="font-bold uppercase text-slate-800">Kế toán trưởng</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
            <div className="h-14 flex items-end justify-center font-medium text-slate-700">
              Nguyễn Thanh Thúy
            </div>
          </div>

          <div>
            <div className="font-bold uppercase text-slate-800">Người nhận tiền</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
            <div className="h-14 flex items-end justify-center font-bold text-slate-900">
              {employee.fullName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
