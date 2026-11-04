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
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import { recomputeSeasonalWorkerPayroll, getDayOfWeekInfo } from '../data/mockSeasonalWorkers';
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
  Users,
  HardHat,
  Building,
  RotateCcw,
  Zap,
  Clock,
} from 'lucide-react';
import { MobileAttendanceShareModal } from './MobileAttendanceShareModal';

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
}

type DayStatusType = 'FULL' | 'HALF' | 'ABSENT' | 'LEAVE' | 'LATE' | 'NONE';

interface DayMeta {
  day: number;
  dateStr: string;
  dateLabel: string;
  dayOfWeek: string;
  isWeekend: boolean; // T7 or CN
  isSunday: boolean;
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
  actualWorkDays: number,
  overtimeHours: number,
  paidLeaveDays: number = 0,
  unpaidLeaveDays: number = 0
): { [dayNumber: number]: DailyAttendanceDetail } {
  if (existingRecord && existingRecord.days && Object.keys(existingRecord.days).length > 0) {
    return existingRecord.days;
  }

  // Nếu nhân sự chưa có công và chưa có OT -> để trống toàn bộ (-)
  if ((actualWorkDays || 0) <= 0 && (overtimeHours || 0) <= 0 && (paidLeaveDays || 0) <= 0 && (unpaidLeaveDays || 0) <= 0) {
    return {};
  }

  const generated: { [dayNumber: number]: DailyAttendanceDetail } = {};
  let remWork = Math.max(0, Number(actualWorkDays) || 0);
  let remLeave = Math.max(0, Math.round(Number(paidLeaveDays) || 0));
  let remAbsent = Math.max(0, Math.round(Number(unpaidLeaveDays) || 0));
  let remOt = Math.max(0, Math.round(Number(overtimeHours) || 0));

  // Phân bổ ngày phép (NP) và vắng mặt (VM) trước, sau đó phân bổ ngày công (T2 -> T7)
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

  // Nếu vẫn còn công lẻ (do làm cả Chủ Nhật)
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

  // Phân bổ giờ tăng ca (OT) đều lên các ngày đi làm (tối đa 3h-4h/ngày thường, hoặc 8h Chủ Nhật)
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
  teamWorkers = [],
  config,
  onChangeMonthYear,
  onBatchUpdate,
  onBatchUpdateSeasonal,
  onOpenMobileView,
  forcedGroup,
}) => {
  const [attendanceGroup, setAttendanceGroup] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>(
    forcedGroup || 'PERMANENT'
  );

  useEffect(() => {
    if (forcedGroup) {
      setAttendanceGroup(forcedGroup);
    }
  }, [forcedGroup]);

  const [modifiedEmployees, setModifiedEmployees] = useState<Employee[]>(employees);
  const [modifiedSeasonal, setModifiedSeasonal] = useState<SeasonalWorker[]>(seasonalWorkers);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
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
    setModifiedEmployees(employees);
  }, [employees]);

  useEffect(() => {
    setModifiedSeasonal(seasonalWorkers);
  }, [seasonalWorkers]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const currentMonth = config.month || 11;
  const currentYear = config.year || 2026;
  const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

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
      });
    }
    return list;
  }, [currentMonth, currentYear]);

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
    if (attendanceGroup === 'PERMANENT') {
      const filtered =
        selectedDepartment === 'ALL'
          ? activeEmployees
          : activeEmployees.filter((e) => e.department === selectedDepartment);

      const groupsMap = new Map<string, Employee[]>();
      filtered.forEach((emp) => {
        const dept = emp.department || 'Phòng ban chung';
        if (!groupsMap.has(dept)) groupsMap.set(dept, []);
        groupsMap.get(dept)!.push(emp);
      });

      return Array.from(groupsMap.entries()).map(([groupName, items]) => ({
        groupName,
        items: items.map((e) => {
          const daysMap = ensureMonthlyDaysForWorker(
            e.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            e.actualWorkDays || 0,
            e.overtimeHours || 0,
            e.paidLeaveDays || 0,
            e.unpaidLeaveDays || 0
          );
          const totals = calculateRowTotalsFromDays(daysMap);
          return {
            id: e.id,
            code: e.code,
            fullName: e.fullName,
            group: e.department,
            daysMap,
            totals,
            rawEmployee: e,
          };
        }),
      }));
    } else {
      const filtered =
        selectedDepartment === 'ALL'
          ? activeSeasonal
          : activeSeasonal.filter(
              (w) => (w.project || w.teamName || w.trade || 'Công trình thi công') === selectedDepartment
            );

      const groupsMap = new Map<string, SeasonalWorker[]>();
      filtered.forEach((w) => {
        const grp = w.project || w.teamName || w.trade || 'Công trình thi công';
        if (!groupsMap.has(grp)) groupsMap.set(grp, []);
        groupsMap.get(grp)!.push(w);
      });

      return Array.from(groupsMap.entries()).map(([groupName, items]) => ({
        groupName,
        items: items.map((w) => {
          const daysMap = ensureMonthlyDaysForWorker(
            w.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            w.actualWorkDays || 0,
            w.overtimeHours || 0,
            0,
            0
          );
          const totals = calculateRowTotalsFromDays(daysMap);
          return {
            id: w.id,
            code: w.code,
            fullName: w.fullName,
            group: grpNameOrTrade(w),
            daysMap,
            totals,
            rawSeasonal: w,
          };
        }),
      }));
    }
  }, [
    attendanceGroup,
    selectedDepartment,
    activeEmployees,
    activeSeasonal,
    monthKey,
    currentMonth,
    currentYear,
    daysInMonthMeta,
  ]);

  function grpNameOrTrade(w: SeasonalWorker) {
    return w.project || w.trade || 'Thời vụ';
  }

  // Cập nhật dữ liệu 1 dòng nhân sự (Lưu vào monthlyAttendance VÀ cập nhật trực tiếp Công + Giờ TC sang Bản Lương)
  const applyWorkerDaysMapUpdate = (
    workerCode: string,
    nextDaysMap: { [dayNumber: number]: DailyAttendanceDetail }
  ) => {
    const totals = calculateRowTotalsFromDays(nextDaysMap);
    const updatedMonthRecord: MonthlyAttendanceRecord = {
      monthKey,
      month: currentMonth,
      year: currentYear,
      totalWorkDays: totals.totalCong,
      totalOtHours: totals.totalOT,
      days: nextDaysMap,
      lastSubmittedAt: new Date().toISOString(),
      submittedBy: 'ADMIN',
    };

    if (attendanceGroup === 'PERMANENT') {
      const updatedList = modifiedEmployees.map((emp) => {
        if (emp.code === workerCode) {
          const currentBaseMap = ensureMonthlyDaysForWorker(
            emp.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            emp.actualWorkDays || 0,
            emp.overtimeHours || 0,
            emp.paidLeaveDays || 0,
            emp.unpaidLeaveDays || 0
          );
          const finalMap = { ...currentBaseMap, ...nextDaysMap };
          // Xóa những ngày bị đặt về NONE và 0h OT
          Object.keys(finalMap).forEach((k) => {
            const dNum = Number(k);
            const item = finalMap[dNum];
            if (!item || (item.workUnits === 0 && !item.statusType && (item.otHours || 0) === 0)) {
              delete finalMap[dNum];
            }
          });
          const recalcTotals = calculateRowTotalsFromDays(finalMap);

          const nextEmp: Employee = {
            ...emp,
            actualWorkDays: recalcTotals.totalCong,
            overtimeHours: recalcTotals.totalOT,
            paidLeaveDays: recalcTotals.totalNP,
            unpaidLeaveDays: recalcTotals.totalVM,
            monthlyAttendance: {
              ...(emp.monthlyAttendance || {}),
              [monthKey]: {
                ...updatedMonthRecord,
                totalWorkDays: recalcTotals.totalCong,
                totalOtHours: recalcTotals.totalOT,
                days: finalMap,
              },
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
          const currentBaseMap = ensureMonthlyDaysForWorker(
            w.monthlyAttendance?.[monthKey],
            currentMonth,
            currentYear,
            daysInMonthMeta,
            w.actualWorkDays || 0,
            w.overtimeHours || 0,
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

          const nextWorker: SeasonalWorker = {
            ...w,
            actualWorkDays: recalcTotals.totalCong,
            overtimeHours: recalcTotals.totalOT,
            monthlyAttendance: {
              ...(w.monthlyAttendance || {}),
              [monthKey]: {
                ...updatedMonthRecord,
                totalWorkDays: recalcTotals.totalCong,
                totalOtHours: recalcTotals.totalOT,
                days: finalMap,
              },
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
    applyWorkerDaysMapUpdate(workerCode, baseMap);
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
    applyWorkerDaysMapUpdate(workerCode, baseMap);
  };

  // Chấm nhanh đủ công cả tháng (T2 -> T7) cho 1 nhân sự
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
    applyWorkerDaysMapUpdate(workerCode, nextMap);
    setEditingCell(null);
    setToastMessage(`Đã chấm đủ công tháng ${currentMonth}/${currentYear} cho ${workerCode} và cập nhật Bản Lương!`);
  };

  // Xóa trắng toàn bộ ngày trong tháng của 1 nhân sự
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
            monthlyAttendance: {
              ...(emp.monthlyAttendance || {}),
              [monthKey]: {
                monthKey,
                month: currentMonth,
                year: currentYear,
                totalWorkDays: 0,
                totalOtHours: 0,
                days: {},
              },
            },
          });
        }
        return emp;
      });
      setModifiedEmployees(updatedList);
      onBatchUpdate(updatedList);
    } else {
      const updatedList = modifiedSeasonal.map((w) => {
        if (w.code === workerCode) {
          return recomputeSeasonalWorkerPayroll({
            ...w,
            actualWorkDays: 0,
            overtimeHours: 0,
            monthlyAttendance: {
              ...(w.monthlyAttendance || {}),
              [monthKey]: {
                monthKey,
                month: currentMonth,
                year: currentYear,
                totalWorkDays: 0,
                totalOtHours: 0,
                days: {},
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
    setToastMessage(`Đã xóa trắng công tháng ${currentMonth}/${currentYear} của ${workerCode}!`);
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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* ===================================================================== */}
      {/* THANH TIÊU ĐỀ TIMELINE (GIỐNG HỆT MẪU TIMELINE CHẤM CÔNG) */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
        {/* Bên trái: Icon Lịch Cam + Chữ Timeline */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#e85d2a] shadow-2xs">
            <Calendar className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#e85d2a] tracking-tight">
                Timeline
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {attendanceGroup === 'PERMANENT'
                  ? `Nhân Viên Chính Thức (${activeEmployees.length})`
                  : `Nhân Viên Thời Vụ (${activeSeasonal.length})`}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Nhấn vào từng ô ngày để chấm công / nhập giờ tăng ca (OT) — Tự động cộng tổng <strong className="text-slate-700">Công</strong> và <strong className="text-slate-700">Giờ TC</strong> cập nhật sang <strong className="text-[#e85d2a]">Bản Lương</strong>
            </p>
          </div>
        </div>

        {/* Bên phải: Lọc Phòng Ban + Điều hướng Tháng/Năm + Link Chấm Công + Tải Excel */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!forcedGroup && (
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setAttendanceGroup('PERMANENT');
                  setSelectedDepartment('ALL');
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition ${
                  attendanceGroup === 'PERMANENT'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                NV Chính Thức ({activeEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttendanceGroup('SEASONAL');
                  setSelectedDepartment('ALL');
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition ${
                  attendanceGroup === 'SEASONAL'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                NV Thời Vụ ({activeSeasonal.length})
              </button>
            </div>
          )}

          {/* Dropdown lọc Tất cả phòng ban */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 cursor-pointer min-w-[160px]"
          >
            <option value="ALL">
              {attendanceGroup === 'PERMANENT' ? 'Tất cả phòng ban' : 'Tất cả dự án / tổ đội'}
            </option>
            {departmentList.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Bộ chuyển đổi < tháng MM năm YYYY > */}
          <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 gap-1">
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

          {/* Nút gửi Link Chấm Công Điện Thoại */}
          <button
            type="button"
            onClick={() => {
              const firstCode =
                attendanceGroup === 'PERMANENT'
                  ? activeEmployees[0]?.code
                  : activeSeasonal[0]?.code;
              setShareModalTargetId(firstCode ? String(firstCode) : null);
              setIsShareModalOpen(true);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
            title="Lấy Link & Mã QR gửi cho mọi người chấm công trên điện thoại"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Link Chấm Công</span>
          </button>

          {/* Nút Tải Excel màu cam giống mẫu */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-[#e85d2a] hover:bg-[#d14e1f] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải Excel</span>
          </button>
        </div>
      </div>

      {/* Chú thích nhanh các ký hiệu icon nhỏ */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-700">Ký hiệu:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-[#4caf50] text-white inline-flex items-center justify-center text-[9px] font-bold">
              ✓
            </span>
            <span>Đủ công (1.0)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-[#4caf50] text-white inline-flex items-center justify-center text-[9px] font-bold">
              ½
            </span>
            <span>Nửa công (0.5)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-[#ef5350] text-white inline-flex items-center justify-center text-[9px] font-bold">
              ✕
            </span>
            <span>Vắng mặt (VM)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-[#2196f3] text-white inline-flex items-center justify-center text-[9px] font-bold">
              📅
            </span>
            <span>Nghỉ phép (NP)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-amber-500 text-white inline-flex items-center justify-center text-[8px] font-bold">
              ĐM
            </span>
            <span>Đi muộn (ĐM)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1 py-0.2 rounded-full bg-[#f57c00] text-white text-[9px] font-bold">
              3h
            </span>
            <span>Giờ tăng ca (Giờ TC)</span>
          </span>
        </div>
        <div className="text-[11px] font-semibold text-emerald-700">
          ✓ Tổng Công & Giờ TC tự động cập nhật sang Bản Lương
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
              <th className="py-2.5 px-3 sticky left-0 z-40 bg-[#f8fafc] min-w-[215px] text-center font-bold text-slate-700 border-r border-slate-200/80">
                Nhân sự
              </th>

              {/* Các cột ngày 1 -> 30/31 */}
              {daysInMonthMeta.map((dm) => (
                <th
                  key={dm.day}
                  className="py-1.5 px-0.5 text-center min-w-[32px] w-8 font-normal"
                >
                  <div className="font-bold text-slate-700 text-[11px] leading-tight">
                    {dm.day}
                  </div>
                  <div
                    className={`text-[10px] leading-tight mt-0.5 ${
                      dm.isWeekend ? 'text-red-500 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {dm.dayOfWeek}
                  </div>
                </th>
              ))}

              {/* 5 Cột Tổng Hợp Bên Phải: Công | VM | ĐM | NP | Giờ TC */}
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
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs">
            {groupedSections.map((section) => (
              <React.Fragment key={section.groupName}>
                {/* DÒNG TIÊU ĐỀ PHÒNG BAN / BỘ PHẬN */}
                <tr className="bg-white">
                  <td
                    colSpan={daysInMonthMeta.length + 6}
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
                      {/* Cột Nhân Sự (Sticky Left) */}
                      <td className="py-2 px-2.5 sticky left-0 z-20 bg-white group-hover:bg-orange-50/40 border-r border-slate-100">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-[#e86c3a] text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                              {initials}
                            </div>
                            <div className="truncate">
                              <span className="font-bold text-slate-800 text-[12px]">
                                {worker.fullName}
                              </span>{' '}
                              <span className="text-slate-500 font-medium text-[11px]">
                                ({worker.code})
                              </span>
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
                            className="p-0.5 text-center align-middle relative"
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

                      {/* 5 Cột Tổng Hợp Cuối Dòng: Công | VM | ĐM | NP | Giờ TC */}
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
