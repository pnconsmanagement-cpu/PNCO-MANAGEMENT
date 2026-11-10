import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, HardHat, Building, CalendarCheck, Table2, CreditCard } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TabType, NavigationTabs } from './components/NavigationTabs';
import { PayslipTab } from './components/PayslipTab';
import { DepartmentSummaryTab } from './components/DepartmentSummaryTab';
import { PayrollTableTab } from './components/PayrollTableTab';
import { AttendanceTab } from './components/AttendanceTab';
import { EmployeeListTab } from './components/EmployeeListTab';
import { DataAuditTab } from './components/DataAuditTab';
import { SeasonalWorkersTab } from './components/SeasonalWorkersTab';
import { TeamWorkersTab } from './components/TeamWorkersTab';
import { ProjectsTab } from './components/ProjectsTab';
import { SalaryAdvancesTab } from './components/SalaryAdvancesTab';
import { FinancialReportTab } from './components/FinancialReportTab';
import { BankExportModal } from './components/BankExportModal';
import { ImportModal } from './components/ImportModal';
import { CompanyModal } from './components/CompanyModal';
import { ZaloOASettingsModal } from './components/ZaloOASettingsModal';
import { BatchSendZaloModal } from './components/BatchSendZaloModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { MobileAttendanceApp } from './components/MobileAttendanceApp';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  loadCompanyConfigFromSupabase,
  loadEmployeesFromSupabase,
  loadSeasonalWorkersFromSupabase,
  loadProjectsFromSupabase,
  syncAllDataToSupabase,
  syncSeasonalWorkersToSupabase,
  syncSingleSeasonalWorkerToSupabase,
  deleteSeasonalWorkerFromSupabase,
  deleteBatchSeasonalWorkersFromSupabase,
  clearAllSeasonalWorkersFromSupabase,
  syncSingleEmployeeToSupabase,
  syncEmployeesToSupabase,
  deleteEmployeeFromSupabase,
  syncProjectsToSupabase,
  subscribeToSupabaseRealtime,
  autoApplyUrlConfig,
  getLastSyncedTime,
  isValidDailyAttendanceMap,
  materializeSeasonalMonthlyAttendance,
} from './services/supabaseService';
import { initialCompanyConfig, initialEmployees } from './data/mockPayrollData';
import {
  initialSeasonalWorkers,
  recomputeSeasonalWorkerPayroll as recomputeSeasonal,
  syncSeasonalWorkerForMonth,
  ensureSeasonalHistoricalMonths,
} from './data/mockSeasonalWorkers';
import { initialProjects, initialTeamWorkers, initialSalaryAdvances } from './data/mockProjectsAndTeams';
import {
  CompanyConfig,
  Employee,
  SeasonalWorker,
  Project,
  TeamWorker,
  SalaryAdvance,
  PayrollRecord,
} from './types';
import {
  recomputeEmployeePayroll,
  getRealCurrentDateInfo,
  ensureEmployeeHistoricalMonths,
  sanitizeEmployeeMonthlyAttendance,
  normalizeEmpName,
  syncEmployeeForMonth,
  buildMonthlyAttendanceRecord,
  isLegacy19MockEmployeeList,
} from './utils/payrollCalculator';
import { ensureEmployeeContract } from './utils/contractHelper';
import {
  fetchServerData,
  saveAllToServer,
  saveAttendanceToServer,
  saveSingleWorkerToServer,
  subscribeToSync,
  getLastSyncedTime as getServerLastSyncedTime,
} from './services/backendSyncService';

// Tự động kiểm tra URL chia sẻ cấu hình nếu có
autoApplyUrlConfig();

const DEFAULT_MOCK_TIMESTAMP = '2026-09-01T00:00:00.000Z';
const INITIAL_SEASONAL_CODES = new Set(initialSeasonalWorkers.map((w) => w.code));

function isUnmodifiedMockSeasonalWorker(w: SeasonalWorker): boolean {
  if (!INITIAL_SEASONAL_CODES.has(w.code)) return false;
  if ((w as any).dailyRateUpdatedAt || (w as any).bankUpdatedAt) return false;
  const initW = initialSeasonalWorkers.find((iw) => iw.code === w.code);
  if (!initW) return false;
  if (w.fullName !== initW.fullName || w.project !== initW.project) return false;
  const mAtt = w.monthlyAttendance || {};
  for (const rec of Object.values(mAtt)) {
    if (rec && rec.lastSubmittedAt && rec.lastSubmittedAt !== DEFAULT_MOCK_TIMESTAMP) {
      return false;
    }
  }
  return true;
}

function buildPayrollRecordsForSync(
  cfg: CompanyConfig,
  emps: Employee[],
  seas: SeasonalWorker[],
  teams: TeamWorker[] = []
): PayrollRecord[] {
  const periodCode = cfg.periodCode || `${String(cfg.month || 11).padStart(2, '0')}/${cfg.year || 2026}`;
  const periodTag = periodCode.replace('/', '_');
  const stdDays = cfg.standardWorkDays || 26;
  return [
    ...emps.map((e): PayrollRecord => ({
      id: `PR-EMP-${periodTag}-${e.code || e.id}`,
      periodType: 'MONTH',
      periodCode,
      workerType: 'PERMANENT',
      workerId: e.id,
      workerCode: e.code,
      workerName: e.fullName,
      departmentOrProject: e.department,
      standardWorkDays: e.standardWorkDays || stdDays,
      actualWorkDays: e.actualWorkDays || 0,
      baseSalaryOrRate: e.baseSalary || 0,
      salaryByDays: e.salaryByActualDays || 0,
      overtimeHours: e.overtimeHours || 0,
      overtimePay: e.overtimePay || 0,
      allowances:
        (e.responsibilityAllowance || 0) +
        (e.projectAllowance || 0) +
        (e.mealAllowance || 0) +
        (e.phoneTravelAllowance || 0),
      bonuses: e.kpiBonus || 0,
      totalIncome: e.totalIncome || 0,
      insuranceDeduction: e.totalInsurance || 0,
      taxDeduction: e.personalIncomeTax || 0,
      advancePayment: e.advancePayment || 0,
      totalDeductions: e.totalDeductions || 0,
      netSalary: e.netSalary || 0,
      bankAccount: e.bankAccount,
      bankName: e.bankName,
      payrollData: e,
    })),
    ...seas.map((w): PayrollRecord => ({
      id: `PR-SEA-${periodTag}-${w.code || w.id}`,
      periodType: 'MONTH',
      periodCode,
      workerType: w.payrollCycleType === 'TEAM' ? 'TEAM' : 'SEASONAL',
      workerId: w.id,
      workerCode: w.code,
      workerName: w.fullName,
      departmentOrProject: w.project || w.trade,
      standardWorkDays: stdDays,
      actualWorkDays: w.actualWorkDays || 0,
      baseSalaryOrRate: w.dailyRate || 0,
      salaryByDays: w.salaryByDays || 0,
      overtimeHours: w.overtimeHours || 0,
      overtimePay: w.overtimePay || 0,
      allowances: (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0),
      bonuses: w.otherBonus || 0,
      totalIncome: w.totalIncome || 0,
      taxDeduction: w.personalIncomeTax || 0,
      advancePayment: w.advancePayment || 0,
      totalDeductions: w.totalDeductions || 0,
      netSalary: w.netSalary || 0,
      bankAccount: w.bankAccount,
      bankName: w.bankName,
      payrollData: w,
    })),
    ...teams.map((t): PayrollRecord => ({
      id: `PR-TEAM-${periodTag}-${t.code || t.id}`,
      periodType: 'MONTH',
      periodCode,
      workerType: 'TEAM',
      workerId: t.id,
      workerCode: t.code,
      workerName: t.teamName,
      departmentOrProject: t.project || 'Công trình',
      standardWorkDays: stdDays,
      actualWorkDays: t.actualWorkDays || 0,
      baseSalaryOrRate: t.unitRate || 0,
      salaryByDays: t.salaryByDays || 0,
      overtimeHours: t.overtimeHours || 0,
      overtimePay: t.overtimePay || 0,
      allowances: t.mealAllowance || 0,
      bonuses: t.otherBonus || 0,
      totalIncome: t.totalIncome || 0,
      advancePayment: t.advancePayment || 0,
      totalDeductions: t.totalDeductions || 0,
      netSalary: t.netSalary || 0,
      bankAccount: t.bankAccount,
      bankName: t.bankName,
      payrollData: t,
    })),
  ];
}

// Hàm gộp cấu hình từ Cloud/Server nhưng LUÔN GIỮ NGUYÊN tháng/năm đang xem của người dùng
function mergeRemoteConfigPreservingPeriod(
  currentCfg: CompanyConfig,
  remoteCfg?: CompanyConfig | null
): CompanyConfig {
  if (remoteCfg && (remoteCfg as any).supabaseUrl && (remoteCfg as any).supabaseAnonKey && !isSupabaseConfigured()) {
    setSupabaseConfig((remoteCfg as any).supabaseUrl, (remoteCfg as any).supabaseAnonKey);
  }
  const sbCfg = getSupabaseConfig();
  const base = remoteCfg ? { ...remoteCfg } : { ...currentCfg };
  return {
    ...base,
    month: currentCfg.month,
    year: currentCfg.year,
    period: currentCfg.period,
    periodCode: currentCfg.periodCode,
    paymentDate: currentCfg.paymentDate,
    standardWorkDays: remoteCfg?.standardWorkDays || currentCfg.standardWorkDays || 26,
    ...(sbCfg.url && sbCfg.anonKey
      ? { supabaseUrl: sbCfg.url, supabaseAnonKey: sbCfg.anonKey }
      : {}),
  } as CompanyConfig;
}

const DELETED_EMP_STORAGE_KEY = 'pncons_deleted_emp_keys';
const DELETED_SEA_STORAGE_KEY = 'pncons_deleted_sea_keys';

function getDeletedKeys(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.map((x) => String(x).trim()).filter(Boolean))
      : new Set();
  } catch {
    return new Set();
  }
}

function addDeletedKeys(storageKey: string, keys: (string | undefined | null)[]) {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedKeys(storageKey);
    keys.forEach((k) => {
      if (k && String(k).trim()) set.add(String(k).trim());
    });
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {}
}

function removeDeletedKeys(storageKey: string, keys: (string | undefined | null)[]) {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedKeys(storageKey);
    keys.forEach((k) => {
      if (k && String(k).trim()) set.delete(String(k).trim());
    });
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {}
}

// Hàm gộp danh sách nhân viên chính thức từ Cloud/Server với dữ liệu hiện tại (lấy danh sách từ Cloud/Server làm chuẩn để đồng bộ xóa/sửa giữa 2 máy tính)
function mergeEmployeeListsPreservingAttendance(
  localList: Employee[],
  remoteList: Employee[],
  activeMonth: number,
  activeYear: number,
  stdDays: number = 26
): Employee[] {
  const deletedSet = getDeletedKeys(DELETED_EMP_STORAGE_KEY);
  const localByCodeOrId = new Map<string, Employee>();
  if (!isLegacy19MockEmployeeList(localList)) {
    localList.forEach((rawEmp) => {
      if (!rawEmp) return;
      if (deletedSet.has(String(rawEmp.id)) || (rawEmp.code && deletedSet.has(String(rawEmp.code)))) return;
      const emp = sanitizeEmployeeMonthlyAttendance(rawEmp);
      localByCodeOrId.set(emp.code || emp.id, emp);
    });
  }

  const effectiveRemote =
    Array.isArray(remoteList) && remoteList.length > 0 && !isLegacy19MockEmployeeList(remoteList)
      ? remoteList
      : localByCodeOrId.size > 0
      ? Array.from(localByCodeOrId.values())
      : initialEmployees;

  const map = new Map<string, Employee>();
  effectiveRemote.forEach((rawRem) => {
    if (!rawRem) return;
    if (deletedSet.has(String(rawRem.id)) || (rawRem.code && deletedSet.has(String(rawRem.code)))) return;
    const rEmp = sanitizeEmployeeMonthlyAttendance(rawRem);
    const key = rEmp.code || rEmp.id;
    const existing = localByCodeOrId.get(key);
    if (existing) {
      const samePerson =
        normalizeEmpName(existing.fullName) === normalizeEmpName(rEmp.fullName);
      const mergedMonthly = samePerson
        ? { ...(existing.monthlyAttendance || {}) }
        : { ...(rEmp.monthlyAttendance || {}) };

      if (samePerson) {
        Object.entries(rEmp.monthlyAttendance || {}).forEach(([mKey, rRec]) => {
          if (!rRec) return;
          const exRec = mergedMonthly[mKey];
          if (!exRec) {
            mergedMonthly[mKey] = rRec;
          } else {
            const exIsDefault = exRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const rIsDefault = rRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const exTime = exRec.lastSubmittedAt ? new Date(exRec.lastSubmittedAt).getTime() : 0;
            const rTime = rRec.lastSubmittedAt ? new Date(rRec.lastSubmittedAt).getTime() : 0;

            if (exIsDefault && !rIsDefault) {
              mergedMonthly[mKey] = rRec;
            } else if (!exIsDefault && rIsDefault) {
              mergedMonthly[mKey] = exRec;
            } else if (rTime >= exTime) {
              mergedMonthly[mKey] = rRec;
            } else {
              mergedMonthly[mKey] = exRec;
            }
          }
        });
      }

      const exProfileTime = Number(existing.updatedAt || 0);
      const rProfileTime = Number(rEmp.updatedAt || 0);

      let baseProfile: Employee;
      if (samePerson && exProfileTime > rProfileTime) {
        baseProfile = {
          ...rEmp,
          ...existing,
          updatedAt: exProfileTime,
        };
      } else if (samePerson && exProfileTime === 0 && rProfileTime === 0) {
        // Trường hợp các bản ghi cũ chưa có updatedAt: nếu máy hiện tại đã nhập Phụ cấp mà Cloud đang = 0 thì giữ lại Phụ cấp đã nhập
        const hasLocalAllowances =
          (existing.responsibilityAllowance || 0) > 0 ||
          (existing.projectAllowance || 0) > 0 ||
          (existing.mealAllowance || 0) > 0 ||
          (existing.phoneTravelAllowance || 0) > 0 ||
          (existing.kpiBonus || 0) > 0;
        const hasRemoteAllowances =
          (rEmp.responsibilityAllowance || 0) > 0 ||
          (rEmp.projectAllowance || 0) > 0 ||
          (rEmp.mealAllowance || 0) > 0 ||
          (rEmp.phoneTravelAllowance || 0) > 0 ||
          (rEmp.kpiBonus || 0) > 0;
        baseProfile = {
          ...existing,
          ...rEmp,
          ...(hasLocalAllowances && !hasRemoteAllowances
            ? {
                responsibilityAllowance: existing.responsibilityAllowance || 0,
                projectAllowance: existing.projectAllowance || 0,
                mealAllowance: existing.mealAllowance || 0,
                phoneTravelAllowance: existing.phoneTravelAllowance || 0,
                kpiBonus: existing.kpiBonus || 0,
                updatedAt: Date.now(),
              }
            : {}),
        };
      } else {
        baseProfile = {
          ...(samePerson ? existing : {}),
          ...rEmp,
          updatedAt: Math.max(exProfileTime, rProfileTime),
        };
      }

      map.set(key, {
        ...baseProfile,
        monthlyAttendance: mergedMonthly,
        periodRecords: samePerson
          ? {
              ...(existing.periodRecords || {}),
              ...(rEmp.periodRecords || {}),
            }
          : rEmp.periodRecords || {},
      });
    } else {
      map.set(key, rEmp);
    }
  });

  const seenIds = new Set<string>();
  return Array.from(map.values())
    .map((emp, idx) => {
      let uniqueId = String(emp.id || emp.code || `EMP_${idx + 1}`);
      if (seenIds.has(uniqueId)) {
        uniqueId = `${uniqueId}_${idx + 1}`;
      }
      seenIds.add(uniqueId);
      const withContract = ensureEmployeeContract({ ...emp, id: uniqueId });
      const withHistory = ensureEmployeeHistoricalMonths(withContract);
      return syncEmployeeForMonth(withHistory, activeMonth, activeYear, stdDays);
    })
    .sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
}

// Hàm nhận diện chế độ xem Chấm Công Di Động (chỉ khi có tham số URL chỉ định rõ ràng hoặc mở từ link riêng)
function checkShouldShowAttendanceView(): { shouldShow: boolean; workerCode?: string } {
  if (typeof window === 'undefined') return { shouldShow: false };

  // Nếu người dùng đã chủ động bấm nút "Thoát về trang quản trị" trong phiên này:
  if (sessionStorage.getItem('pncons_admin_auth') === 'true') {
    const rawSearch = window.location.search;
    const rawHash = window.location.hash.toLowerCase();
    // Chỉ kích hoạt lại nếu trên URL có tham số view=chamcong mới hoặc worker mới
    if (!rawSearch.includes('chamcong') && !rawHash.includes('chamcong') && !rawSearch.includes('worker=')) {
      return { shouldShow: false };
    }
  }

  const search = window.location.search;
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(search);

  // Lấy workerCode từ search params, hash, hoặc sessionStorage
  let workerCode = searchParams.get('worker') || undefined;
  if (!workerCode && window.location.hash.includes('worker=')) {
    const match = window.location.hash.match(/worker=([^&]+)/);
    if (match && match[1]) workerCode = decodeURIComponent(match[1]);
  }
  if (!workerCode) {
    const cachedCode = sessionStorage.getItem('pncons_mobile_worker_code');
    if (cachedCode) workerCode = cachedCode;
  }

  // Chuyển sang chế độ Chấm Công Di Động khi mở link chia sẻ:
  // Hỗ trợ cả query params (?view=chamcong, ?worker=...) và hash (#chamcong&worker=...)
  const hasAttendanceParam =
    searchParams.get('view') === 'chamcong' ||
    searchParams.get('mode') === 'attendance' ||
    searchParams.get('mode') === 'mobile_attendance' ||
    searchParams.get('chamcong') === '1' ||
    hash.includes('chamcong') ||
    hash.includes('view=chamcong') ||
    hash.includes('mode=attendance') ||
    hash.includes('chamcong=1') ||
    Boolean(searchParams.get('worker')) ||
    sessionStorage.getItem('pncons_in_mobile_mode') === 'true';

  if (hasAttendanceParam) {
    if (workerCode) {
      sessionStorage.setItem('pncons_mobile_worker_code', workerCode);
    }
    sessionStorage.setItem('pncons_in_mobile_mode', 'true');
    return { shouldShow: true, workerCode };
  }

  // Luôn luôn mở ứng dụng quản trị bảng lương và chấm công đầy đủ
  return { shouldShow: false, workerCode };
}

// DỮ LIỆU ĐƯỢC BẢO LƯU 100% - LUÔN HIỂN THỊ THÁNG & NGÀY THỰC TẾ HIỆN TẠI KHI MỞ APP
export default function App() {
  const realDateInfo = useMemo(() => getRealCurrentDateInfo(), []);

  const [config, setConfig] = useState<CompanyConfig>(() => {
    const realInfo = getRealCurrentDateInfo();
    const curM = realInfo.realMonth;
    const curY = realInfo.realYear;
    const curMPadded = realInfo.realMonthPadded;
    const nextM = curM === 12 ? '01' : curM + 1 < 10 ? `0${curM + 1}` : `${curM + 1}`;
    const nextY = curM === 12 ? curY + 1 : curY;

    const saved = localStorage.getItem('payroll_company_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          month: curM,
          year: curY,
          period: `Kỳ lương tháng ${curMPadded} năm ${curY}`,
          periodCode: `${curMPadded}/${curY}`,
          paymentDate: `05/${nextM}/${nextY}`,
          standardWorkDays: parsed.standardWorkDays || 26,
        };
      } catch {
        return initialCompanyConfig;
      }
    }
    return initialCompanyConfig;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const realInfo = getRealCurrentDateInfo();
    const saved = localStorage.getItem('payroll_employees');
    if (saved) {
      try {
        const parsed: Employee[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && !isLegacy19MockEmployeeList(parsed)) {
          // Gộp thêm dữ liệu các tháng đã lưu trong các slot payroll_month_YYYY_MM (nếu có) để không bao giờ mất lịch sử
          const legacyMonthSlots: Array<{ m: number; y: number; key: string; monthKey: string }> = [
            { m: 9, y: 2026, key: 'payroll_month_2026_09', monthKey: '2026-09' },
            { m: 10, y: 2026, key: 'payroll_month_2026_10', monthKey: '2026-10' },
            { m: 11, y: 2026, key: 'payroll_month_2026_11', monthKey: '2026-11' },
            { m: 12, y: 2026, key: 'payroll_month_2026_12', monthKey: '2026-12' },
          ];
          const legacyByMonth: Record<string, Employee[]> = {};
          legacyMonthSlots.forEach((slot) => {
            try {
              const rawSlot = localStorage.getItem(slot.key);
              if (rawSlot) {
                const arr = JSON.parse(rawSlot);
                if (Array.isArray(arr) && !isLegacy19MockEmployeeList(arr)) {
                  legacyByMonth[slot.monthKey] = arr;
                }
              }
            } catch {}
          });

          const deletedEmpSet = getDeletedKeys(DELETED_EMP_STORAGE_KEY);
          const seenEmpIds = new Set<string>();
          const list = parsed
            .filter(
              (emp) =>
                emp &&
                !deletedEmpSet.has(String(emp.id)) &&
                !(emp.code && deletedEmpSet.has(String(emp.code)))
            )
            .map((emp, idx) => {
              let uniqueEmpId = String(emp.id || emp.code || `EMP_${idx + 1}`);
              if (seenEmpIds.has(uniqueEmpId)) {
                uniqueEmpId = `${uniqueEmpId}_${idx + 1}`;
              }
              seenEmpIds.add(uniqueEmpId);
              const withContract = ensureEmployeeContract({ ...emp, id: uniqueEmpId });
              if (withContract.projectAllowance === undefined) {
                const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
                withContract.projectAllowance = defaultEmp ? defaultEmp.projectAllowance || 0 : 0;
              }
              if (withContract.insuranceSalary === undefined) {
                const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
                withContract.insuranceSalary = defaultEmp ? defaultEmp.insuranceSalary : 0;
              }

              const mergedMonthly = { ...(withContract.monthlyAttendance || {}) };
              legacyMonthSlots.forEach((slot) => {
                const slotList = legacyByMonth[slot.monthKey];
                if (!slotList) return;
                const foundInSlot = slotList.find(
                  (x) =>
                    normalizeEmpName(x?.fullName) === normalizeEmpName(withContract.fullName) &&
                    (x.code === withContract.code || x.id === withContract.id)
                );
                if (!foundInSlot) return;
                const slotRec = foundInSlot.monthlyAttendance?.[slot.monthKey];
                if (slotRec && Object.keys(slotRec.days || {}).length > 0 && !mergedMonthly[slot.monthKey]) {
                  mergedMonthly[slot.monthKey] = slotRec;
                }
              });

              const withHistory = ensureEmployeeHistoricalMonths({
                ...withContract,
                monthlyAttendance: mergedMonthly,
              });
              return syncEmployeeForMonth(withHistory, realInfo.realMonth, realInfo.realYear, 26);
            });
          return list.sort((a, b) => {
            if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
          });
        } else if (isLegacy19MockEmployeeList(parsed)) {
          // Tự động dọn dẹp dữ liệu 19 nhân viên mẫu cũ trong LocalStorage trên máy tính thứ 2
          try {
            ['payroll_month_2026_09', 'payroll_month_2026_10', 'payroll_month_2026_11', 'payroll_month_2026_12'].forEach(
              (k) => localStorage.removeItem(k)
            );
          } catch {}
        }
      } catch (e) {
        console.error('Error parsing saved employees', e);
      }
    }

    return initialEmployees.map((emp) =>
      syncEmployeeForMonth(ensureEmployeeHistoricalMonths(emp), realInfo.realMonth, realInfo.realYear, 26)
    );
  });

  // Hàm làm sạch danh sách nhân viên thời vụ (loại bỏ trùng lặp key/id hoặc bản ghi NV chính thức bị lẫn)
  const cleanSeasonalList = (
    rawList: SeasonalWorker[],
    targetMonth: number = config.month || realDateInfo.realMonth,
    targetYear: number = config.year || realDateInfo.realYear
  ): SeasonalWorker[] => {
    const deletedSeaSet = getDeletedKeys(DELETED_SEA_STORAGE_KEY);
    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();
    const result: SeasonalWorker[] = [];
    rawList.forEach((w, idx) => {
      if (!w) return;
      const codeStr = String(w.code || '');
      if (codeStr.startsWith('PNC00') || w.trade === 'Nhân viên chính thức') return;
      if (deletedSeaSet.has(String(w.id)) || (codeStr && deletedSeaSet.has(codeStr))) return;
      let uniqueCode = codeStr || `SEAS_${w.id || idx + 1}`;
      if (seenCodes.has(uniqueCode)) {
        let suffix = idx + 1;
        while (seenCodes.has(`PNC-TV${String(suffix).padStart(2, '0')}`)) {
          suffix++;
        }
        uniqueCode = `PNC-TV${String(suffix).padStart(2, '0')}`;
      }
      seenCodes.add(uniqueCode);

      let uniqueId = String(w.id || uniqueCode);
      if (seenIds.has(uniqueId)) {
        uniqueId = `${uniqueCode}_${idx + 1}`;
      }
      seenIds.add(uniqueId);

      result.push(
        syncSeasonalWorkerForMonth(
          ensureSeasonalHistoricalMonths(
            materializeSeasonalMonthlyAttendance({ ...w, id: uniqueId, code: uniqueCode })
          ),
          targetMonth,
          targetYear
        )
      );
    });
    return result.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  // DANH SÁCH CÔNG NHÂN KỸ THUẬT & NHÂN LỰC THỜI VỤ
  const [seasonalWorkers, setSeasonalWorkers] = useState<SeasonalWorker[]>(() => {
    const realInfo = getRealCurrentDateInfo();
    const saved = localStorage.getItem('payroll_seasonal_workers');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = cleanSeasonalList(parsed, realInfo.realMonth, realInfo.realYear);
          if (cleaned.length > 0) return cleaned;
        }
      } catch (e) {
        console.error('Error parsing saved seasonal workers', e);
      }
    }
    return initialSeasonalWorkers.map((w) =>
      syncSeasonalWorkerForMonth(ensureSeasonalHistoricalMonths(w), realInfo.realMonth, realInfo.realYear)
    );
  });

  // DANH SÁCH DỰ ÁN CÔNG TRÌNH
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('payroll_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing projects', e);
      }
    }
    return initialProjects;
  });

  // DANH SÁCH NHÂN VIÊN TỔ ĐỘI
  const [teamWorkers, setTeamWorkers] = useState<TeamWorker[]>(() => {
    const saved = localStorage.getItem('payroll_team_workers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing team workers', e);
      }
    }
    return initialTeamWorkers;
  });

  // DANH SÁCH BẢN LƯƠNG ỨNG
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>(() => {
    const saved = localStorage.getItem('payroll_salary_advances');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing salary advances', e);
      }
    }
    return initialSalaryAdvances;
  });

  type SubViewType = 'LIST' | 'ATTENDANCE' | 'PAYROLL' | 'ADVANCES';
  const [activeTab, setActiveTab] = useState<TabType>('SEASONAL_WORKERS');
  const [employeeSubTab, setEmployeeSubTab] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('SEASONAL');
  const [permanentSubTab, setPermanentSubTab] = useState<SubViewType>('LIST');
  const [seasonalSubTab, setSeasonalSubTab] = useState<SubViewType>('LIST');

  const handleSelectTab = (tab: TabType) => {
    if (tab === 'EMPLOYEE_LIST') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('LIST');
      setEmployeeSubTab('PERMANENT');
    } else if (tab === 'PERMANENT_PAYROLL' || tab === 'PAYROLL_TABLE') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('PAYROLL');
    } else if (tab === 'SEASONAL_PAYROLL') {
      setActiveTab('SEASONAL_WORKERS');
      setSeasonalSubTab('PAYROLL');
    } else if (tab === 'ATTENDANCE') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('ATTENDANCE');
    } else if (tab === 'SALARY_ADVANCES') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('ADVANCES');
    } else {
      setActiveTab(tab);
      if (tab === 'PERMANENT_EMPLOYEES') setEmployeeSubTab('PERMANENT');
      if (tab === 'SEASONAL_WORKERS') setEmployeeSubTab('SEASONAL');
    }
  };

  const handleSelectSubTab = (
    parentTab: 'PERMANENT_EMPLOYEES' | 'SEASONAL_WORKERS',
    sub: SubViewType
  ) => {
    setActiveTab(parentTab);
    if (parentTab === 'PERMANENT_EMPLOYEES') {
      setPermanentSubTab(sub);
      setEmployeeSubTab('PERMANENT');
    } else {
      setSeasonalSubTab(sub);
      setEmployeeSubTab('SEASONAL');
    }
  };
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBankExportOpen, setIsBankExportOpen] = useState(false);
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [isZaloSettingsOpen, setIsZaloSettingsOpen] = useState(false);
  const [isBatchZaloOpen, setIsBatchZaloOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [lastSyncedText, setLastSyncedText] = useState<string | null>(getLastSyncedTime());

  const initialAttendanceCheck = useMemo(() => checkShouldShowAttendanceView(), []);

  // Chế độ xem Web App Chấm Công Di Động (dành riêng cho điện thoại thợ hoặc mở từ link riêng)
  const [isMobileAttendanceView, setIsMobileAttendanceView] = useState<boolean>(
    () => initialAttendanceCheck.shouldShow
  );

  const [activeMobileWorkerCode, setActiveMobileWorkerCode] = useState<string | undefined>(
    () => initialAttendanceCheck.workerCode
  );

  // Lắng nghe thay đổi URL (popstate & hashchange) để tự động chuyển sang chế độ chấm công khi có param
  useEffect(() => {
    const handleUrlChange = () => {
      const check = checkShouldShowAttendanceView();
      if (check.shouldShow) {
        setIsMobileAttendanceView(true);
        if (check.workerCode) setActiveMobileWorkerCode(check.workerCode);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Hàm tạo chuỗi snapshot đại diện cho TOÀN BỘ thông tin nhân viên (lương, phụ cấp, bảo hiểm, hợp đồng, ngân hàng, chấm công...)
  const serializeDataSnapshot = (cfg: CompanyConfig, emps: Employee[], seas: SeasonalWorker[]): string => {
    try {
      return JSON.stringify({
        p: cfg?.periodCode,
        e: emps.map((x) => [
          x.id,
          x.code,
          x.fullName,
          x.title,
          x.department,
          x.phone,
          x.email,
          x.idCard,
          x.taxCode,
          x.joinDate,
          x.status,
          x.salaryType,
          x.dailyRate,
          x.baseSalary,
          x.insuranceSalary,
          x.responsibilityAllowance,
          x.projectAllowance,
          x.mealAllowance,
          x.phoneTravelAllowance,
          x.kpiBonus,
          x.otherIncome,
          x.dependents,
          x.actualWorkDays,
          x.overtimeHours,
          x.advancePayment,
          x.bankAccount,
          x.bankName,
          x.contractType,
          x.contractDuration,
          x.contractStartDate,
          x.contractEndDate,
          x.contractNumber,
          x.updatedAt,
          x.monthlyAttendance,
        ]),
        s: seas.map((x) => [
          x.id,
          x.code,
          x.fullName,
          x.trade,
          x.skillLevel,
          x.project,
          x.teamName,
          x.phone,
          x.idCard,
          x.paymentMethod,
          x.actualWorkDays,
          x.advancePayment,
          x.dailyRate,
          x.overtimeHours,
          x.mealAllowance,
          x.travelSafetyAllowance,
          x.otherBonus,
          x.hasTaxCommitment,
          x.status,
          x.payrollCycleType,
          x.bankAccount,
          x.bankName,
          x.salaryByDays,
          x.paymentDate,
          x.selectedForAttendance,
          x.updatedAt,
          x.monthlyAttendance,
          x.periodRecords,
        ]),
      });
    } catch {
      return '';
    }
  };

  // Snapshot & state refs theo dõi trạng thái mới nhất (chống stale closure, chống loop và không ghi đè khi đang nhập liệu)
  const lastSavedSnapshotRef = useRef<string>('');
  const lastServerSnapshotRef = useRef<string>('');
  const isSyncingRef = useRef(false);
  const lastLocalEditAtRef = useRef<number>(0);
  const singleWorkerSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const realtimeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configRef = useRef(config);
  const employeesRef = useRef(employees);
  const seasonalWorkersRef = useRef(seasonalWorkers);
  const periodCodeRef = useRef(config.periodCode);
  const activeMonthRef = useRef(config.month || realDateInfo.realMonth);
  const activeYearRef = useRef(config.year || realDateInfo.realYear);

  useEffect(() => {
    configRef.current = config;
    employeesRef.current = employees;
    seasonalWorkersRef.current = seasonalWorkers;
    periodCodeRef.current = config.periodCode;
    activeMonthRef.current = config.month || realDateInfo.realMonth;
    activeYearRef.current = config.year || realDateInfo.realYear;
  }, [config, employees, seasonalWorkers, realDateInfo.realMonth, realDateInfo.realYear]);

  // Chỉ chặn đồng bộ nền trong 2.5 giây ngay sau khi người dùng vừa gõ phím hoặc bấm sửa dữ liệu
  const isUserEditingOrTyping = (): boolean => {
    return Date.now() - lastLocalEditAtRef.current < 2500;
  };

  // Khởi tạo snapshot ban đầu
  useEffect(() => {
    const initSnap = serializeDataSnapshot(config, employees, seasonalWorkers);
    lastSavedSnapshotRef.current = initSnap;
    lastServerSnapshotRef.current = initSnap;
  }, []);

  // Kênh truyền tin giữa các tab/cửa sổ trên cùng trình duyệt (BroadcastChannel)
  const syncBroadcast = useMemo(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        return new BroadcastChannel('pncons_payroll_broadcast_sync');
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const notifyCrossTab = () => {
    try {
      syncBroadcast?.postMessage({ type: 'PAYROLL_DATA_CHANGED', timestamp: Date.now() });
    } catch {}
  };

  // Hợp nhất danh sách công nhân thời vụ giữa máy hiện tại và Cloud/Server, bảo toàn 100% dữ liệu chấm công các tháng
  const mergeSeasonalListsPreservingAttendance = (
    localList: SeasonalWorker[],
    cloudList: SeasonalWorker[],
    activeMonth: number,
    activeYear: number,
    periodCodeStr?: string
  ): { mergedList: SeasonalWorker[]; needsPushToCloud: boolean } => {
    const localMap = new Map<string, SeasonalWorker>();
    const resultMap = new Map<string, SeasonalWorker>();
    let needsPushToCloud = false;

    const getUniqueWorkerMapKey = (
      w: SeasonalWorker,
      map: Map<string, SeasonalWorker>
    ): string => {
      const baseKey = String(w.code || w.id || '').trim();
      const existing = map.get(baseKey);
      if (!existing) return baseKey;
      const sameId = w.id && existing.id && String(w.id) === String(existing.id);
      const sameName =
        (existing.fullName || '').trim().toLowerCase() ===
        (w.fullName || '').trim().toLowerCase();
      if (sameId || sameName) return baseKey;
      return `${baseKey}__${String(w.id || (w.fullName || '').trim().toLowerCase())}`;
    };

    const findMatchingKeyInMap = (
      w: SeasonalWorker,
      map: Map<string, SeasonalWorker>
    ): string => {
      const baseKey = String(w.code || w.id || '').trim();
      const wName = (w.fullName || '').trim().toLowerCase();
      for (const [k, v] of map.entries()) {
        if (w.id && v.id && String(w.id) === String(v.id) && (v.fullName || '').trim().toLowerCase() === wName) {
          return k;
        }
      }
      for (const [k, v] of map.entries()) {
        if (
          v.code === w.code &&
          (v.fullName || '').trim().toLowerCase() === wName
        ) {
          return k;
        }
      }
      for (const [k, v] of map.entries()) {
        if (w.id && v.id && String(w.id) === String(v.id)) {
          return k;
        }
      }
      const direct = map.get(baseKey);
      if (direct && (direct.payrollCycleType || '1_MONTH') === (w.payrollCycleType || '1_MONTH')) {
        return baseKey;
      }
      return getUniqueWorkerMapKey(w, map);
    };

    const deletedSeaSet = getDeletedKeys(DELETED_SEA_STORAGE_KEY);
    localList.forEach((rawW) => {
      if (!rawW) return;
      if (deletedSeaSet.has(String(rawW.id)) || (rawW.code && deletedSeaSet.has(String(rawW.code)))) return;
      const w = materializeSeasonalMonthlyAttendance(rawW, periodCodeStr);
      const key = getUniqueWorkerMapKey(w, localMap);
      localMap.set(key, w);
      // Chỉ giữ sẵn những công nhân thực tế của người dùng (không giữ 12 công nhân mẫu mặc định nếu Cloud đã có danh sách riêng)
      if (!isUnmodifiedMockSeasonalWorker(w)) {
        resultMap.set(key, w);
      }
    });

    const cloudKeys = new Set<string>();
    cloudList.forEach((rawCw) => {
      if (!rawCw) return;
      if (deletedSeaSet.has(String(rawCw.id)) || (rawCw.code && deletedSeaSet.has(String(rawCw.code)))) return;
      const cw = materializeSeasonalMonthlyAttendance(rawCw, periodCodeStr);
      const key = findMatchingKeyInMap(cw, localMap);
      cloudKeys.add(key);
      const existing = localMap.get(key);

      if (existing) {
        const mergedMonthly: Record<string, any> = { ...(existing.monthlyAttendance || {}) };

        // Kiểm tra xem ở máy hiện tại có tháng nào đã chấm công thật mà trên Cloud chưa có hoặc bị rỗng không
        Object.entries(existing.monthlyAttendance || {}).forEach(([mKey, exRec]) => {
          if (!exRec) return;
          const exIsDefault = exRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
          const exWork = Number(exRec.totalWorkDays || 0);
          const exOt = Number(exRec.totalOtHours || 0);
          const cRec = cw.monthlyAttendance?.[mKey];
          const exTime = exRec?.lastSubmittedAt ? new Date(exRec.lastSubmittedAt).getTime() : 0;
          const cTime = cRec?.lastSubmittedAt ? new Date(cRec.lastSubmittedAt).getTime() : 0;
          if (!exIsDefault && (exWork > 0 || exOt > 0) && !cRec) {
            needsPushToCloud = true;
          } else if (!exIsDefault && cRec && exTime > cTime) {
            needsPushToCloud = true;
          }
        });

        Object.entries(cw.monthlyAttendance || {}).forEach(([mKey, cRec]) => {
          if (!cRec) return;
          const exRec = mergedMonthly[mKey];
          if (!exRec) {
            mergedMonthly[mKey] = cRec;
          } else {
            const exIsDefault = exRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const cIsDefault = cRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const exTime = exRec.lastSubmittedAt ? new Date(exRec.lastSubmittedAt).getTime() : 0;
            const cTime = cRec.lastSubmittedAt ? new Date(cRec.lastSubmittedAt).getTime() : 0;
            const exHasDays = isValidDailyAttendanceMap(exRec.days);
            const cHasDays = isValidDailyAttendanceMap(cRec.days);

            let chosenRec = cRec;
            if (exIsDefault && !cIsDefault) {
              chosenRec = cRec;
            } else if (!exIsDefault && cIsDefault) {
              chosenRec = exRec;
              needsPushToCloud = true;
            } else if (cTime > 0 && exTime > 0 && cTime !== exTime) {
              if (cTime > exTime) {
                chosenRec = cRec;
              } else {
                chosenRec = exRec;
                needsPushToCloud = true;
              }
            } else if (!cHasDays && exHasDays && Number(exRec.totalWorkDays || 0) > 0 && cTime <= exTime) {
              chosenRec = exRec;
              needsPushToCloud = true;
            } else {
              chosenRec = cRec;
            }

            const chosenDays = { ...(chosenRec.days || {}) };
            let totDays = 0;
            let totOt = 0;
            Object.values(chosenDays).forEach((d: any) => {
              if (!d) return;
              if (d.statusType === 'LATE') {
                totDays += Number(d.workUnits || 0) > 0 ? Number(d.workUnits) : 1;
              } else if (d.statusType !== 'ABSENT' && d.statusType !== 'LEAVE') {
                totDays += Number(d.workUnits || 0);
              }
              totOt += Number(d.otHours || 0);
            });
            const finalWorkDays =
              Object.keys(chosenDays).length > 0
                ? Math.round(totDays * 10) / 10
                : Number(chosenRec.totalWorkDays || 0);
            const finalOtHours =
              Object.keys(chosenDays).length > 0 ? totOt : Number(chosenRec.totalOtHours || 0);

            mergedMonthly[mKey] = {
              ...exRec,
              ...chosenRec,
              days: chosenDays,
              totalWorkDays: finalWorkDays,
              totalOtHours: finalOtHours,
            };
          }
        });

        const exRateTime = Number((existing as any).dailyRateUpdatedAt || 0);
        const cwRateTime = Number((cw as any).dailyRateUpdatedAt || 0);
        const resolvedDailyRate =
          exRateTime > cwRateTime && typeof existing.dailyRate === 'number'
            ? existing.dailyRate
            : cwRateTime > exRateTime && typeof cw.dailyRate === 'number'
            ? cw.dailyRate
            : Number(cw.dailyRate ?? existing.dailyRate ?? 0);

        const exUpdatedAt = Number(existing.updatedAt || (existing as any).dailyRateUpdatedAt || 0);
        const cwUpdatedAt = Number(cw.updatedAt || (cw as any).dailyRateUpdatedAt || 0);
        const localIsNewer = exUpdatedAt > cwUpdatedAt;
        if (localIsNewer) {
          needsPushToCloud = true;
        }
        const resolvedCycleType = localIsNewer
          ? existing.payrollCycleType || cw.payrollCycleType || '1_MONTH'
          : cw.payrollCycleType || existing.payrollCycleType || '1_MONTH';

        const mergedPeriodRecs: Record<string, any> = {};
        const allPeriodKeys = new Set([
          ...Object.keys(existing.periodRecords || {}),
          ...Object.keys(cw.periodRecords || {}),
        ]);
        allPeriodKeys.forEach((pKey) => {
          const exPRec = existing.periodRecords?.[pKey];
          const cwPRec = cw.periodRecords?.[pKey];
          if (exPRec && !cwPRec) {
            mergedPeriodRecs[pKey] = exPRec;
            if (exPRec.isRecorded || Number(exPRec.salaryByDays || 0) > 0 || Number(exPRec.actualWorkDays || 0) > 0) {
              needsPushToCloud = true;
            }
          } else if (!exPRec && cwPRec) {
            mergedPeriodRecs[pKey] = cwPRec;
          } else if (exPRec && cwPRec) {
            const exRecorded =
              Boolean(exPRec.isRecorded) ||
              Number(exPRec.salaryByDays || 0) > 0 ||
              Number(exPRec.actualWorkDays || 0) > 0;
            const cwRecorded =
              Boolean(cwPRec.isRecorded) ||
              Number(cwPRec.salaryByDays || 0) > 0 ||
              Number(cwPRec.actualWorkDays || 0) > 0;
            const exRecTime = Number((exPRec as any).updatedAt || exUpdatedAt || 0);
            const cwRecTime = Number((cwPRec as any).updatedAt || cwUpdatedAt || 0);
            if (exRecorded && !cwRecorded && cwRecTime <= exRecTime) {
              mergedPeriodRecs[pKey] = exPRec;
              needsPushToCloud = true;
            } else if (cwRecorded && !exRecorded && exRecTime <= cwRecTime) {
              mergedPeriodRecs[pKey] = cwPRec;
            } else if (exRecTime > cwRecTime) {
              mergedPeriodRecs[pKey] = exPRec;
              needsPushToCloud = true;
            } else {
              mergedPeriodRecs[pKey] = cwPRec;
            }
          }
        });

        if (resolvedDailyRate >= 0) {
          Object.keys(mergedPeriodRecs).forEach((pKey) => {
            const r = mergedPeriodRecs[pKey];
            if (!r) return;
            const isTeamRec = resolvedCycleType === 'TEAM' || r.cycleType === 'TEAM';
            const recRate = isTeamRec
              ? Number(
                  r.salaryByDays !== undefined &&
                    r.salaryByDays > 0 &&
                    (!r.actualWorkDays || r.actualWorkDays === 1)
                    ? r.salaryByDays
                    : r.dailyRate ?? r.salaryByDays ?? resolvedDailyRate ?? 0
                )
              : resolvedDailyRate > 0
              ? resolvedDailyRate
              : Number(r.dailyRate || 0);
            const workDays = isTeamRec
              ? Number(r.actualWorkDays || 0) > 0
                ? Number(r.actualWorkDays)
                : r.isRecorded
                ? 1
                : 0
              : Number(r.actualWorkDays || 0);
            const sByDays = workDays > 0 ? Math.round(recRate * workDays) : 0;
            const otPay = Math.round((recRate / 8) * Number(r.overtimeHours || 0) * 1.5);
            const totInc =
              sByDays +
              otPay +
              Number(r.mealAllowance || 0) +
              Number(r.travelSafetyAllowance || 0) +
              Number(r.otherBonus || 0);
            const tax = !(r.hasTaxCommitment ?? true) && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
            const totDed = tax + Number(r.advancePayment || 0);
            mergedPeriodRecs[pKey] = {
              ...r,
              ...(isTeamRec ? { cycleType: 'TEAM' } : {}),
              dailyRate: recRate,
              actualWorkDays: workDays,
              salaryByDays: sByDays,
              overtimePay: otPay,
              totalIncome: totInc,
              personalIncomeTax: tax,
              totalDeductions: totDed,
              netSalary: Math.max(0, totInc - totDed),
            };
          });
        }

        const exBankTime = Number((existing as any).bankUpdatedAt || 0);
        const cwBankTime = Number((cw as any).bankUpdatedAt || 0);
        const resolvedBankAccount =
          exBankTime > cwBankTime
            ? (existing.bankAccount || '')
            : cwBankTime > exBankTime
            ? (cw.bankAccount || '')
            : (cw.bankAccount || existing.bankAccount || '');
        const resolvedBankName =
          exBankTime > cwBankTime
            ? (existing.bankName || '')
            : cwBankTime > exBankTime
            ? (cw.bankName || '')
            : (cw.bankName || existing.bankName || 'Vietcombank');
        const resolvedPaymentMethod =
          exBankTime > cwBankTime
            ? (existing.paymentMethod || 'BANK')
            : cwBankTime > exBankTime
            ? (cw.paymentMethod || 'BANK')
            : (cw.paymentMethod || existing.paymentMethod || 'BANK');

        const exAllowTime = Number((existing as any).allowanceUpdatedAt || 0);
        const cwAllowTime = Number((cw as any).allowanceUpdatedAt || 0);
        const maxAllowTime = Math.max(exAllowTime, cwAllowTime);
        if (exAllowTime > cwAllowTime) {
          needsPushToCloud = true;
        }
        const resolvedMealAllowance =
          exAllowTime > cwAllowTime
            ? Number(existing.mealAllowance || 0)
            : cwAllowTime > exAllowTime
            ? Number(cw.mealAllowance || 0)
            : maxAllowTime > 0
            ? Number(cw.mealAllowance ?? existing.mealAllowance ?? 0)
            : 0;
        const resolvedTravelAllowance =
          exAllowTime > cwAllowTime
            ? Number(existing.travelSafetyAllowance || 0)
            : cwAllowTime > exAllowTime
            ? Number(cw.travelSafetyAllowance || 0)
            : maxAllowTime > 0
            ? Number(cw.travelSafetyAllowance ?? existing.travelSafetyAllowance ?? 0)
            : 0;
        const resolvedOtherBonus =
          exAllowTime > cwAllowTime
            ? Number(existing.otherBonus || 0)
            : cwAllowTime > exAllowTime
            ? Number(cw.otherBonus || 0)
            : maxAllowTime > 0
            ? Number(cw.otherBonus ?? existing.otherBonus ?? 0)
            : 0;

        const baseMerged = localIsNewer ? { ...cw, ...existing } : { ...existing, ...cw };

        resultMap.set(key, {
          ...baseMerged,
          payrollCycleType: resolvedCycleType,
          updatedAt: Math.max(exUpdatedAt, cwUpdatedAt) || undefined,
          bankAccount: resolvedBankAccount,
          bankName: resolvedBankName,
          paymentMethod: resolvedPaymentMethod,
          ...(Math.max(exBankTime, cwBankTime) > 0
            ? { bankUpdatedAt: Math.max(exBankTime, cwBankTime) }
            : {}),
          dailyRate: resolvedDailyRate,
          ...(Math.max(exRateTime, cwRateTime) > 0
            ? { dailyRateUpdatedAt: Math.max(exRateTime, cwRateTime) }
            : {}),
          ...(resolvedCycleType !== 'TEAM'
            ? {
                mealAllowance: resolvedMealAllowance,
                travelSafetyAllowance: resolvedTravelAllowance,
                otherBonus: resolvedOtherBonus,
                ...(maxAllowTime > 0 ? { allowanceUpdatedAt: maxAllowTime } : {}),
              }
            : {}),
          actualWorkDays: localIsNewer
            ? existing.actualWorkDays ?? cw.actualWorkDays
            : cw.actualWorkDays !== undefined
            ? cw.actualWorkDays
            : existing.actualWorkDays,
          overtimeHours: localIsNewer
            ? existing.overtimeHours ?? cw.overtimeHours
            : cw.overtimeHours !== undefined
            ? cw.overtimeHours
            : existing.overtimeHours,
          monthlyAttendance: mergedMonthly,
          periodRecords: mergedPeriodRecs,
        } as SeasonalWorker);
      } else {
        resultMap.set(key, cw);
      }
    });

    // Kiểm tra xem có công nhân thực tế nào ở máy hiện tại chưa có trên Cloud không
    resultMap.forEach((_, key) => {
      if (!cloudKeys.has(key)) {
        needsPushToCloud = true;
      }
    });

    const mergedList = cleanSeasonalList(Array.from(resultMap.values()), activeMonth, activeYear);
    return { mergedList, needsPushToCloud };
  };

  // Hàm tải dữ liệu mới nhất từ Supabase Cloud và áp dụng an toàn vào ứng dụng (không kích hoạt auto-save ngược lại)
  const reloadLatestFromCloud = async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) return;
    // Tuyệt đối không tải đè dữ liệu nền khi đang lưu hoặc khi người dùng đang gõ nhập liệu
    if (options?.silent && (isSyncingRef.current || isUserEditingOrTyping())) {
      return;
    }
    try {
      const curPeriod = periodCodeRef.current;
      const curM = activeMonthRef.current;
      const curY = activeYearRef.current;
      const [cloudCfg, cloudEmp, cloudSea, cloudProj] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(curPeriod),
        loadSeasonalWorkersFromSupabase(curPeriod),
        loadProjectsFromSupabase(),
      ]);

      // Kiểm tra lại sau khi await mạng: nếu người dùng vừa gõ phím trong lúc chờ mạng thì hủy áp dụng để không giật mất chữ
      if (options?.silent && (isSyncingRef.current || isUserEditingOrTyping())) {
        return;
      }

      const latestConfig = configRef.current;
      const latestEmployees = employeesRef.current;
      const latestSeasonal = seasonalWorkersRef.current;

      if (cloudProj && cloudProj.length > 0) {
        setProjects(cloudProj);
        localStorage.setItem('payroll_projects', JSON.stringify(cloudProj));
      }

      let nextSea = latestSeasonal;
      let shouldPushSeaToCloud = false;
      if (cloudSea && cloudSea.length > 0) {
        const mergedRes = mergeSeasonalListsPreservingAttendance(
          latestSeasonal,
          cloudSea,
          curM,
          curY,
          curPeriod
        );
        nextSea = mergedRes.mergedList;
        shouldPushSeaToCloud = mergedRes.needsPushToCloud;
      }

      if (shouldPushSeaToCloud) {
        syncSeasonalWorkersToSupabase(nextSea, curPeriod).catch((err) =>
          console.warn('[Auto Push Missing Seasonal Data]', err)
        );
      }

      const nextCfg = mergeRemoteConfigPreservingPeriod(latestConfig, cloudCfg);
      const nextEmp =
        cloudEmp && cloudEmp.length > 0
          ? mergeEmployeeListsPreservingAttendance(
              latestEmployees,
              cloudEmp,
              curM,
              curY,
              nextCfg.standardWorkDays || 26
            )
          : latestEmployees;

      // So sánh với snapshot hiện tại trong bộ nhớ: nếu giống hệt, DỪNG NGAY KHÔNG GÂY LẶP VÀ KHÔNG GÂY TREO APP
      const currentMemorySnapshot = serializeDataSnapshot(latestConfig, latestEmployees, latestSeasonal);
      const newSnapshot = serializeDataSnapshot(nextCfg, nextEmp, nextSea);
      if (newSnapshot && newSnapshot === currentMemorySnapshot) {
        lastSavedSnapshotRef.current = newSnapshot;
        lastServerSnapshotRef.current = newSnapshot;
        setCloudSyncStatus('synced');
        return;
      }

      // Cập nhật snapshot refs trước khi setState để các effect auto-save nhận biết đây là dữ liệu từ Cloud
      lastSavedSnapshotRef.current = newSnapshot;
      lastServerSnapshotRef.current = newSnapshot;

      if (cloudCfg) {
        configRef.current = nextCfg;
        setConfig(nextCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
      }
      if (cloudEmp && cloudEmp.length > 0) {
        employeesRef.current = nextEmp;
        setEmployees(nextEmp);
        localStorage.setItem('payroll_employees', JSON.stringify(nextEmp));
      }
      if (cloudSea && cloudSea.length > 0) {
        seasonalWorkersRef.current = nextSea;
        setSeasonalWorkers(nextSea);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSea));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getLastSyncedTime());
    } catch (e) {
      console.warn('Error reloading from Supabase Cloud:', e);
      if (!options?.silent) setCloudSyncStatus('error');
    }
  };

  // Persistence LocalStorage
  useEffect(() => {
    localStorage.setItem('payroll_company_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('payroll_employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(seasonalWorkers));
  }, [seasonalWorkers]);

  // ĐỒNG BỘ 2 CHIỀU VỚI MÁY CHỦ BACKEND (SERVER REALTIME SYNC)
  useEffect(() => {
    let isMounted = true;

    // 1. Tải dữ liệu ban đầu từ máy chủ
    (async () => {
      try {
        const serverData = await fetchServerData();
        if (!isMounted) return;

        if (serverData && serverData.lastUpdated > 0) {
          const wasSupabaseConfigured = isSupabaseConfigured();
          const curM = activeMonthRef.current;
          const curY = activeYearRef.current;
          const nextCfg = mergeRemoteConfigPreservingPeriod(configRef.current, serverData.config);

          // Nếu máy chủ vừa cung cấp thông tin kết nối Supabase cho máy tính mới này -> tải thêm từ Supabase Cloud!
          if (!wasSupabaseConfigured && isSupabaseConfigured()) {
            configRef.current = nextCfg;
            setConfig(nextCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
            reloadLatestFromCloud();
            return;
          }

          // Nếu đã cấu hình Supabase Cloud thì lấy Supabase Cloud làm nguồn chuẩn duy nhất (không để file cục bộ cũ ghi đè)
          if (isSupabaseConfigured()) {
            return;
          }

          const nextEmps =
            serverData.employees && serverData.employees.length > 0
              ? mergeEmployeeListsPreservingAttendance(
                  employeesRef.current,
                  serverData.employees,
                  curM,
                  curY,
                  nextCfg.standardWorkDays || 26
                )
              : employeesRef.current;
          const nextSeas =
            serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
              ? mergeSeasonalListsPreservingAttendance(
                  seasonalWorkersRef.current,
                  serverData.seasonalWorkers,
                  curM,
                  curY,
                  nextCfg.periodCode
                ).mergedList
              : seasonalWorkersRef.current;

          const initSnap = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
          lastServerSnapshotRef.current = initSnap;
          lastSavedSnapshotRef.current = initSnap;

          if (serverData.config) {
            configRef.current = nextCfg;
            setConfig(nextCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
          }
          if (serverData.employees && serverData.employees.length > 0) {
            employeesRef.current = nextEmps;
            setEmployees(nextEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
          }
          if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
            seasonalWorkersRef.current = nextSeas;
            setSeasonalWorkers(nextSeas);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
          }
          setCloudSyncStatus('synced');
          setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
        }
      } catch (err) {
        console.warn('Initial server sync error:', err);
      }
    })();

    // 2. Lắng nghe cập nhật Real-time từ máy chủ (khi thợ chấm công trên điện thoại)
    const unsubscribe = subscribeToSync((serverData) => {
      if (!isMounted) return;
      // Không ghi đè khi người dùng đang gõ nhập liệu hoặc đang đồng bộ
      if (isSyncingRef.current || isUserEditingOrTyping()) return;
      if (isSupabaseConfigured()) {
        reloadLatestFromCloud({ silent: true });
        return;
      }

      const curM = activeMonthRef.current;
      const curY = activeYearRef.current;
      const nextCfg = mergeRemoteConfigPreservingPeriod(configRef.current, serverData.config);
      const nextEmps =
        serverData.employees && serverData.employees.length > 0
          ? mergeEmployeeListsPreservingAttendance(
              employeesRef.current,
              serverData.employees,
              curM,
              curY,
              nextCfg.standardWorkDays || 26
            )
          : employeesRef.current;
      const nextSeas =
        serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
          ? mergeSeasonalListsPreservingAttendance(
              seasonalWorkersRef.current,
              serverData.seasonalWorkers,
              curM,
              curY,
              nextCfg.periodCode
            ).mergedList
          : seasonalWorkersRef.current;

      const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
      if (snapshot && snapshot === lastServerSnapshotRef.current) {
        return;
      }

      lastServerSnapshotRef.current = snapshot;
      lastSavedSnapshotRef.current = snapshot;

      if (serverData.config) {
        configRef.current = nextCfg;
        setConfig(nextCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
      }
      if (serverData.employees && serverData.employees.length > 0) {
        employeesRef.current = nextEmps;
        setEmployees(nextEmps);
        localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
      }
      if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
        seasonalWorkersRef.current = nextSeas;
        setSeasonalWorkers(nextSeas);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Khởi động: Tải dữ liệu từ Supabase Cloud
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    (async () => {
      try {
        const curM = activeMonthRef.current;
        const curY = activeYearRef.current;
        const [cloudCfg, cloudEmp, cloudSea, cloudProj] = await Promise.all([
          loadCompanyConfigFromSupabase(),
          loadEmployeesFromSupabase(configRef.current.periodCode),
          loadSeasonalWorkersFromSupabase(configRef.current.periodCode),
          loadProjectsFromSupabase(),
        ]);

        if (cloudProj && cloudProj.length > 0) {
          setProjects(cloudProj);
          localStorage.setItem('payroll_projects', JSON.stringify(cloudProj));
        }

        let hasAnyDataOnCloud = false;
        let shouldPushSeasonalToCloud = false;

        const nextCfg = mergeRemoteConfigPreservingPeriod(configRef.current, cloudCfg);
        const nextEmps =
          cloudEmp && cloudEmp.length > 0
            ? mergeEmployeeListsPreservingAttendance(
                employeesRef.current,
                cloudEmp,
                curM,
                curY,
                nextCfg.standardWorkDays || 26
              )
            : employeesRef.current;

        let nextSeas = seasonalWorkersRef.current;
        if (cloudSea && cloudSea.length > 0) {
          const mergedRes = mergeSeasonalListsPreservingAttendance(
            seasonalWorkersRef.current,
            cloudSea,
            curM,
            curY,
            nextCfg.periodCode
          );
          nextSeas = mergedRes.mergedList;
          shouldPushSeasonalToCloud = mergedRes.needsPushToCloud;
        } else if (seasonalWorkersRef.current.length > 0) {
          shouldPushSeasonalToCloud = true;
        }

        const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
        lastSavedSnapshotRef.current = snapshot;
        lastServerSnapshotRef.current = snapshot;

        if (cloudCfg) {
          configRef.current = nextCfg;
          setConfig(nextCfg);
          localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
          hasAnyDataOnCloud = true;
        }
        if (cloudEmp && cloudEmp.length > 0) {
          employeesRef.current = nextEmps;
          setEmployees(nextEmps);
          localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
          hasAnyDataOnCloud = true;
        }
        if (cloudSea && cloudSea.length > 0) {
          seasonalWorkersRef.current = nextSeas;
          setSeasonalWorkers(nextSeas);
          localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
          hasAnyDataOnCloud = true;
        }

        // Cập nhật sang máy chủ cục bộ để đồng nhất 100%
        saveAllToServer(nextCfg, nextEmps, nextSeas).catch(() => {});

        const shouldPushEmployeesToCloud =
          !cloudEmp ||
          cloudEmp.length === 0 ||
          cloudEmp.length !== nextEmps.length ||
          nextEmps.some((ne) => {
            const ce = cloudEmp.find((c) => c.code === ne.code || c.id === ne.id);
            if (!ce) return true;
            return (
              Number(ne.baseSalary || 0) !== Number(ce.baseSalary || 0) ||
              Number(ne.insuranceSalary || 0) !== Number(ce.insuranceSalary || 0) ||
              Number(ne.responsibilityAllowance || 0) !== Number(ce.responsibilityAllowance || 0) ||
              Number(ne.projectAllowance || 0) !== Number(ce.projectAllowance || 0) ||
              Number(ne.mealAllowance || 0) !== Number(ce.mealAllowance || 0) ||
              Number(ne.phoneTravelAllowance || 0) !== Number(ce.phoneTravelAllowance || 0) ||
              Number(ne.kpiBonus || 0) !== Number(ce.kpiBonus || 0) ||
              String(ne.bankAccount || '') !== String(ce.bankAccount || '') ||
              String(ne.bankName || '') !== String(ce.bankName || '') ||
              String(ne.title || '') !== String(ce.title || '') ||
              String(ne.department || '') !== String(ce.department || '') ||
              Number(ne.updatedAt || 0) > Number(ce.updatedAt || 0)
            );
          });

        if (!hasAnyDataOnCloud || shouldPushSeasonalToCloud || shouldPushEmployeesToCloud) {
          isSyncingRef.current = true;
          try {
            const report = await syncAllDataToSupabase(
              nextCfg,
              nextEmps,
              nextSeas,
              teamWorkers,
              projects,
              salaryAdvances,
              buildPayrollRecordsForSync(nextCfg, nextEmps, nextSeas, teamWorkers)
            );
            if (report.success) {
              setCloudSyncStatus('synced');
              setLastSyncedText(getLastSyncedTime());
            }
          } finally {
            isSyncingRef.current = false;
          }
        } else {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }
      } catch (e) {
        console.warn('Initial cloud sync error:', e);
        setCloudSyncStatus('error');
      }
    })();
  }, []);

  // 1. Lắng nghe BroadcastChannel (cho các tab trong cùng trình duyệt)
  useEffect(() => {
    if (!syncBroadcast) return;
    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.type === 'PAYROLL_DATA_CHANGED') {
        reloadLatestFromCloud({ silent: true });
      }
    };
    syncBroadcast.addEventListener('message', handleBroadcast);
    return () => {
      syncBroadcast.removeEventListener('message', handleBroadcast);
    };
  }, [syncBroadcast]);

  // 2. Lắng nghe Supabase Realtime (cho các máy tính khác qua Cloud WebSocket - có debounce chống lặp)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsubscribe = subscribeToSupabaseRealtime(() => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      const delayMs = isSyncingRef.current || isUserEditingOrTyping() ? 2600 : 1000;
      realtimeDebounceTimerRef.current = setTimeout(() => {
        if (!isSyncingRef.current && !isUserEditingOrTyping()) {
          reloadLatestFromCloud({ silent: true });
        }
      }, delayMs);
    });

    return () => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      unsubscribe();
    };
  }, []);

  // 3. Tự động đồng bộ nhẹ nhàng khi người dùng chuyển tab sang trang này (Focus & Visibility Change)
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        isSupabaseConfigured() &&
        !isSyncingRef.current &&
        !isUserEditingOrTyping()
      ) {
        reloadLatestFromCloud({ silent: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Heartbeat tự động đồng bộ mỗi 3 giây để các trình duyệt/máy tính khác luôn nhận được phụ cấp / lương / chấm công mới nhất ngay tức thì
    const interval = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        isSupabaseConfigured() &&
        !isSyncingRef.current &&
        !isUserEditingOrTyping()
      ) {
        reloadLatestFromCloud({ silent: true });
      }
    }, 3000);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(interval);
    };
  }, []);

  // 4. Tự động lưu lên Máy chủ & Supabase Cloud khi có thay đổi tổng thể chưa được lưu bởi các hàm cập nhật đơn lẻ
  useEffect(() => {
    const currentSnapshot = serializeDataSnapshot(config, employees, seasonalWorkers);
    if (!currentSnapshot) return;

    const needsServerSync = currentSnapshot !== lastServerSnapshotRef.current;
    const needsCloudSync = isSupabaseConfigured() && currentSnapshot !== lastSavedSnapshotRef.current;

    if (!needsServerSync && !needsCloudSync) {
      return;
    }

    lastLocalEditAtRef.current = Date.now();

    const timer = setTimeout(async () => {
      const nowCfg = configRef.current;
      const nowEmps = employeesRef.current;
      const nowSeas = seasonalWorkersRef.current;
      const nowSnapshot = serializeDataSnapshot(nowCfg, nowEmps, nowSeas);
      if (nowSnapshot === lastSavedSnapshotRef.current && nowSnapshot === lastServerSnapshotRef.current) {
        return;
      }

      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      // Đánh dấu snapshot ngay trước khi gọi mạng để chặn sự kiện Realtime vọng ngược gây vòng lặp
      const prevServerSnap = lastServerSnapshotRef.current;
      const prevCloudSnap = lastSavedSnapshotRef.current;
      lastServerSnapshotRef.current = nowSnapshot;
      lastSavedSnapshotRef.current = nowSnapshot;

      try {
        setCloudSyncStatus('syncing');

        if (nowSnapshot !== prevServerSnap) {
          await saveAllToServer(nowCfg, nowEmps, nowSeas);
        }

        if (isSupabaseConfigured() && nowSnapshot !== prevCloudSnap) {
          await syncAllDataToSupabase(
            nowCfg,
            nowEmps,
            nowSeas,
            teamWorkers,
            projects,
            salaryAdvances,
            buildPayrollRecordsForSync(nowCfg, nowEmps, nowSeas, teamWorkers)
          );
        }

        setCloudSyncStatus('synced');
        setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
      } catch (err) {
        console.warn('Auto sync error:', err);
        setCloudSyncStatus('error');
      } finally {
        isSyncingRef.current = false;
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [config, employees, seasonalWorkers]);

  // Cập nhật công nhân thời vụ - cập nhật đồng bộ tức thì vào Ref + State và đẩy lên Supabase Cloud
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    lastLocalEditAtRef.current = Date.now();
    const recalculated = recomputeSeasonal(updated);
    const prev = seasonalWorkersRef.current;

    const targetName = (recalculated.fullName || '').trim().toLowerCase();
    let idx = prev.findIndex(
      (w) =>
        recalculated.id &&
        String(w.id) === String(recalculated.id) &&
        (w.fullName || '').trim().toLowerCase() === targetName
    );
    if (idx === -1 && recalculated.id) {
      idx = prev.findIndex((w) => String(w.id) === String(recalculated.id));
    }
    if (idx === -1 && recalculated.code) {
      idx = prev.findIndex(
        (w) =>
          w.code === recalculated.code &&
          ((w.fullName || '').trim().toLowerCase() === targetName ||
            (w.payrollCycleType || '1_MONTH') === (recalculated.payrollCycleType || '1_MONTH'))
      );
    }
    if (idx === -1 && recalculated.code) {
      idx = prev.findIndex((w) => w.code === recalculated.code);
    }

    let next: SeasonalWorker[];
    let finalWorkerToSync: SeasonalWorker;
    if (idx !== -1) {
      next = [...prev];
      const effectiveCycleType =
        recalculated.payrollCycleType || next[idx].payrollCycleType || '1_MONTH';
      const mergedRecords = {
        ...(next[idx].periodRecords || {}),
        ...(recalculated.periodRecords || {}),
      };
      if (
        effectiveCycleType !== 'TEAM' &&
        typeof recalculated.dailyRate === 'number' &&
        recalculated.dailyRate >= 0
      ) {
        Object.keys(mergedRecords).forEach((k) => {
          if (mergedRecords[k]) {
            const r = mergedRecords[k];
            if (r.cycleType === 'TEAM') return;
            const sByDays = Math.round(recalculated.dailyRate * Number(r.actualWorkDays || 0));
            const otPay = Math.round((recalculated.dailyRate / 8) * Number(r.overtimeHours || 0) * 1.5);
            const totInc =
              sByDays +
              otPay +
              Number(r.mealAllowance || 0) +
              Number(r.travelSafetyAllowance || 0) +
              Number(r.otherBonus || 0);
            const tax = !(r.hasTaxCommitment ?? true) && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
            const totDed = tax + Number(r.advancePayment || 0);
            mergedRecords[k] = {
              ...r,
              dailyRate: recalculated.dailyRate,
              salaryByDays: sByDays,
              overtimePay: otPay,
              totalIncome: totInc,
              personalIncomeTax: tax,
              totalDeductions: totDed,
              netSalary: totInc - totDed,
            };
          }
        });
      }
      finalWorkerToSync = {
        ...next[idx],
        ...recalculated,
        bankAccount:
          recalculated.bankAccount !== undefined
            ? recalculated.bankAccount
            : next[idx].bankAccount || '',
        bankName:
          recalculated.bankName !== undefined
            ? recalculated.bankName
            : next[idx].bankName || 'Vietcombank',
        paymentMethod: recalculated.paymentMethod || next[idx].paymentMethod || 'BANK',
        bankUpdatedAt: Date.now(),
        dailyRateUpdatedAt: Date.now(),
        updatedAt: Date.now(),
        monthlyAttendance: {
          ...(next[idx].monthlyAttendance || {}),
          ...(recalculated.monthlyAttendance || {}),
        },
        periodRecords: mergedRecords,
      } as SeasonalWorker;
      next[idx] = finalWorkerToSync;
    } else {
      finalWorkerToSync = {
        ...recalculated,
        bankUpdatedAt: Date.now(),
        dailyRateUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      } as SeasonalWorker;
      next = [...prev, finalWorkerToSync];
    }

    // Cập nhật đồng bộ vào Ref & LocalStorage NGAY LẬP TỨC trước khi gọi setState
    // để mọi hàm lưu tức thì (như handleSavePayrollTable / handleManualForceSync) đọc được dữ liệu mới 100%
    seasonalWorkersRef.current = next;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, next);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(next));
    setSeasonalWorkers(next);

    const timerKey = `sea_${finalWorkerToSync.id || finalWorkerToSync.code}`;
    if (singleWorkerSyncTimersRef.current[timerKey]) {
      clearTimeout(singleWorkerSyncTimersRef.current[timerKey]);
    }
    singleWorkerSyncTimersRef.current[timerKey] = setTimeout(async () => {
      isSyncingRef.current = true;
      try {
        setCloudSyncStatus('syncing');
        const latestWorker =
          seasonalWorkersRef.current.find(
            (w) =>
              (finalWorkerToSync.id && String(w.id) === String(finalWorkerToSync.id)) ||
              (finalWorkerToSync.code && w.code === finalWorkerToSync.code)
          ) || finalWorkerToSync;
        saveAttendanceToServer(latestWorker);
        await saveAllToServer(configRef.current, employeesRef.current, seasonalWorkersRef.current);
        if (isSupabaseConfigured()) {
          await syncSingleSeasonalWorkerToSupabase(latestWorker, periodCodeRef.current);
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        } else {
          setCloudSyncStatus('synced');
          setLastSyncedText(getServerLastSyncedTime());
        }
      } catch {
        setCloudSyncStatus('error');
      } finally {
        isSyncingRef.current = false;
      }
    }, 250);
  };

  // Thêm mới công nhân thời vụ - đồng bộ ngay lập tức lên Supabase Cloud (không cần F5)
  const handleAddSeasonalWorker = (newWorker: SeasonalWorker) => {
    lastLocalEditAtRef.current = Date.now();
    removeDeletedKeys(DELETED_SEA_STORAGE_KEY, [newWorker.id, newWorker.code]);
    const recalculated = recomputeSeasonal(newWorker);
    setSeasonalWorkers((prev) => {
      const maxOrder = prev.reduce((max, w) => Math.max(max, w.sortOrder || 0), 0);
      const workerWithOrder: SeasonalWorker = {
        ...recalculated,
        sortOrder: recalculated.sortOrder || (maxOrder + 1),
      };
      const next = [...prev, workerWithOrder];
      seasonalWorkersRef.current = next;
      const snap = serializeDataSnapshot(configRef.current, employeesRef.current, next);
      lastSavedSnapshotRef.current = snap;
      lastServerSnapshotRef.current = snap;
      localStorage.setItem('payroll_seasonal_workers', JSON.stringify(next));
      saveSingleWorkerToServer(workerWithOrder);
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(workerWithOrder, periodCodeRef.current).then(() => notifyCrossTab());
      }
      return next;
    });
  };

  const handleReorderSeasonalWorkers = (reordered: SeasonalWorker[]) => {
    lastLocalEditAtRef.current = Date.now();
    seasonalWorkersRef.current = reordered;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, reordered);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers(reordered);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(reordered));
    saveAllToServer(configRef.current, employeesRef.current, reordered);
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(reordered, periodCodeRef.current).then(() => notifyCrossTab());
    }
  };

  // Xóa triệt để công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteSeasonalWorker = (id: string) => {
    lastLocalEditAtRef.current = Date.now();
    const strId = String(id).trim();
    const currentList = seasonalWorkersRef.current;
    const target = currentList.find((w) => String(w.id) === strId || String(w.code) === strId);
    const targetId = target ? String(target.id) : strId;
    const targetCode = target?.code ? String(target.code).trim() : '';

    // Hủy mọi bộ đếm lưu tự động đang chờ của thợ này để không ghi đè ngược lại sau khi xóa
    [`sea_${targetId}`, `sea_${targetCode}`, `sea_${strId}`].forEach((tk) => {
      if (singleWorkerSyncTimersRef.current[tk]) {
        clearTimeout(singleWorkerSyncTimersRef.current[tk]);
        delete singleWorkerSyncTimersRef.current[tk];
      }
    });

    const filtered = currentList.filter((w) => {
      if (target) {
        return String(w.id) !== targetId;
      }
      return String(w.id) !== strId && String(w.code) !== strId;
    });

    const hasRemainingSameCode = targetCode
      ? filtered.some((w) => String(w.code).trim() === targetCode)
      : false;

    addDeletedKeys(
      DELETED_SEA_STORAGE_KEY,
      hasRemainingSameCode ? [targetId, strId] : [targetId, targetCode, strId]
    );

    seasonalWorkersRef.current = filtered;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, filtered);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers(filtered);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(filtered));
    saveAllToServer(configRef.current, employeesRef.current, filtered);
    if (isSupabaseConfigured()) {
      deleteSeasonalWorkerFromSupabase(
        targetId,
        hasRemainingSameCode ? undefined : targetCode || undefined
      ).then(() => notifyCrossTab());
    }
  };

  // Xóa hàng loạt công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteBatchSeasonalWorkers = (ids: string[]) => {
    lastLocalEditAtRef.current = Date.now();
    const idSet = new Set(ids.map((item) => String(item).trim()));
    const currentList = seasonalWorkersRef.current;
    const targets = currentList.filter(
      (w) => idSet.has(String(w.id).trim()) || (w.code && idSet.has(String(w.code).trim()))
    );
    const filtered = currentList.filter(
      (w) => !idSet.has(String(w.id).trim()) && !(w.code && idSet.has(String(w.code).trim()))
    );

    const remainingCodes = new Set(filtered.map((w) => String(w.code || '').trim()).filter(Boolean));
    const codesToDelete = targets
      .map((w) => String(w.code || '').trim())
      .filter((c) => c && !remainingCodes.has(c));

    targets.forEach((t) => {
      [`sea_${t.id}`, `sea_${t.code}`].forEach((tk) => {
        if (singleWorkerSyncTimersRef.current[tk]) {
          clearTimeout(singleWorkerSyncTimersRef.current[tk]);
          delete singleWorkerSyncTimersRef.current[tk];
        }
      });
    });

    addDeletedKeys(DELETED_SEA_STORAGE_KEY, [...ids, ...codesToDelete]);

    seasonalWorkersRef.current = filtered;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, filtered);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers(filtered);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(filtered));
    saveAllToServer(configRef.current, employeesRef.current, filtered);
    if (isSupabaseConfigured()) {
      deleteBatchSeasonalWorkersFromSupabase(ids, codesToDelete).then(() => notifyCrossTab());
    }
  };

  // Xóa toàn bộ công nhân thời vụ trên Supabase Cloud
  const handleClearAllSeasonalWorkers = () => {
    lastLocalEditAtRef.current = Date.now();
    const allKeys = seasonalWorkersRef.current.flatMap((w) => [w.id, w.code]);
    addDeletedKeys(DELETED_SEA_STORAGE_KEY, allKeys);
    seasonalWorkersRef.current = [];
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, []);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers([]);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify([]));
    saveAllToServer(configRef.current, employeesRef.current, []);
    if (isSupabaseConfigured()) {
      clearAllSeasonalWorkersFromSupabase(periodCodeRef.current).then(() => notifyCrossTab());
    }
  };

  const handleResetSeasonalWorkers = () => {
    lastLocalEditAtRef.current = Date.now();
    localStorage.removeItem(DELETED_SEA_STORAGE_KEY);
    seasonalWorkersRef.current = initialSeasonalWorkers;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, initialSeasonalWorkers);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers(initialSeasonalWorkers);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(initialSeasonalWorkers));
    saveAllToServer(configRef.current, employeesRef.current, initialSeasonalWorkers);
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(initialSeasonalWorkers, periodCodeRef.current).then(() => notifyCrossTab());
    }
  };

  // Cập nhật nhân viên chính thức - phản hồi tức thì trên UI và đồng bộ ngay toàn bộ thông tin (phụ cấp, lương, BHXH, hợp đồng, ngân hàng...) lên Server & Supabase Cloud
  const handleUpdateEmployee = (updated: Employee) => {
    const nowTs = Date.now();
    lastLocalEditAtRef.current = nowTs;
    removeDeletedKeys(DELETED_EMP_STORAGE_KEY, [updated.id, updated.code]);
    const recalculated = recomputeEmployeePayroll({
      ...updated,
      updatedAt: nowTs,
    });
    setEmployees((prev) => {
      let finalEmpToSync: Employee = recalculated;
      const next = prev.map((emp) => {
        if (emp.id === recalculated.id || emp.code === recalculated.code) {
          finalEmpToSync = {
            ...emp,
            ...recalculated,
            updatedAt: nowTs,
            monthlyAttendance: {
              ...(emp.monthlyAttendance || {}),
              ...(recalculated.monthlyAttendance || {}),
            },
            periodRecords: {
              ...(emp.periodRecords || {}),
              ...(recalculated.periodRecords || {}),
            },
          };
          return finalEmpToSync;
        }
        return emp;
      });
      employeesRef.current = next;
      const snap = serializeDataSnapshot(configRef.current, next, seasonalWorkersRef.current);
      lastSavedSnapshotRef.current = snap;
      lastServerSnapshotRef.current = snap;
      localStorage.setItem('payroll_employees', JSON.stringify(next));

      // Cập nhật luôn vào slot tháng hiện tại để khi chuyển qua lại giữa các tháng không bao giờ đọc lại giá trị phụ cấp cũ
      try {
        const curM = configRef.current.month || realDateInfo.realMonth;
        const curY = configRef.current.year || realDateInfo.realYear;
        const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
        localStorage.setItem(`payroll_month_${curY}_${curMStr}`, JSON.stringify(next));
      } catch {}

      const timerKey = `emp_${finalEmpToSync.code || finalEmpToSync.id}`;
      if (singleWorkerSyncTimersRef.current[timerKey]) {
        clearTimeout(singleWorkerSyncTimersRef.current[timerKey]);
      }
      singleWorkerSyncTimersRef.current[timerKey] = setTimeout(async () => {
        isSyncingRef.current = true;
        try {
          setCloudSyncStatus('syncing');
          const latestEmp =
            employeesRef.current.find(
              (e) =>
                (finalEmpToSync.id && String(e.id) === String(finalEmpToSync.id)) ||
                (finalEmpToSync.code && e.code === finalEmpToSync.code)
            ) || finalEmpToSync;
          await saveAllToServer(configRef.current, employeesRef.current, seasonalWorkersRef.current);
          if (isSupabaseConfigured()) {
            await syncSingleEmployeeToSupabase(latestEmp, periodCodeRef.current);
            setCloudSyncStatus('synced');
            setLastSyncedText(getLastSyncedTime());
            notifyCrossTab();
          } else {
            setCloudSyncStatus('synced');
            setLastSyncedText(getServerLastSyncedTime());
          }
        } catch {
          setCloudSyncStatus('error');
        } finally {
          isSyncingRef.current = false;
        }
      }, 300);

      return next;
    });
  };

  // Thêm nhân viên chính thức
  const handleAddEmployee = (newEmp: Employee) => {
    lastLocalEditAtRef.current = Date.now();
    removeDeletedKeys(DELETED_EMP_STORAGE_KEY, [newEmp.id, newEmp.code]);
    const recalculated = recomputeEmployeePayroll(newEmp);
    setEmployees((prev) => {
      const next = [...prev, recalculated];
      employeesRef.current = next;
      const snap = serializeDataSnapshot(configRef.current, next, seasonalWorkersRef.current);
      lastSavedSnapshotRef.current = snap;
      lastServerSnapshotRef.current = snap;
      localStorage.setItem('payroll_employees', JSON.stringify(next));
      saveAllToServer(configRef.current, next, seasonalWorkersRef.current);
      if (isSupabaseConfigured()) {
        syncSingleEmployeeToSupabase(recalculated, periodCodeRef.current).then(() => notifyCrossTab());
      }
      return next;
    });
  };

  // Xóa nhân viên chính thức - xóa ngay trên Supabase Cloud, Server và LocalStorage
  const handleDeleteEmployee = (id: string) => {
    lastLocalEditAtRef.current = Date.now();
    const strId = String(id).trim();
    const currentList = employeesRef.current;
    const target = currentList.find((e) => String(e.id) === strId || String(e.code) === strId);
    const targetId = target ? String(target.id) : strId;
    const targetCode = target?.code ? String(target.code).trim() : '';

    [`emp_${targetId}`, `emp_${targetCode}`, `emp_${strId}`].forEach((tk) => {
      if (singleWorkerSyncTimersRef.current[tk]) {
        clearTimeout(singleWorkerSyncTimersRef.current[tk]);
        delete singleWorkerSyncTimersRef.current[tk];
      }
    });

    const filtered = currentList.filter((e) => {
      if (target) {
        return String(e.id) !== targetId;
      }
      return String(e.id) !== strId && String(e.code) !== strId;
    });

    const hasRemainingSameCode = targetCode
      ? filtered.some((e) => String(e.code).trim() === targetCode)
      : false;

    addDeletedKeys(
      DELETED_EMP_STORAGE_KEY,
      hasRemainingSameCode ? [targetId, strId] : [targetId, targetCode, strId]
    );

    employeesRef.current = filtered;
    const snap = serializeDataSnapshot(configRef.current, filtered, seasonalWorkersRef.current);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setEmployees(filtered);
    localStorage.setItem('payroll_employees', JSON.stringify(filtered));

    // Xóa luôn trong các slot tháng cũ nếu có để khi đổi tháng / F5 không bị phục hồi ngược lại
    ['payroll_month_2026_09', 'payroll_month_2026_10', 'payroll_month_2026_11', 'payroll_month_2026_12'].forEach(
      (slotKey) => {
        try {
          const raw = localStorage.getItem(slotKey);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              const nextArr = arr.filter(
                (x: any) =>
                  String(x?.id) !== targetId &&
                  (hasRemainingSameCode || !targetCode || String(x?.code) !== targetCode)
              );
              localStorage.setItem(slotKey, JSON.stringify(nextArr));
            }
          }
        } catch {}
      }
    );

    saveAllToServer(configRef.current, filtered, seasonalWorkersRef.current);
    if (isSupabaseConfigured()) {
      deleteEmployeeFromSupabase(
        targetId,
        hasRemainingSameCode ? undefined : targetCode || undefined
      ).then(() => notifyCrossTab());
    }
  };

  // Nút cưỡng bức làm mới & đẩy đồng bộ 2 chiều ngay tức thì lên Supabase Cloud + Máy chủ
  const handleManualForceSync = async () => {
    setCloudSyncStatus('syncing');
    lastLocalEditAtRef.current = Date.now();
    isSyncingRef.current = true;
    // Hủy các timer lưu đơn lẻ đang chờ để không chạy đè sau khi đã đồng bộ toàn bộ
    Object.keys(singleWorkerSyncTimersRef.current).forEach((k) => {
      if (singleWorkerSyncTimersRef.current[k]) {
        clearTimeout(singleWorkerSyncTimersRef.current[k]);
        delete singleWorkerSyncTimersRef.current[k];
      }
    });
    try {
      const latestCfg = configRef.current;
      const latestEmps = employeesRef.current;
      const latestSeas = seasonalWorkersRef.current;
      const sbCfg = getSupabaseConfig();
      const cfgToSync: CompanyConfig = {
        ...latestCfg,
        ...(sbCfg.url && sbCfg.anonKey
          ? { supabaseUrl: sbCfg.url, supabaseAnonKey: sbCfg.anonKey }
          : {}),
      } as CompanyConfig;

      const currentSnap = serializeDataSnapshot(cfgToSync, latestEmps, latestSeas);
      lastSavedSnapshotRef.current = currentSnap;
      lastServerSnapshotRef.current = currentSnap;

      // Luôn lưu đồng thời lên cả Máy chủ Backend và Supabase Cloud để 2 trình duyệt / 2 máy tính đồng bộ tức thì
      await saveAllToServer(cfgToSync, latestEmps, latestSeas);

      if (isSupabaseConfigured()) {
        await syncAllDataToSupabase(
          cfgToSync,
          latestEmps,
          latestSeas,
          teamWorkers,
          projects,
          salaryAdvances,
          buildPayrollRecordsForSync(cfgToSync, latestEmps, latestSeas, teamWorkers)
        );
        notifyCrossTab();
      } else {
        const curM = latestCfg.month || realDateInfo.realMonth;
        const curY = latestCfg.year || realDateInfo.realYear;
        const serverData = await fetchServerData();
        if (serverData && serverData.lastUpdated > 0) {
          if (serverData.config) {
            setConfig((prev) => mergeRemoteConfigPreservingPeriod(prev, serverData.config));
          }
          if (serverData.employees && serverData.employees.length > 0) {
            setEmployees((prev) =>
              mergeEmployeeListsPreservingAttendance(
                prev,
                serverData.employees,
                curM,
                curY,
                latestCfg.standardWorkDays || 26
              )
            );
          }
          if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
            setSeasonalWorkers(
              mergeSeasonalListsPreservingAttendance(
                seasonalWorkersRef.current,
                serverData.seasonalWorkers,
                curM,
                curY,
                latestCfg.periodCode
              ).mergedList
            );
          }
          setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
        }
        notifyCrossTab();
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getLastSyncedTime() || getServerLastSyncedTime());
    } catch {
      setCloudSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Chuyển đổi Tháng/Năm đồng bộ toàn diện cho Bản Chấm Công và Bản Lương (Tháng hiện tại, Tháng 9, Tháng 10...)
  const handleChangeMonthYear = (newMonth: number, newYear: number) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
    const currentKey = `payroll_month_${curY}_${curMStr}`;
    try {
      localStorage.setItem(currentKey, JSON.stringify(employees));
    } catch {}

    const mStr = newMonth < 10 ? `0${newMonth}` : `${newMonth}`;
    const nextM = newMonth === 12 ? '01' : newMonth + 1 < 10 ? `0${newMonth + 1}` : `${newMonth + 1}`;
    const nextY = newMonth === 12 ? newYear + 1 : newYear;
    const targetMonthKey = `${newYear}-${mStr}`;

    const newConfig: CompanyConfig = {
      ...config,
      month: newMonth,
      year: newYear,
      period: `Kỳ lương tháng ${mStr} năm ${newYear}`,
      periodCode: `${mStr}/${newYear}`,
      paymentDate: `05/${nextM}/${nextY}`,
    };
    setConfig(newConfig);

    // Kiểm tra nếu có dữ liệu cũ từng lưu trong slot payroll_month_YYYY_MM thì gộp vào monthlyAttendance[targetMonthKey]
    const targetStorageKey = `payroll_month_${newYear}_${mStr}`;
    let legacySlotEmployees: Employee[] | null = null;
    try {
      const savedTarget = localStorage.getItem(targetStorageKey);
      if (savedTarget) {
        const parsedTarget = JSON.parse(savedTarget);
        if (Array.isArray(parsedTarget) && parsedTarget.length > 0) {
          legacySlotEmployees = parsedTarget;
        }
      }
    } catch {}

    const stdDays = config.standardWorkDays || 26;
    setEmployees((prev) =>
      prev.map((emp) => {
        const mergedMonthly = { ...(emp.monthlyAttendance || {}) };
        if (legacySlotEmployees && !mergedMonthly[targetMonthKey]) {
          const matchedOld = legacySlotEmployees.find(
            (x) =>
              normalizeEmpName(x?.fullName) === normalizeEmpName(emp.fullName) &&
              (x.code === emp.code || x.id === emp.id)
          );
          if (matchedOld) {
            const oldRec = matchedOld.monthlyAttendance?.[targetMonthKey];
            if (oldRec && Object.keys(oldRec.days || {}).length > 0) {
              mergedMonthly[targetMonthKey] = oldRec;
            }
          }
        }
        const withHistory = ensureEmployeeHistoricalMonths({
          ...emp,
          monthlyAttendance: mergedMonthly,
        });
        return syncEmployeeForMonth(withHistory, newMonth, newYear, stdDays);
      })
    );

    setSeasonalWorkers((prev) =>
      prev.map((w) => syncSeasonalWorkerForMonth(ensureSeasonalHistoricalMonths(w), newMonth, newYear))
    );
  };

  const handleBatchUpdate = (updatedList: Employee[]) => {
    const nowTs = Date.now();
    lastLocalEditAtRef.current = nowTs;
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const stdDays = configRef.current.standardWorkDays || 26;
    const normalizedList = updatedList.map((emp) =>
      syncEmployeeForMonth({ ...emp, updatedAt: nowTs }, curM, curY, stdDays)
    );
    employeesRef.current = normalizedList;
    const snap = serializeDataSnapshot(configRef.current, normalizedList, seasonalWorkersRef.current);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setEmployees(normalizedList);
    const mStr = curM < 10 ? `0${curM}` : `${curM}`;
    const currentMonthKey = `payroll_month_${curY}_${mStr}`;
    try {
      localStorage.setItem(currentMonthKey, JSON.stringify(normalizedList));
      localStorage.setItem('payroll_employees', JSON.stringify(normalizedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    isSyncingRef.current = true;
    setCloudSyncStatus('syncing');
    saveAllToServer(configRef.current, normalizedList, seasonalWorkersRef.current)
      .then(async () => {
        if (isSupabaseConfigured()) {
          await syncEmployeesToSupabase(normalizedList, periodCodeRef.current);
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        } else {
          setCloudSyncStatus('synced');
        }
      })
      .catch(() => setCloudSyncStatus('error'))
      .finally(() => {
        isSyncingRef.current = false;
      });
  };

  const handleResetDefault = () => {
    localStorage.removeItem(DELETED_EMP_STORAGE_KEY);
    localStorage.removeItem('payroll_employees');
    localStorage.removeItem('payroll_company_config');
    const clean = initialEmployees.map((emp) =>
      syncEmployeeForMonth(
        ensureEmployeeHistoricalMonths(emp),
        realDateInfo.realMonth,
        realDateInfo.realYear,
        26
      )
    );
    setEmployees(clean);
    setConfig(initialCompanyConfig);
    localStorage.setItem('payroll_employees', JSON.stringify(clean));
  };

  const handleAuditSelectEmployee = (code: string) => {
    setActiveTab('PAYSLIP');
  };

  // Handlers for Projects
  const handleAddProject = (p: Project) => {
    const updated = [p, ...projects];
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };
  const handleUpdateProject = (p: Project) => {
    const updated = projects.map((item) => (item.id === p.id ? p : item));
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };
  const handleDeleteProject = (id: string) => {
    const updated = projects.filter((item) => item.id !== id);
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };

  // Handlers for Team Workers
  const handleAddTeamWorker = (tw: TeamWorker) => {
    const updated = [...teamWorkers, tw];
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleUpdateTeamWorker = (tw: TeamWorker) => {
    const updated = teamWorkers.map((item) => (item.id === tw.id ? tw : item));
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleDeleteTeamWorker = (id: string) => {
    const updated = teamWorkers.filter((item) => item.id !== id);
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleBatchUpdateTeamWorkers = (list: TeamWorker[]) => {
    setTeamWorkers(list);
    localStorage.setItem('payroll_team_workers', JSON.stringify(list));
  };

  // Helper kiểm tra phiếu tạm ứng thuộc Tháng / Năm đang xét
  const doesAdvanceMatchMonthYear = (adv: SalaryAdvance, m: number, y: number): boolean => {
    const dateStr = (adv.requestDate || adv.paymentDate || '').trim();
    if (dateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [yy, mm] = dateStr.split('-').map(Number);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length === 3) {
        const mm = Number(parts[1]);
        const yy = Number(parts[2].length === 4 ? parts[2] : parts[0]);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
    }
    if (adv.periodKey) {
      const pParts = adv.periodKey.split(/[\/\-]/);
      if (pParts.length === 2) {
        const mm = Number(pParts[0].length === 4 ? pParts[1] : pParts[0]);
        const yy = Number(pParts[0].length === 4 ? pParts[0] : pParts[1]);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
    }
    return true;
  };

  // Đồng bộ danh sách phiếu tạm ứng vào Nhân viên chính thức & Nhân viên thời vụ
  const syncAdvancesIntoWorkers = (nextAdvances: SalaryAdvance[]) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const mStr = String(curM).padStart(2, '0');
    const monthPeriodKey = `${curY}-${mStr}_MONTH`;

    const nextEmployees = employees.map((e) => {
      const empAdvances = nextAdvances.filter(
        (a) =>
          a.targetType === 'PERMANENT' &&
          (a.workerId === e.id || a.workerCode === e.code) &&
          doesAdvanceMatchMonthYear(a, curM, curY)
      );
      const sumAdv = empAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return recomputeEmployeePayroll({ ...e, advancePayment: sumAdv });
    });

    const nextSeasonal = seasonalWorkers.map((w) => {
      const workerAdvances = nextAdvances.filter(
        (a) =>
          a.targetType === 'SEASONAL' &&
          (a.workerId === w.id || a.workerCode === w.code) &&
          doesAdvanceMatchMonthYear(a, curM, curY)
      );
      const sumAdv = workerAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const totalDeductions = (w.personalIncomeTax || 0) + sumAdv;
      const netSalary = Math.max(0, (w.totalIncome || 0) - totalDeductions);
      const nextPeriodRecords = { ...(w.periodRecords || {}) };
      if (nextPeriodRecords[monthPeriodKey]) {
        const rec = nextPeriodRecords[monthPeriodKey];
        const recDed = (rec.personalIncomeTax || 0) + sumAdv;
        nextPeriodRecords[monthPeriodKey] = {
          ...rec,
          advancePayment: sumAdv,
          totalDeductions: recDed,
          netSalary: Math.max(0, (rec.totalIncome || 0) - recDed),
        };
      }
      return {
        ...w,
        advancePayment: sumAdv,
        totalDeductions,
        netSalary,
        periodRecords: nextPeriodRecords,
      };
    });

    setEmployees(nextEmployees);
    setSeasonalWorkers(nextSeasonal);
    localStorage.setItem('payroll_employees', JSON.stringify(nextEmployees));
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeasonal));
    saveAllToServer(config, nextEmployees, nextSeasonal);
  };

  // Handlers for Salary Advances
  const handleAddSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = [adv, ...salaryAdvances];
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };
  const handleUpdateSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = salaryAdvances.map((item) => (item.id === adv.id ? adv : item));
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };
  const handleDeleteSalaryAdvance = (id: string) => {
    const updated = salaryAdvances.filter((item) => item.id !== id);
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };

  const handleBatchUpdateSeasonalWorkers = (list: SeasonalWorker[]) => {
    const nowTs = Date.now();
    lastLocalEditAtRef.current = nowTs;
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const syncedList = list.map((w) =>
      syncSeasonalWorkerForMonth({ ...w, updatedAt: nowTs }, curM, curY)
    );
    seasonalWorkersRef.current = syncedList;
    const snap = serializeDataSnapshot(configRef.current, employeesRef.current, syncedList);
    lastSavedSnapshotRef.current = snap;
    lastServerSnapshotRef.current = snap;
    setSeasonalWorkers(syncedList);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(syncedList));
    isSyncingRef.current = true;
    setCloudSyncStatus('syncing');
    saveAllToServer(configRef.current, employeesRef.current, syncedList)
      .then(async () => {
        if (isSupabaseConfigured()) {
          await syncSeasonalWorkersToSupabase(syncedList, periodCodeRef.current);
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        } else {
          setCloudSyncStatus('synced');
        }
      })
      .catch(() => setCloudSyncStatus('error'))
      .finally(() => {
        isSyncingRef.current = false;
      });
  };

  // Đồng bộ 100% danh sách nhân viên và công nhân thời vụ theo đúng Tháng/Năm đang chọn (config.month / config.year)
  // và tự động cộng tổng tiền Tạm ứng từ Bản Ứng Lương (salaryAdvances) vào đúng nhân viên
  const syncedEmployees = useMemo(() => {
    const m = config.month || realDateInfo.realMonth;
    const y = config.year || realDateInfo.realYear;
    const std = config.standardWorkDays || 26;
    return employees.map((e) => {
      const synced = syncEmployeeForMonth(e, m, y, std);
      const matchingAdvances = salaryAdvances.filter(
        (a) =>
          a.targetType === 'PERMANENT' &&
          (a.workerId === synced.id || a.workerCode === synced.code) &&
          doesAdvanceMatchMonthYear(a, m, y)
      );
      if (matchingAdvances.length > 0) {
        const sumAdv = matchingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        return recomputeEmployeePayroll({ ...synced, advancePayment: sumAdv });
      }
      return synced;
    });
  }, [employees, salaryAdvances, config.month, config.year, config.standardWorkDays, realDateInfo.realMonth, realDateInfo.realYear]);

  const syncedSeasonalWorkers = useMemo(() => {
    const m = config.month || realDateInfo.realMonth;
    const y = config.year || realDateInfo.realYear;
    return seasonalWorkers.map((w) => {
      const synced = syncSeasonalWorkerForMonth(w, m, y);
      const matchingAdvances = salaryAdvances.filter(
        (a) =>
          a.targetType === 'SEASONAL' &&
          (a.workerId === synced.id || a.workerCode === synced.code) &&
          doesAdvanceMatchMonthYear(a, m, y)
      );
      const sumAdv =
        matchingAdvances.length > 0
          ? matchingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0)
          : 0;
      const totalDeductions = (synced.personalIncomeTax || 0) + sumAdv;
      const netSalary = Math.max(0, (synced.totalIncome || 0) - totalDeductions);
      return {
        ...synced,
        advancePayment: sumAdv,
        totalDeductions,
        netSalary,
      };
    });
  }, [seasonalWorkers, salaryAdvances, config.month, config.year, realDateInfo.realMonth, realDateInfo.realYear]);

  // Count issues
  const auditCount = syncedEmployees.filter(
    (e) =>
      !e.bankAccount ||
      (e.selectedForAttendance !== false && e.netSalary <= 0) ||
      e.actualWorkDays > e.standardWorkDays
  ).length;

  // Khi người dùng hoặc thợ mở link Web App Chấm Công Di Động riêng trên điện thoại
  if (isMobileAttendanceView) {
    const isAdminPreview =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('pncons_is_admin_preview') === 'true';

    // Chuyển đổi NV Chính Thức đang làm việc sang định dạng chung để dùng chung Web App Chấm Công Di Động
    const permanentAsWorkers: SeasonalWorker[] = syncedEmployees
      .filter((e) => (e.status || 'ACTIVE') === 'ACTIVE')
      .map((e) => ({
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

    const allMobileWorkers: SeasonalWorker[] = [...syncedSeasonalWorkers, ...permanentAsWorkers];

    return (
      <MobileAttendanceApp
        workers={allMobileWorkers}
        projects={projects}
        config={config}
        initialWorkerCode={activeMobileWorkerCode}
        isAdminPreview={isAdminPreview}
        onUpdateWorker={(updatedWorker) => {
          const matchedPerm = employees.find(
            (e) => e.code === updatedWorker.code || String(e.id) === String(updatedWorker.id)
          );
          if (matchedPerm) {
            handleUpdateEmployee({
              ...matchedPerm,
              actualWorkDays: updatedWorker.actualWorkDays,
              overtimeHours: updatedWorker.overtimeHours,
              selectedForAttendance:
                (updatedWorker.actualWorkDays || 0) > 0 || (updatedWorker.overtimeHours || 0) > 0,
              monthlyAttendance: updatedWorker.monthlyAttendance,
              periodRecords: updatedWorker.periodRecords,
              payrollCycleType: updatedWorker.payrollCycleType,
              currentPeriodKey: updatedWorker.currentPeriodKey,
            });
          } else {
            handleUpdateSeasonalWorker(updatedWorker);
          }
        }}
        onExitMobileView={() => {
          sessionStorage.setItem('pncons_admin_auth', 'true');
          sessionStorage.removeItem('pncons_is_admin_preview');
          sessionStorage.removeItem('pncons_in_mobile_mode');
          sessionStorage.removeItem('pncons_mobile_worker_code');
          setIsMobileAttendanceView(false);
          try {
            const cleanUrl = window.location.pathname;
            window.history.pushState(null, '', cleanUrl);
          } catch {}
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        config={config}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenBankExport={() => setIsBankExportOpen(true)}
        onEditCompany={() => setIsCompanyOpen(true)}
        onOpenZaloSettings={() => setIsZaloSettingsOpen(true)}
        onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
        onToggleSidebar={() => setIsSidebarMobileOpen((prev) => !prev)}
        onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
        onManualSync={handleManualForceSync}
        cloudSyncStatus={cloudSyncStatus}
        lastSyncedText={lastSyncedText}
      />

      {/* Main Layout: Sidebar on Left + Content on Right */}
      <div className="flex flex-1 min-h-[calc(100vh-60px)] relative">
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          permanentSubTab={permanentSubTab}
          seasonalSubTab={seasonalSubTab}
          onSelectSubTab={handleSelectSubTab}
          auditIssuesCount={auditCount}
          seasonalCount={syncedSeasonalWorkers.length}
          employeeCount={syncedEmployees.length}
          teamCount={teamWorkers.length}
          projectCount={projects.length}
          advanceCount={salaryAdvances.length}
          config={config}
          isOpenMobile={isSidebarMobileOpen}
          onCloseMobile={() => setIsSidebarMobileOpen(false)}
          onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
          onOpenCompanyModal={() => setIsCompanyOpen(true)}
          onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
          onOpenMobileAttendance={() => setIsMobileAttendanceView(true)}
          cloudSyncStatus={cloudSyncStatus}
        />

        {/* Right Main Content Area */}
        <main className="flex-1 min-w-0 bg-slate-100 p-3 sm:p-5 flex flex-col overflow-x-hidden">
          <div className="w-full mx-auto flex-1 flex flex-col">
            {/* Top Navigation Bar: Tab 1 và Tab 2 nổi bật */}
            <div className="no-print">
              <NavigationTabs
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                auditIssuesCount={auditCount}
                employeeCount={syncedEmployees.length}
                seasonalCount={syncedSeasonalWorkers.length}
                teamCount={teamWorkers.length}
                projectCount={projects.length}
                advanceCount={salaryAdvances.length}
              />
            </div>

            {/* Metric Summary Cards — Đồng bộ 100% với Bản Chấm Công và Bản Lương */}
            <div className="no-print">
              <MetricCards
                employees={syncedEmployees}
                seasonalWorkers={syncedSeasonalWorkers}
                activeCategory={activeTab === 'SEASONAL_WORKERS' ? 'SEASONAL' : 'PERMANENT'}
                config={config}
              />
            </div>

            {/* Tab Views */}
            <div className="flex-1">
              {/* TAB 1: BẢN NHÂN VIÊN CHÍNH THỨC (CÓ 4 SUB-TABS BÊN TRONG) */}
              {(activeTab === 'PERMANENT_EMPLOYEES' || activeTab === 'EMPLOYEE_LIST') && (
                <div className="space-y-3">
                  {/* Thanh chuyển đổi 4 Tab con bên trong Tab 1 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        id="subtab-perm-list"
                        onClick={() => setPermanentSubTab('LIST')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'LIST'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Users className="w-4 h-4 text-sky-400" />
                        <span>1.1 Danh Sách Nhân Viên</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          permanentSubTab === 'LIST' ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {syncedEmployees.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-att"
                        onClick={() => setPermanentSubTab('ATTENDANCE')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'ATTENDANCE'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <CalendarCheck className="w-4 h-4 text-emerald-400" />
                        <span>1.2 Bản Chấm Công</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {syncedEmployees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length} đang làm việc
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-payroll"
                        onClick={() => setPermanentSubTab('PAYROLL')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'PAYROLL'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Table2 className="w-4 h-4 text-sky-300" />
                        <span>1.3 Bản Lương</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-800 border border-sky-300">
                          {
                            syncedEmployees.filter(
                              (e) =>
                                (e.status || 'ACTIVE') === 'ACTIVE' &&
                                (e.selectedForAttendance === true ||
                                  (e.actualWorkDays || 0) > 0 ||
                                  (e.overtimeHours || 0) > 0)
                            ).length
                          }{' '}
                          tham gia chấm công
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-advances"
                        onClick={() => setPermanentSubTab('ADVANCES')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'ADVANCES'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-amber-400" />
                        <span>1.4 Bản Ứng Lương</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          permanentSubTab === 'ADVANCES' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {salaryAdvances.filter((a) => a.targetType === 'PERMANENT').length}
                        </span>
                      </button>
                    </div>

                    {/* Hiển thị ngày thực hiện tại & Nút chọn nhanh Tháng 9 / Tháng 10 / Tháng hiện tại */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Hôm nay: {realDateInfo.realDateStr}</span>
                      </span>
                      <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(9, config.year || realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === 9
                              ? 'bg-[#0f3d64] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          Tháng 9
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(10, config.year || realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === 10
                              ? 'bg-[#0f3d64] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          Tháng 10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(realDateInfo.realMonth, realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === realDateInfo.realMonth && config.year === realDateInfo.realYear
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          Tháng {realDateInfo.realMonthPadded}/{realDateInfo.realYear} (Hiện tại)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1.1 Danh Sách Nhân Viên */}
                  {permanentSubTab === 'LIST' && (
                    <EmployeeListTab
                      employees={syncedEmployees}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      onBatchUpdate={handleBatchUpdate}
                      onGoToAttendance={() => setPermanentSubTab('ATTENDANCE')}
                      onGoToSeasonalWorkers={() => {
                        setActiveTab('SEASONAL_WORKERS');
                        setSeasonalSubTab('LIST');
                      }}
                      onResetDefault={handleResetDefault}
                    />
                  )}

                  {/* 1.2 Bản Chấm Công (Chỉ hiện NV đang làm việc) */}
                  {permanentSubTab === 'ATTENDANCE' && (
                    <AttendanceTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onBatchUpdate={handleBatchUpdate}
                      onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                      onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                      onUpdateEmployee={handleUpdateEmployee}
                      onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      forcedGroup="PERMANENT"
                      seasonalCount={syncedSeasonalWorkers.length}
                      onManualSync={handleManualForceSync}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      cloudSyncStatus={cloudSyncStatus}
                    />
                  )}

                  {/* 1.3 Bản Lương (Tự động nhảy lương khi nhân viên tham gia chấm công) */}
                  {permanentSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      onSavePayrollToCloud={handleManualForceSync}
                      forcedCategory="PERMANENT"
                    />
                  )}

                  {/* 1.4 Bản Ứng Lương (Chỉ hiện NV đang làm việc) */}
                  {permanentSubTab === 'ADVANCES' && (
                    <SalaryAdvancesTab
                      advances={salaryAdvances}
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onAddAdvance={handleAddSalaryAdvance}
                      onUpdateAdvance={handleUpdateSalaryAdvance}
                      onDeleteAdvance={handleDeleteSalaryAdvance}
                      forcedTargetType="PERMANENT"
                    />
                  )}
                </div>
              )}

              {/* TAB 2: BẢN NHÂN VIÊN THỜI VỤ (CÓ 4 SUB-TABS BÊN TRONG) */}
              {activeTab === 'SEASONAL_WORKERS' && (
                <div className="space-y-3">
                  {/* Thanh chuyển đổi 4 Tab con bên trong Tab 2 (ẩn trên 2.1 Danh Sách Thời Vụ theo yêu cầu tinh gọn) */}
                  {seasonalSubTab !== 'LIST' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          id="subtab-seas-list"
                          onClick={() => setSeasonalSubTab('LIST')}
                          className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                        >
                          <HardHat className="w-4 h-4 text-amber-200" />
                          <span>2.1 Danh Sách Thời Vụ</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-200 text-slate-700">
                            {syncedSeasonalWorkers.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-att"
                          onClick={() => setSeasonalSubTab('ATTENDANCE')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'ATTENDANCE'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <CalendarCheck className="w-4 h-4 text-amber-200" />
                          <span>2.2 Bản Chấm Công</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            {
                              syncedSeasonalWorkers.filter(
                                (w) => (w.status || 'ACTIVE') === 'ACTIVE' && w.payrollCycleType !== 'TEAM'
                              ).length
                            }{' '}
                            đang làm việc
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-payroll"
                          onClick={() => setSeasonalSubTab('PAYROLL')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'PAYROLL'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <Table2 className="w-4 h-4 text-amber-200" />
                          <span>2.3 Bản Lương</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            {
                              syncedSeasonalWorkers.filter(
                                (w) =>
                                  (w.status || 'ACTIVE') === 'ACTIVE' &&
                                  ((w.actualWorkDays || 0) > 0 ||
                                    (w.overtimeHours || 0) > 0 ||
                                    (w.payrollCycleType === 'TEAM' &&
                                      (Boolean(w.selectedForAttendance) || (w.salaryByDays || 0) > 0)))
                              ).length
                            }{' '}
                            nhận lương
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-advances"
                          onClick={() => setSeasonalSubTab('ADVANCES')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'ADVANCES'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 text-amber-200" />
                          <span>2.4 Bản Ứng Lương</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                            seasonalSubTab === 'ADVANCES' ? 'bg-slate-900 text-amber-300' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {salaryAdvances.filter((a) => a.targetType === 'SEASONAL').length}
                          </span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Hôm nay: {realDateInfo.realDateStr}</span>
                        </span>
                        <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(9, config.year || realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === 9
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            Tháng 9
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(10, config.year || realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === 10
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            Tháng 10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(realDateInfo.realMonth, realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === realDateInfo.realMonth && config.year === realDateInfo.realYear
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            Tháng {realDateInfo.realMonthPadded}/{realDateInfo.realYear} (Hiện tại)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2.1 Danh Sách Thời Vụ */}
                  {seasonalSubTab === 'LIST' && (
                    <SeasonalWorkersTab
                      workers={syncedSeasonalWorkers}
                      projects={projects}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateWorker={handleUpdateSeasonalWorker}
                      onAddWorker={handleAddSeasonalWorker}
                      onDeleteWorker={handleDeleteSeasonalWorker}
                      onDeleteBatchWorkers={handleDeleteBatchSeasonalWorkers}
                      onClearAllWorkers={handleClearAllSeasonalWorkers}
                      onResetWorkers={handleResetSeasonalWorkers}
                      onReorderWorkers={handleReorderSeasonalWorkers}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      onGoToPermanentEmployees={() => {
                        setActiveTab('PERMANENT_EMPLOYEES');
                        setPermanentSubTab('LIST');
                      }}
                      onGoToSeasonalAttendance={() => setSeasonalSubTab('ATTENDANCE')}
                      onGoToSeasonalPayroll={() => setSeasonalSubTab('PAYROLL')}
                    />
                  )}

                  {/* 2.2 Bản Chấm Công (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ATTENDANCE' && (
                    <AttendanceTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onBatchUpdate={handleBatchUpdate}
                      onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                      onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                      onUpdateEmployee={handleUpdateEmployee}
                      onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      forcedGroup="SEASONAL"
                      seasonalCount={syncedSeasonalWorkers.length}
                      onManualSync={handleManualForceSync}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      cloudSyncStatus={cloudSyncStatus}
                    />
                  )}

                  {/* 2.3 Bản Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                      onSavePayrollToCloud={handleManualForceSync}
                      forcedCategory="SEASONAL"
                    />
                  )}

                  {/* 2.4 Bản Ứng Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ADVANCES' && (
                    <SalaryAdvancesTab
                      advances={salaryAdvances}
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onAddAdvance={handleAddSalaryAdvance}
                      onUpdateAdvance={handleUpdateSalaryAdvance}
                      onDeleteAdvance={handleDeleteSalaryAdvance}
                      forcedTargetType="SEASONAL"
                    />
                  )}
                </div>
              )}

              {/* Tab 3: Danh Sách Dự Án */}
              {activeTab === 'PROJECTS' && (
                <ProjectsTab
                  projects={projects}
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  onAddProject={handleAddProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}

              {/* Tab 4: Báo Cáo Tài Chính */}
              {activeTab === 'FINANCIAL_REPORT' && (
                <FinancialReportTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  projects={projects}
                  advances={salaryAdvances}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                />
              )}

              {/* Tab 5: Phiếu Lương */}
              {activeTab === 'PAYSLIP' && (
                <PayslipTab
                  employees={syncedEmployees}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployeeContact={(empId, updates) => {
                    setEmployees((prev) =>
                      prev.map((e) =>
                        e.id === empId || e.code === empId
                          ? {
                              ...e,
                              ...(updates.email !== undefined ? { email: updates.email } : {}),
                              ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
                            }
                          : e
                      )
                    );
                  }}
                  onUpdateEmployeeEmail={(empId, newEmail) => {
                    setEmployees((prev) =>
                      prev.map((e) =>
                        e.id === empId || e.code === empId ? { ...e, email: newEmail } : e
                      )
                    );
                  }}
                  onOpenZaloSettings={() => setIsZaloSettingsOpen(true)}
                  onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
                />
              )}

              {/* Tab: Tổng Hợp Theo Bộ Phận */}
              {activeTab === 'DEPARTMENT' && (
                <DepartmentSummaryTab employees={syncedEmployees} />
              )}

              {/* Tab 6: Kiểm Tra Dữ Liệu */}
              {activeTab === 'DATA_AUDIT' && (
                <DataAuditTab
                  employees={syncedEmployees}
                  onSelectEmployeeForPayslip={handleAuditSelectEmployee}
                />
              )}

              {/* Direct Tab Access Fallbacks */}
              {activeTab === 'PERMANENT_PAYROLL' && (
                <PayrollTableTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  forcedCategory="PERMANENT"
                />
              )}

              {activeTab === 'SEASONAL_PAYROLL' && (
                <PayrollTableTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                  forcedCategory="SEASONAL"
                />
              )}

              {activeTab === 'ATTENDANCE' && (
                <AttendanceTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onBatchUpdate={handleBatchUpdate}
                  onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                  onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                  seasonalCount={syncedSeasonalWorkers.length}
                />
              )}

              {activeTab === 'SALARY_ADVANCES' && (
                <SalaryAdvancesTab
                  advances={salaryAdvances}
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onAddAdvance={handleAddSalaryAdvance}
                  onUpdateAdvance={handleUpdateSalaryAdvance}
                  onDeleteAdvance={handleDeleteSalaryAdvance}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={(newEmployees) => {
          setEmployees(newEmployees);
        }}
        onResetDefault={handleResetDefault}
      />

      <BankExportModal
        isOpen={isBankExportOpen}
        onClose={() => setIsBankExportOpen(false)}
        employees={employees}
        config={config}
      />

      <CompanyModal
        isOpen={isCompanyOpen}
        onClose={() => setIsCompanyOpen(false)}
        config={config}
        onSave={(newCfg) => {
          setConfig(newCfg);
          if (newCfg.standardWorkDays && newCfg.standardWorkDays !== config.standardWorkDays) {
            setEmployees((prev) =>
              prev.map((emp) =>
                recomputeEmployeePayroll({
                  ...emp,
                  standardWorkDays: newCfg.standardWorkDays,
                })
              )
            );
          }
        }}
      />

      <ZaloOASettingsModal
        isOpen={isZaloSettingsOpen}
        onClose={() => setIsZaloSettingsOpen(false)}
        config={config}
        onSave={(newZaloConfig) => {
          setConfig((prev) => ({
            ...prev,
            zaloOA: newZaloConfig,
          }));
        }}
      />

      <BatchSendZaloModal
        isOpen={isBatchZaloOpen}
        onClose={() => setIsBatchZaloOpen(false)}
        employees={employees}
        config={config}
        onOpenSettings={() => {
          setIsBatchZaloOpen(false);
          setIsZaloSettingsOpen(true);
        }}
      />

      <SupabaseSyncModal
        isOpen={isSupabaseOpen}
        onClose={() => setIsSupabaseOpen(false)}
        config={config}
        employees={employees}
        seasonalWorkers={seasonalWorkers}
        teamWorkers={teamWorkers}
        projects={projects}
        salaryAdvances={salaryAdvances}
        onDataLoadedFromCloud={({
          config: newCfg,
          employees: newEmps,
          seasonalWorkers: newSeas,
          teamWorkers: newTeams,
          projects: newProjs,
          salaryAdvances: newAdvs,
        }) => {
          if (newCfg) {
            setConfig(newCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(newCfg));
          }
          if (newEmps && newEmps.length > 0) {
            setEmployees(newEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(newEmps));
          }
          if (newSeas && newSeas.length > 0) {
            setSeasonalWorkers(newSeas);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(newSeas));
          }
          if (newTeams && newTeams.length > 0) {
            setTeamWorkers(newTeams);
            localStorage.setItem('payroll_team_workers', JSON.stringify(newTeams));
          }
          if (newProjs && newProjs.length > 0) {
            setProjects(newProjs);
            localStorage.setItem('payroll_projects', JSON.stringify(newProjs));
          }
          if (newAdvs && newAdvs.length > 0) {
            setSalaryAdvances(newAdvs);
            localStorage.setItem('payroll_salary_advances', JSON.stringify(newAdvs));
          }
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }}
        onSyncSuccess={() => {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }}
      />
    </div>
  );
}
