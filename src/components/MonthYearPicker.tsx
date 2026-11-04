import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { getRealCurrentDateInfo } from '../utils/payrollCalculator';

interface MonthYearPickerProps {
  month: number; // 1 - 12
  year: number; // e.g. 2026
  onChange: (newMonth: number, newYear: number) => void;
  label?: string;
  compact?: boolean;
}

export const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  month,
  year,
  onChange,
  label = 'Kỳ lương:',
  compact = false,
}) => {
  const { realMonth, realYear, monthStr: realMonthStr, realDateFormatted } = getRealCurrentDateInfo();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

  const handlePrevMonth = () => {
    if (month === 1) {
      onChange(12, year - 1);
    } else {
      onChange(month - 1, year);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onChange(1, year + 1);
    } else {
      onChange(month + 1, year);
    }
  };

  const isCurrentRealMonth = month === realMonth && year === realYear;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
        {label && (
          <span className="font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 text-sky-700" />
            <span>{label}</span>
          </span>
        )}

        {/* Prev button */}
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
          title="Tháng trước"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Month dropdown */}
        <select
          value={month}
          onChange={(e) => onChange(Number(e.target.value), year)}
          className="h-6 px-1.5 border border-slate-200 rounded font-bold text-[#0f3d64] bg-white cursor-pointer text-xs"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              Tháng {m < 10 ? `0${m}` : m}
            </option>
          ))}
        </select>

        {/* Year dropdown */}
        <select
          value={year}
          onChange={(e) => onChange(month, Number(e.target.value))}
          className="h-6 px-1.5 border border-slate-200 rounded font-bold text-[#0f3d64] bg-white cursor-pointer text-xs"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              Năm {y}
            </option>
          ))}
        </select>

        {/* Next button */}
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
          title="Tháng sau"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Nút chọn nhanh: Tháng 9, Tháng 10, Tháng hiện tại */}
      {!compact && (
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => onChange(9, realYear)}
            className={`px-2 py-0.5 rounded font-bold text-[11px] transition cursor-pointer ${
              month === 9 && year === realYear
                ? 'bg-[#0f3d64] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
            title={`Xem Bản Công & Bản Lương Tháng 09/${realYear}`}
          >
            Tháng 9
          </button>

          <button
            type="button"
            onClick={() => onChange(10, realYear)}
            className={`px-2 py-0.5 rounded font-bold text-[11px] transition cursor-pointer ${
              month === 10 && year === realYear
                ? 'bg-[#0f3d64] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
            title={`Xem Bản Công & Bản Lương Tháng 10/${realYear}`}
          >
            Tháng 10
          </button>

          <button
            type="button"
            onClick={() => onChange(realMonth, realYear)}
            className={`px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 transition cursor-pointer ${
              isCurrentRealMonth
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
            title={`Về tháng và ngày hiện tại (${realDateFormatted})`}
          >
            <Clock className="w-3 h-3" />
            <span>Tháng hiện tại ({realMonthStr}/{realYear})</span>
          </button>
        </div>
      )}
    </div>
  );
};
