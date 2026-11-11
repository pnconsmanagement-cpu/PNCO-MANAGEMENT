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
  systemType: '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT';
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
  const [cycleSystemFilter, setCycleSystemFilter] = useState<
    'ALL' | '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT'
  >('ALL');
  // Chỉ hiện các kỳ có phát sinh lương (> 0đ) hoặc hiện tất cả các tuần/đợt trong tháng
  const [onlyActivePeriods, setOnlyActivePeriods] = useState<boolean>(false);

  // Trạng thái điều khiển Biểu đồ cột thống kê lương (Mục 3 cuối trang)
  const [chartViewMode, setChartViewMode] = useState<'OVERVIEW' | 'PERIOD_DETAIL' | 'PROJECTS'>('OVERVIEW');
  const [chartMetric, setChartMetric] = useState<'NET' | 'GROSS'>('NET');
  const [yearlyBarStyle, setYearlyBarStyle] = useState<'GROUPED' | 'STACKED'>('GROUPED');
  const [enabledChartSystems, setEnabledChartSystems] = useState<
    Record<'1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT', boolean>
  >({
    '1_WEEK': true,
    '2_WEEKS': true,
    '1_MONTH': true,
    TEAM: true,
    PERMANENT: true,
  });
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredSystemId, setHoveredSystemId] = useState<
    '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT' | null
  >(null);

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

    // 3. HỆ LƯƠNG THÁNG (Công nhân Thời vụ Lương Tháng)
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
      systemLabel: '3. Lương Tháng (Thời Vụ)',
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

    // 4. HỆ LƯƠNG TỔ ĐỘI (Bản Lương Tổ Đội)
    const activeSeasonalTeams = activeSeasonal.filter(
      (w) =>
        w.payrollCycleType === 'TEAM' &&
        (Boolean(w.selectedForAttendance) ||
          Number(w.actualWorkDays || 0) > 0 ||
          Number(w.totalIncome || 0) > 0)
    );
    const teamMonthRow: PeriodBreakdownRow = {
      id: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}_TEAM_MONTH`,
      systemType: 'TEAM',
      systemLabel: '4. Hệ Lương Tổ Đội',
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

    // 5. HỆ LƯƠNG NHÂN VIÊN CHÍNH THỨC (Bản Lương NV Chính Thức)
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
      systemType: 'PERMANENT',
      systemLabel: '5. Hệ Lương Nhân Viên Chính Thức',
      periodLabel: `Bản Lương NV Chính Thức (T${selectedMonth}/${selectedYear})`,
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

    const monthlyRows: PeriodBreakdownRow[] = [seasonalMonthRow];
    const teamRows: PeriodBreakdownRow[] = [teamMonthRow];
    const permanentRows: PeriodBreakdownRow[] = [permanentMonthRow];

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

    const weeklySummary = sumRows(weeklyRows, weeklyParticipatingCount);
    const biWeeklySummary = sumRows(biWeeklyRows, biWeeklyParticipatingCount);
    const monthlySummary = sumRows(monthlyRows, monthlySeasonalWorkers.length);
    const teamSummary = sumRows(teamRows, activeSeasonalTeams.length);
    const permanentSummary = sumRows(permanentRows, activePermanent.length);

    const grandTotal = {
      workerCount:
        weeklySummary.workerCount +
        biWeeklySummary.workerCount +
        monthlySummary.workerCount +
        teamSummary.workerCount +
        permanentSummary.workerCount,
      totalWorkDays:
        Math.round(
          (weeklySummary.totalWorkDays +
            biWeeklySummary.totalWorkDays +
            monthlySummary.totalWorkDays +
            teamSummary.totalWorkDays +
            permanentSummary.totalWorkDays) *
            10
        ) / 10,
      totalOtHours:
        Math.round(
          (weeklySummary.totalOtHours +
            biWeeklySummary.totalOtHours +
            monthlySummary.totalOtHours +
            teamSummary.totalOtHours +
            permanentSummary.totalOtHours) *
            10
        ) / 10,
      salaryByDays:
        weeklySummary.salaryByDays +
        biWeeklySummary.salaryByDays +
        monthlySummary.salaryByDays +
        teamSummary.salaryByDays +
        permanentSummary.salaryByDays,
      overtimePay:
        weeklySummary.overtimePay +
        biWeeklySummary.overtimePay +
        monthlySummary.overtimePay +
        teamSummary.overtimePay +
        permanentSummary.overtimePay,
      allowancesAndBonus:
        weeklySummary.allowancesAndBonus +
        biWeeklySummary.allowancesAndBonus +
        monthlySummary.allowancesAndBonus +
        teamSummary.allowancesAndBonus +
        permanentSummary.allowancesAndBonus,
      totalIncome:
        weeklySummary.totalIncome +
        biWeeklySummary.totalIncome +
        monthlySummary.totalIncome +
        teamSummary.totalIncome +
        permanentSummary.totalIncome,
      deductions:
        weeklySummary.deductions +
        biWeeklySummary.deductions +
        monthlySummary.deductions +
        teamSummary.deductions +
        permanentSummary.deductions,
      netSalary:
        weeklySummary.netSalary +
        biWeeklySummary.netSalary +
        monthlySummary.netSalary +
        teamSummary.netSalary +
        permanentSummary.netSalary,
    };

    return {
      weeklyRows,
      biWeeklyRows,
      monthlyRows,
      teamRows,
      permanentRows,
      weeklySummary,
      biWeeklySummary,
      monthlySummary,
      teamSummary,
      permanentSummary,
      grandTotal,
    };
  }, [
    syncedSeasonalForSelectedMonth,
    syncedEmployeesForSelectedMonth,
    selectedYear,
    selectedMonth,
    selectedProjectFilter,
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

    // Sheet 1: Thống kê Lương 1 Tuần, Lương 2 Tuần, Lương Tháng, Hệ Lương Tổ Đội, Hệ Lương NV Chính Thức
    const allCycleRows = [
      ...cycleBreakdownStats.weeklyRows,
      ...cycleBreakdownStats.biWeeklyRows,
      ...cycleBreakdownStats.monthlyRows,
      ...cycleBreakdownStats.teamRows,
      ...cycleBreakdownStats.permanentRows,
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

    XLSX.utils.book_append_sheet(wb, wsCycles, 'ThongKe_5_He_Luong');
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

  const visibleTeamRows = useMemo(
    () =>
      onlyActivePeriods
        ? cycleBreakdownStats.teamRows.filter((r) => r.totalIncome > 0 || r.totalWorkDays > 0)
        : cycleBreakdownStats.teamRows,
    [cycleBreakdownStats.teamRows, onlyActivePeriods]
  );

  const visiblePermanentRows = useMemo(
    () =>
      onlyActivePeriods
        ? cycleBreakdownStats.permanentRows.filter((r) => r.totalIncome > 0 || r.totalWorkDays > 0)
        : cycleBreakdownStats.permanentRows,
    [cycleBreakdownStats.permanentRows, onlyActivePeriods]
  );

  // Định dạng số tiền rút gọn trên đầu cột & trục tung (VD: 82.5 tr, 1.25 tỷ)
  const formatCompactVND = (amount: number): string => {
    const val = Math.round(Number(amount) || 0);
    if (val <= 0) return '0 đ';
    if (val >= 1_000_000_000) {
      const ty = val / 1_000_000_000;
      return `${ty >= 10 ? ty.toFixed(1) : ty.toFixed(2).replace(/\.?0+$/, '')} tỷ`;
    }
    if (val >= 1_000_000) {
      const tr = val / 1_000_000;
      return `${tr >= 100 ? Math.round(tr) : Number(tr.toFixed(1))} tr`;
    }
    if (val >= 1_000) {
      return `${Math.round(val / 1_000)}k`;
    }
    return `${val} đ`;
  };

  // Tính mức trần trục tung (Y-axis) tròn đẹp để chia 4 vạch lưới ngang
  const computeNiceScaleMax = (rawMax: number): number => {
    if (rawMax <= 0) return 10_000_000;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const normalized = rawMax / magnitude;
    let niceFactor = 10;
    if (normalized <= 1.2) niceFactor = 1.2;
    else if (normalized <= 1.5) niceFactor = 1.5;
    else if (normalized <= 2) niceFactor = 2;
    else if (normalized <= 2.5) niceFactor = 2.5;
    else if (normalized <= 3) niceFactor = 3;
    else if (normalized <= 4) niceFactor = 4;
    else if (normalized <= 5) niceFactor = 5;
    else if (normalized <= 6) niceFactor = 6;
    else if (normalized <= 8) niceFactor = 8;
    return niceFactor * magnitude;
  };

  const toggleChartSystem = (sysKey: '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT') => {
    setEnabledChartSystems((prev) => {
      const next = { ...prev, [sysKey]: !prev[sysKey] };
      const anyActive = Object.values(next).some(Boolean);
      return anyActive ? next : prev;
    });
  };

  // Tổng hợp dữ liệu biểu đồ cột cho cả 12 tháng trong năm đang chọn (5 Hệ Lương)
  const yearlyMonthlyChartData = useMemo(() => {
    const stdDays = config.standardWorkDays || 26;

    return Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const mSeasonal = seasonalWorkers
        .map((w) => syncSeasonalWorkerForMonth(w, m, selectedYear))
        .filter(
          (w) =>
            (w.status || 'ACTIVE') === 'ACTIVE' &&
            (selectedProjectFilter === 'ALL' ||
              (w.project && w.project.toLowerCase().includes(selectedProjectFilter.toLowerCase())))
        );

      // 1. Hệ Lương 1 Tuần
      const mWeeklyWorkers = mSeasonal.filter((w) => (w.payrollCycleType || '1_MONTH') === '1_WEEK');
      const mWeeklyPeriods = getPayrollPeriods(selectedYear, m, '1_WEEK');
      let weeklyGross = 0;
      let weeklyNet = 0;
      mWeeklyPeriods.forEach((period) => {
        mWeeklyWorkers.forEach((w) => {
          const wp = getWorkerForPeriod(w, period);
          const d = Number(wp.actualWorkDays || 0);
          const ot = Number(wp.overtimeHours || 0);
          if (d > 0 || ot > 0) {
            weeklyGross += Number(wp.totalIncome || 0);
            weeklyNet += Number(wp.netSalary || 0);
          }
        });
      });

      // 2. Hệ Lương 2 Tuần
      const mBiWeeklyWorkers = mSeasonal.filter((w) => (w.payrollCycleType || '1_MONTH') === '2_WEEKS');
      const mBiWeeklyPeriods = getPayrollPeriods(selectedYear, m, '2_WEEKS');
      let biWeeklyGross = 0;
      let biWeeklyNet = 0;
      mBiWeeklyPeriods.forEach((period) => {
        mBiWeeklyWorkers.forEach((w) => {
          const wp = getWorkerForPeriod(w, period);
          const d = Number(wp.actualWorkDays || 0);
          const ot = Number(wp.overtimeHours || 0);
          if (d > 0 || ot > 0) {
            biWeeklyGross += Number(wp.totalIncome || 0);
            biWeeklyNet += Number(wp.netSalary || 0);
          }
        });
      });

      // 3. Hệ Lương Tháng (Thời vụ)
      const mMonthlyWorkers = mSeasonal.filter(
        (w) =>
          (w.payrollCycleType || '1_MONTH') === '1_MONTH' &&
          (Number(w.actualWorkDays || 0) > 0 || Number(w.overtimeHours || 0) > 0)
      );
      const monthlyGross = mMonthlyWorkers.reduce((s, w) => s + Number(w.totalIncome || 0), 0);
      const monthlyNet = mMonthlyWorkers.reduce((s, w) => s + Number(w.netSalary || 0), 0);

      // 4. Hệ Lương Tổ Đội
      const mTeamWorkers = mSeasonal.filter(
        (w) =>
          w.payrollCycleType === 'TEAM' &&
          (Boolean(w.selectedForAttendance) ||
            Number(w.actualWorkDays || 0) > 0 ||
            Number(w.totalIncome || 0) > 0)
      );
      const teamGross = mTeamWorkers.reduce((s, w) => s + Number(w.totalIncome || 0), 0);
      const teamNet = mTeamWorkers.reduce((s, w) => s + Number(w.netSalary || 0), 0);

      // 5. Hệ Lương Nhân Viên Chính Thức
      const mPermanent = employees
        .map((e) => syncEmployeeForMonth(e, m, selectedYear, stdDays))
        .filter(
          (e) =>
            e.status !== 'RESIGNED' &&
            e.selectedForAttendance !== false &&
            (Number(e.actualWorkDays || 0) > 0 ||
              Number(e.overtimeHours || 0) > 0 ||
              Number(e.paidLeaveDays || 0) > 0) &&
            (selectedProjectFilter === 'ALL' ||
              (e.department &&
                e.department.toLowerCase().includes(selectedProjectFilter.toLowerCase())))
        );
      const permanentGross = mPermanent.reduce((s, e) => s + Number(e.totalIncome || 0), 0);
      const permanentNet = mPermanent.reduce((s, e) => s + Number(e.netSalary || 0), 0);

      return {
        month: m,
        label: `T${m}`,
        fullLabel: `Tháng ${m}/${selectedYear}`,
        values: {
          '1_WEEK': { net: weeklyNet, gross: weeklyGross },
          '2_WEEKS': { net: biWeeklyNet, gross: biWeeklyGross },
          '1_MONTH': { net: monthlyNet, gross: monthlyGross },
          TEAM: { net: teamNet, gross: teamGross },
          PERMANENT: { net: permanentNet, gross: permanentGross },
        },
        totalNet: weeklyNet + biWeeklyNet + monthlyNet + teamNet + permanentNet,
        totalGross: weeklyGross + biWeeklyGross + monthlyGross + teamGross + permanentGross,
      };
    });
  }, [seasonalWorkers, employees, selectedYear, selectedProjectFilter, config.standardWorkDays]);

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
                Bảng Thống Kê Lương Tuần, Lương 2 Tuần, Lương Tháng, Tổ Đội & NV Chính Thức (T{selectedMonth}/{selectedYear})
              </h3>
              <p className="text-[11px] text-slate-500">
                Tổng hợp chi tiết từng tuần thi công, từng đợt 2 tuần, lương tháng thời vụ, hệ lương tổ đội và hệ lương nhân viên chính thức
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
            <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px] gap-0.5">
              <button
                type="button"
                onClick={() => setCycleSystemFilter('ALL')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === 'ALL'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Tất cả (5 hệ)
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
              <button
                type="button"
                onClick={() => setCycleSystemFilter('TEAM')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === 'TEAM'
                    ? 'bg-purple-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Hệ Lương Tổ Đội
              </button>
              <button
                type="button"
                onClick={() => setCycleSystemFilter('PERMANENT')}
                className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                  cycleSystemFilter === 'PERMANENT'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Hệ Lương NV Chính Thức
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

        {/* 5 Thẻ Tóm Tắt Nhanh 5 Hệ Lương trong Tháng đang chọn */}
        <div className="p-3.5 bg-slate-50/60 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          {/* Card 1: Hệ Lương 1 Tuần */}
          <div className="bg-white border border-sky-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-600" />
                <span className="font-bold text-sky-950 uppercase text-[11px]">
                  1. Hệ Lương 1 Tuần (T{selectedMonth}/{selectedYear})
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
            <span className="px-2 py-1 bg-sky-50 text-sky-800 border border-sky-200 rounded-lg font-mono font-bold text-[10px]">
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
                  2. Hệ Lương 2 Tuần (T{selectedMonth}/{selectedYear})
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
            <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-mono font-bold text-[10px]">
              {cycleBreakdownStats.biWeeklyRows.filter((r) => r.totalIncome > 0).length}/2 đợt
            </span>
          </div>

          {/* Card 3: Hệ Lương Tháng (Thời vụ) */}
          <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="font-bold text-emerald-950 uppercase text-[11px]">
                  3. Hệ Lương Tháng (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-emerald-800 font-mono mt-1">
                {formatVND(cycleBreakdownStats.monthlySummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.monthlySummary.workerCount} thợ •{' '}
                {cycleBreakdownStats.monthlySummary.totalWorkDays} công •{' '}
                {cycleBreakdownStats.monthlySummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-mono font-bold text-[10px]">
              Thời vụ
            </span>
          </div>

          {/* Card 4: Hệ Lương Tổ Đội */}
          <div className="bg-white border border-purple-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span className="font-bold text-purple-950 uppercase text-[11px]">
                  4. Hệ Lương Tổ Đội (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-purple-800 font-mono mt-1">
                {formatVND(cycleBreakdownStats.teamSummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.teamSummary.workerCount} người •{' '}
                {cycleBreakdownStats.teamSummary.totalWorkDays} đợt •{' '}
                {cycleBreakdownStats.teamSummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-lg font-mono font-bold text-[10px]">
              Tổ đội
            </span>
          </div>

          {/* Card 5: Hệ Lương Nhân Viên Chính Thức */}
          <div className="bg-white border border-indigo-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span className="font-bold text-indigo-950 uppercase text-[11px]">
                  5. Hệ Lương NV Chính Thức (T{selectedMonth}/{selectedYear})
                </span>
              </div>
              <div className="text-base font-black text-indigo-800 font-mono mt-1">
                {formatVND(cycleBreakdownStats.permanentSummary.netSalary)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cycleBreakdownStats.permanentSummary.workerCount} NV •{' '}
                {cycleBreakdownStats.permanentSummary.totalWorkDays} công •{' '}
                {cycleBreakdownStats.permanentSummary.totalOtHours}h OT
              </div>
            </div>
            <span className="px-2 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-mono font-bold text-[10px]">
              Chính thức
            </span>
          </div>
        </div>

        {/* Bảng Chi Tiết Từng Tuần, Từng Đợt 2 Tuần, Lương Tháng, Hệ Lương Tổ Đội & Hệ Lương NV Chính Thức */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-2.5 border-r border-slate-200 w-44">Hệ Lương</th>
                <th className="p-2.5 border-r border-slate-200 min-w-[180px]">Kỳ Tính Lương</th>
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

              {/* PHẦN 3: HỆ LƯƠNG THÁNG (CÔNG NHÂN THỜI VỤ LƯƠNG THÁNG) */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === '1_MONTH') && (
                <>
                  {visibleMonthlyRows.map((row) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-emerald-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-emerald-900">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-extrabold">
                            <Calendar className="w-3 h-3 text-emerald-700" />
                            3. Lương Tháng
                          </span>
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
                      {cycleBreakdownStats.monthlySummary.workerCount} thợ
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

              {/* PHẦN 4: HỆ LƯƠNG TỔ ĐỘI */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === 'TEAM') && (
                <>
                  {visibleTeamRows.map((row) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-purple-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-purple-900">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-100 text-purple-900 text-[11px] font-extrabold">
                            <Building className="w-3 h-3 text-purple-700" />
                            4. Hệ Lương Tổ Đội
                          </span>
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
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-purple-900">
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
                  {/* Dòng cộng Hệ Lương Tổ Đội */}
                  <tr className="bg-purple-50/80 font-bold text-purple-950 border-t border-b border-purple-200">
                    <td colSpan={3} className="p-2.5 border-r border-purple-200 uppercase text-[11px] font-black">
                      Cộng Hệ Lương Tổ Đội (Tháng {selectedMonth}/{selectedYear})
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-center">
                      {cycleBreakdownStats.teamSummary.workerCount} người
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-center font-mono">
                      {cycleBreakdownStats.teamSummary.totalWorkDays}
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-center font-mono">
                      {cycleBreakdownStats.teamSummary.totalOtHours}h
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.teamSummary.salaryByDays)}
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.teamSummary.overtimePay)}
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.teamSummary.allowancesAndBonus)}
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-right font-mono font-black">
                      {formatVND(cycleBreakdownStats.teamSummary.totalIncome)}
                    </td>
                    <td className="p-2.5 border-r border-purple-200 text-right font-mono text-rose-700">
                      {formatVND(cycleBreakdownStats.teamSummary.deductions)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-100/80">
                      {formatVND(cycleBreakdownStats.teamSummary.netSalary)}
                    </td>
                  </tr>
                </>
              )}

              {/* PHẦN 5: HỆ LƯƠNG NHÂN VIÊN CHÍNH THỨC */}
              {(cycleSystemFilter === 'ALL' || cycleSystemFilter === 'PERMANENT') && (
                <>
                  {visiblePermanentRows.map((row) => {
                    const hasData = row.totalIncome > 0 || row.totalWorkDays > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasData ? 'bg-white hover:bg-indigo-50/40' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <td className="p-2.5 border-r border-slate-200 font-bold text-indigo-900">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[11px] font-extrabold">
                            <Users className="w-3 h-3 text-indigo-700" />
                            5. Hệ Lương NV Chính Thức
                          </span>
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
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-indigo-900">
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
                  {/* Dòng cộng Hệ Lương Nhân Viên Chính Thức */}
                  <tr className="bg-indigo-50/80 font-bold text-indigo-950 border-t border-b border-indigo-200">
                    <td colSpan={3} className="p-2.5 border-r border-indigo-200 uppercase text-[11px] font-black">
                      Cộng Hệ Lương Nhân Viên Chính Thức (Tháng {selectedMonth}/{selectedYear})
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-center">
                      {cycleBreakdownStats.permanentSummary.workerCount} người
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-center font-mono">
                      {cycleBreakdownStats.permanentSummary.totalWorkDays}
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-center font-mono">
                      {cycleBreakdownStats.permanentSummary.totalOtHours}h
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.permanentSummary.salaryByDays)}
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.permanentSummary.overtimePay)}
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-right font-mono">
                      {formatVND(cycleBreakdownStats.permanentSummary.allowancesAndBonus)}
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-right font-mono font-black">
                      {formatVND(cycleBreakdownStats.permanentSummary.totalIncome)}
                    </td>
                    <td className="p-2.5 border-r border-indigo-200 text-right font-mono text-rose-700">
                      {formatVND(cycleBreakdownStats.permanentSummary.deductions)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-100/80">
                      {formatVND(cycleBreakdownStats.permanentSummary.netSalary)}
                    </td>
                  </tr>
                </>
              )}

              {/* DÒNG TỔNG CỘNG CẢ 5 HỆ LƯƠNG TRONG THÁNG */}
              <tr className="bg-[#0f3d64] text-white font-black border-t-2 border-slate-400">
                <td colSpan={3} className="p-3 border-r border-white/15 uppercase text-xs">
                  TỔNG CỘNG THỐNG KÊ LƯƠNG THÁNG {selectedMonth}/{selectedYear} (5 HỆ LƯƠNG)
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

      {/* ===================================================================== */}
      {/* BẢNG 3: BIỂU ĐỒ CỘT THỐNG KÊ TIỀN LƯƠNG TRỰC QUAN (CUỐI BÁO CÁO)      */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Header & Thanh công cụ lọc biểu đồ */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#0f3d64] text-white rounded-lg">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">
                3. Biểu Đồ Cột Thống Kê Tiền Lương ({chartMetric === 'NET' ? 'Thực Lĩnh Chi Trả' : 'Tổng Thu Nhập'})
              </h3>
              <p className="text-[11px] text-slate-500">
                Đối chiếu trực quan 5 Hệ Lương theo từng tháng, từng tuần/đợt và theo ngân sách công trình
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {/* Chuyển đổi góc nhìn biểu đồ */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-lg border border-slate-200 text-[11px]">
              <button
                type="button"
                onClick={() => setChartViewMode('OVERVIEW')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  chartViewMode === 'OVERVIEW'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                5 Hệ Lương & 12 Tháng
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('PERIOD_DETAIL')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  chartViewMode === 'PERIOD_DETAIL'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chi Tiết Tuần / Đợt (T{selectedMonth})
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('PROJECTS')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  chartViewMode === 'PROJECTS'
                    ? 'bg-[#0f3d64] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Dự Án ({projects.length})
              </button>
            </div>

            {/* Chuyển đổi chỉ tiêu Thực lĩnh (Net) / Tổng thu nhập (Gross) */}
            {chartViewMode !== 'PROJECTS' && (
              <div className="flex items-center bg-slate-200/70 p-1 rounded-lg border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setChartMetric('NET')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMetric === 'NET'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Thực lĩnh (Net)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('GROSS')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMetric === 'GROSS'
                      ? 'bg-sky-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tổng thu nhập
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Thanh lọc chú giải (Interactive Legend) cho 5 Hệ Lương */}
        {chartViewMode !== 'PROJECTS' && (
          <div className="px-4 py-2.5 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Hiển thị hệ lương:</span>
              {(
                [
                  {
                    key: '1_WEEK' as const,
                    label: '1. Lương 1 Tuần',
                    swatch: 'bg-sky-600',
                    activeCls: 'bg-sky-50 border-sky-300 text-sky-900',
                  },
                  {
                    key: '2_WEEKS' as const,
                    label: '2. Lương 2 Tuần',
                    swatch: 'bg-amber-500',
                    activeCls: 'bg-amber-50 border-amber-300 text-amber-900',
                  },
                  {
                    key: '1_MONTH' as const,
                    label: '3. Lương Tháng (TV)',
                    swatch: 'bg-emerald-600',
                    activeCls: 'bg-emerald-50 border-emerald-300 text-emerald-900',
                  },
                  {
                    key: 'TEAM' as const,
                    label: '4. Hệ Lương Tổ Đội',
                    swatch: 'bg-purple-600',
                    activeCls: 'bg-purple-50 border-purple-300 text-purple-900',
                  },
                  {
                    key: 'PERMANENT' as const,
                    label: '5. Hệ Lương NV Chính Thức',
                    swatch: 'bg-indigo-600',
                    activeCls: 'bg-indigo-50 border-indigo-300 text-indigo-900',
                  },
                ]
              ).map((item) => {
                const isOn = enabledChartSystems[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleChartSystem(item.key)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      isOn
                        ? item.activeCls
                        : 'bg-white border-slate-200 text-slate-400 line-through opacity-65'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-xs ${isOn ? item.swatch : 'bg-slate-300'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {chartViewMode === 'OVERVIEW' && (
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[11px] no-print">
                <button
                  type="button"
                  onClick={() => setYearlyBarStyle('GROUPED')}
                  className={`px-2 py-1 rounded font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    yearlyBarStyle === 'GROUPED'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cột ghép từng hệ
                </button>
                <button
                  type="button"
                  onClick={() => setYearlyBarStyle('STACKED')}
                  className={`px-2 py-1 rounded font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    yearlyBarStyle === 'STACKED'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cột chồng tổng tháng
                </button>
              </div>
            )}
          </div>
        )}

        {/* NỘI DUNG BIỂU ĐỒ THEO CHẾ ĐỘ ĐANG CHỌN */}
        <div className="p-4">
          {chartViewMode === 'OVERVIEW' && (() => {
            const singleMonthBars = [
              {
                key: '1_WEEK' as const,
                shortLabel: 'Lương 1 Tuần',
                subInfo: `${cycleBreakdownStats.weeklySummary.workerCount} thợ · ${cycleBreakdownStats.weeklySummary.totalWorkDays} công`,
                value:
                  chartMetric === 'NET'
                    ? cycleBreakdownStats.weeklySummary.netSalary
                    : cycleBreakdownStats.weeklySummary.totalIncome,
                summary: cycleBreakdownStats.weeklySummary,
                fillClass: 'fill-sky-600 hover:fill-sky-500',
                textClass: 'fill-sky-800',
              },
              {
                key: '2_WEEKS' as const,
                shortLabel: 'Lương 2 Tuần',
                subInfo: `${cycleBreakdownStats.biWeeklySummary.workerCount} thợ · ${cycleBreakdownStats.biWeeklySummary.totalWorkDays} công`,
                value:
                  chartMetric === 'NET'
                    ? cycleBreakdownStats.biWeeklySummary.netSalary
                    : cycleBreakdownStats.biWeeklySummary.totalIncome,
                summary: cycleBreakdownStats.biWeeklySummary,
                fillClass: 'fill-amber-500 hover:fill-amber-400',
                textClass: 'fill-amber-800',
              },
              {
                key: '1_MONTH' as const,
                shortLabel: 'Lương Tháng',
                subInfo: `${cycleBreakdownStats.monthlySummary.workerCount} thợ · ${cycleBreakdownStats.monthlySummary.totalWorkDays} công`,
                value:
                  chartMetric === 'NET'
                    ? cycleBreakdownStats.monthlySummary.netSalary
                    : cycleBreakdownStats.monthlySummary.totalIncome,
                summary: cycleBreakdownStats.monthlySummary,
                fillClass: 'fill-emerald-600 hover:fill-emerald-500',
                textClass: 'fill-emerald-800',
              },
              {
                key: 'TEAM' as const,
                shortLabel: 'Hệ Tổ Đội',
                subInfo: `${cycleBreakdownStats.teamSummary.workerCount} người · ${cycleBreakdownStats.teamSummary.totalWorkDays} đợt`,
                value:
                  chartMetric === 'NET'
                    ? cycleBreakdownStats.teamSummary.netSalary
                    : cycleBreakdownStats.teamSummary.totalIncome,
                summary: cycleBreakdownStats.teamSummary,
                fillClass: 'fill-purple-600 hover:fill-purple-500',
                textClass: 'fill-purple-800',
              },
              {
                key: 'PERMANENT' as const,
                shortLabel: 'NV Chính Thức',
                subInfo: `${cycleBreakdownStats.permanentSummary.workerCount} NV · ${cycleBreakdownStats.permanentSummary.totalWorkDays} công`,
                value:
                  chartMetric === 'NET'
                    ? cycleBreakdownStats.permanentSummary.netSalary
                    : cycleBreakdownStats.permanentSummary.totalIncome,
                summary: cycleBreakdownStats.permanentSummary,
                fillClass: 'fill-indigo-600 hover:fill-indigo-500',
                textClass: 'fill-indigo-800',
              },
            ].filter((b) => enabledChartSystems[b.key]);

            const totalSelectedMonthVal = singleMonthBars.reduce((s, b) => s + b.value, 0);
            const leftScaleMax = computeNiceScaleMax(
              Math.max(...singleMonthBars.map((b) => b.value), 0)
            );

            // Tính cực đại trục tung cho biểu đồ 12 tháng
            const enabledKeys = (
              ['1_WEEK', '2_WEEKS', '1_MONTH', 'TEAM', 'PERMANENT'] as const
            ).filter((k) => enabledChartSystems[k]);

            const rawYearlyMax = yearlyMonthlyChartData.reduce((maxAcc, mItem) => {
              const vals = enabledKeys.map((k) =>
                chartMetric === 'NET' ? mItem.values[k].net : mItem.values[k].gross
              );
              const candidate =
                yearlyBarStyle === 'STACKED'
                  ? vals.reduce((a, b) => a + b, 0)
                  : Math.max(...vals, 0);
              return Math.max(maxAcc, candidate);
            }, 0);
            const rightScaleMax = computeNiceScaleMax(rawYearlyMax);

            const inspectedMonthNum = hoveredMonth ?? selectedMonth;
            const inspectedMonthData =
              yearlyMonthlyChartData.find((d) => d.month === inspectedMonthNum) ||
              yearlyMonthlyChartData[0];

            const activeHoveredBar =
              singleMonthBars.find((b) => b.key === hoveredSystemId) || null;

            const systemColorMap: Record<
              '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT',
              string
            > = {
              '1_WEEK': 'fill-sky-600',
              '2_WEEKS': 'fill-amber-500',
              '1_MONTH': 'fill-emerald-600',
              TEAM: 'fill-purple-600',
              PERMANENT: 'fill-indigo-600',
            };

            return (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                {/* CỘT TRÁI (5/12): BIỂU ĐỒ CỘT SO SÁNH 5 HỆ LƯƠNG TRONG THÁNG ĐANG CHỌN */}
                <div className="xl:col-span-5 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between bg-white">
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <div className="text-xs font-black text-slate-900 uppercase">
                          So Sánh Hệ Lương — Tháng {selectedMonth}/{selectedYear}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Tổng cộng:{' '}
                          <span className="font-mono font-bold text-emerald-800 tabular-nums">
                            {formatVND(totalSelectedMonthVal)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 no-print">
                        <button
                          type="button"
                          onClick={() => handleStepMonth('PREV')}
                          className="p-1 border border-slate-200 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                          title="Tháng trước"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono font-bold text-[#0f3d64] px-1.5 tabular-nums">
                          T{selectedMonth}/{selectedYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStepMonth('NEXT')}
                          className="p-1 border border-slate-200 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                          title="Tháng sau"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* SVG Biểu đồ cột Tháng đang chọn */}
                    <div className="mt-3">
                      <svg
                        viewBox="0 0 540 285"
                        className="w-full h-auto select-none overflow-visible"
                        role="img"
                        aria-label={`Biểu đồ cột thống kê lương tháng ${selectedMonth}/${selectedYear}`}
                      >
                        {/* 5 đường lưới ngang (0%, 25%, 50%, 75%, 100%) */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const yPos = 228 - ratio * 188;
                          const tickVal = Math.round(leftScaleMax * ratio);
                          return (
                            <g key={ratio}>
                              <line
                                x1={62}
                                y1={yPos}
                                x2={528}
                                y2={yPos}
                                className={
                                  ratio === 0
                                    ? 'stroke-slate-300 stroke-1'
                                    : 'stroke-slate-200/90 stroke-1'
                                }
                                strokeDasharray={ratio === 0 ? undefined : '3 3'}
                              />
                              <text
                                x={56}
                                y={yPos + 3.5}
                                textAnchor="end"
                                className="fill-slate-500 text-[10px] font-mono tabular-nums"
                              >
                                {formatCompactVND(tickVal)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Các cột Hệ Lương */}
                        {singleMonthBars.map((bar, idx) => {
                          const plotWidth = 466;
                          const slotWidth = plotWidth / Math.max(singleMonthBars.length, 1);
                          const barWidth = Math.min(48, Math.max(26, slotWidth * 0.52));
                          const centerX = 62 + slotWidth * idx + slotWidth / 2;
                          const barX = centerX - barWidth / 2;
                          const rawHeight =
                            leftScaleMax > 0 ? (bar.value / leftScaleMax) * 188 : 0;
                          const barHeight = bar.value > 0 ? Math.max(4, rawHeight) : 2;
                          const barY = 228 - barHeight;
                          const sharePct =
                            totalSelectedMonthVal > 0
                              ? Math.round((bar.value / totalSelectedMonthVal) * 100)
                              : 0;
                          const isHovered = hoveredSystemId === bar.key;

                          return (
                            <g
                              key={bar.key}
                              onMouseEnter={() => setHoveredSystemId(bar.key)}
                              onMouseLeave={() => setHoveredSystemId(null)}
                              onClick={() =>
                                setCycleSystemFilter((prev) =>
                                  prev === bar.key ? 'ALL' : bar.key
                                )
                              }
                              className="cursor-pointer"
                            >
                              {/* Nền hover nhẹ */}
                              {isHovered && (
                                <rect
                                  x={62 + slotWidth * idx + 3}
                                  y={32}
                                  width={slotWidth - 6}
                                  height={196}
                                  rx={6}
                                  className="fill-slate-100/80"
                                />
                              )}

                              {/* Thân cột */}
                              <rect
                                x={barX}
                                y={barY}
                                width={barWidth}
                                height={barHeight}
                                rx={4}
                                className={
                                  bar.value > 0
                                    ? `${bar.fillClass} transition-opacity`
                                    : 'fill-slate-200'
                                }
                              />

                              {/* Số tiền trên đỉnh cột */}
                              <text
                                x={centerX}
                                y={barY - (bar.value > 0 && sharePct > 0 ? 14 : 6)}
                                textAnchor="middle"
                                className={`text-[10.5px] font-mono font-bold tabular-nums ${
                                  bar.value > 0 ? bar.textClass : 'fill-slate-400'
                                }`}
                              >
                                {formatCompactVND(bar.value)}
                              </text>

                              {/* Tỷ trọng % */}
                              {bar.value > 0 && (
                                <text
                                  x={centerX}
                                  y={barY - 4}
                                  textAnchor="middle"
                                  className="fill-slate-500 text-[9px] font-mono tabular-nums"
                                >
                                  ({sharePct}%)
                                </text>
                              )}

                              {/* Nhãn trục hoành */}
                              <text
                                x={centerX}
                                y={245}
                                textAnchor="middle"
                                className="fill-slate-800 text-[10px] font-bold"
                              >
                                {bar.shortLabel}
                              </text>
                              <text
                                x={centerX}
                                y={259}
                                textAnchor="middle"
                                className="fill-slate-500 text-[9px] font-mono tabular-nums"
                              >
                                {bar.subInfo}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Dải thông tin chi tiết khi rê chuột vào cột Hệ Lương */}
                  <div className="mt-2 pt-2.5 border-t border-slate-100 text-[11px] flex flex-wrap items-center justify-between gap-2 text-slate-600">
                    {activeHoveredBar ? (
                      <>
                        <span className="font-bold text-slate-900">
                          {activeHoveredBar.shortLabel}:
                        </span>
                        <span className="font-mono tabular-nums">
                          Công: <strong>{formatVND(activeHoveredBar.summary.salaryByDays)}</strong>
                          {' · '}OT: <strong>{formatVND(activeHoveredBar.summary.overtimePay)}</strong>
                          {' · '}Thực lĩnh:{' '}
                          <strong className="text-emerald-700">
                            {formatVND(activeHoveredBar.summary.netSalary)}
                          </strong>
                        </span>
                      </>
                    ) : (
                      <span>
                        Rê chuột vào cột để xem chi tiết Công / OT • Bấm vào cột để lọc bảng trên
                      </span>
                    )}
                  </div>
                </div>

                {/* CỘT PHẢI (7/12): BIỂU ĐỒ CỘT THỐNG KÊ 12 THÁNG TRONG NĂM */}
                <div className="xl:col-span-7 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between bg-white">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div>
                        <div className="text-xs font-black text-slate-900 uppercase">
                          Biến Động Lương Theo 12 Tháng — Năm {selectedYear}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Bấm vào cột tháng bất kỳ (T1 – T12) để chuyển nhanh sang kiểm tra kỳ lương tháng đó
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-700 tabular-nums">
                        Cả năm {selectedYear}:{' '}
                        <span className="text-[#0f3d64]">
                          {formatVND(
                            yearlyMonthlyChartData.reduce(
                              (sum, mItem) =>
                                sum +
                                enabledKeys.reduce(
                                  (s, k) =>
                                    s +
                                    (chartMetric === 'NET'
                                      ? mItem.values[k].net
                                      : mItem.values[k].gross),
                                  0
                                ),
                              0
                            )
                          )}
                        </span>
                      </span>
                    </div>

                    {/* SVG Biểu đồ cột 12 tháng */}
                    <div className="mt-3">
                      <svg
                        viewBox="0 0 740 285"
                        className="w-full h-auto select-none overflow-visible"
                        role="img"
                        aria-label={`Biểu đồ cột lương 12 tháng năm ${selectedYear}`}
                      >
                        {/* 5 đường lưới ngang */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const yPos = 228 - ratio * 188;
                          const tickVal = Math.round(rightScaleMax * ratio);
                          return (
                            <g key={ratio}>
                              <line
                                x1={62}
                                y1={yPos}
                                x2={730}
                                y2={yPos}
                                className={
                                  ratio === 0
                                    ? 'stroke-slate-300 stroke-1'
                                    : 'stroke-slate-200/90 stroke-1'
                                }
                                strokeDasharray={ratio === 0 ? undefined : '3 3'}
                              />
                              <text
                                x={56}
                                y={yPos + 3.5}
                                textAnchor="end"
                                className="fill-slate-500 text-[10px] font-mono tabular-nums"
                              >
                                {formatCompactVND(tickVal)}
                              </text>
                            </g>
                          );
                        })}

                        {/* 12 Cột Tháng T1..T12 */}
                        {yearlyMonthlyChartData.map((mItem, idx) => {
                          const plotWidth = 668;
                          const slotWidth = plotWidth / 12;
                          const slotX = 62 + slotWidth * idx;
                          const centerX = slotX + slotWidth / 2;
                          const isSelected = mItem.month === selectedMonth;
                          const isHovered = mItem.month === hoveredMonth;

                          const monthEnabledSum = enabledKeys.reduce(
                            (s, k) =>
                              s +
                              (chartMetric === 'NET'
                                ? mItem.values[k].net
                                : mItem.values[k].gross),
                            0
                          );

                          // Chiều cao đỉnh cao nhất trong slot để đặt nhãn tổng tháng
                          let topPeakY = 228;

                          return (
                            <g
                              key={mItem.month}
                              onMouseEnter={() => setHoveredMonth(mItem.month)}
                              onMouseLeave={() => setHoveredMonth(null)}
                              onClick={() => handleSelectMonthYear(mItem.month, selectedYear)}
                              className="cursor-pointer"
                            >
                              {/* Vùng highlight tháng đang chọn / đang hover */}
                              <rect
                                x={slotX + 2}
                                y={30}
                                width={slotWidth - 4}
                                height={232}
                                rx={6}
                                className={
                                  isSelected
                                    ? 'fill-sky-50/90 stroke-sky-300 stroke-1'
                                    : isHovered
                                    ? 'fill-slate-100/80'
                                    : 'fill-transparent'
                                }
                              />

                              {yearlyBarStyle === 'STACKED' ? (
                                (() => {
                                  const barW = 24;
                                  let currentBottomY = 228;
                                  const rects = enabledKeys.map((sysKey) => {
                                    const val =
                                      chartMetric === 'NET'
                                        ? mItem.values[sysKey].net
                                        : mItem.values[sysKey].gross;
                                    if (val <= 0) return null;
                                    const h = Math.max(2, (val / rightScaleMax) * 188);
                                    currentBottomY -= h;
                                    topPeakY = Math.min(topPeakY, currentBottomY);
                                    return (
                                      <rect
                                        key={sysKey}
                                        x={centerX - barW / 2}
                                        y={currentBottomY}
                                        width={barW}
                                        height={h}
                                        rx={1.5}
                                        className={systemColorMap[sysKey]}
                                      />
                                    );
                                  });
                                  return (
                                    <>
                                      {monthEnabledSum <= 0 && (
                                        <rect
                                          x={centerX - barW / 2}
                                          y={226}
                                          width={barW}
                                          height={2}
                                          rx={1}
                                          className="fill-slate-200"
                                        />
                                      )}
                                      {rects}
                                      {monthEnabledSum > 0 && (
                                        <text
                                          x={centerX}
                                          y={topPeakY - 5}
                                          textAnchor="middle"
                                          className="fill-slate-800 text-[9.5px] font-mono font-bold tabular-nums"
                                        >
                                          {formatCompactVND(monthEnabledSum)}
                                        </text>
                                      )}
                                    </>
                                  );
                                })()
                              ) : (
                                (() => {
                                  const count = Math.max(enabledKeys.length, 1);
                                  const gap = 1.5;
                                  const maxClusterW = slotWidth - 10;
                                  const barW = Math.min(
                                    12,
                                    Math.max(5.5, (maxClusterW - gap * (count - 1)) / count)
                                  );
                                  const totalClusterW = barW * count + gap * (count - 1);
                                  const startX = centerX - totalClusterW / 2;

                                  return (
                                    <>
                                      {enabledKeys.map((sysKey, kIdx) => {
                                        const val =
                                          chartMetric === 'NET'
                                            ? mItem.values[sysKey].net
                                            : mItem.values[sysKey].gross;
                                        const h =
                                          val > 0
                                            ? Math.max(3, (val / rightScaleMax) * 188)
                                            : 2;
                                        const y = 228 - h;
                                        if (val > 0) topPeakY = Math.min(topPeakY, y);
                                        return (
                                          <rect
                                            key={sysKey}
                                            x={startX + kIdx * (barW + gap)}
                                            y={y}
                                            width={barW}
                                            height={h}
                                            rx={1.5}
                                            className={
                                              val > 0
                                                ? systemColorMap[sysKey]
                                                : 'fill-slate-200'
                                            }
                                          />
                                        );
                                      })}
                                      {monthEnabledSum > 0 && (
                                        <text
                                          x={centerX}
                                          y={topPeakY - 5}
                                          textAnchor="middle"
                                          className="fill-slate-800 text-[9px] font-mono font-bold tabular-nums"
                                        >
                                          {formatCompactVND(monthEnabledSum)}
                                        </text>
                                      )}
                                    </>
                                  );
                                })()
                              )}

                              {/* Nhãn tháng T1..T12 */}
                              <text
                                x={centerX}
                                y={246}
                                textAnchor="middle"
                                className={
                                  isSelected
                                    ? 'fill-[#0f3d64] text-[10.5px] font-black'
                                    : 'fill-slate-600 text-[10px] font-semibold'
                                }
                              >
                                {mItem.label}
                              </text>
                              {isSelected && (
                                <text
                                  x={centerX}
                                  y={258}
                                  textAnchor="middle"
                                  className="fill-sky-700 text-[8.5px] font-bold"
                                >
                                  Đang xem
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Thanh đọc số liệu chi tiết của Tháng đang trỏ chuột / Tháng đang chọn */}
                  <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-black text-[#0f3d64]">
                      Chi tiết {inspectedMonthData.fullLabel}:
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-slate-700">
                      <span>
                        1 Tuần:{' '}
                        <strong className="text-sky-800">
                          {formatVND(
                            chartMetric === 'NET'
                              ? inspectedMonthData.values['1_WEEK'].net
                              : inspectedMonthData.values['1_WEEK'].gross
                          )}
                        </strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        2 Tuần:{' '}
                        <strong className="text-amber-800">
                          {formatVND(
                            chartMetric === 'NET'
                              ? inspectedMonthData.values['2_WEEKS'].net
                              : inspectedMonthData.values['2_WEEKS'].gross
                          )}
                        </strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        Tháng:{' '}
                        <strong className="text-emerald-800">
                          {formatVND(
                            chartMetric === 'NET'
                              ? inspectedMonthData.values['1_MONTH'].net
                              : inspectedMonthData.values['1_MONTH'].gross
                          )}
                        </strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        Tổ Đội:{' '}
                        <strong className="text-purple-800">
                          {formatVND(
                            chartMetric === 'NET'
                              ? inspectedMonthData.values.TEAM.net
                              : inspectedMonthData.values.TEAM.gross
                          )}
                        </strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        NV Chính Thức:{' '}
                        <strong className="text-indigo-800">
                          {formatVND(
                            chartMetric === 'NET'
                              ? inspectedMonthData.values.PERMANENT.net
                              : inspectedMonthData.values.PERMANENT.gross
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* CHẾ ĐỘ 2: BIỂU ĐỒ CỘT CHI TIẾT TỪNG TUẦN / TỪNG ĐỢT TRONG THÁNG ĐANG CHỌN */}
          {chartViewMode === 'PERIOD_DETAIL' && (() => {
            const periodBars = [
              ...(enabledChartSystems['1_WEEK'] ? cycleBreakdownStats.weeklyRows : []),
              ...(enabledChartSystems['2_WEEKS'] ? cycleBreakdownStats.biWeeklyRows : []),
              ...(enabledChartSystems['1_MONTH'] ? cycleBreakdownStats.monthlyRows : []),
              ...(enabledChartSystems.TEAM ? cycleBreakdownStats.teamRows : []),
              ...(enabledChartSystems.PERMANENT ? cycleBreakdownStats.permanentRows : []),
            ];

            const maxPeriodVal = computeNiceScaleMax(
              Math.max(
                ...periodBars.map((r) => (chartMetric === 'NET' ? r.netSalary : r.totalIncome)),
                0
              )
            );

            const colorByType: Record<
              '1_WEEK' | '2_WEEKS' | '1_MONTH' | 'TEAM' | 'PERMANENT',
              { rect: string; text: string }
            > = {
              '1_WEEK': { rect: 'fill-sky-600 hover:fill-sky-500', text: 'fill-sky-800' },
              '2_WEEKS': { rect: 'fill-amber-500 hover:fill-amber-400', text: 'fill-amber-800' },
              '1_MONTH': {
                rect: 'fill-emerald-600 hover:fill-emerald-500',
                text: 'fill-emerald-800',
              },
              TEAM: { rect: 'fill-purple-600 hover:fill-purple-500', text: 'fill-purple-800' },
              PERMANENT: { rect: 'fill-indigo-600 hover:fill-indigo-500', text: 'fill-indigo-800' },
            };

            return (
              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="text-xs font-black text-slate-900 uppercase">
                      Biểu Đồ Cột Chi Tiết Từng Tuần, Từng Đợt 2 Tuần, Tháng, Tổ Đội & NV Chính Thức — Tháng {selectedMonth}/{selectedYear}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Hiển thị đầy đủ {periodBars.length} kỳ tính lương trong Tháng {selectedMonth}/{selectedYear}
                    </div>
                  </div>
                  <div className="text-xs font-mono font-black text-emerald-800 tabular-nums">
                    Tổng cộng:{' '}
                    {formatVND(
                      periodBars.reduce(
                        (s, r) => s + (chartMetric === 'NET' ? r.netSalary : r.totalIncome),
                        0
                      )
                    )}
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <svg
                    viewBox="0 0 960 295"
                    className="w-full min-w-[680px] h-auto select-none"
                    role="img"
                    aria-label={`Biểu đồ chi tiết các kỳ lương tháng ${selectedMonth}/${selectedYear}`}
                  >
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const yPos = 226 - ratio * 184;
                      const tickVal = Math.round(maxPeriodVal * ratio);
                      return (
                        <g key={ratio}>
                          <line
                            x1={66}
                            y1={yPos}
                            x2={944}
                            y2={yPos}
                            className={
                              ratio === 0
                                ? 'stroke-slate-300 stroke-1'
                                : 'stroke-slate-200 stroke-1'
                            }
                            strokeDasharray={ratio === 0 ? undefined : '3 3'}
                          />
                          <text
                            x={60}
                            y={yPos + 3.5}
                            textAnchor="end"
                            className="fill-slate-500 text-[10px] font-mono tabular-nums"
                          >
                            {formatCompactVND(tickVal)}
                          </text>
                        </g>
                      );
                    })}

                    {periodBars.map((row, idx) => {
                      const plotW = 878;
                      const slotW = plotW / Math.max(periodBars.length, 1);
                      const barW = Math.min(44, Math.max(22, slotW * 0.52));
                      const cx = 66 + slotW * idx + slotW / 2;
                      const val = chartMetric === 'NET' ? row.netSalary : row.totalIncome;
                      const h = val > 0 ? Math.max(4, (val / maxPeriodVal) * 184) : 2;
                      const y = 226 - h;
                      const palette = colorByType[row.systemType];

                      const shortName = row.periodLabel
                        .replace(` (T${selectedMonth}/${selectedYear})`, '')
                        .replace('Thời vụ ', 'TV ')
                        .replace('Bản Lương ', '');

                      return (
                        <g key={row.id}>
                          <rect
                            x={cx - barW / 2}
                            y={y}
                            width={barW}
                            height={h}
                            rx={4}
                            className={val > 0 ? palette.rect : 'fill-slate-200'}
                          />
                          <text
                            x={cx}
                            y={y - 6}
                            textAnchor="middle"
                            className={`text-[10px] font-mono font-bold tabular-nums ${
                              val > 0 ? palette.text : 'fill-slate-400'
                            }`}
                          >
                            {formatCompactVND(val)}
                          </text>
                          <text
                            x={cx}
                            y={244}
                            textAnchor="middle"
                            className="fill-slate-800 text-[9.5px] font-bold"
                          >
                            {shortName}
                          </text>
                          <text
                            x={cx}
                            y={257}
                            textAnchor="middle"
                            className="fill-slate-500 text-[8.5px] font-mono tabular-nums"
                          >
                            {row.dateRangeLabel}
                          </text>
                          <text
                            x={cx}
                            y={270}
                            textAnchor="middle"
                            className="fill-slate-400 text-[8.5px] font-mono tabular-nums"
                          >
                            {row.workerCount > 0
                              ? `${row.workerCount} NS · ${row.totalWorkDays}c`
                              : '0 công'}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            );
          })()}

          {/* CHẾ ĐỘ 3: BIỂU ĐỒ CỘT SO SÁNH DỰ TOÁN & CHI PHÍ LƯƠNG THỰC TẾ THEO DỰ ÁN */}
          {chartViewMode === 'PROJECTS' && (() => {
            const maxProjVal = computeNiceScaleMax(
              Math.max(
                ...projectExpenses.flatMap((p) => [p.laborBudget || 0, p.totalLaborCost || 0]),
                0
              )
            );

            return (
              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="text-xs font-black text-slate-900 uppercase">
                      Biểu Đồ Cột So Sánh Dự Toán Nhân Công & Chi Phí Thực Tế Theo Dự Án
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Đối chiếu trực tiếp bảng 2 ({projectExpenses.length} công trình đang quản lý)
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" />
                      <span>Dự toán nhân công</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                      <span>Chi phí thực tế</span>
                    </span>
                  </div>
                </div>

                {projectExpenses.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Chưa có dự án nào trong danh sách để hiển thị biểu đồ.
                  </div>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <svg
                      viewBox="0 0 960 295"
                      className="w-full min-w-[640px] h-auto select-none"
                      role="img"
                      aria-label="Biểu đồ cột so sánh dự toán và chi phí nhân công theo dự án"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const yPos = 226 - ratio * 184;
                        const tickVal = Math.round(maxProjVal * ratio);
                        return (
                          <g key={ratio}>
                            <line
                              x1={68}
                              y1={yPos}
                              x2={944}
                              y2={yPos}
                              className={
                                ratio === 0
                                  ? 'stroke-slate-300 stroke-1'
                                  : 'stroke-slate-200 stroke-1'
                              }
                              strokeDasharray={ratio === 0 ? undefined : '3 3'}
                            />
                            <text
                              x={62}
                              y={yPos + 3.5}
                              textAnchor="end"
                              className="fill-slate-500 text-[10px] font-mono tabular-nums"
                            >
                              {formatCompactVND(tickVal)}
                            </text>
                          </g>
                        );
                      })}

                      {projectExpenses.map((proj, idx) => {
                        const plotW = 876;
                        const slotW = plotW / Math.max(projectExpenses.length, 1);
                        const cx = 68 + slotW * idx + slotW / 2;
                        const barW = Math.min(34, Math.max(18, slotW * 0.24));
                        const gap = 6;

                        const budgetH =
                          proj.laborBudget > 0
                            ? Math.max(4, (proj.laborBudget / maxProjVal) * 184)
                            : 2;
                        const actualH =
                          proj.totalLaborCost > 0
                            ? Math.max(4, (proj.totalLaborCost / maxProjVal) * 184)
                            : 2;

                        const budgetX = cx - barW - gap / 2;
                        const actualX = cx + gap / 2;
                        const budgetY = 226 - budgetH;
                        const actualY = 226 - actualH;
                        const isOver = proj.budgetPercent >= 95;

                        const shortProjName =
                          proj.name.length > 22 ? `${proj.name.slice(0, 20)}…` : proj.name;

                        return (
                          <g key={proj.id}>
                            {/* Cột Dự toán */}
                            <rect
                              x={budgetX}
                              y={budgetY}
                              width={barW}
                              height={budgetH}
                              rx={3}
                              className="fill-slate-300"
                            />
                            <text
                              x={budgetX + barW / 2}
                              y={budgetY - 5}
                              textAnchor="middle"
                              className="fill-slate-600 text-[9.5px] font-mono font-semibold tabular-nums"
                            >
                              {formatCompactVND(proj.laborBudget)}
                            </text>

                            {/* Cột Thực tế */}
                            <rect
                              x={actualX}
                              y={actualY}
                              width={barW}
                              height={actualH}
                              rx={3}
                              className={
                                isOver
                                  ? 'fill-rose-600'
                                  : proj.budgetPercent > 70
                                  ? 'fill-amber-500'
                                  : 'fill-emerald-600'
                              }
                            />
                            <text
                              x={actualX + barW / 2}
                              y={actualY - 5}
                              textAnchor="middle"
                              className={`text-[9.5px] font-mono font-bold tabular-nums ${
                                isOver ? 'fill-rose-700' : 'fill-emerald-800'
                              }`}
                            >
                              {formatCompactVND(proj.totalLaborCost)}
                            </text>

                            {/* Nhãn Mã dự án & Tên */}
                            <text
                              x={cx}
                              y={244}
                              textAnchor="middle"
                              className="fill-[#0f3d64] text-[10px] font-mono font-bold"
                            >
                              {proj.code} ({proj.budgetPercent}%)
                            </text>
                            <text
                              x={cx}
                              y={258}
                              textAnchor="middle"
                              className="fill-slate-600 text-[9.5px] font-medium"
                            >
                              {shortProjName}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
