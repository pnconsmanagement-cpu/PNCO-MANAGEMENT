import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Building,
  Users,
  TrendingUp,
  Download,
  Printer,
  DollarSign,
  ShieldCheck,
  CreditCard,
  Layers,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, SeasonalWorker, TeamWorker, Project, SalaryAdvance, CompanyConfig } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';
import {
  getPayrollPeriods,
  getWorkerForPeriod,
  syncSeasonalWorkerForMonth,
} from '../data/mockSeasonalWorkers';
import { syncEmployeeForMonth } from '../utils/payrollCalculator';

interface FinancialReportTabProps {
  employees?: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  projects?: Project[];
  advances?: SalaryAdvance[];
  config: CompanyConfig;
  onChangeMonthYear?: (month: number, year: number) => void;
}

interface PeriodBreakdownRow {
  id: string;
  systemType: '1_WEEK' | '2_WEEKS' | '1_MONTH';
  systemLabel: string;
  periodLabel: string;
  dateRangeLabel: string;
  workerCount: number;
  totalWorkDays: number;
  totalOtHours: number;
  salaryByDays: number;
  overtimePay: number;
  allowancesAndBonus: number;
  totalIncome: number;
  deductions: number;
  netSalary: number;
}

export const FinancialReportTab: React.FC<FinancialReportTabProps> = ({
  employees = [],
  seasonalWorkers = [],
  teamWorkers = [],
  projects = [],
  advances = [],
  config,
  onChangeMonthYear,
}) => {
  // Tháng & Năm đang lọc để xem thống kê lương
  const [selectedMonth, setSelectedMonth] = useState<number>(() => config.month || 11);
  const [selectedYear, setSelectedYear] = useState<number>(() => config.year || 2026);

  useEffect(() => {
    if (config.month) setSelectedMonth(config.month);
    if (config.year) setSelectedYear(config.year);
  }, [config.month, config.year]);

  // Lựa chọn bộ lọc thời gian tổng hợp: Tháng đang chọn, Quý (Q1, Q2, Q3, Q4) hoặc Cả năm
  const [timeViewMode, setTimeViewMode] = useState<'MONTH' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEAR'>('MONTH');
  // Lựa chọn dự án: Tất cả hoặc từng dự án cụ thể
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('ALL');
  // Bộ lọc hệ lương trong bảng thống kê chi tiết
  const [cycleSystemFilter, setCycleSystemFilter] = useState<'ALL' | '1_WEEK' | '2_WEEKS' | '1_MONTH'>('ALL');
  // Chỉ hiện các kỳ có phát sinh lương (> 0đ) hoặc hiện tất cả các tuần/đợt trong tháng
  const [onlyActivePeriods, setOnlyActivePeriods] = useState<boolean>(false);

  const handleSelectMonthYear = (nextMonth: number, nextYear: number) => {
    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
    setTimeViewMode('MONTH');
    if (onChangeMonthYear) {
      onChangeMonthYear(nextMonth, nextYear);
    }
  };

  const handleStepMonth = (dir: 'PREV' | 'NEXT') => {
    let m = selectedMonth + (dir === 'NEXT' ? 1 : -1);
    let y = selectedYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    handleSelectMonthYear(m, y);
  };

  // Đồng bộ dữ liệu nhân viên chính thức và công nhân thời vụ theo đúng Tháng/Năm đang lọc
  const syncedEmployeesForSelectedMonth = useMemo(() => {
    const stdDays = config.standardWorkDays || 26;
    return employees.map((e) => syncEmployeeForMonth(e, selectedMonth, selectedYear, stdDays));
  }, [employees, selectedMonth, selectedYear, config.standardWorkDays]);

  const syncedSeasonalForSelectedMonth = useMemo(() => {
    return seasonalWorkers.map((w) => syncSeasonalWorkerForMonth(w, selectedMonth, selectedYear));
  }, [seasonalWorkers, selectedMonth, selectedYear]);

  // Hàm kiểm tra khớp bộ lọc dự án
  const matchesProject = (projName?: string) => {
    if (selectedProjectFilter === 'ALL') return true;
    if (!projName) return false;
    return projName.toLowerCase().includes(selectedProjectFilter.toLowerCase());
  };

  // ============================================================================
  // BẢNG THỐNG KÊ CHI TIẾT: LƯƠNG 1 TUẦN, LƯƠNG 2 TUẦN & LƯƠNG THÁNG THEO THÁNG
  // ============================================================================
  const cycleBreakdownStats = useMemo(() => {
    const activeSeasonal = syncedSeasonalForSelectedMonth.filter(
      (w) => (w.status || 'ACTIVE') === 'ACTIVE' && matchesProject(w.project)
    );

    // 1. HỆ LƯƠNG 1 TUẦN (Tuần 1 -> Tuần 5/6 của tháng đang chọn)
    const weeklyWorkers = activeSeasonal.filter((w) => (w.payrollCycleType || '1_MONTH') === '1_WEEK');
    const weeklyPeriods = getPayrollPeriods(selectedYear, selectedMonth, '1_WEEK');
    const weeklyRows: PeriodBreakdownRow[] = weeklyPeriods.map((period) => {
      let workerCount = 0;
      let totalWorkDays = 0;
      let totalOtHours = 0;
      let salaryByDays = 0;
      let overtimePay = 0;
      let allowancesAndBonus = 0;
      let totalIncome = 0;
      let deductions = 0;
      let netSalary = 0;

      weeklyWorkers.forEach((w) => {
        const wPeriod = getWorkerForPeriod(w, period);
        const days = Number(wPeriod.actualWorkDays || 0);
        const ot = Number(wPeriod.overtimeHours || 0);
        if (days > 0 || ot > 0) {
          workerCount += 1;
          totalWorkDays += days;
          totalOtHours += ot;
          salaryByDays += Number(wPeriod.salaryByDays || 0);
          overtimePay += Number(wPeriod.overtimePay || 0);
          allowancesAndBonus +=
            Number(wPeriod.mealAllowance || 0) +
            Number(wPeriod.travelSafetyAllowance || 0) +
            Number(wPeriod.otherBonus || 0);
          totalIncome += Number(wPeriod.totalIncome || 0);
          deductions += Number(wPeriod.totalDeductions || 0);
          netSalary += Number(wPeriod.netSalary || 0);
        }
      });

      return {
        id: period.periodKey,
        systemType: '1_WEEK',
        systemLabel: 'Lương 1 Tuần',
        periodLabel: period.shortLabel,
        dateRangeLabel: `${period.dates[0]} - ${period.dates[period.dates.length - 1]}`,
        workerCount,
        totalWorkDays: Math.round(totalWorkDays * 10) / 10,
        totalOtHours: Math.round(totalOtHours * 10) / 10,
        salaryByDays,
        overtimePay,
        allowancesAndBonus,
        totalIncome,
        deductions,
        netSalary,
      };
    });

    // 2. HỆ LƯƠNG 2 TUẦN (Đợt 1: 01-15 & Đợt 2: 16-Cuối tháng)
    const biWeeklyWorkers = activeSeasonal.filter((w) => (w.payrollCycleType || '1_MONTH') === '2_WEEKS');
    const biWeeklyPeriods = getPayrollPeriods(selectedYear, selectedMonth, '2_WEEKS');
    const biWeeklyRows: PeriodBreakdownRow[] = biWeeklyPeriods.map((period) => {
      let workerCount = 0;
      let totalWorkDays = 0;
      let totalOtHours = 0;
      let salaryByDays = 0;
      let overtimePay = 0;
      let allowancesAndBonus = 0;
      let totalIncome = 0;
      let deductions = 0;
      let netSalary = 0;

      biWeeklyWorkers.forEach((w) => {
        const wPeriod = getWorkerForPeriod(w, period);
        const days = Number(wPeriod.actualWorkDays || 0);
        const ot = Number(wPeriod.overtimeHours || 0);
        if (days > 0 || ot > 0) {
          workerCount += 1;
          totalWorkDays += days;
          totalOtHours += ot;
          salaryByDays += Number(wPeriod.salaryByDays || 0);
          overtimePay += Number(wPeriod.overtimePay || 0);
          allowancesAndBonus +=
            Number(wPeriod.mealAllowance || 0) +
            Number(wPeriod.travelSafetyAllowance || 0) +
            Number(wPeriod.otherBonus || 0);
          totalIncome += Number(wPeriod.totalIncome || 0);
          deductions += Number(wPeriod.totalDeductions || 0);
          netSalary += Number(wPeriod.netSalary || 0);
        }
      });

      return {
        id: period.periodKey,
        systemType: '2_WEEKS',
        systemLabel: 'Lương 2 Tuần',
        periodLabel: period.shortLabel,
        dateRangeLabel: `${period.dates[0]} - ${period.dates[period.dates.length - 1]}`,
        workerCount,
        totalWorkDays: Math.round(totalWorkDays * 10) / 10,
        totalOtHours: Math.round(totalOtHours * 10) / 10,
        salaryByDays,
        overtimePay,
        allowancesAndBonus,
        totalIncome,
        deductions,
        netSalary,
      };
    });

    // 3. HỆ LƯƠNG THÁNG (Công nhân Thời vụ Lương Tháng + Nhân sự Tổ Đội + Nhân viên Chính thức)
    const monthlyPeriod = getPayrollPeriods(selectedYear, selectedMonth, '1_MONTH')[0];
    const monthRangeStr = monthlyPeriod
      ? `${monthlyPeriod.dates[0]} - ${monthlyPeriod.dates[monthlyPeriod.dates.length - 1]}`
      : `01/${String(selectedMonth).padStart(2, '0')} - 30/${String(selectedMonth).padStart(2, '0')}`;

    const monthlySeasonalWorkers = activeSeasonal.filter(
      (w) =>
        (w.payrollCycleType || '1_MONTH') === '1_MONTH' &&
        (Number(w.actualWorkDays || 0) > 0 || Number(w.overtimeHours || 0) > 0)
    );
    const seasonalMonthRow: PeriodBreakdownRow = {
      id: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}_SEA_MONTH`,
      systemType: '1_MONTH',
      systemLabel: 'Lương Tháng',
      periodLabel: `Thời vụ Lương Tháng (T${selectedMonth}/${selectedYear})`,
      dateRangeLabel: monthRangeStr,
      workerCount: monthlySeasonalWorkers.length,
      totalWorkDays:
        Math.round(
          monthlySeasonalWorkers.reduce((s, w) => s + Number(w.actualWorkDays || 0), 0) * 10
        ) / 10,
      totalOtHours:
        Math.round(
          monthlySeasonalWorkers.reduce((s, w) => s + Number(w.overtimeHours || 0), 0) * 10
        ) / 10,
      salaryByDays: monthlySeasonalWorkers.reduce((s, w) => s + Number(w.salaryByDays || 0), 0),
      overtimePay: monthlySeasonalWorkers.reduce((s, w) => s + Number(w.overtimePay || 0), 0),
      allowancesAndBonus: monthlySeasonalWorkers.reduce(
        (s, w) =>
          s +
          Number(w.mealAllowance || 0) +
          Number(w.travelSafetyAllowance || 0) +
          Number(w.otherBonus || 0),
        0
      ),
      totalIncome: monthlySeasonalWorkers.reduce((s, w) => s + Number(w.totalIncome || 0), 0),
      deductions: monthlySeasonalWorkers.reduce((s, w) => s + Number(w.totalDeductions || 0), 0),
      netSalary: monthlySeasonalWorkers.reduce((s, w) => s + Number(w.netSalary || 0), 0),
    };

    const activeSeasonalTeams = activeSeasonal.filter(
      (w) =>
        w.payrollCycleType === 'TEAM' &&
        (Boolean(w.selectedForAttendance) ||
          Number(w.actualWorkDays || 0) > 0 ||
          Number(w.totalIncome || 0) > 0)
    );
    const teamMonthRow: PeriodBreakdownRow = {
      id: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}_TEAM_MONTH`,
      systemType: '1_MONTH',
      systemLabel: 'Lương Tháng',
      periodLabel: `Bản Lương Tổ Đội (T${selectedMonth}/${selectedYear})`,
      dateRangeLabel: monthRangeStr,
      workerCount: activeSeasonalTeams.length,
      totalWorkDays: activeSeasonalTeams.length,
      totalOtHours:
        Math.round(
          activeSeasonalTeams.reduce((s, w) => s + Number(w.overtimeHours || 0), 0) * 10
        ) / 10,
      salaryByDays: activeSeasonalTeams.reduce((s, w) => s + Number(w.salaryByDays || 0), 0),
      overtimePay: activeSeasonalTeams.reduce((s, w) => s + Number(w.overtimePay || 0), 0),
      allowancesAndBonus: activeSeasonalTeams.reduce(
        (s, w) =>
          s +
          Number(w.mealAllowance || 0) +
          Number(w.travelSafetyAllowance || 0) +
          Number(w.otherBonus || 0),
        0
      ),
      totalIncome: activeSeasonalTeams.reduce((s, w) => s + Number(w.totalIncome || 0), 0),
      deductions: activeSeasonalTeams.reduce((s, w) => s + Number(w.totalDeductions || 0), 0),
      netSalary: activeSeasonalTeams.reduce((s, w) => s + Number(w.netSalary || 0), 0),
    };

    const activePermanent = syncedEmployeesForSelectedMonth.filter(
      (e) =>
        e.status !== 'RESIGNED' &&
        e.selectedForAttendance !== false &&
        (Number(e.actualWorkDays || 0) > 0 ||
          Number(e.overtimeHours || 0) > 0 ||
          Number(e.paidLeaveDays || 0) > 0) &&
        (selectedProjectFilter === 'ALL' || matchesProject(e.department))
    );
    const permanentMonthRow: PeriodBreakdownRow = {
      id: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}_PERM_MONTH`,
      systemType: '1_MONTH',
      systemLabel: 'Lương Tháng',
      periodLabel: `NV Chính Thức (T${selectedMonth}/${selectedYear})`,
      dateRangeLabel: monthRangeStr,
      workerCount: activePermanent.length,
      totalWorkDays:
        Math.round(
          activePermanent.reduce((s, e) => s + Number(e.actualWorkDays || 0), 0) * 10
        ) / 10,
      totalOtHours:
        Math.round(
          activePermanent.reduce((s, e) => s + Number(e.overtimeHours || 0), 0) * 10
        ) / 10,
      salaryByDays: activePermanent.reduce(
        (s, e) => s + Number(e.salaryByActualDays || 0),
        0
      ),
      overtimePay: activePermanent.reduce((s, e) => s + Number(e.overtimePay || 0), 0),
      allowancesAndBonus: activePermanent.reduce(
        (s, e) =>
          s +
          Number(e.responsibilityAllowance || 0) +
          Number(e.projectAllowance || 0) +
          Number(e.mealAllowance || 0) +
          Number(e.phoneTravelAllowance || 0) +
          Number(e.kpiBonus || 0),
        0
      ),
      totalIncome: activePermanent.reduce((s, e) => s + Number(e.totalIncome || 0), 0),
      deductions: activePermanent.reduce((s, e) => s + Number(e.totalDeductions || 0), 0),
      netSalary: activePermanent.reduce((s, e) => s + Number(e.netSalary || 0), 0),
    };

    const monthlyRows: PeriodBreakdownRow[] = [
      seasonalMonthRow,
      ...(teamMonthRow.totalIncome > 0 || !onlyActivePeriods ? [teamMonthRow] : []),
      ...(permanentMonthRow.totalIncome > 0 || !onlyActivePeriods ? [permanentMonthRow] : []),
    ];

    const sumRows = (rows: PeriodBreakdownRow[], maxWorkerCount: number) => ({
      workerCount: maxWorkerCount,
      totalWorkDays: Math.round(rows.reduce((s, r) => s + r.totalWorkDays, 0) * 10) / 10,
      totalOtHours: Math.round(rows.reduce((s, r) => s + r.totalOtHours, 0) * 10) / 10,
      salaryByDays: rows.reduce((s, r) => s + r.salaryByDays, 0),
      overtimePay: rows.reduce((s, r) => s + r.overtimePay, 0),
      allowancesAndBonus: rows.reduce((s, r) => s + r.allowancesAndBonus, 0),
      totalIncome: rows.reduce((s, r) => s + r.totalIncome, 0),
      deductions: rows.reduce((s, r) => s + r.deductions, 0),
      netSalary: rows.reduce((s, r) => s + r.netSalary, 0),
    });

    const weeklyParticipatingCount = weeklyWorkers.filter(
      (w) => Number(w.actualWorkDays || 0) > 0 || Number(w.overtimeHours || 0) > 0
    ).length;
    const biWeeklyParticipatingCount = biWeeklyWorkers.filter(
      (w) => Number(w.actualWorkDays || 0) > 0 || Number(w.overtimeHours || 0) > 0
    ).length;
    const monthlyParticipatingCount =
      monthlySeasonalWorkers.length + activeSeasonalTeams.length + activePermanent.length;

    const weeklySummary = sumRows(weeklyRows, weeklyParticipatingCount);
    const biWeeklySummary = sumRows(biWeeklyRows, biWeeklyParticipatingCount);
    const monthlySummary = sumRows(monthlyRows, monthlyParticipatingCount);

    const grandTotal = {
      workerCount:
        weeklySummary.workerCount + biWeeklySummary.workerCount + monthlySummary.workerCount,
      totalWorkDays:
        Math.round(
          (weeklySummary.totalWorkDays +
            biWeeklySummary.totalWorkDays +
            monthlySummary.totalWorkDays) *
            10
        ) / 10,
      totalOtHours:
        Math.round(
          (weeklySummary.totalOtHours +
            biWeeklySummary.totalOtHours +
            monthlySummary.totalOtHours) *
            10
        ) / 10,
      salaryByDays:
        weeklySummary.salaryByDays + biWeeklySummary.salaryByDays + monthlySummary.salaryByDays,
      overtimePay:
        weeklySummary.overtimePay + biWeeklySummary.overtimePay + monthlySummary.overtimePay,
      allowancesAndBonus:
        weeklySummary.allowancesAndBonus +
        biWeeklySummary.allowancesAndBonus +
        monthlySummary.allowancesAndBonus,
      totalIncome:
        weeklySummary.totalIncome + biWeeklySummary.totalIncome + monthlySummary.totalIncome,
      deductions:
        weeklySummary.deductions + biWeeklySummary.deductions + monthlySummary.deductions,
      netSalary:
        weeklySummary.netSalary + biWeeklySummary.netSalary + monthlySummary.netSalary,
    };

    return {
      weeklyRows,
      biWeeklyRows,
      monthlyRows,
      weeklySummary,
      biWeeklySummary,
      monthlySummary,
      grandTotal,
    };
  }, [
    syncedSeasonalForSelectedMonth,
    syncedEmployeesForSelectedMonth,
    selectedYear,
    selectedMonth,
    selectedProjectFilter,
    onlyActivePeriods,
  ]);

  // Tính toán nhân công chính thức
  const permanentStats = useMemo(() => {
    const active = syncedEmployeesForSelectedMonth.filter(
      (e) =>
        e.status !== 'RESIGNED' &&
        e.selectedForAttendance !== false &&
        (Number(e.actualWorkDays || 0) > 0 ||
          Number(e.overtimeHours || 0) > 0 ||
          Number(e.paidLeaveDays || 0) > 0)
    );
    const count = active.length;
    const baseTotal = active.reduce((s, e) => s + (e.salaryByActualDays || 0), 0);
    const otTotal = active.reduce((s, e) => s + (e.overtimePay || 0), 0);
    const allowanceTotal = active.reduce(
      (s, e) =>
        s +
        (e.responsibilityAllowance || 0) +
        (e.projectAllowance || 0) +
        (e.mealAllowance || 0) +
        (e.phoneTravelAllowance || 0) +
        (e.kpiBonus || 0),
      0
    );
    const totalIncome = active.reduce((s, e) => s + (e.totalIncome || 0), 0);
    const employeeInsurance = active.reduce((s, e) => s + (e.totalInsurance || 0), 0);
    // Doanh nghiệp đóng: BHXH 17.5% + BHYT 3% + BHTN 1% = 21.5%
    const companyInsurance = active.reduce((s, e) => s + Math.round((e.insuranceSalary || 0) * 0.215), 0);
    const netTotal = active.reduce((s, e) => s + (e.netSalary || 0), 0);

    return {
      count,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      employeeInsurance,
      companyInsurance,
      netTotal,
    };
  }, [syncedEmployeesForSelectedMonth]);

  // Tính toán nhân công thời vụ (1 tuần, 2 tuần, tháng)
  const seasonalStats = useMemo(() => {
    const active = syncedSeasonalForSelectedMonth.filter(
      (w) => (w.status || 'ACTIVE') === 'ACTIVE' && w.payrollCycleType !== 'TEAM'
    );
    const filtered =
      selectedProjectFilter === 'ALL'
        ? active
        : active.filter(
            (w) => w.project && w.project.toLowerCase().includes(selectedProjectFilter.toLowerCase())
          );

    const count = filtered.length;
    const baseTotal = filtered.reduce((s, w) => s + (w.salaryByDays || 0), 0);
    const otTotal = filtered.reduce((s, w) => s + (w.overtimePay || 0), 0);
    const allowanceTotal = filtered.reduce(
      (s, w) => s + (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0),
      0
    );
    const totalIncome = filtered.reduce((s, w) => s + (w.totalIncome || 0), 0);
    const taxTotal = filtered.reduce((s, w) => s + (w.personalIncomeTax || 0), 0);
    const netTotal = filtered.reduce((s, w) => s + (w.netSalary || 0), 0);

    return {
      count,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      taxTotal,
      netTotal,
    };
  }, [syncedSeasonalForSelectedMonth, selectedProjectFilter]);

  // Tính toán nhân công tổ đội (bao gồm cả nhân viên thuộc nhóm Tổ Đội được chọn trả lương trong tháng)
  const teamStats = useMemo(() => {
    const active = teamWorkers.filter((t) => t.status !== 'PAUSED');
    const filtered =
      selectedProjectFilter === 'ALL'
        ? active
        : active.filter(
            (t) => t.project && t.project.toLowerCase().includes(selectedProjectFilter.toLowerCase())
          );

    const seasonalTeamActive = syncedSeasonalForSelectedMonth.filter(
      (w) =>
        (w.status || 'ACTIVE') === 'ACTIVE' &&
        w.payrollCycleType === 'TEAM' &&
        (Boolean(w.selectedForAttendance) || (w.actualWorkDays || 0) > 0 || (w.totalIncome || 0) > 0)
    );
    const filteredSeasonalTeam =
      selectedProjectFilter === 'ALL'
        ? seasonalTeamActive
        : seasonalTeamActive.filter(
            (w) => w.project && w.project.toLowerCase().includes(selectedProjectFilter.toLowerCase())
          );

    const count = filtered.length + filteredSeasonalTeam.length;
    const totalWorkers =
      filtered.reduce((s, t) => s + (t.workerCount || 1), 0) + filteredSeasonalTeam.length;
    const baseTotal =
      filtered.reduce((s, t) => s + (t.salaryByDays || 0), 0) +
      filteredSeasonalTeam.reduce((s, w) => s + (w.salaryByDays || 0), 0);
    const otTotal =
      filtered.reduce((s, t) => s + (t.overtimePay || 0), 0) +
      filteredSeasonalTeam.reduce((s, w) => s + (w.overtimePay || 0), 0);
    const allowanceTotal =
      filtered.reduce((s, t) => s + (t.mealAllowance || 0) + (t.otherBonus || 0), 0) +
      filteredSeasonalTeam.reduce(
        (s, w) => s + (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0),
        0
      );
    const totalIncome =
      filtered.reduce((s, t) => s + (t.totalIncome || 0), 0) +
      filteredSeasonalTeam.reduce((s, w) => s + (w.totalIncome || 0), 0);
    const advanceTotal =
      filtered.reduce((s, t) => s + (t.advancePayment || 0), 0) +
      filteredSeasonalTeam.reduce((s, w) => s + (w.advancePayment || 0), 0);
    const netTotal =
      filtered.reduce((s, t) => s + (t.netSalary || 0), 0) +
      filteredSeasonalTeam.reduce((s, w) => s + (w.netSalary || 0), 0);

    return {
      count,
      totalWorkers,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      advanceTotal,
      netTotal,
    };
  }, [teamWorkers, syncedSeasonalForSelectedMonth, selectedProjectFilter]);

  // Hệ số nhân theo chu kỳ thời gian (Tháng: 1x, Quý: 3x, Năm: 12x)
  const multiplier = useMemo(() => {
    if (timeViewMode === 'MONTH') return 1;
    if (timeViewMode === 'YEAR') return 12;
    return 3; // Quý (Q1, Q2, Q3, Q4)
  }, [timeViewMode]);

  // Tổng hợp tài chính toàn công ty
  const grandTotalLaborBudget = useMemo(() => {
    const totalPayroll = (permanentStats.totalIncome + seasonalStats.totalIncome + teamStats.totalIncome) * multiplier;
    const totalCompanyInsurance = permanentStats.companyInsurance * multiplier;
    const totalLaborExpense = totalPayroll + totalCompanyInsurance;
    const totalNetDisbursement = (permanentStats.netTotal + seasonalStats.netTotal + teamStats.netTotal) * multiplier;
    const totalAdvances = advances.reduce((s, a) => s + (a.amount || 0), 0) * (timeViewMode === 'MONTH' ? 1 : multiplier * 0.8);

    return {
      totalPayroll,
      totalCompanyInsurance,
      totalLaborExpense,
      totalNetDisbursement,
      totalAdvances,
    };
  }, [permanentStats, seasonalStats, teamStats, multiplier, advances, timeViewMode]);

  // Phân tích chi phí theo từng dự án
  const projectExpenses = useMemo(() => {
    return projects.map((p) => {
      const matchProj = (projStr?: string) => {
        if (!projStr) return false;
        const wp = projStr.trim().toLowerCase();
        const pn = p.name.trim().toLowerCase();
        const pc = (p.code || '').trim().toLowerCase();
        return (
          wp === pn ||
          wp.includes(pn.substring(0, Math.min(15, pn.length))) ||
          pn.includes(wp.substring(0, Math.min(15, wp.length))) ||
          (pc.length > 0 && wp.includes(pc))
        );
      };
      const pSeasonal = syncedSeasonalForSelectedMonth.filter(
        (w) => w.payrollCycleType !== 'TEAM' && matchProj(w.project)
      );
      const pSeasonalTeams = syncedSeasonalForSelectedMonth.filter(
        (w) =>
          w.payrollCycleType === 'TEAM' &&
          matchProj(w.project) &&
          (Boolean(w.selectedForAttendance) || (w.actualWorkDays || 0) > 0 || (w.totalIncome || 0) > 0)
      );
      const pTeams = teamWorkers.filter((t) => matchProj(t.project));

      const seasonalMonthly = pSeasonal.reduce((s, w) => s + (w.totalIncome || 0), 0);
      const teamMonthly =
        pTeams.reduce((s, t) => s + (t.totalIncome || 0), 0) +
        pSeasonalTeams.reduce((s, w) => s + (w.totalIncome || 0), 0);
      const engineersMonthly = 35000000; // Chi phí kỹ sư giám sát tại dự án ước tính
      const monthlyTotal = seasonalMonthly + teamMonthly + engineersMonthly;
      const actualCost =
        seasonalMonthly + teamMonthly > 0
          ? monthlyTotal * multiplier
          : p.actualLaborCost || monthlyTotal * multiplier;
      const budgetPercent = p.laborBudget > 0 ? Math.min(Math.round((actualCost / p.laborBudget) * 100), 100) : 0;

      return {
        ...p,
        seasonalCost: seasonalMonthly * multiplier,
        teamCost: teamMonthly * multiplier,
        totalLaborCost: actualCost,
        budgetPercent,
        remainingBudget: Math.max(0, p.laborBudget - actualCost),
      };
    });
  }, [projects, syncedSeasonalForSelectedMonth, teamWorkers, multiplier]);

  // Xuất file Excel Báo Cáo Tài Chính (kèm Sheet Thống Kê Lương Tuần / 2 Tuần / Tháng)
  const handleExportExcel = () => {
    const timeLabel =
      timeViewMode === 'MONTH'
        ? `Thang_${selectedMonth}_${selectedYear}`
        : timeViewMode === 'YEAR'
        ? `Ca_Nam_${selectedYear}`
        : `Quy_${timeViewMode}_${selectedYear}`;

    // Sheet 1: Thống kê Lương 1 Tuần, Lương 2 Tuần, Lương Tháng
    const allCycleRows = [
      ...cycleBreakdownStats.weeklyRows,
      ...cycleBreakdownStats.biWeeklyRows,
      ...cycleBreakdownStats.monthlyRows,
    ];
    const cycleSheetData = [
      ...allCycleRows.map((r, idx) => ({
        STT: idx + 1,
        'Hệ Lương': r.systemLabel,
        'Kỳ Thanh Toán (Tuần / Đợt / Tháng)': r.periodLabel,
        'Khoảng Thời Gian': r.dateRangeLabel,
        'Số Nhân Sự Có Công': r.workerCount,
        'Tổng Ngày Công': r.totalWorkDays,
        'Tổng Giờ OT (h)': r.totalOtHours,
        'Lương Theo Công (VNĐ)': r.salaryByDays,
        'Tiền Tăng Ca OT (VNĐ)': r.overtimePay,
        'Phụ Cấp & Thưởng (VNĐ)': r.allowancesAndBonus,
        'Tổng Thu Nhập (VNĐ)': r.totalIncome,
        'Khấu Trừ / Tạm Ứng (VNĐ)': r.deductions,
        'Thực Lĩnh Chi Trả (VNĐ)': r.netSalary,
      })),
      {
        STT: '',
        'Hệ Lương': 'TỔNG CỘNG TOÀN THÁNG',
        'Kỳ Thanh Toán (Tuần / Đợt / Tháng)': `Tháng ${selectedMonth}/${selectedYear}`,
        'Khoảng Thời Gian': '',
        'Số Nhân Sự Có Công': cycleBreakdownStats.grandTotal.workerCount,
        'Tổng Ngày Công': cycleBreakdownStats.grandTotal.totalWorkDays,
        'Tổng Giờ OT (h)': cycleBreakdownStats.grandTotal.totalOtHours,
        'Lương Theo Công (VNĐ)': cycleBreakdownStats.grandTotal.salaryByDays,
        'Tiền Tăng Ca OT (VNĐ)': cycleBreakdownStats.grandTotal.overtimePay,
        'Phụ Cấp & Thưởng (VNĐ)': cycleBreakdownStats.grandTotal.allowancesAndBonus,
        'Tổng Thu Nhập (VNĐ)': cycleBreakdownStats.grandTotal.totalIncome,
        'Khấu Trừ / Tạm Ứng (VNĐ)': cycleBreakdownStats.grandTotal.deductions,
        'Thực Lĩnh Chi Trả (VNĐ)': cycleBreakdownStats.grandTotal.netSalary,
      },
    ];

    // Sheet 2: Tổng hợp chi phí theo nhóm
    const summaryData = [
      {
        'Nhóm Nhân Lực': '1. Nhân viên chính thức (Khối VP & Kỹ sư)',
        'Số Lượng': `${permanentStats.count} người`,
        'Lương Theo Công (VNĐ)': permanentStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': permanentStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': permanentStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': permanentStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': permanentStats.companyInsurance * multiplier,
        'Thực Lĩnh Chi Trả (VNĐ)': permanentStats.netTotal * multiplier,
      },
      {
        'Nhóm Nhân Lực': '2. Công nhân kỹ thuật & Thời vụ',
        'Số Lượng': `${seasonalStats.count} thợ`,
        'Lương Theo Công (VNĐ)': seasonalStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': seasonalStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': seasonalStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': seasonalStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': 0,
        'Thực Lĩnh Chi Trả (VNĐ)': seasonalStats.netTotal * multiplier,
      },
      {
        'Nhóm Nhân Lực': '3. Nhân viên tổ đội thi công (Khoán việc)',
        'Số Lượng': `${teamStats.count} tổ (${teamStats.totalWorkers} thợ)`,
        'Lương Theo Công (VNĐ)': teamStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': teamStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': teamStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': teamStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': 0,
        'Thực Lĩnh Chi Trả (VNĐ)': teamStats.netTotal * multiplier,
      },
    ];

    // Sheet 3: Chi phí theo dự án công trình
    const projectData = projectExpenses.map((p, idx) => ({
      STT: idx + 1,
      'Mã Dự Án': p.code,
      'Tên Công Trình': p.name,
      'Chủ Đầu Tư': p.investor,
      'Dự Toán Nhân Công (VNĐ)': p.laborBudget,
      'Chi Phí Nhân Lực Thực Tế (VNĐ)': p.totalLaborCost,
      'Tỷ Lệ Giải Ngân (%)': `${p.budgetPercent}%`,
      'Ngân Sách Còn Lại (VNĐ)': p.remainingBudget,
      'Trạng Thái': p.status === 'IN_PROGRESS' ? 'Đang thi công' : 'Hoàn thành',
    }));

    const wb = XLSX.utils.book_new();
    const wsCycles = XLSX.utils.json_to_sheet(cycleSheetData);
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsProjects = XLSX.utils.json_to_sheet(projectData);

    XLSX.utils.book_append_sheet(wb, wsCycles, 'ThongKe_Tuan_2Tuan_Thang');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'TongHopChiPhiNhanSu');
    XLSX.utils.book_append_sheet(wb, wsProjects, 'ChiPhiTheoDuAn');
    XLSX.writeFile(wb, `Bao_Cao_Tai_Chinh_Nhan_Cong_Phuc_Nguyen_${timeLabel}.xlsx`);
  };

  // In báo cáo tài chính
  const handlePrintReport = () => {
    window.print();
  };

  const visibleWeeklyRows = useMemo(
    () =>
      onlyActivePeriods
        ? cycleBreakdownStats.weeklyRows.filter((r) => r.totalIncome > 0 || r.totalWorkDays > 0)
        : cycleBreakdownStats.weeklyRows,
    [cycleBreakdownStats.weeklyRows, onlyActivePeriods]
  );

  const visibleBiWeeklyRows = useMemo(
    () =>
      onlyActivePeriods
        ? cycleBreakdownStats.biWeeklyRows.filter((r) => r.totalIncome > 0 || r.totalWorkDays > 0)
        : cycleBreakdownStats.biWeeklyRows,
    [cycleBreakdownStats.biWeeklyRows, onlyActivePeriods]
  );

  const visibleMonthlyRows = useMemo(
    () =>
      onlyActivePeriods
        ? cycleBreakdownStats.monthlyRows.filter((r) => r.totalIncome > 0 || r.totalWorkDays > 0)
        : cycleBreakdownStats.monthlyRows,
    [cycleBreakdownStats.monthlyRows, onlyActivePeriods]
  );

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#09233b] via-[#0f3d64] to-[#1c5b8c] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#13375c] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-300 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              Báo Cáo Tài Chính Tổng Hợp Chi Phí Nhân Công & Tiền Lương
            </h2>
          </div>
          <p className="text-xs text-sky-200 mt-1 max-w-2xl">
            Tự động tổng hợp chi phí toàn diện theo thời gian (Tuần, 2 Tuần, Tháng, Quý, Năm), theo từng dự án công trình và phân tích cơ cấu chi phí nhân lực Phúc Nguyên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel Báo Cáo</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Printer className="w-4 h-4 text-sky-300" />
            <span>In Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* Thanh Điều Hướng Chu Kỳ Báo Cáo & Dự Án */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 no-print">
        {/* Chọn chu kỳ thời gian */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[#0f3d64]" />
            <span>Kỳ báo cáo:</span>
          </span>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setTimeViewMode('MONTH')}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'MONTH' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tháng {selectedMonth}/{selectedYear}
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q1')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q1' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý I
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q2')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q2' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý II
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q3')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q3' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý III
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q4')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q4' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý IV
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('YEAR')}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'YEAR' ? 'bg-amber-600 text-white shadow-xs font-black' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cả Năm {selectedYear}
            </button>
          </div>
        </div>

        {/* Lọc theo dự án */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Building className="w-4 h-4 text-sky-700" />
            <span>Công trình:</span>
          </span>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer max-w-xs"
          >
            <option value="ALL">Toàn bộ công trình & văn phòng ({projects.length} dự án)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 Chỉ Số Tài Chính Tổng Hợp Toàn Công Ty */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng chi phí nhân sự toàn bộ</div>
            <div className="text-xl font-black text-[#0f3d64] mt-0.5">
              {formatVND(grandTotalLaborBudget.totalLaborExpense)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Bao gồm quỹ lương + 21.5% BHXH doanh nghiệp
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0f3d64] shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Thực chi thanh toán (Net)</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalNetDisbursement)}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              Chuyển khoản & chi tiền mặt trực tiếp
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Bảo hiểm công ty đóng (21.5%)</div>
            <div className="text-xl font-black text-blue-800 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalCompanyInsurance)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">BHXH 17.5% + BHYT 3% + BHTN 1%</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tạm ứng đã cấp trong kỳ</div>
            <div className="text-xl font-black text-rose-700 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalAdvances)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Đã thu hồi trực tiếp từ lương</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BẢNG THỐNG KÊ CHI TIẾT LƯƠNG TUẦN, LƯƠNG 2 TUẦN & LƯƠNG THÁNG (CÓ LỌC THÁNG) */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Header & Bộ lọc từng tháng / từng hệ lương */}
        <div className="p-3.5 bg-gradient-to-r from-slate-50 via-sky-50/40 to-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#0f3d64] text-white rounded-lg shadow-2xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">
                Bảng Thống Kê Lương Tuần, Lương 2 Tuần & Lương Tháng (T{selectedMonth}/{selectedYear})
              </h3>
              <p className="text-[11px] text-slate-500">
                Tổng hợp chi tiết từng tuần thi công, từng đợt 2 tuần và kỳ lương tháng sau khi tính lương
              </p>
            </div>
          </div>

          {/* Cụm bộ lọc từng tháng + lọc hệ lương */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            {/* Bộ chọn Tháng & Năm trực tiếp */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-2xs text-xs">
              <button
                type="button"
                onClick={() => handleStepMonth('PREV')}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <Calendar className="w-3.5 h-3.5 text-[#0f3d64] ml-1" />
              <select
                value={selectedMonth}
                onChange={(e) => handleSelectMonthYear(parseInt(e.target.value, 10), selectedYear)}
                className="bg-transparent font-black text-[#0f3d64] text-xs py-0.5 px-1 outline-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
              <span className="text-slate-300">/</span>
              <select
                value={selectedYear}
                onChange={(e) => handleSelectMonthYear(selectedMonth, parseInt(e.target.value, 10))}
                className="bg-transparent font-bold text-slate-700 text-xs py-0.5 px-1 outline-none cursor-pointer font-mono"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleStepMonth('NEXT')}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Nút chọn nhanh các tháng phổ biến */}
            <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
              {[9, 10, 11, 12].map((m) => {
                const isCur = selectedMonth === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectMonthYear(m, selectedYear)}
                    className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                      isCur
                        ? 'bg-[#0f3d64] text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    T{m}/{selectedYear}
                  </button>
                );
              })}
            </div>

            {/* Lọc theo Hệ Lương */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
              <button
                type="button"
                onClick={() => setCycleSystemFilter('ALL')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === 'ALL'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Tất cả (3 hệ)
              </button>
              <button
                type="button"
                onClick={() => setCycleSystemFilter('1_WEEK')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === '1_WEEK'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Lương 1 Tuần
              </button>
              <button
                type="button"
                onClick={() => setCycleSystemFilter('2_WEEKS')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === '2_WEEKS'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Lương 2 Tuần
              </button>
              <button
                type="button"
                onClick={() => setCycleSystemFilter('1_MONTH')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === '1_MONTH'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Lương Tháng
              </button>
            </div>

            {/* Lọc chỉ hiện kỳ có phát sinh lương */}
            <button
              type="button"
              onClick={() => setOnlyActivePeriods((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                onlyActivePeriods
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              title="Chỉ hiển thị những tuần/đợt có phát sinh công & lương"
            >
              <Filter className="w-3 h-3" />
              <span>{onlyActivePeriods ? 'Đang lọc kỳ có lương' : 'Hiện tất cả kỳ'}</span>
            </button>
          </div>
        </div>

        {/* 3 Thẻ Tóm Tắt Nhanh 3 Hệ Lương trong Tháng đang chọn */}
        <div className="p-3.5 bg-slate-50/60 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Card 1: Hệ Lương 1 Tuần */}
          <div className="bg-white border border-sky-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-600" />
                <span className="font-bold text-sky-950 uppercase text-[11px]">
                  1. Tổng Hệ Lương 1 Tuần (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-sky-900 font-mono mt-1">
                {formatVND(cycleBreakdownStats.weeklySummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.weeklySummary.workerCount} thợ •{' '}
                {cycleBreakdownStats.weeklySummary.totalWorkDays} công •{' '}
                {cycleBreakdownStats.weeklySummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-sky-50 text-sky-800 border border-sky-200 rounded-lg font-mono font-bold text-[11px]">
              {cycleBreakdownStats.weeklyRows.filter((r) => r.totalIncome > 0).length}/
              {cycleBreakdownStats.weeklyRows.length} tuần
            </span>
          </div>

          {/* Card 2: Hệ Lương 2 Tuần */}
          <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-bold text-amber-950 uppercase text-[11px]">
                  2. Tổng Hệ Lương 2 Tuần (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-amber-800 font-mono mt-1">
                {formatVND(cycleBreakdownStats.biWeeklySummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.biWeeklySummary.workerCount} thợ •{' '}
                {cycleBreakdownStats.biWeeklySummary.totalWorkDays} công •{' '}
                {cycleBreakdownStats.biWeeklySummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-mono font-bold text-[11px]">
              {cycleBreakdownStats.biWeeklyRows.filter((r) => r.totalIncome > 0).length}/2 đợt
            </span>
          </div>

          {/* Card 3: Hệ Lương Tháng */}
          <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="font-bold text-emerald-950 uppercase text-[11px]">
                  3. Tổng Hệ Lương Tháng (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-emerald-800 font-mono mt-1">
                {formatVND(cycleBreakdownStats.monthlySummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.monthlySummary.workerCount} nhân sự •{' '}
                {cycleBreakdownStats.monthlySummary.totalWorkDays} công •{' '}
                {cycleBreakdownStats.monthlySummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-mono font-bold text-[11px]">
              Cả tháng {selectedMonth}
            </span>
          </div>
        </div>

        {/* Bảng Chi Tiết Từng Tuần, Từng Đợt 2 Tuần và Từng Tháng */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-2.5 border-r border-slate-200 w-36">Hệ Lương</th>
                <th className="p-2.5 border-r border-slate-200 min-w-[170px]">Kỳ Tính Lương</th>
                <th className="p-2.5 border-r border-slate-200 text-center w-28">Khoảng Ngày</th>
                <th className="p-2.5 border-r border-slate-200 text-center w-24">Nhân Sự</th>
                <th className="p-2.5 border-r border-slate-200 text-center w-20">Tổng Công</th>
                <th className="p-2.5 border-r border-slate-200 text-center w-20">Giờ OT</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Lương Theo Công</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Tiền Tăng Ca (OT)</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Phụ Cấp & Thưởng</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Tổng Thu Nhập</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Tạm Ứng / Khấu Trừ</th>
                <th className="p-2.5 text-right bg-emerald-50 text-emerald-950 font-black">Thực Lĩnh Chi Trả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* PHẦN 1: HỆ LƯƠNG 1 TUẦN */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === '1_WEEK') && (
                <>
                  {visibleWeeklyRows.map((row, idx) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-sky-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-sky-900">
                          {idx === 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[11px] font-extrabold">
                              <Clock className="w-3 h-3 text-sky-700" />
                              1. Lương 1 Tuần
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 pl-2">↳ Lương 1 Tuần</span>
                          )}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 font-bold text-slate-800">
                          {row.periodLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-[11px] text-slate-600">
                          {row.dateRangeLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-semibold">
                          {row.workerCount > 0 ? `${row.workerCount} thợ` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-sky-900">
                          {row.totalWorkDays > 0 ? `${row.totalWorkDays}` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-amber-800">
                          {row.totalOtHours > 0 ? `${row.totalOtHours}h` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.salaryByDays > 0 ? formatVND(row.salaryByDays) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.overtimePay > 0 ? formatVND(row.overtimePay) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.allowancesAndBonus > 0 ? formatVND(row.allowancesAndBonus) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                          {row.totalIncome > 0 ? formatVND(row.totalIncome) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono text-rose-700">
                          {row.deductions > 0 ? formatVND(row.deductions) : '0 đ'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                          {row.netSalary > 0 ? formatVND(row.netSalary) : '0 đ'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Dòng cộng Hệ Lương 1 Tuần */}
                  <tr className="bg-sky-50/80 font-bold text-sky-950 border-t border-b border-sky-200">
                    <td colSpan={3} className="p-2.5 border-r border-sky-200 uppercase text-[11px] font-black">
                      Cộng Hệ Lương 1 Tuần (Tháng {selectedMonth}/{selectedYear})
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-center">
                      {cycleBreakdownStats.weeklySummary.workerCount} thợ
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-center font-mono">
                      {cycleBreakdownStats.weeklySummary.totalWorkDays}
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-center font-mono">
                      {cycleBreakdownStats.weeklySummary.totalOtHours}h
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.weeklySummary.salaryByDays)}
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.weeklySummary.overtimePay)}
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.weeklySummary.allowancesAndBonus)}
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-right font-mono font-black">
                      {formatVND(cycleBreakdownStats.weeklySummary.totalIncome)}
                    </td>
                    <td className="p-2.5 border-r border-sky-200 text-right font-mono text-rose-700">
                      {formatVND(cycleBreakdownStats.weeklySummary.deductions)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                      {formatVND(cycleBreakdownStats.weeklySummary.netSalary)}
                    </td>
                  </tr>
                </>
              )}

              {/* PHẦN 2: HỆ LƯƠNG 2 TUẦN */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === '2_WEEKS') && (
                <>
                  {visibleBiWeeklyRows.map((row, idx) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-amber-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-amber-900">
                          {idx === 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-extrabold">
                              <Layers className="w-3 h-3 text-amber-700" />
                              2. Lương 2 Tuần
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 pl-2">↳ Lương 2 Tuần</span>
                          )}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 font-bold text-slate-800">
                          {row.periodLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-[11px] text-slate-600">
                          {row.dateRangeLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-semibold">
                          {row.workerCount > 0 ? `${row.workerCount} thợ` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-amber-900">
                          {row.totalWorkDays > 0 ? `${row.totalWorkDays}` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-amber-800">
                          {row.totalOtHours > 0 ? `${row.totalOtHours}h` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.salaryByDays > 0 ? formatVND(row.salaryByDays) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.overtimePay > 0 ? formatVND(row.overtimePay) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.allowancesAndBonus > 0 ? formatVND(row.allowancesAndBonus) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                          {row.totalIncome > 0 ? formatVND(row.totalIncome) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono text-rose-700">
                          {row.deductions > 0 ? formatVND(row.deductions) : '0 đ'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                          {row.netSalary > 0 ? formatVND(row.netSalary) : '0 đ'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Dòng cộng Hệ Lương 2 Tuần */}
                  <tr className="bg-amber-50/80 font-bold text-amber-950 border-t border-b border-amber-200">
                    <td colSpan={3} className="p-2.5 border-r border-amber-200 uppercase text-[11px] font-black">
                      Cộng Hệ Lương 2 Tuần (Tháng {selectedMonth}/{selectedYear})
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-center">
                      {cycleBreakdownStats.biWeeklySummary.workerCount} thợ
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-center font-mono">
                      {cycleBreakdownStats.biWeeklySummary.totalWorkDays}
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-center font-mono">
                      {cycleBreakdownStats.biWeeklySummary.totalOtHours}h
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.salaryByDays)}
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.overtimePay)}
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.allowancesAndBonus)}
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-right font-mono font-black">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.totalIncome)}
                    </td>
                    <td className="p-2.5 border-r border-amber-200 text-right font-mono text-rose-700">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.deductions)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                      {formatVND(cycleBreakdownStats.biWeeklySummary.netSalary)}
                    </td>
                  </tr>
                </>
              )}

              {/* PHẦN 3: HỆ LƯƠNG THÁNG */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === '1_MONTH') && (
                <>
                  {visibleMonthlyRows.map((row, idx) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-emerald-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-emerald-900">
                          {idx === 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-extrabold">
                              <Calendar className="w-3 h-3 text-emerald-700" />
                              3. Lương Tháng
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 pl-2">↳ Lương Tháng</span>
                          )}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 font-bold text-slate-800">
                          {row.periodLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-[11px] text-slate-600">
                          {row.dateRangeLabel}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-semibold">
                          {row.workerCount > 0 ? `${row.workerCount} người` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-emerald-900">
                          {row.totalWorkDays > 0 ? `${row.totalWorkDays}` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-amber-800">
                          {row.totalOtHours > 0 ? `${row.totalOtHours}h` : '-'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.salaryByDays > 0 ? formatVND(row.salaryByDays) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.overtimePay > 0 ? formatVND(row.overtimePay) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          {row.allowancesAndBonus > 0 ? formatVND(row.allowancesAndBonus) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                          {row.totalIncome > 0 ? formatVND(row.totalIncome) : '0 đ'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono text-rose-700">
                          {row.deductions > 0 ? formatVND(row.deductions) : '0 đ'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                          {row.netSalary > 0 ? formatVND(row.netSalary) : '0 đ'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Dòng cộng Hệ Lương Tháng */}
                  <tr className="bg-emerald-50/80 font-bold text-emerald-950 border-t border-b border-emerald-200">
                    <td colSpan={3} className="p-2.5 border-r border-emerald-200 uppercase text-[11px] font-black">
                      Cộng Hệ Lương Tháng (Tháng {selectedMonth}/{selectedYear})
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-center">
                      {cycleBreakdownStats.monthlySummary.workerCount} người
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-center font-mono">
                      {cycleBreakdownStats.monthlySummary.totalWorkDays}
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-center font-mono">
                      {cycleBreakdownStats.monthlySummary.totalOtHours}h
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.monthlySummary.salaryByDays)}
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.monthlySummary.overtimePay)}
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.monthlySummary.allowancesAndBonus)}
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-right font-mono font-black">
                      {formatVND(cycleBreakdownStats.monthlySummary.totalIncome)}
                    </td>
                    <td className="p-2.5 border-r border-emerald-200 text-right font-mono text-rose-700">
                      {formatVND(cycleBreakdownStats.monthlySummary.deductions)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-100/80">
                      {formatVND(cycleBreakdownStats.monthlySummary.netSalary)}
                    </td>
                  </tr>
                </>
              )}

              {/* DÒNG TỔNG CỘNG CẢ 3 HỆ LƯƠNG TRONG THÁNG */}
              <tr className="bg-[#0f3d64] text-white font-black border-t-2 border-slate-400">
                <td colSpan={3} className="p-3 border-r border-white/15 uppercase text-xs">
                  TỔNG CỘNG THỐNG KÊ LƯƠNG THÁNG {selectedMonth}/{selectedYear} (3 HỆ LƯƠNG)
                </td>
                <td className="p-3 border-r border-white/15 text-center font-mono">
                  {cycleBreakdownStats.grandTotal.workerCount} NS
                </td>
                <td className="p-3 border-r border-white/15 text-center font-mono text-amber-300">
                  {cycleBreakdownStats.grandTotal.totalWorkDays}
                </td>
                <td className="p-3 border-r border-white/15 text-center font-mono text-amber-300">
                  {cycleBreakdownStats.grandTotal.totalOtHours}h
                </td>
                <td className="p-3 border-r border-white/15 text-right font-mono">
                  {formatVND(cycleBreakdownStats.grandTotal.salaryByDays)}
                </td>
                <td className="p-3 border-r border-white/15 text-right font-mono">
                  {formatVND(cycleBreakdownStats.grandTotal.overtimePay)}
                </td>
                <td className="p-3 border-r border-white/15 text-right font-mono">
                  {formatVND(cycleBreakdownStats.grandTotal.allowancesAndBonus)}
                </td>
                <td className="p-3 border-r border-white/15 text-right font-mono text-sky-200">
                  {formatVND(cycleBreakdownStats.grandTotal.totalIncome)}
                </td>
                <td className="p-3 border-r border-white/15 text-right font-mono text-rose-200">
                  {formatVND(cycleBreakdownStats.grandTotal.deductions)}
                </td>
                <td className="p-3 text-right font-mono text-emerald-300 text-sm">
                  {formatVND(cycleBreakdownStats.grandTotal.netSalary)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng 1: Phân Tích Cơ Cấu Chi Phí Theo 3 Nhóm Nhân Sự */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 uppercase">
            <Users className="w-4 h-4 text-[#0f3d64]" />
            <span>1. Cơ Cấu Chi Phí Tiền Lương Theo Từng Nhóm Nhân Sự</span>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">
            {timeViewMode === 'MONTH'
              ? `Tháng ${selectedMonth}/${selectedYear}`
              : timeViewMode === 'YEAR'
              ? `Cả năm ${selectedYear}`
              : `Quý ${timeViewMode}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-3 border-r border-slate-200">Nhóm Nhân Lực</th>
                <th className="p-3 border-r border-slate-200 text-center w-28">Số Lượng</th>
                <th className="p-3 border-r border-slate-200 text-right">Lương Theo Công</th>
                <th className="p-3 border-r border-slate-200 text-right">Làm Thêm Giờ (OT)</th>
                <th className="p-3 border-r border-slate-200 text-right">Phụ Cấp & Thưởng</th>
                <th className="p-3 border-r border-slate-200 text-right">Tổng Thu Nhập</th>
                <th className="p-3 border-r border-slate-200 text-right">BHXH Doanh Nghiệp (21.5%)</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-black">Thực Lĩnh Chi Trả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Hàng 1: Chính thức */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-[#0f3d64] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                  <span>1. Nhân viên chính thức (Khối VP & Kỹ sư)</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {permanentStats.count} người
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(permanentStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-blue-800">
                  {formatVND(permanentStats.companyInsurance * multiplier)}
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(permanentStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng 2: Thời vụ */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-amber-800 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>2. Công nhân kỹ thuật & Thời vụ</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {seasonalStats.count} thợ
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(seasonalStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-400">
                  0 đ (Theo cam kết 08)
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(seasonalStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng 3: Tổ đội */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-indigo-800 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <span>3. Nhân viên tổ đội thi công (Khoán công trình)</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {teamStats.count} tổ ({teamStats.totalWorkers} thợ)
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(teamStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-400">
                  0 đ (Khoán tổ đội)
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(teamStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng Tổng Cộng */}
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td className="p-3 border-r border-slate-300 uppercase">TỔNG CỘNG CHI PHÍ NHÂN LỰC</td>
                <td className="p-3 border-r border-slate-300 text-center">
                  {permanentStats.count + seasonalStats.count + teamStats.totalWorkers} nhân sự
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.baseTotal + seasonalStats.baseTotal + teamStats.baseTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.otTotal + seasonalStats.otTotal + teamStats.otTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.allowanceTotal + seasonalStats.allowanceTotal + teamStats.allowanceTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono font-black text-blue-950">
                  {formatVND(grandTotalLaborBudget.totalPayroll)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                  {formatVND(grandTotalLaborBudget.totalCompanyInsurance)}
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-900 bg-emerald-100">
                  {formatVND(grandTotalLaborBudget.totalNetDisbursement)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng 2: Phân Tích Chi Phí Nhân Công Theo Từng Dự Án / Công Trình */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 uppercase">
            <Building className="w-4 h-4 text-sky-700" />
            <span>2. Báo Cáo Chi Phí Nhân Công Chi Tiết Theo Từng Dự Án (So Sánh Ngân Sách Dự Toán)</span>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">{projects.length} công trình</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-3 border-r border-slate-200 text-center w-12">STT</th>
                <th className="p-3 border-r border-slate-200 w-24">Mã DA</th>
                <th className="p-3 border-r border-slate-200 min-w-[200px]">Tên Công Trình</th>
                <th className="p-3 border-r border-slate-200 min-w-[150px]">Chủ Đầu Tư / Địa Điểm</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Dự Toán Nhân Công</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Chi Phí Thực Tế</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[120px]">Tiến Độ Giải Ngân</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Ngân Sách Còn Lại</th>
                <th className="p-3 text-center w-28">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectExpenses.map((p, idx) => {
                const percent = p.budgetPercent;
                const isOverBudget = percent >= 95;

                return (
                  <tr key={p.id} className="hover:bg-sky-50/40 transition-colors">
                    <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="p-3 border-r border-slate-200 font-mono font-bold text-[#0f3d64]">
                      {p.code}
                    </td>
                    <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                      {p.name}
                      <div className="text-[10px] text-slate-500 font-normal">Chỉ huy trưởng: {p.managerName}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-slate-600">
                      <div>{p.investor}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{p.location}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                      {formatVND(p.laborBudget)}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">
                      {formatVND(p.totalLaborCost)}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-14 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              isOverBudget ? 'bg-rose-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold font-mono ${isOverBudget ? 'text-rose-600' : 'text-slate-700'}`}>
                          {percent}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-sky-900">
                      {formatVND(p.remainingBudget)}
                    </td>
                    <td className="p-3 text-center">
                      {p.status === 'IN_PROGRESS' ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                          Đang thi công
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-bold">
                          Hoàn thành
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
