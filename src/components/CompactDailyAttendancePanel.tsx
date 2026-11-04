import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Zap,
  RotateCcw,
  Clock,
  Smartphone,
  X,
  Layers,
} from 'lucide-react';
import {
  DailyAttendanceDetail,
  MonthlyAttendanceRecord,
  SeasonalCycleType,
} from '../types';
import { getPayrollPeriods, getDayOfWeekInfo } from '../data/mockSeasonalWorkers';

interface CompactDailyAttendancePanelProps {
  workerCode: string;
  workerName: string;
  month: number;
  year: number;
  standardWorkDays?: number;
  dailyRate?: number;
  monthlyAttendance?: { [monthKey: string]: MonthlyAttendanceRecord };
  initialCycleType?: SeasonalCycleType;
  onChangeMonthYear?: (month: number, year: number) => void;
  onUpdateAttendance: (payload: {
    monthlyAttendance: { [monthKey: string]: MonthlyAttendanceRecord };
    actualWorkDays: number;
    overtimeHours: number;
    cycleType: SeasonalCycleType;
    periodKey: string;
  }) => void;
  onOpenShareLink?: () => void;
  onClose?: () => void;
}

export const CompactDailyAttendancePanel: React.FC<CompactDailyAttendancePanelProps> = ({
  workerCode,
  workerName,
  month,
  year,
  standardWorkDays = 26,
  dailyRate = 0,
  monthlyAttendance = {},
  initialCycleType = '1_MONTH',
  onChangeMonthYear,
  onUpdateAttendance,
  onOpenShareLink,
  onClose,
}) => {
  const [cycleType, setCycleType] = useState<SeasonalCycleType>(initialCycleType || '1_MONTH');
  const periods = useMemo(
    () => getPayrollPeriods(year, month, cycleType),
    [cycleType, year, month]
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    () => periods[0]?.id || 'M1'
  );

  const activePeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) || periods[0],
    [periods, selectedPeriodId]
  );

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const currentMonthRecord: MonthlyAttendanceRecord = useMemo(() => {
    const existing = monthlyAttendance?.[monthKey];
    if (existing && existing.days) return existing;
    return {
      monthKey,
      month,
      year,
      totalWorkDays: 0,
      totalOtHours: 0,
      days: {},
    };
  }, [monthlyAttendance, monthKey, month, year]);

  // Build list of days for the active period
  const periodDays = useMemo(() => {
    const dates = activePeriod?.dates || [];
    return dates.map((dateLabel) => {
      const dayNum = parseInt(dateLabel.split('/')[0], 10);
      const dayInfo = getDayOfWeekInfo(dateLabel, year, month);
      const saved: DailyAttendanceDetail | undefined = currentMonthRecord.days?.[dayNum];
      return {
        dayNum,
        dateLabel,
        dateStr: `${dateLabel}/${year}`,
        dayOfWeek: dayInfo.dayOfWeek,
        dayName: dayInfo.dayName,
        isSunday: dayInfo.isSunday,
        workUnits: saved?.workUnits ?? 0,
        otHours: saved?.otHours ?? 0,
        note: saved?.note ?? (dayInfo.isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
      };
    });
  }, [activePeriod, currentMonthRecord, year, month]);

  const applyDaysUpdate = (
    updatedDaysMap: { [dayNumber: number]: DailyAttendanceDetail },
    targetCycleType: SeasonalCycleType = cycleType
  ) => {
    let totalMonthWorkDays = 0;
    let totalMonthOtHours = 0;
    Object.values(updatedDaysMap).forEach((d) => {
      totalMonthWorkDays += Number(d.workUnits || 0);
      totalMonthOtHours += Number(d.otHours || 0);
    });
    totalMonthWorkDays = Math.round(totalMonthWorkDays * 10) / 10;

    // Calculate workdays & OT for active period (or full month if 1_MONTH)
    let activeWorkDays = totalMonthWorkDays;
    let activeOtHours = totalMonthOtHours;
    if (targetCycleType !== '1_MONTH' && activePeriod?.dates) {
      let pDays = 0;
      let pOt = 0;
      activePeriod.dates.forEach((dLabel) => {
        const dNum = parseInt(dLabel.split('/')[0], 10);
        const rec = updatedDaysMap[dNum];
        if (rec) {
          pDays += Number(rec.workUnits || 0);
          pOt += Number(rec.otHours || 0);
        }
      });
      activeWorkDays = Math.round(pDays * 10) / 10;
      activeOtHours = pOt;
    }

    const nextMonthly: { [key: string]: MonthlyAttendanceRecord } = {
      ...monthlyAttendance,
      [monthKey]: {
        monthKey,
        month,
        year,
        totalWorkDays: totalMonthWorkDays,
        totalOtHours: totalMonthOtHours,
        days: updatedDaysMap,
        lastSubmittedAt: new Date().toISOString(),
        submittedBy: 'ADMIN',
      },
    };

    onUpdateAttendance({
      monthlyAttendance: nextMonthly,
      actualWorkDays: activeWorkDays,
      overtimeHours: activeOtHours,
      cycleType: targetCycleType,
      periodKey: activePeriod?.periodKey || `${monthKey}_MONTH`,
    });
  };

  const handleSetDayWorkUnits = (dayNum: number, dateLabel: string, isSunday: boolean, units: number) => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    const prev = nextDays[dayNum];
    nextDays[dayNum] = {
      day: dayNum,
      dateStr: `${dateLabel}/${year}`,
      workUnits: units,
      statusType: units === 1 ? 'FULL' : units === 0.5 ? 'HALF' : 'ABSENT',
      otHours: prev?.otHours ?? 0,
      note:
        prev?.note && prev.note !== 'Nghỉ ca' && prev.note !== 'Nghỉ Chủ Nhật'
          ? prev.note
          : units > 0
          ? 'Đi làm đủ ca'
          : isSunday
          ? 'Nghỉ Chủ Nhật'
          : 'Nghỉ ca',
      updatedAt: new Date().toISOString(),
    };
    applyDaysUpdate(nextDays);
  };

  const handleStepDayOT = (dayNum: number, dateLabel: string, delta: number) => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    const prev = nextDays[dayNum];
    const nextOt = Math.max(0, Math.min(24, (prev?.otHours || 0) + delta));
    nextDays[dayNum] = {
      day: dayNum,
      dateStr: `${dateLabel}/${year}`,
      workUnits: prev?.workUnits ?? (nextOt > 0 ? 1 : 0),
      statusType: (prev?.workUnits ?? (nextOt > 0 ? 1 : 0)) === 1 ? 'FULL' : 'ABSENT',
      otHours: nextOt,
      note: prev?.note || 'Tăng ca',
      updatedAt: new Date().toISOString(),
    };
    applyDaysUpdate(nextDays);
  };

  const handleDayNote = (dayNum: number, dateLabel: string, note: string) => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    const prev = nextDays[dayNum];
    nextDays[dayNum] = {
      day: dayNum,
      dateStr: `${dateLabel}/${year}`,
      workUnits: prev?.workUnits ?? 0,
      otHours: prev?.otHours ?? 0,
      note,
      updatedAt: new Date().toISOString(),
    };
    applyDaysUpdate(nextDays);
  };

  // Quick Action 1: 26 công (Tiêu chuẩn tháng - trừ Chủ Nhật)
  const handleQuickStandardDays = () => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    let count = 0;
    periodDays.forEach((d) => {
      if (!d.isSunday && count < standardWorkDays) {
        count += 1;
        nextDays[d.dayNum] = {
          day: d.dayNum,
          dateStr: d.dateStr,
          workUnits: 1,
          statusType: 'FULL',
          otHours: nextDays[d.dayNum]?.otHours || 0,
          note: 'Đi làm đủ ca',
          updatedAt: new Date().toISOString(),
        };
      } else {
        nextDays[d.dayNum] = {
          day: d.dayNum,
          dateStr: d.dateStr,
          workUnits: 0,
          statusType: 'ABSENT',
          otHours: 0,
          note: d.isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca',
          updatedAt: new Date().toISOString(),
        };
      }
    });
    applyDaysUpdate(nextDays);
  };

  // Quick Action 2: Đủ cả kỳ / cả tháng
  const handleQuickFullAllDays = () => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    periodDays.forEach((d) => {
      nextDays[d.dayNum] = {
        day: d.dayNum,
        dateStr: d.dateStr,
        workUnits: 1,
        statusType: 'FULL',
        otHours: nextDays[d.dayNum]?.otHours || 0,
        note: 'Đi làm đủ ca',
        updatedAt: new Date().toISOString(),
      };
    });
    applyDaysUpdate(nextDays);
  };

  // Quick Action 3: +2h OT/ngày (cho những ngày có đi làm)
  const handleQuickAdd2hOT = () => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    periodDays.forEach((d) => {
      const cur = nextDays[d.dayNum];
      if (cur && cur.workUnits > 0) {
        nextDays[d.dayNum] = {
          ...cur,
          otHours: 2,
          updatedAt: new Date().toISOString(),
        };
      }
    });
    applyDaysUpdate(nextDays);
  };

  // Quick Action 4: Xóa trắng (0 công)
  const handleQuickClear = () => {
    const nextDays = { ...(currentMonthRecord.days || {}) };
    periodDays.forEach((d) => {
      nextDays[d.dayNum] = {
        day: d.dayNum,
        dateStr: d.dateStr,
        workUnits: 0,
        statusType: 'ABSENT',
        otHours: 0,
        note: d.isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca',
        updatedAt: new Date().toISOString(),
      };
    });
    applyDaysUpdate(nextDays);
  };

  const activeSummary = useMemo(() => {
    let totalDays = 0;
    let totalOt = 0;
    periodDays.forEach((d) => {
      totalDays += Number(d.workUnits || 0);
      totalOt += Number(d.otHours || 0);
    });
    totalDays = Math.round(totalDays * 10) / 10;
    const salaryByDays = Math.round(totalDays * dailyRate);
    const otPay = Math.round((dailyRate / 8) * totalOt * 1.5);
    return { totalDays, totalOt, salaryByDays, otPay };
  }, [periodDays, dailyRate]);

  return (
    <div className="bg-slate-50/90 border border-sky-200 rounded-xl p-2.5 space-y-2.5 shadow-inner text-xs">
      {/* THANH ĐIỀU KHIỂN TRÊN CÙNG (NHỎ GỌN) */}
      <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Chọn Tháng / Năm */}
          <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1">
            <button
              type="button"
              onClick={() => {
                if (!onChangeMonthYear) return;
                if (month === 1) onChangeMonthYear(12, year - 1);
                else onChangeMonthYear(month - 1, year);
              }}
              className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
              title="Tháng trước"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <Calendar className="w-3.5 h-3.5 text-[#0f3d64]" />
            <select
              value={month}
              onChange={(e) => onChangeMonthYear?.(Number(e.target.value), year)}
              className="bg-transparent font-extrabold text-[11px] text-slate-900 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m < 10 ? `0${m}` : m}
                </option>
              ))}
            </select>
            <span className="text-slate-400">/</span>
            <select
              value={year}
              onChange={(e) => onChangeMonthYear?.(month, Number(e.target.value))}
              className="bg-transparent font-mono font-bold text-[11px] text-slate-800 focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!onChangeMonthYear) return;
                if (month === 12) onChangeMonthYear(1, year + 1);
                else onChangeMonthYear(month + 1, year);
              }}
              className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
              title="Tháng sau"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Chu kỳ lương: 1 Tuần | 2 Tuần | Lương Tháng */}
          <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            <span className="px-1.5 text-[10px] font-semibold text-slate-600 flex items-center gap-1">
              <Layers className="w-3 h-3 text-sky-700" />
              Chu kỳ:
            </span>
            {(
              [
                { id: '1_WEEK', label: 'Lương 1 Tuần' },
                { id: '2_WEEKS', label: 'Lương 2 Tuần' },
                { id: '1_MONTH', label: 'Lương Tháng' },
              ] as { id: SeasonalCycleType; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCycleType(item.id);
                  const nextPeriods = getPayrollPeriods(year, month, item.id);
                  if (nextPeriods[0]) setSelectedPeriodId(nextPeriods[0].id);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                  cycleType === item.id
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Các nút thao tác chấm nhanh (Icon nhỏ) */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleQuickStandardDays}
              className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
            >
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>{standardWorkDays} công (Tiêu chuẩn)</span>
            </button>
            <button
              type="button"
              onClick={handleQuickFullAllDays}
              className="px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
            >
              <Zap className="w-3 h-3 text-sky-600" />
              <span>Đủ cả kỳ ({periodDays.length} ngày)</span>
            </button>
            <button
              type="button"
              onClick={handleQuickAdd2hOT}
              className="px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
            >
              <span>+2h OT/ngày</span>
            </button>
            <button
              type="button"
              onClick={handleQuickClear}
              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Xóa trắng (0 công)</span>
            </button>
          </div>
        </div>

        {/* Gửi link chấm công cá nhân + Đóng */}
        <div className="flex items-center gap-1.5">
          {onOpenShareLink && (
            <button
              type="button"
              onClick={onOpenShareLink}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black flex items-center gap-1 shadow-2xs cursor-pointer transition"
              title="Lấy link chấm công cá nhân gửi Zalo cho nhân sự này"
            >
              <Smartphone className="w-3 h-3" />
              <span>Gửi Link Chấm Công ({workerCode})</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              title="Thu gọn lịch chấm công"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* CHỌN KỲ TRONG THÁNG (THU GỌN) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#0f3d64]" />
            Chọn kỳ:
          </span>
          {periods.map((p) => {
            const isSelected = p.id === activePeriod?.id;
            let pWorkDays = 0;
            p.dates.forEach((dStr: string) => {
              const dNum = parseInt(dStr.split('/')[0], 10);
              const dRec = currentMonthRecord.days ? currentMonthRecord.days[dNum] : undefined;
              pWorkDays += Number(dRec?.workUnits || 0);
            });
            pWorkDays = Math.round(pWorkDays * 10) / 10;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPeriodId(p.id)}
                className={`px-2.5 py-1 rounded-lg border text-left transition flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#0f3d64] text-white border-[#0f3d64] shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300'
                }`}
              >
                <div>
                  <div className="text-[10px] font-black leading-tight">{p.shortLabel}</div>
                  <div className={`text-[9px] font-mono ${isSelected ? 'text-sky-200' : 'text-slate-400'}`}>
                    {p.dates[0]} - {p.dates[p.dates.length - 1]}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                    pWorkDays > 0
                      ? isSelected
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-emerald-100 text-emerald-800'
                      : isSelected
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {pWorkDays} công
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-extrabold text-[#0f3d64]">
          Nhân sự: <span className="text-sky-800">{workerName}</span> ({workerCode}) —{' '}
          <span className="text-emerald-700 font-mono">{activeSummary.totalDays} công</span> /{' '}
          <span className="text-amber-700 font-mono">{activeSummary.totalOt}h OT</span>
        </div>
      </div>

      {/* LƯỚI CHẤM CÔNG TỪNG NGÀY DẠNG ICON NHỎ GỌN (10 CỘT TRÊN MÀN HÌNH LỚN) */}
      <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 max-h-[290px] overflow-y-auto p-0.5">
        {periodDays.map((day) => {
          const isFull = day.workUnits === 1;
          const isHalf = day.workUnits === 0.5;
          const isOff = day.workUnits === 0;
          const hasOT = day.otHours > 0;

          return (
            <div
              key={day.dayNum}
              className={`rounded-lg border p-1.5 flex flex-col justify-between transition-all ${
                isFull
                  ? 'bg-emerald-50/80 border-emerald-400 shadow-2xs'
                  : isHalf
                  ? 'bg-amber-50/80 border-amber-400 shadow-2xs'
                  : day.isSunday
                  ? 'bg-rose-50/40 border-rose-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              {/* Header: Thứ + Ngày */}
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200/70">
                <span
                  className={`px-1 py-0.2 rounded text-[9px] font-black leading-none ${
                    day.isSunday
                      ? 'bg-rose-100 text-rose-700 border border-rose-300'
                      : 'bg-[#0f3d64] text-white'
                  }`}
                >
                  {day.dayOfWeek}
                </span>
                <span className="text-[10px] font-mono font-black text-slate-700">
                  {day.dateLabel}
                </span>
              </div>

              {/* Chọn nhanh công: 1.0 | 0.5 | 0 */}
              <div className="grid grid-cols-3 gap-0.5 bg-slate-200/75 p-0.5 rounded">
                <button
                  type="button"
                  onClick={() => handleSetDayWorkUnits(day.dayNum, day.dateLabel, day.isSunday, 1)}
                  className={`py-0.5 rounded font-black text-[9px] cursor-pointer transition ${
                    isFull
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                  title="1.0 công (Đủ ca 8h)"
                >
                  1.0
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDayWorkUnits(day.dayNum, day.dateLabel, day.isSunday, 0.5)}
                  className={`py-0.5 rounded font-black text-[9px] cursor-pointer transition ${
                    isHalf
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                  title="0.5 công (Nửa ca 4h)"
                >
                  0.5
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDayWorkUnits(day.dayNum, day.dateLabel, day.isSunday, 0)}
                  className={`py-0.5 rounded font-bold text-[9px] cursor-pointer transition ${
                    isOff
                      ? 'bg-slate-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-white'
                  }`}
                  title="Nghỉ (0 công)"
                >
                  0
                </button>
              </div>

              {/* Tăng ca OT nhỏ gọn */}
              <div className="mt-1 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-[8px] font-bold text-slate-500">OT:</span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleStepDayOT(day.dayNum, day.dateLabel, -1)}
                    className="w-3.5 h-3.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-black flex items-center justify-center cursor-pointer"
                  >
                    -
                  </button>
                  <span
                    className={`font-mono font-black text-[9px] px-0.5 rounded ${
                      hasOT ? 'bg-amber-100 text-amber-900' : 'text-slate-600'
                    }`}
                  >
                    {day.otHours}h
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStepDayOT(day.dayNum, day.dateLabel, 1)}
                    className="w-3.5 h-3.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-950 text-[9px] font-black flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Ghi chú 1 dòng nhỏ */}
              <input
                type="text"
                value={day.note}
                onChange={(e) => handleDayNote(day.dayNum, day.dateLabel, e.target.value)}
                placeholder="Ghi chú..."
                className="mt-1 w-full text-[8px] px-1 py-0.5 bg-white/90 border border-slate-200 rounded text-slate-600 truncate focus:outline-none focus:border-sky-400"
              />
            </div>
          );
        })}
      </div>

      {/* THANH TỔNG HỢP CÔNG & GIỜ TĂNG CA CUỐI BẢNG */}
      <div className="bg-white border border-sky-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-slate-500">Tổng ngày công: </span>
            <strong className="font-mono font-black text-emerald-700 text-xs">
              {activeSummary.totalDays} công
            </strong>
          </div>
          <div>
            <span className="text-slate-500">Tổng giờ tăng ca OT: </span>
            <strong className="font-mono font-black text-amber-700 text-xs">
              {activeSummary.totalOt}h OT
            </strong>
          </div>
          {dailyRate > 0 && (
            <>
              <div>
                <span className="text-slate-500">Lương ngày công: </span>
                <strong className="font-mono font-bold text-slate-900">
                  {new Intl.NumberFormat('vi-VN').format(activeSummary.salaryByDays)} đ
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Tiền làm thêm OT: </span>
                <strong className="font-mono font-bold text-amber-800">
                  +{new Intl.NumberFormat('vi-VN').format(activeSummary.otPay)} đ
                </strong>
              </div>
            </>
          )}
        </div>
        <div className="text-[10px] text-emerald-700 font-bold">
          ✓ Tự động đồng bộ với Link Chấm Công Di Động & Bản Lương
        </div>
      </div>
    </div>
  );
};
