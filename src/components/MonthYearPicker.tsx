import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

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

  // Month input format YYYY-MM
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const valueYYYYMM = `${year}-${monthStr}`;

  const handleMonthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "2026-06"
    if (!val) return;
    const [y, m] = val.split('-').map(Number);
    if (y && m) {
      onChange(m, y);
    }
  };

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-xs'} bg-white border border-slate-300 rounded px-2 py-1 shadow-2xs`}>
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

      {/* Native Month-Year text box */}
      <input
        type="month"
        value={valueYYYYMM}
        onChange={handleMonthInputChange}
        className="h-6 px-1.5 border border-slate-200 rounded font-medium text-slate-800 bg-slate-50 hover:bg-white focus:outline-sky-600 cursor-pointer text-xs"
        title="Chọn tháng và năm"
      />

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
  );
};
