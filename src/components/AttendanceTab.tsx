import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  CompanyConfig,
  Employee,
  SeasonalWorker,
  TeamWorker,
  MonthlyAttendanceRecord,
  DailyAttendanceDetail,
} from '../types';
import {
  recomputeEmployeePayroll,
  syncEmployeeForMonth,
  getRealCurrentDateInfo,
} from '../utils/payrollCalculator';
import {
  recomputeSeasonalWorkerPayroll,
  syncSeasonalWorkerForMonth,
  getDayOfWeekInfo,
} from '../data/mockSeasonalWorkers';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import {
  Calendar,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Smartphone,
  QrCode,
  CheckCircle2,
  RotateCcw,
  Zap,
  Clock,
  Search,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { MobileAttendanceShareModal } from './MobileAttendanceShareModal';
import { isSupabaseConfigured } from '../services/supabaseService';

interface AttendanceTabProps {
  employees: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onBatchUpdate: (updated: Employee[]) => void;
  onBatchUpdateSeasonal?: (updated: SeasonalWorker[]) => void;
  onBatchUpdateTeam?: (updated: TeamWorker[]) => void;
  onGoToEmployeeList?: () => void;
  onGoToSeasonalAttendance?: () => void;
  onOpenMobileView?: (workerCode?: string) => void;
  seasonalCount?: number;
  forcedGroup?: 'PERMANENT' | 'SEASONAL' | 'TEAM';
  onManualSync?: () => Promise<void> | void;
  onOpenSupabaseModal?: () => void;
  cloudSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
}

type DayStatusType = 'FULL' | 'HALF' | 'ABSENT' | 'LEAVE' | 'LATE' | 'NONE';

interface DayMeta {
  day: number;
  dateStr: string;
  dateLabel: string;
  dayOfWeek: string;
  isWeekend: boolean; // T7 or CN
  isSunday: boolean;
  isToday: boolean;
}

/**
 * Lấy chữ cái viết tắt từ Họ và Tên (VD: "Hán Văn Quang" -> "HVQ", "Hán Kiều Duy Phôn" -> "HKDP")
 */
function getInitials(fullName: string): string {
  if (!fullName) return 'NV';
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
    .slice(0, 4);
}

/**
 * Nếu nhân sự đã có sẵn số công (actualWorkDays) hoặc giờ tăng ca (overtimeHours) nhưng chưa có chi tiết từng ngày
 * trong tháng hiện tại, hàm này tự động khởi tạo lưới ngày khớp với tổng số công & giờ OT đó để hiển thị lên Timeline.
 */
function ensureMonthlyDaysForWorker(
  existingRecord: MonthlyAttendanceRecord | undefined,
  month: number,
  year: number,
  daysMeta: DayMeta[],
  _actualWorkDays: number,
  _overtimeHours: number,
  paidLeaveDays: number = 0,
  unpaidLeaveDays: number = 0
): { [dayNumber: number]: DailyAttendanceDetail } {
  if (!existingRecord) {
    return {};
  }
  if (existingRecord.days && Object.keys(existingRecord.days).length > 0) {
    return existingRecord.days;
  }

  // Nếu bản ghi tháng là 11/2026 mà không có chi tiết days -> trả về trống để không tự tạo ngày công giả
  if (month === 11 && year === 2026) {
    return {};
  }

  const recWork = Number(existingRecord.totalWorkDays || 0);
  const recOt = Number(existingRecord.totalOtHours || 0);

  // Nếu bản ghi tháng có 0 công và 0 OT -> để trống toàn bộ (-)
  if (recWork <= 0 && recOt <= 0) {
    return {};
  }

  const generated: { [dayNumber: number]: DailyAttendanceDetail } = {};
  let remWork = Math.max(0, recWork);
  let remLeave = Math.max(0, Math.round(Number(paidLeaveDays) || 0));
  let remAbsent = Math.max(0, Math.round(Number(unpaidLeaveDays) || 0));
  let remOt = Math.max(0, Math.round(recOt));

  for (const dm of daysMeta) {
    if (dm.isSunday) {
      if (remAbsent > 0) {
        generated[dm.day] = {
          day: dm.day,
          dateStr: dm.dateStr,
          workUnits: 0,
          statusType: 'ABSENT',
          otHours: 0,
        };
        remAbsent -= 1;
      }
      continue;
    }

    if (remWork >= 1) {
      generated[dm.day] = {
        day: dm.day,
        dateStr: dm.dateStr,
        workUnits: 1,
        statusType: 'FULL',
        otHours: 0,
      };
      remWork -= 1;
    } else if (remWork >= 0.5) {
      generated[dm.day] = {
        day: dm.day,
        dateStr: dm.dateStr,
        workUnits: 0.5,
        statusType: 'HALF',
        otHours: 0,
      };
      remWork = 0;
    } else if (remLeave > 0) {
      generated[dm.day] = {
        day: dm.day,
        dateStr: dm.dateStr,
        workUnits: 0,
        statusType: 'LEAVE',
        otHours: 0,
      };
      remLeave -= 1;
    } else if (remAbsent > 0) {
      generated[dm.day] = {
        day: dm.day,
        dateStr: dm.dateStr,
        workUnits: 0,
        statusType: 'ABSENT',
        otHours: 0,
      };
      remAbsent -= 1;
    }
  }

  if (remWork > 0) {
    for (const dm of daysMeta) {
      if (remWork <= 0) break;
      if (!generated[dm.day] || generated[dm.day].workUnits === 0) {
        const addUnit = remWork >= 1 ? 1 : 0.5;
        generated[dm.day] = {
          day: dm.day,
          dateStr: dm.dateStr,
          workUnits: addUnit,
          statusType: addUnit === 1 ? 'FULL' : 'HALF',
          otHours: generated[dm.day]?.otHours || 0,
        };
        remWork -= addUnit;
      }
    }
  }

  const workingDayNums = Object.keys(generated)
    .map(Number)
    .filter((d) => (generated[d]?.workUnits || 0) > 0);

  let pass = 0;
  while (remOt > 0 && workingDayNums.length > 0 && pass < 10) {
    for (const dNum of workingDayNums) {
      if (remOt <= 0) break;
      const addOt = Math.min(remOt, pass === 0 ? 3 : 1);
      generated[dNum] = {
        ...generated[dNum],
        otHours: (generated[dNum].otHours || 0) + addOt,
      };
      remOt -= addOt;
    }
    pass++;
  }

  return generated;
}

/**
 * Tính toán 5 chỉ số tổng hợp từ danh sách ngày trong tháng:
 * - Công (totalWorkDays)
 * - VM (Vắng mặt / Nghỉ không lương)
 * - ĐM (Đi muộn)
 * - NP (Nghỉ phép)
 * - Giờ TC (Tổng giờ tăng ca OT)
 */
function calculateRowTotalsFromDays(daysMap: { [dayNumber: number]: DailyAttendanceDetail }) {
  let totalCong = 0;
  let totalVM = 0;
  let totalDM = 0;
  let totalNP = 0;
  let totalOT = 0;

  Object.values(daysMap || {}).forEach((d) => {
    if (!d) return;
    const status = d.statusType;
    const units = Number(d.workUnits || 0);
    const ot = Number(d.otHours || 0);

    totalOT += ot;

    if (status === 'LEAVE') {
      totalNP += 1;
    } else if (status === 'ABSENT') {
      totalVM += 1;
    } else if (status === 'LATE') {
      totalDM += 1;
      totalCong += units > 0 ? units : 1;
    } else if (units > 0) {
      totalCong += units;
    }
  });

  return {
    totalCong: Math.round(totalCong * 10) / 10,
    totalVM,
    totalDM,
    totalNP,
    totalOT: Math.round(totalOT * 10) / 10,
  };
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  employees,
  seasonalWorkers = [],
  config,
  onChangeMonthYear,
  onBatchUpdate,
  onBatchUpdateSeasonal,
  onOpenMobileView,
  forcedGroup,
  onManualSync,
  onOpenSupabaseModal,
  cloudSyncStatus = 'idle',
}) => {
  const realDateInfo = useMemo(() => getRealCurrentDateInfo(), []);

  const [attendanceGroup, setAttendanceGroup] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>(
    forcedGroup || 'PERMANENT'
  );

  useEffect(() => {
    if (forcedGroup) {
      setAttendanceGroup(forcedGroup);
    }
  }, [forcedGroup]);

  const currentMonth = config.month || realDateInfo.realMonth;
  const currentYear = config.year || realDateInfo.realYear;
  const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const isViewingRealCurrentMonth =
    currentMonth === realDateInfo.realMonth && currentYear === realDateInfo.realYear;

  const [modifiedEmployees, setModifiedEmployees] = useState<Employee[]>(() =>
    employees.map((e) => syncEmployeeForMonth(e, currentMonth, currentYear, config.standardWorkDays || 26))
  );
  const [modifiedSeasonal, setModifiedSeasonal] = useState<SeasonalWorker[]>(() =>
    seasonalWorkers.map((w) => syncSeasonalWorkerForMonth(w, currentMonth, currentYear))
  );
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [shareModalTargetId, setShareModalTargetId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Ô ngày đang được mở Popover chỉnh sửa nhanh
  const [editingCell, setEditingCell] = useState<{
    workerCode: string;
    workerName: string;
    day: number;
    dateStr: string;
    dayOfWeek: string;
  } | null>(null);

  useEffect(() => {
    setModifiedEmployees(
      employees.map((e) =>
        syncEmployeeForMonth(e, currentMonth, currentYear, config.standardWorkDays || 26)
      )
    );
  }, [employees, currentMonth, currentYear, config.standardWorkDays]);

  useEffect(() => {
    setModifiedSeasonal(
      seasonalWorkers.map((w) => syncSeasonalWorkerForMonth(w, currentMonth, currentYear))
    );
  }, [seasonalWorkers, currentMonth, currentYear]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Danh sách các ngày thực tế của tháng đang chọn (1 -> 28/29/30/31)
  const daysInMonthMeta: DayMeta[] = useMemo(() => {
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    const mStr = String(currentMonth).padStart(2, '0');
    const list: DayMeta[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const dStr = String(d).padStart(2, '0');
      const dateLabel = `${dStr}/${mStr}`;
      const info = getDayOfWeekInfo(dateLabel, currentYear, currentMonth);
      list.push({
        day: d,
        dateStr: `${dStr}/${mStr}/${currentYear}`,
        dateLabel,
        dayOfWeek: info.dayOfWeek,
        isWeekend: info.dayOfWeek === 'T7' || info.dayOfWeek === 'CN',
        isSunday: info.isSunday,
        isToday: isViewingRealCurrentMonth && d === realDateInfo.realDay,
      });
    }
    return list;
  }, [currentMonth, currentYear, isViewingRealCurrentMonth, realDateInfo.realDay]);

  // Chỉ lấy nhân sự có trạng thái Đang làm việc (ACTIVE)
  const activeEmployees = useMemo(() => {
    return modifiedEmployees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE');
  }, [modifiedEmployees]);

  const activeSeasonal = useMemo(() => {
    return modifiedSeasonal.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE');
  }, [modifiedSeasonal]);

  // Danh sách Phòng ban / Bộ phận (hoặc Dự án / Tổ đội cho Thời vụ)
  const departmentList = useMemo(() => {
    const set = new Set<string>();
    if (attendanceGroup === 'PERMANENT') {
      activeEmployees.forEach((e) => {
        if (e.department) set.add(e.department);
      });
    } else {
      activeSeasonal.forEach((w) => {
        set.add(w.project || w.teamName || w.trade || 'Công trình thi công');
      });
    }
    return Array.from(set);
  }, [attendanceGroup, activeEmployees, activeSeasonal]);

  // Nhóm nhân sự theo Phòng ban / Dự án giống hệt giao diện Timeline
  const groupedSections = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (attendanceGroup === 'PERMANENT') {
      const filtered = (
        selectedDepartment === 'ALL'
          ? activeEmployees
          : activeEmployees.filter((e) => e.department === selectedDepartment)
      ).filter((e) => {
        if (!keyword) return true;
        return (
          (e.fullName || '').toLowerCase().includes(keyword) ||
          (e.code || '').toLowerCase().includes(keyword) ||
          (e.department || '').toLowerCase().includes(keyword) ||
          (e.phone || '').toLowerCase().includes(keyword)
        );
      });

      const groupsMap = new Map<string, Employee[]>();
      filtered.forEach((emp) => {
        const dept = emp.department || 'Phòng ban chung';
        if (!groupsMap.has(dept)) groupsMap.set(dept, []);
        groupsMap.get(dept)!.push(emp);
      });

      return Array.from(groupsMap.entries()).map(([groupName, items]) => ({
        groupName,
        items: items.map((e) => {
          const syncedEmp = syncEmployeeForMonth(
            e,
            currentMonth,
            currentYear,
            config.standardWorkDays || 26
          );
          const daysMap = ensureMonthlyDaysForWorker(
            syncedEmp.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            syncedEmp.actualWorkDays || 0,
            syncedEmp.overtimeHours || 0,
            syncedEmp.paidLeaveDays || 0,
            syncedEmp.unpaidLeaveDays || 0
          );
          const totals = calculateRowTotalsFromDays(daysMap);
          const isParticipating =
            totals.totalCong > 0 ||
            totals.totalOT > 0 ||
            totals.totalNP > 0;
          const livePayrollEmp = recomputeEmployeePayroll({
            ...syncedEmp,
            actualWorkDays: totals.totalCong,
            overtimeHours: totals.totalOT,
            paidLeaveDays: totals.totalNP,
            unpaidLeaveDays: totals.totalVM,
            selectedForAttendance: isParticipating,
          });
          return {
            id: syncedEmp.id,
            code: syncedEmp.code,
            fullName: syncedEmp.fullName,
            group: syncedEmp.department,
            daysMap,
            totals,
            isParticipating,
            netSalary: livePayrollEmp.netSalary || 0,
            rawEmployee: livePayrollEmp,
          };
        }),
      }));
    } else {
      const filtered = (
        selectedDepartment === 'ALL'
          ? activeSeasonal
          : activeSeasonal.filter(
              (w) => (w.project || w.teamName || w.trade || 'Công trình thi công') === selectedDepartment
            )
      ).filter((w) => {
        if (!keyword) return true;
        return (
          (w.fullName || '').toLowerCase().includes(keyword) ||
          (w.code || '').toLowerCase().includes(keyword) ||
          (w.project || '').toLowerCase().includes(keyword) ||
          (w.trade || '').toLowerCase().includes(keyword) ||
          (w.phone || '').toLowerCase().includes(keyword)
        );
      });

      const groupsMap = new Map<string, SeasonalWorker[]>();
      filtered.forEach((w) => {
        const grp = w.project || w.teamName || w.trade || 'Công trình thi công';
        if (!groupsMap.has(grp)) groupsMap.set(grp, []);
        groupsMap.get(grp)!.push(w);
      });

      return Array.from(groupsMap.entries()).map(([groupName, items]) => ({
        groupName,
        items: items.map((w) => {
          const syncedW = syncSeasonalWorkerForMonth(w, currentMonth, currentYear);
          const daysMap = ensureMonthlyDaysForWorker(
            syncedW.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            syncedW.actualWorkDays || 0,
            syncedW.overtimeHours || 0,
            0,
            0
          );
          const totals = calculateRowTotalsFromDays(daysMap);
          const isParticipating = totals.totalCong > 0 || totals.totalOT > 0;
          const livePayrollW = recomputeSeasonalWorkerPayroll({
            ...syncedW,
            actualWorkDays: totals.totalCong,
            overtimeHours: totals.totalOT,
          });
          return {
            id: syncedW.id,
            code: syncedW.code,
            fullName: syncedW.fullName,
            group: grpNameOrTrade(syncedW),
            daysMap,
            totals,
            isParticipating,
            netSalary: livePayrollW.netSalary || 0,
            rawSeasonal: livePayrollW,
          };
        }),
      }));
    }
  }, [
    attendanceGroup,
    selectedDepartment,
    searchTerm,
    activeEmployees,
    activeSeasonal,
    monthKey,
    currentMonth,
    currentYear,
    daysInMonthMeta,
    config.standardWorkDays,
  ]);

  function grpNameOrTrade(w: SeasonalWorker) {
    return w.project || w.trade || 'Thời vụ';
  }

  // Cập nhật dữ liệu 1 dòng nhân sự (Lưu vào monthlyAttendance VÀ cập nhật trực tiếp Công + Giờ TC + Trạng thái Tham gia chấm công sang Bản Lương)
  const applyWorkerDaysMapUpdate = (
    workerCode: string,
    nextDaysMap: { [dayNumber: number]: DailyAttendanceDetail },
    explicitReplacement: boolean = false
  ) => {
    if (attendanceGroup === 'PERMANENT') {
      const updatedList = modifiedEmployees.map((emp) => {
        if (emp.code === workerCode) {
          const syncedEmp = syncEmployeeForMonth(
            emp,
            currentMonth,
            currentYear,
            config.standardWorkDays || 26
          );
          const currentBaseMap = explicitReplacement
            ? {}
            : ensureMonthlyDaysForWorker(
                syncedEmp.monthlyAttendance?.[monthKey],
                currentMonth,
                currentYear,
                daysInMonthMeta,
                syncedEmp.actualWorkDays || 0,
                syncedEmp.overtimeHours || 0,
                syncedEmp.paidLeaveDays || 0,
                syncedEmp.unpaidLeaveDays || 0
              );
          const finalMap = { ...currentBaseMap, ...nextDaysMap };
          Object.keys(finalMap).forEach((k) => {
            const dNum = Number(k);
            const item = finalMap[dNum];
            if (!item || (item.workUnits === 0 && !item.statusType && (item.otHours || 0) === 0)) {
              delete finalMap[dNum];
            }
          });
          const recalcTotals = calculateRowTotalsFromDays(finalMap);
          const hasAttendance =
            recalcTotals.totalCong > 0 ||
            recalcTotals.totalOT > 0 ||
            recalcTotals.totalNP > 0;

          const updatedMonthRecord: MonthlyAttendanceRecord = {
            monthKey,
            month: currentMonth,
            year: currentYear,
            totalWorkDays: recalcTotals.totalCong,
            totalOtHours: recalcTotals.totalOT,
            days: finalMap,
            lastSubmittedAt: new Date().toISOString(),
            submittedBy: 'MANUAL_USER' as any,
          };

          const nextEmp: Employee = {
            ...syncedEmp,
            actualWorkDays: recalcTotals.totalCong,
            overtimeHours: recalcTotals.totalOT,
            paidLeaveDays: recalcTotals.totalNP,
            unpaidLeaveDays: recalcTotals.totalVM,
            selectedForAttendance: hasAttendance,
            monthlyAttendance: {
              ...(syncedEmp.monthlyAttendance || {}),
              [monthKey]: updatedMonthRecord,
            },
          };
          return recomputeEmployeePayroll(nextEmp);
        }
        return emp;
      });
      setModifiedEmployees(updatedList);
      onBatchUpdate(updatedList);
    } else {
      const updatedList = modifiedSeasonal.map((w) => {
        if (w.code === workerCode) {
          const syncedW = syncSeasonalWorkerForMonth(w, currentMonth, currentYear);
          const currentBaseMap = explicitReplacement
            ? {}
            : ensureMonthlyDaysForWorker(
                syncedW.monthlyAttendance?.[monthKey],
                currentMonth,
                currentYear,
                daysInMonthMeta,
                syncedW.actualWorkDays || 0,
                syncedW.overtimeHours || 0,
                0,
                0
              );
          const finalMap = { ...currentBaseMap, ...nextDaysMap };
          Object.keys(finalMap).forEach((k) => {
            const dNum = Number(k);
            const item = finalMap[dNum];
            if (!item || (item.workUnits === 0 && !item.statusType && (item.otHours || 0) === 0)) {
              delete finalMap[dNum];
            }
          });
          const recalcTotals = calculateRowTotalsFromDays(finalMap);

          if (typeof window !== 'undefined' && w.code) {
            try {
              localStorage.setItem(
                `pncons_mobile_days_${w.code}_${currentYear}_${currentMonth}`,
                JSON.stringify(finalMap)
              );
            } catch {}
          }

          const updatedMonthRecord: MonthlyAttendanceRecord = {
            monthKey,
            month: currentMonth,
            year: currentYear,
            totalWorkDays: recalcTotals.totalCong,
            totalOtHours: recalcTotals.totalOT,
            days: finalMap,
            lastSubmittedAt: new Date().toISOString(),
            submittedBy: 'ADMIN',
          };

          const mStr = String(currentMonth).padStart(2, '0');
          const monthPeriodId = `${currentYear}-${mStr}_MONTH`;
          const nextPeriodRecords = { ...(syncedW.periodRecords || {}) };
          if (recalcTotals.totalCong === 0 && recalcTotals.totalOT === 0) {
            ['W1', 'W2', 'W3', 'W4', 'W5', 'BI1', 'BI2', 'M1', 'MONTH'].forEach((suffix) => {
              const pid = `${currentYear}-${mStr}_${suffix}`;
              if (nextPeriodRecords[pid]) {
                nextPeriodRecords[pid] = {
                  ...nextPeriodRecords[pid],
                  actualWorkDays: 0,
                  overtimeHours: 0,
                  isRecorded: false,
                };
              }
            });
          } else {
            const existingMonthRec = nextPeriodRecords[monthPeriodId];
            const rate = Number(syncedW.dailyRate || existingMonthRec?.dailyRate || 0);
            const salaryByDays = Math.round(rate * recalcTotals.totalCong);
            const overtimePay = Math.round((rate / 8) * recalcTotals.totalOT * 1.5);
            const mealAllowance = Number(existingMonthRec?.mealAllowance ?? syncedW.mealAllowance ?? 0);
            const travelSafetyAllowance = Number(existingMonthRec?.travelSafetyAllowance ?? syncedW.travelSafetyAllowance ?? 0);
            const otherBonus = Number(existingMonthRec?.otherBonus ?? syncedW.otherBonus ?? 0);
            const totalIncome = salaryByDays + overtimePay + mealAllowance + travelSafetyAllowance + otherBonus;
            const hasTaxCommitment = existingMonthRec?.hasTaxCommitment ?? syncedW.hasTaxCommitment ?? true;
            const personalIncomeTax = !hasTaxCommitment && totalIncome >= 2000000 ? Math.round(totalIncome * 0.1) : 0;
            const advancePayment = Number(existingMonthRec?.advancePayment ?? syncedW.advancePayment ?? 0);
            const totalDeductions = personalIncomeTax + advancePayment;

            nextPeriodRecords[monthPeriodId] = {
              ...(existingMonthRec || {}),
              periodKey: monthPeriodId,
              periodLabel: `Cả tháng ${mStr}/${currentYear}`,
              cycleType: '1_MONTH',
              isRecorded: true,
              dailyRate: rate,
              actualWorkDays: recalcTotals.totalCong,
              salaryByDays,
              overtimeHours: recalcTotals.totalOT,
              overtimePay,
              mealAllowance,
              travelSafetyAllowance,
              otherBonus,
              totalIncome,
              hasTaxCommitment,
              personalIncomeTax,
              advancePayment,
              totalDeductions,
              netSalary: totalIncome - totalDeductions,
            };
          }

          const nextWorker: SeasonalWorker = {
            ...syncedW,
            actualWorkDays: recalcTotals.totalCong,
            overtimeHours: recalcTotals.totalOT,
            selectedForAttendance: recalcTotals.totalCong > 0 || recalcTotals.totalOT > 0,
            periodRecords: nextPeriodRecords,
            monthlyAttendance: {
              ...(syncedW.monthlyAttendance || {}),
              [monthKey]: updatedMonthRecord,
            },
          };
          return recomputeSeasonalWorkerPayroll(nextWorker);
        }
        return w;
      });
      setModifiedSeasonal(updatedList);
      onBatchUpdateSeasonal?.(updatedList);
    }
  };

  // Lấy bản đồ ngày hiện tại của 1 nhân sự
  const getCurrentDaysMapForWorker = (workerCode: string): { [dayNumber: number]: DailyAttendanceDetail } => {
    for (const sec of groupedSections) {
      const found = sec.items.find((it) => it.code === workerCode);
      if (found) return { ...found.daysMap };
    }
    return {};
  };

  // Thay đổi trạng thái ngày (Đủ công, Nửa công, Vắng mặt, Nghỉ phép, Đi muộn, Xóa trống)
  const handleSelectDayStatus = (workerCode: string, day: number, dateStr: string, status: DayStatusType) => {
    const baseMap = getCurrentDaysMapForWorker(workerCode);
    const prev = baseMap[day];

    if (status === 'NONE') {
      delete baseMap[day];
    } else {
      const workUnits =
        status === 'FULL' || status === 'LATE' ? 1 : status === 'HALF' ? 0.5 : 0;
      baseMap[day] = {
        day,
        dateStr,
        workUnits,
        statusType: status,
        otHours: prev?.otHours || 0,
        updatedAt: new Date().toISOString(),
      };
    }
    applyWorkerDaysMapUpdate(workerCode, baseMap, true);
  };

  // Thay đổi giờ tăng ca (OT) của 1 ngày
  const handleSelectDayOtHours = (workerCode: string, day: number, dateStr: string, otHours: number) => {
    const baseMap = getCurrentDaysMapForWorker(workerCode);
    const prev = baseMap[day];
    const validOt = Math.max(0, Math.min(24, Number(otHours) || 0));

    // Nếu ngày đó chưa được chấm công mà nhập OT -> mặc định là Đi làm đủ công (1.0)
    const statusType = prev?.statusType || (validOt > 0 ? 'FULL' : undefined);
    const workUnits =
      prev?.workUnits !== undefined
        ? prev.workUnits
        : statusType === 'FULL'
        ? 1
        : 0;

    if (!statusType && validOt === 0) {
      delete baseMap[day];
    } else {
      baseMap[day] = {
        day,
        dateStr,
        workUnits,
        statusType,
        otHours: validOt,
        updatedAt: new Date().toISOString(),
      };
    }
    applyWorkerDaysMapUpdate(workerCode, baseMap, true);
  };

  // Chấm nhanh đủ công cả tháng (T2 -> T7) cho 1 nhân sự -> Trạng thái "Tham gia chấm công" và tự động nhảy lương
  const handleFillFullMonthForWorker = (workerCode: string) => {
    const nextMap: { [dayNumber: number]: DailyAttendanceDetail } = {};
    const prevMap = getCurrentDaysMapForWorker(workerCode);
    daysInMonthMeta.forEach((dm) => {
      if (!dm.isSunday) {
        nextMap[dm.day] = {
          day: dm.day,
          dateStr: dm.dateStr,
          workUnits: 1,
          statusType: 'FULL',
          otHours: prevMap[dm.day]?.otHours || 0,
          updatedAt: new Date().toISOString(),
        };
      }
    });
    applyWorkerDaysMapUpdate(workerCode, nextMap, true);
    setEditingCell(null);
    setToastMessage(
      `Đã bật "Tham gia chấm công" & chấm đủ công tháng ${currentMonth}/${currentYear} cho ${workerCode} — Bản Lương đã tự động nhảy lương!`
    );
  };

  // Xóa trắng toàn bộ ngày trong tháng của 1 nhân sự -> Trạng thái "Chưa chấm công" (0 đ)
  const handleClearMonthForWorker = (workerCode: string) => {
    if (attendanceGroup === 'PERMANENT') {
      const updatedList = modifiedEmployees.map((emp) => {
        if (emp.code === workerCode) {
          return recomputeEmployeePayroll({
            ...emp,
            actualWorkDays: 0,
            overtimeHours: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            selectedForAttendance: false,
            monthlyAttendance: {
              ...(emp.monthlyAttendance || {}),
              [monthKey]: {
                monthKey,
                month: currentMonth,
                year: currentYear,
                totalWorkDays: 0,
                totalOtHours: 0,
                days: {},
                lastSubmittedAt: new Date().toISOString(),
                submittedBy: 'MANUAL_USER' as any,
              },
            },
          });
        }
        return emp;
      });
      setModifiedEmployees(updatedList);
      onBatchUpdate(updatedList);
    } else {
      const mStr = String(currentMonth).padStart(2, '0');
      const updatedList = modifiedSeasonal.map((w) => {
        if (w.code === workerCode) {
          if (typeof window !== 'undefined' && w.code) {
            try {
              localStorage.setItem(`pncons_mobile_days_${w.code}_${currentYear}_${currentMonth}`, JSON.stringify({}));
            } catch {}
          }
          const nextPeriodRecords = { ...(w.periodRecords || {}) };
          ['W1', 'W2', 'W3', 'W4', 'W5', 'BI1', 'BI2', 'M1'].forEach((suffix) => {
            const pid = `${currentYear}-${mStr}_${suffix}`;
            if (nextPeriodRecords[pid]) {
              nextPeriodRecords[pid] = {
                ...nextPeriodRecords[pid],
                actualWorkDays: 0,
                overtimeHours: 0,
                isRecorded: false,
              };
            }
          });
          return recomputeSeasonalWorkerPayroll({
            ...w,
            actualWorkDays: 0,
            overtimeHours: 0,
            selectedForAttendance: false,
            periodRecords: nextPeriodRecords,
            monthlyAttendance: {
              ...(w.monthlyAttendance || {}),
              [monthKey]: {
                monthKey,
                month: currentMonth,
                year: currentYear,
                totalWorkDays: 0,
                totalOtHours: 0,
                days: {},
                lastSubmittedAt: new Date().toISOString(),
                submittedBy: 'ADMIN',
              },
            },
          });
        }
        return w;
      });
      setModifiedSeasonal(updatedList);
      onBatchUpdateSeasonal?.(updatedList);
    }
    setEditingCell(null);
    setToastMessage(`Đã đặt về "Chưa chấm công" (0 công) tháng ${currentMonth}/${currentYear} của ${workerCode}!`);
  };

  // Chấm nhanh toàn bộ nhân viên trong tháng hiện tại (T2 -> T7) để tất cả tham gia chấm công & nhảy lương
  const handleFillAllWorkersInMonth = () => {
    if (attendanceGroup === 'PERMANENT') {
      const updatedList = modifiedEmployees.map((emp) => {
        if ((emp.status || 'ACTIVE') !== 'ACTIVE') return emp;
        const nextMap: { [dayNumber: number]: DailyAttendanceDetail } = {};
        daysInMonthMeta.forEach((dm) => {
          if (!dm.isSunday) {
            nextMap[dm.day] = {
              day: dm.day,
              dateStr: dm.dateStr,
              workUnits: 1,
              statusType: 'FULL',
              otHours: emp.monthlyAttendance?.[monthKey]?.days?.[dm.day]?.otHours || 0,
              updatedAt: new Date().toISOString(),
            };
          }
        });
        const totals = calculateRowTotalsFromDays(nextMap);
        return recomputeEmployeePayroll({
          ...emp,
          actualWorkDays: totals.totalCong,
          overtimeHours: totals.totalOT,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          selectedForAttendance: true,
          monthlyAttendance: {
            ...(emp.monthlyAttendance || {}),
            [monthKey]: {
              monthKey,
              month: currentMonth,
              year: currentYear,
              totalWorkDays: totals.totalCong,
              totalOtHours: totals.totalOT,
              days: nextMap,
            },
          },
        });
      });
      setModifiedEmployees(updatedList);
      onBatchUpdate(updatedList);
      setToastMessage(
        `Đã chấm đủ công tháng ${currentMonth}/${currentYear} cho toàn bộ ${activeEmployees.length} nhân viên — Bản Lương đã tự động nhảy lương!`
      );
    }
  };

  // Xuất file Excel Bảng Chấm Công Timeline
  const handleExportExcel = () => {
    const rows: Record<string, any>[] = [];
    groupedSections.forEach((sec) => {
      sec.items.forEach((item) => {
        const rowObj: Record<string, any> = {
          'Phòng ban / Bộ phận': sec.groupName,
          'Mã NV': item.code,
          'Họ và tên': item.fullName,
        };
        daysInMonthMeta.forEach((dm) => {
          const dRec = item.daysMap[dm.day];
          let cellText = '-';
          if (dRec) {
            if (dRec.statusType === 'LEAVE') cellText = 'NP';
            else if (dRec.statusType === 'ABSENT') cellText = 'VM';
            else if (dRec.statusType === 'LATE') cellText = 'ĐM';
            else if (dRec.workUnits === 1) cellText = '1';
            else if (dRec.workUnits === 0.5) cellText = '0.5';
            if ((dRec.otHours || 0) > 0) {
              cellText += ` (+${dRec.otHours}h)`;
            }
          }
          rowObj[`${dm.day} (${dm.dayOfWeek})`] = cellText;
        });
        rowObj['Công'] = item.totals.totalCong;
        rowObj['VM'] = item.totals.totalVM;
        rowObj['ĐM'] = item.totals.totalDM;
        rowObj['NP'] = item.totals.totalNP;
        rowObj['Giờ TC'] = item.totals.totalOT;
        rows.push(rowObj);
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Timeline_T${currentMonth}_${currentYear}`);
    XLSX.writeFile(
      wb,
      `Bang_Cham_Cong_Timeline_Thang_${currentMonth}_${currentYear}.xlsx`
    );
    setToastMessage('Đã tải file Excel Bảng Chấm Công Timeline thành công!');
  };

  // Danh sách nhân sự để truyền vào Modal tạo Link Chấm Công Di Động (hỗ trợ cả NV Chính Thức & Thời Vụ)
  const shareableWorkers: SeasonalWorker[] = useMemo(() => {
    if (attendanceGroup === 'PERMANENT') {
      return activeEmployees.map((e) => ({
        id: e.code || `PERM_${e.id}`,
        code: e.code,
        fullName: e.fullName,
        trade: e.title || 'Nhân viên chính thức',
        skillLevel: e.department || 'Chính thức',
        project: e.department || 'Văn phòng / Dự án',
        teamName: e.department || 'Phòng ban',
        teamLeader: '',
        phone: e.phone || '',
        idCard: e.idCard || '',
        bankAccount: e.bankAccount || '',
        bankName: e.bankName || '',
        paymentMethod: 'BANK',
        joinDate: e.joinDate || '',
        dailyRate:
          e.salaryType === 'DAILY'
            ? e.baseSalary
            : Math.round((e.baseSalary || 0) / (e.standardWorkDays || config.standardWorkDays || 26)),
        actualWorkDays: e.actualWorkDays || 0,
        salaryByDays: e.salaryByActualDays || 0,
        overtimeHours: e.overtimeHours || 0,
        overtimePay: e.overtimePay || 0,
        mealAllowance: e.mealAllowance || 0,
        travelSafetyAllowance: e.phoneTravelAllowance || 0,
        otherBonus: e.kpiBonus || 0,
        totalIncome: e.totalIncome || 0,
        hasTaxCommitment: true,
        personalIncomeTax: e.personalIncomeTax || 0,
        advancePayment: e.advancePayment || 0,
        totalDeductions: e.totalDeductions || 0,
        netSalary: e.netSalary || 0,
        status: 'ACTIVE',
        monthlyAttendance: e.monthlyAttendance,
        periodRecords: e.periodRecords,
        payrollCycleType: e.payrollCycleType || '1_MONTH',
        currentPeriodKey: e.currentPeriodKey,
      }));
    }
    return activeSeasonal.map((w) => ({
      ...w,
      id: w.code || `SEAS_${w.id}`,
    }));
  }, [activeEmployees, activeSeasonal, attendanceGroup, config.standardWorkDays]);

  const activeEditingDayDetail = useMemo(() => {
    if (!editingCell) return null;
    const map = getCurrentDaysMapForWorker(editingCell.workerCode);
    return map[editingCell.day] || null;
  }, [editingCell, groupedSections]);

  const participatingCount = useMemo(() => {
    let count = 0;
    groupedSections.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.isParticipating) count++;
      });
    });
    return count;
  }, [groupedSections]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
      {/* Thanh công cụ gọn nhẹ: Tìm kiếm nhân viên chấm công & Lọc theo Tháng / Năm */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Ô tìm kiếm nhanh nhân viên chấm công */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm nhanh tên hoặc mã nhân viên chấm công..."
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0f3d64] rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bộ lọc Tháng / Năm */}
        <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 gap-1">
          <button
            type="button"
            onClick={() => {
              if (currentMonth === 1) onChangeMonthYear(12, currentYear - 1);
              else onChangeMonthYear(currentMonth - 1, currentYear);
            }}
            className="w-6 h-6 rounded hover:bg-white hover:shadow-2xs flex items-center justify-center text-slate-600 cursor-pointer transition"
            title="Tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 px-2 text-xs font-semibold text-slate-800">
            <span>tháng</span>
            <select
              value={currentMonth}
              onChange={(e) => onChangeMonthYear(Number(e.target.value), currentYear)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m < 10 ? `0${m}` : m}
                </option>
              ))}
            </select>
            <span>năm</span>
            <select
              value={currentYear}
              onChange={(e) => onChangeMonthYear(currentMonth, Number(e.target.value))}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              if (currentMonth === 12) onChangeMonthYear(1, currentYear + 1);
              else onChangeMonthYear(currentMonth + 1, currentYear);
            }}
            className="w-6 h-6 rounded hover:bg-white hover:shadow-2xs flex items-center justify-center text-slate-600 cursor-pointer transition"
            title="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Nút Lưu & Đồng bộ Supabase nhanh cho Bản Chấm Công */}
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() ? (
            <button
              type="button"
              onClick={async () => {
                if (attendanceGroup === 'SEASONAL') {
                  onBatchUpdateSeasonal?.(modifiedSeasonal);
                } else {
                  onBatchUpdate(modifiedEmployees);
                }
                if (onManualSync) {
                  await onManualSync();
                }
                setToastMessage(
                  `Đã lưu & đồng bộ toàn bộ dữ liệu chấm công Tháng ${currentMonth}/${currentYear} lên Supabase Cloud!`
                );
              }}
              disabled={cloudSyncStatus === 'syncing'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer disabled:opacity-60"
              title="Đẩy toàn bộ dữ liệu chấm công hiện tại lên Supabase Cloud để đồng bộ sang các máy tính khác"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>{cloudSyncStatus === 'syncing' ? 'Đang lưu Supabase...' : 'Lưu & Đồng bộ Supabase'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenSupabaseModal?.()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition cursor-pointer"
              title="Kết nối Supabase để đồng bộ dữ liệu chấm công giữa nhiều máy tính"
            >
              <Cloud className="w-3.5 h-3.5 text-amber-600" />
              <span>Chưa nối Supabase (Bấm để kết nối)</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BẢNG MA TRẬN TIMELINE CHẤM CÔNG THEO NGÀY (1 -> 30/31) */}
      {/* ===================================================================== */}
      <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[680px] shadow-2xs bg-white">
        <table className="w-full border-collapse text-left select-none">
          <thead className="sticky top-0 z-30 bg-[#f8fafc] border-b border-slate-200 text-[11px]">
            <tr>
              {/* Cột Nhân sự cố định bên trái */}
              <th className="py-2.5 px-3 sticky left-0 z-40 bg-[#f8fafc] min-w-[235px] text-left font-bold text-slate-700 border-r border-slate-200/80">
                Nhân sự &amp; Trạng thái chấm công
              </th>

              {/* Các cột ngày 1 -> 30/31 */}
              {daysInMonthMeta.map((dm) => (
                <th
                  key={dm.day}
                  className={`py-1.5 px-0.5 text-center min-w-[32px] w-8 font-normal ${
                    dm.isToday ? 'bg-amber-100/80 ring-1 ring-amber-400' : ''
                  }`}
                  title={dm.isToday ? `Hôm nay: ${dm.dateStr}` : dm.dateStr}
                >
                  <div
                    className={`font-bold text-[11px] leading-tight ${
                      dm.isToday ? 'text-[#e85d2a] font-black underline' : 'text-slate-700'
                    }`}
                  >
                    {dm.day}
                  </div>
                  <div
                    className={`text-[10px] leading-tight mt-0.5 ${
                      dm.isToday
                        ? 'text-[#e85d2a] font-bold'
                        : dm.isWeekend
                        ? 'text-red-500 font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {dm.dayOfWeek}
                  </div>
                </th>
              ))}

              {/* 6 Cột Tổng Hợp Bên Phải: Công | VM | ĐM | NP | Giờ TC | Thực lĩnh (Bản Lương) */}
              <th className="py-2 px-1 text-center min-w-[44px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#e85d2a] text-white font-bold text-[10px] shadow-2xs">
                  Công
                </span>
              </th>
              <th className="py-2 px-1 text-center min-w-[40px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#e85d2a] text-white font-bold text-[10px] shadow-2xs">
                  VM
                </span>
              </th>
              <th className="py-2 px-1 text-center min-w-[40px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#e85d2a] text-white font-bold text-[10px] shadow-2xs">
                  ĐM
                </span>
              </th>
              <th className="py-2 px-1 text-center min-w-[40px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#e85d2a] text-white font-bold text-[10px] shadow-2xs">
                  NP
                </span>
              </th>
              <th className="py-2 px-1.5 text-center min-w-[52px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#e85d2a] text-white font-bold text-[10px] shadow-2xs">
                  Giờ TC
                </span>
              </th>
              <th className="py-2 px-2 text-right min-w-[105px]">
                <span className="inline-block w-full py-0.5 px-1.5 rounded bg-[#0f3d64] text-white font-bold text-[10px] shadow-2xs text-center">
                  Lương (Bản Lương)
                </span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs">
            {groupedSections.map((section) => (
              <React.Fragment key={section.groupName}>
                {/* DÒNG TIÊU ĐỀ PHÒNG BAN / BỘ PHẬN */}
                <tr className="bg-white">
                  <td
                    colSpan={daysInMonthMeta.length + 7}
                    className="pt-4 pb-1.5 px-3 font-extrabold text-xs sm:text-sm text-slate-800 uppercase tracking-wide border-b-2 border-[#e86c3a]"
                  >
                    {section.groupName}
                  </td>
                </tr>

                {/* CÁC DÒNG NHÂN SỰ TRONG PHÒNG BAN */}
                {section.items.map((worker, wIdx) => {
                  const initials = getInitials(worker.fullName);

                  return (
                    <tr
                      key={`${worker.code || worker.id}_${wIdx}`}
                      className="hover:bg-orange-50/30 transition-colors group"
                    >
                      {/* Cột Nhân Sự + Trạng thái Tham gia chấm công (Sticky Left) */}
                      <td className="py-1.5 px-2.5 sticky left-0 z-20 bg-white group-hover:bg-orange-50/40 border-r border-slate-100">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs ${
                                worker.isParticipating ? 'bg-[#e86c3a]' : 'bg-slate-400'
                              }`}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate leading-tight">
                                <span className="font-bold text-slate-800 text-[12px]">
                                  {worker.fullName}
                                </span>{' '}
                                <span className="text-slate-500 font-medium text-[10px]">
                                  ({worker.code})
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (worker.isParticipating && worker.totals.totalCong > 0) {
                                      handleClearMonthForWorker(worker.code);
                                    } else {
                                      handleFillFullMonthForWorker(worker.code);
                                    }
                                  }}
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition cursor-pointer inline-flex items-center gap-1 ${
                                    worker.isParticipating
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                                  }`}
                                  title={
                                    worker.isParticipating
                                      ? 'Nhân viên đang tham gia chấm công (Đã tự động nhảy lương bên Bản Lương). Bấm để xóa trắng công.'
                                      : 'Nhân viên chưa chấm công. Bấm vào đây để bật Tham gia chấm công (đủ công chuẩn) và nhảy lương ngay!'
                                  }
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      worker.isParticipating ? 'bg-emerald-500' : 'bg-slate-400'
                                    }`}
                                  />
                                  <span>
                                    {worker.isParticipating
                                      ? 'Tham gia chấm công'
                                      : 'Chưa chấm công (Bấm để chấm)'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Nút lấy link chấm công cá nhân nhanh khi rê chuột */}
                          <button
                            type="button"
                            onClick={() => {
                              setShareModalTargetId(String(worker.code));
                              setIsShareModalOpen(true);
                            }}
                            className="opacity-60 group-hover:opacity-100 p-1 rounded hover:bg-emerald-50 text-emerald-600 transition cursor-pointer shrink-0"
                            title={`Gửi link chấm công cá nhân cho ${worker.fullName}`}
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Các ô ngày 1 -> 30/31 (Icon nhỏ gọn giống mẫu Timeline) */}
                      {daysInMonthMeta.map((dm) => {
                        const dRec = worker.daysMap[dm.day];
                        const status: DayStatusType = dRec
                          ? dRec.statusType === 'LEAVE'
                            ? 'LEAVE'
                            : dRec.statusType === 'ABSENT'
                            ? 'ABSENT'
                            : dRec.statusType === 'LATE'
                            ? 'LATE'
                            : dRec.workUnits === 1
                            ? 'FULL'
                            : dRec.workUnits === 0.5
                            ? 'HALF'
                            : 'NONE'
                          : 'NONE';

                        const otHours = Number(dRec?.otHours || 0);
                        const isSelectedCell =
                          editingCell?.workerCode === worker.code &&
                          editingCell?.day === dm.day;

                        return (
                          <td
                            key={dm.day}
                            className={`p-0.5 text-center align-middle relative ${
                              dm.isToday ? 'bg-amber-50/50' : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setEditingCell({
                                  workerCode: worker.code,
                                  workerName: worker.fullName,
                                  day: dm.day,
                                  dateStr: dm.dateStr,
                                  dayOfWeek: dm.dayOfWeek,
                                })
                              }
                              title={`${worker.fullName} - Ngày ${dm.dateStr} (${dm.dayOfWeek}): ${
                                status === 'FULL'
                                  ? '1.0 công'
                                  : status === 'HALF'
                                  ? '0.5 công'
                                  : status === 'ABSENT'
                                  ? 'Vắng mặt (VM)'
                                  : status === 'LEAVE'
                                  ? 'Nghỉ phép (NP)'
                                  : status === 'LATE'
                                  ? 'Đi muộn (ĐM)'
                                  : 'Chưa chấm'
                              }${otHours > 0 ? ` + ${otHours}h tăng ca` : ''}`}
                              className={`w-7 h-7 mx-auto rounded-md flex items-center justify-center relative cursor-pointer transition-all ${
                                isSelectedCell
                                  ? 'ring-2 ring-[#e85d2a] scale-110 z-20'
                                  : 'hover:scale-105'
                              } ${
                                status === 'FULL' || status === 'HALF'
                                  ? 'bg-[#4caf50] text-white shadow-2xs'
                                  : status === 'ABSENT'
                                  ? 'bg-[#ef5350] text-white shadow-2xs'
                                  : status === 'LEAVE'
                                  ? 'bg-[#2196f3] text-white shadow-2xs'
                                  : status === 'LATE'
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : dm.isWeekend
                                  ? 'bg-slate-100/90 text-slate-400 hover:bg-slate-200/70'
                                  : 'bg-slate-50/90 text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {status === 'FULL' && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                              {status === 'HALF' && (
                                <span className="text-[11px] font-extrabold leading-none">
                                  ½
                                </span>
                              )}
                              {status === 'ABSENT' && (
                                <X className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                              {status === 'LEAVE' && (
                                <Calendar className="w-3.5 h-3.5 stroke-[2.5]" />
                              )}
                              {status === 'LATE' && (
                                <span className="text-[9px] font-black leading-none">
                                  ĐM
                                </span>
                              )}
                              {status === 'NONE' && (
                                <span className="text-[11px] font-bold text-slate-400 leading-none">
                                  ·
                                </span>
                              )}

                              {/* Badge số giờ tăng ca (OT) màu cam ở góc trên bên phải */}
                              {otHours > 0 && (
                                <span className="absolute -top-1.5 -right-1 bg-[#f57c00] text-white text-[8px] font-extrabold px-1 py-0 rounded-full leading-tight shadow-2xs border border-white/60">
                                  {otHours}h
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* 6 Cột Tổng Hợp Cuối Dòng: Công | VM | ĐM | NP | Giờ TC | Thực lĩnh (Bản Lương) */}
                      <td className="py-1.5 px-1 text-center">
                        <span className="inline-block w-full py-1 px-1 rounded-md bg-emerald-50 text-emerald-600 font-extrabold text-[11px]">
                          {worker.totals.totalCong}
                        </span>
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="inline-block w-full py-1 px-1 rounded-md bg-rose-50 text-rose-600 font-extrabold text-[11px]">
                          {worker.totals.totalVM}
                        </span>
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="inline-block w-full py-1 px-1 rounded-md bg-amber-50 text-amber-600 font-extrabold text-[11px]">
                          {worker.totals.totalDM}
                        </span>
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="inline-block w-full py-1 px-1 rounded-md bg-sky-50 text-sky-600 font-extrabold text-[11px]">
                          {worker.totals.totalNP}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <span className="inline-block w-full py-1 px-1 rounded-md bg-orange-50 text-orange-600 font-extrabold text-[11px]">
                          {worker.totals.totalOT}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <span
                          className={`inline-block w-full py-1 px-1.5 rounded-md font-extrabold text-[11px] font-mono ${
                            worker.netSalary > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-50 text-slate-400'
                          }`}
                          title="Lương thực lĩnh tự động đồng bộ sang Bản Lương"
                        >
                          {worker.netSalary > 0 ? `${formatNumberOnly(worker.netSalary)} đ` : '0 đ'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===================================================================== */}
      {/* HỘP THOẠI NHỎ (MINI POPOVER MODAL) KHI BẤM VÀO 1 Ô NGÀY TRÊN TIMELINE */}
      {/* ===================================================================== */}
      {editingCell && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setEditingCell(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  {editingCell.workerName} ({editingCell.workerCode})
                </div>
                <div className="text-[11px] font-semibold text-[#e85d2a]">
                  Ngày {editingCell.dateStr} ({editingCell.dayOfWeek})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Chọn trạng thái ngày công */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 block">
                1. Chấm công ngày {editingCell.day}/{currentMonth}:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'FULL'
                    )
                  }
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeEditingDayDetail?.workUnits === 1 &&
                    activeEditingDayDetail?.statusType !== 'LATE'
                      ? 'bg-[#4caf50] text-white border-[#4caf50] shadow-xs'
                      : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Đủ công (1)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'HALF'
                    )
                  }
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeEditingDayDetail?.workUnits === 0.5
                      ? 'bg-[#4caf50] text-white border-[#4caf50] shadow-xs'
                      : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span className="font-black">½</span>
                  <span>Nửa ca (0.5)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'ABSENT'
                    )
                  }
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeEditingDayDetail?.statusType === 'ABSENT'
                      ? 'bg-[#ef5350] text-white border-[#ef5350] shadow-xs'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <X className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Vắng (VM)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'LEAVE'
                    )
                  }
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeEditingDayDetail?.statusType === 'LEAVE'
                      ? 'bg-[#2196f3] text-white border-[#2196f3] shadow-xs'
                      : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Nghỉ phép (NP)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'LATE'
                    )
                  }
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    activeEditingDayDetail?.statusType === 'LATE'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>Đi muộn (ĐM)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectDayStatus(
                      editingCell.workerCode,
                      editingCell.day,
                      editingCell.dateStr,
                      'NONE'
                    )
                  }
                  className="py-2 px-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition"
                >
                  <span>Xóa trống (-)</span>
                </button>
              </div>
            </div>

            {/* 2. Chọn nhanh số giờ tăng ca (Giờ TC / OT) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#f57c00]" />
                  <span>2. Giờ tăng ca (Giờ TC):</span>
                </label>
                <span className="text-xs font-extrabold text-[#f57c00]">
                  {activeEditingDayDetail?.otHours || 0} giờ
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 8].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      handleSelectDayOtHours(
                        editingCell.workerCode,
                        editingCell.day,
                        editingCell.dateStr,
                        h
                      )
                    }
                    className={`py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                      (activeEditingDayDetail?.otHours || 0) === h
                        ? 'bg-[#f57c00] text-white border-[#f57c00] shadow-2xs'
                        : 'bg-orange-50/60 text-orange-800 border-orange-200 hover:bg-orange-100'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Thao tác nhanh cho cả dòng nhân sự này */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleFillFullMonthForWorker(editingCell.workerCode)}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chấm đủ tháng (T2-T7)</span>
              </button>

              <button
                type="button"
                onClick={() => handleClearMonthForWorker(editingCell.workerCode)}
                className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Xóa dòng</span>
              </button>

              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="py-1.5 px-3 rounded-lg bg-[#0f3d64] hover:bg-sky-900 text-white text-[11px] font-bold cursor-pointer transition"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chia sẻ Link & QR Chấm Công Di Động */}
      <MobileAttendanceShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        workers={shareableWorkers}
        config={config}
        selectedWorkerId={shareModalTargetId}
        onOpenMobileView={onOpenMobileView}
      />

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
