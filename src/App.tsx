import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, HardHat, Building, CalendarCheck, Table2, CreditCard, CheckCircle2, Save, X } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TabType, NavigationTabs } from './components/NavigationTabs';
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
  loadRawAttendanceRowsFromSupabase,
  loadProjectsFromSupabase,
  loadTeamWorkersFromSupabase,
  loadSalaryAdvancesFromSupabase,
  syncCompanyConfigToSupabase,
  syncEmployeesToSupabase,
  syncSeasonalWorkersToSupabase,
  syncTeamWorkersToSupabase,
  syncProjectsToSupabase,
  syncSalaryAdvancesToSupabase,
  syncPayrollRecordsToSupabase,
  syncSingleEmployeeToSupabase,
  syncSingleSeasonalWorkerToSupabase,
  deleteBatchSeasonalWorkersFromSupabase,
  clearAllSeasonalWorkersFromSupabase,
  deleteEmployeeFromSupabase,
  subscribeToSupabaseRealtime,
  notifyCloudSyncInstant,
  syncSupabaseCredentialsToServer,
  fetchCloudSyncSignature,
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
  isGenuineUserEmployeeAttendance,
  normalizeEmpName,
  syncEmployeeForMonth,
  buildMonthlyAttendanceRecord,
  isLegacy19MockEmployeeList,
} from './utils/payrollCalculator';
import { ensureEmployeeContract } from './utils/contractHelper';
import { updateWorkerMonthlyAttendance } from './utils/seasonalAttendanceHelper';
import {
  fetchServerData,
  saveAllToServer,
  saveAttendanceToServer,
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
const DELETED_ADV_STORAGE_KEY = 'pncons_deleted_adv_keys';

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
            const exIsGenuine = isGenuineUserEmployeeAttendance(exRec);
            const rIsGenuine = isGenuineUserEmployeeAttendance(rRec);
            const exIsDefault = exRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const rIsDefault = rRec.lastSubmittedAt === DEFAULT_MOCK_TIMESTAMP;
            const exTime = exRec.lastSubmittedAt ? new Date(exRec.lastSubmittedAt).getTime() : 0;
            const rTime = rRec.lastSubmittedAt ? new Date(rRec.lastSubmittedAt).getTime() : 0;

            if (rIsGenuine && !exIsGenuine) {
              mergedMonthly[mKey] = rRec;
            } else if (exIsGenuine && !rIsGenuine) {
              mergedMonthly[mKey] = exRec;
            } else if (exIsDefault && !rIsDefault) {
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
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
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
  const [supabaseConfigVersion, setSupabaseConfigVersion] = useState(0);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [lastSyncedText, setLastSyncedText] = useState<string | null>(getLastSyncedTime());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState<string | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => {
    const onCfgChange = () => setSupabaseConfigVersion((v) => v + 1);
    window.addEventListener('pncons-supabase-config-changed', onCfgChange);
    return () => window.removeEventListener('pncons-supabase-config-changed', onCfgChange);
  }, []);

  // Theo dõi các thao tác xóa nhân sự chờ nhấn nút "Lưu Data" mới thực thi xóa vĩnh viễn
  const pendingDeletedSeaRef = useRef<{
    ids: string[];
    codes: string[];
    removedKeys: string[];
    clearAll: boolean;
    resetDeleted: boolean;
  }>({
    ids: [],
    codes: [],
    removedKeys: [],
    clearAll: false,
    resetDeleted: false,
  });

  const pendingDeletedEmpRef = useRef<{
    items: Array<{ id: string; code?: string }>;
    deletedStorageKeys: string[];
    removedKeys: string[];
    resetDeleted: boolean;
  }>({
    items: [],
    deletedStorageKeys: [],
    removedKeys: [],
    resetDeleted: false,
  });

  const markUnsaved = () => {
    lastLocalEditAtRef.current = Date.now();
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
  };

  // Cảnh báo nếu người dùng đóng trình duyệt hoặc F5 khi đang có dữ liệu nhập chưa nhấn nút "Lưu Data"
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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

  // Chuẩn hóa dữ liệu chấm công theo tháng & kỳ lương để so sánh nội dung thực (bỏ qua dấu thời gian updatedAt / lastSubmittedAt gây vòng lặp lưu)
  const canonicalizeMonthlyAttendance = (mAtt?: Record<string, any>) => {
    if (!mAtt || typeof mAtt !== 'object') return [];
    return Object.keys(mAtt)
      .sort()
      .map((mKey) => {
        const rec = mAtt[mKey];
        if (!rec) return [mKey, 0, 0, []];
        const daysObj = rec.days && typeof rec.days === 'object' ? rec.days : {};
        const sortedDays = Object.keys(daysObj)
          .sort((a, b) => Number(a) - Number(b))
          .map((dKey) => {
            const d = daysObj[dKey];
            return [
              Number(dKey),
              Number(d?.workUnits || 0),
              Number(d?.otHours || 0),
              String(d?.statusType || ''),
            ];
          });
        return [
          mKey,
          Number(rec.totalWorkDays || 0),
          Number(rec.totalOtHours || 0),
          sortedDays,
        ];
      });
  };

  const canonicalizePeriodRecords = (pRecs?: Record<string, any>) => {
    if (!pRecs || typeof pRecs !== 'object') return [];
    return Object.keys(pRecs)
      .sort()
      .map((pKey) => {
        const r = pRecs[pKey];
        if (!r) return [pKey];
        return [
          pKey,
          Boolean(r.isRecorded),
          Number(r.dailyRate || 0),
          Number(r.actualWorkDays || 0),
          Number(r.salaryByDays || 0),
          Number(r.overtimeHours || 0),
          Number(r.mealAllowance || 0),
          Number(r.travelSafetyAllowance || 0),
          Number(r.otherBonus || 0),
          Number(r.advancePayment || 0),
          String(r.cycleType || ''),
          String(r.paymentDate || ''),
          String(r.project || ''),
          Boolean(r.selectedForAttendance),
        ];
      });
  };

  const serializeConfigSnapshot = (cfg: CompanyConfig): string => {
    try {
      return JSON.stringify([
        cfg?.name || '',
        cfg?.address || '',
        cfg?.taxCode || '',
        cfg?.phone || '',
        Number(cfg?.standardWorkDays || 26),
        cfg?.zaloOA || null,
      ]);
    } catch {
      return '';
    }
  };

  const serializeEmployeesSnapshot = (emps: Employee[]): string => {
    try {
      return JSON.stringify(
        emps.map((x) => [
          x.id,
          x.code,
          x.fullName,
          x.title,
          x.department,
          x.phone || '',
          x.email || '',
          x.idCard || '',
          x.taxCode || '',
          x.joinDate || '',
          x.status || 'ACTIVE',
          x.salaryType || 'MONTHLY',
          Number(x.dailyRate || 0),
          Number(x.baseSalary || 0),
          Number(x.insuranceSalary || 0),
          Number(x.responsibilityAllowance || 0),
          Number(x.projectAllowance || 0),
          Number(x.mealAllowance || 0),
          Number(x.phoneTravelAllowance || 0),
          Number(x.kpiBonus || 0),
          Number(x.otherIncome || 0),
          Number(x.dependents || 0),
          Number(x.actualWorkDays || 0),
          Number(x.paidLeaveDays || 0),
          Number(x.unpaidLeaveDays || 0),
          Number(x.overtimeHours || 0),
          Number(x.advancePayment || 0),
          Boolean(x.selectedForAttendance),
          x.bankAccount || '',
          x.bankName || '',
          x.contractType || '',
          x.contractDuration || '',
          x.contractStartDate || '',
          x.contractEndDate || '',
          x.contractNumber || '',
          canonicalizeMonthlyAttendance(x.monthlyAttendance),
          canonicalizePeriodRecords(x.periodRecords),
        ])
      );
    } catch {
      return '';
    }
  };

  const serializeSeasonalSnapshot = (seas: SeasonalWorker[]): string => {
    try {
      return JSON.stringify(
        seas.map((x) => [
          x.id,
          x.code,
          x.fullName,
          x.trade || '',
          x.skillLevel || '',
          x.project || '',
          x.teamName || '',
          x.phone || '',
          x.idCard || '',
          x.paymentMethod || 'BANK',
          Number(x.actualWorkDays || 0),
          Number(x.advancePayment || 0),
          Number(x.dailyRate || 0),
          Number(x.overtimeHours || 0),
          Number(x.mealAllowance || 0),
          Number(x.travelSafetyAllowance || 0),
          Number(x.otherBonus || 0),
          Boolean(x.hasTaxCommitment ?? true),
          x.status || 'ACTIVE',
          x.payrollCycleType || '1_MONTH',
          x.bankAccount || '',
          x.bankName || '',
          Number(x.salaryByDays || 0),
          x.paymentDate || '',
          Boolean(x.selectedForAttendance),
          canonicalizeMonthlyAttendance(x.monthlyAttendance),
          canonicalizePeriodRecords(x.periodRecords),
        ])
      );
    } catch {
      return '';
    }
  };

  const serializeAdvancesSnapshot = (advs: SalaryAdvance[]): string => {
    try {
      return JSON.stringify(
        (advs || []).map((a) => [
          a.id,
          a.advanceCode,
          a.targetType,
          a.workerId,
          a.workerCode,
          Number(a.amount || 0),
          a.requestDate || '',
          a.status || 'APPROVED',
          a.periodKey || '',
          a.reason || '',
          a.paymentMethod || 'BANK',
        ])
      );
    } catch {
      return '';
    }
  };

  // Hàm tạo chuỗi snapshot đại diện cho TOÀN BỘ thông tin nhân viên & tạm ứng (bỏ qua dấu thời gian biến động & tháng đang xem trên UI)
  const serializeDataSnapshot = (
    cfg: CompanyConfig,
    emps: Employee[],
    seas: SeasonalWorker[],
    advs: SalaryAdvance[] = salaryAdvancesRef.current
  ): string => {
    try {
      return JSON.stringify({
        c: serializeConfigSnapshot(cfg),
        e: serializeEmployeesSnapshot(emps),
        s: serializeSeasonalSnapshot(seas),
        a: serializeAdvancesSnapshot(advs),
      });
    } catch {
      return '';
    }
  };

  // Snapshot & state refs theo dõi trạng thái mới nhất (chống stale closure, chống loop và không ghi đè khi đang nhập liệu)
  const lastSavedSnapshotRef = useRef<string>('');
  const lastServerSnapshotRef = useRef<string>('');
  const lastSavedPartsRef = useRef<{ cfg: string; emp: string; sea: string; adv: string }>({
    cfg: '',
    emp: '',
    sea: '',
    adv: '',
  });
  // Theo dõi bản chụp từng bảng đã có trên Supabase Cloud để chỉ đẩy ĐÚNG bảng vừa thay đổi (tăng tốc lưu gấp 5-8 lần!)
  const lastCloudPartsRef = useRef<{
    initialized: boolean;
    cfg: string;
    emp: string;
    sea: string;
    team: string;
    proj: string;
    adv: string;
  }>({
    initialized: false,
    cfg: '',
    emp: '',
    sea: '',
    team: '',
    proj: '',
    adv: '',
  });
  const isSyncingRef = useRef(false);
  const activeSyncCountRef = useRef<number>(0);
  const isReloadingFromCloudRef = useRef(false);
  const lastWriteCompletedAtRef = useRef<number>(0);
  const lastLocalEditAtRef = useRef<number>(0);
  const singleWorkerSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const realtimeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCloudPartsAsSynced = (
    cfg: CompanyConfig,
    emps: Employee[],
    seas: SeasonalWorker[],
    teams: TeamWorker[],
    projs: Project[],
    advs: SalaryAdvance[]
  ) => {
    lastCloudPartsRef.current = {
      initialized: true,
      cfg: serializeConfigSnapshot(cfg),
      emp: serializeEmployeesSnapshot(emps),
      sea: serializeSeasonalSnapshot(seas),
      team: JSON.stringify(teams || []),
      proj: JSON.stringify(projs || []),
      adv: serializeAdvancesSnapshot(advs),
    };
  };

  const markSnapshotAsSaved = (
    cfg: CompanyConfig,
    emps: Employee[],
    seas: SeasonalWorker[],
    advs: SalaryAdvance[] = salaryAdvancesRef.current
  ) => {
    const cfgSnap = serializeConfigSnapshot(cfg);
    const empSnap = serializeEmployeesSnapshot(emps);
    const seaSnap = serializeSeasonalSnapshot(seas);
    const advSnap = serializeAdvancesSnapshot(advs);
    const fullSnap = JSON.stringify({ c: cfgSnap, e: empSnap, s: seaSnap, a: advSnap });
    lastSavedPartsRef.current = { cfg: cfgSnap, emp: empSnap, sea: seaSnap, adv: advSnap };
    lastSavedSnapshotRef.current = fullSnap;
    lastServerSnapshotRef.current = fullSnap;
    return fullSnap;
  };

  const beginSyncTask = (showIndicator: boolean = true) => {
    activeSyncCountRef.current += 1;
    isSyncingRef.current = true;
    if (showIndicator) {
      setCloudSyncStatus('syncing');
    }
  };

  const endSyncTask = (finalStatus: 'synced' | 'error' = 'synced') => {
    activeSyncCountRef.current = Math.max(0, activeSyncCountRef.current - 1);
    lastWriteCompletedAtRef.current = Date.now();
    if (activeSyncCountRef.current === 0) {
      isSyncingRef.current = false;
      setCloudSyncStatus(finalStatus);
    }
  };

  // Watchdog bảo vệ: nếu một yêu cầu mạng bị treo quá 12 giây thì tự động giải phóng trạng thái 'syncing' để không bao giờ kẹt "Đang lưu Supabase..."
  useEffect(() => {
    if (cloudSyncStatus !== 'syncing') return;
    const watchdog = setTimeout(() => {
      activeSyncCountRef.current = 0;
      isSyncingRef.current = false;
      setCloudSyncStatus(isSupabaseConfigured() ? 'synced' : 'idle');
    }, 12000);
    return () => clearTimeout(watchdog);
  }, [cloudSyncStatus]);

  const configRef = useRef(config);
  const employeesRef = useRef(employees);
  const seasonalWorkersRef = useRef(seasonalWorkers);
  const projectsRef = useRef(projects);
  const teamWorkersRef = useRef(teamWorkers);
  const salaryAdvancesRef = useRef(salaryAdvances);
  const periodCodeRef = useRef(config.periodCode);
  const activeMonthRef = useRef(config.month || realDateInfo.realMonth);
  const activeYearRef = useRef(config.year || realDateInfo.realYear);

  useEffect(() => {
    configRef.current = config;
    employeesRef.current = employees;
    seasonalWorkersRef.current = seasonalWorkers;
    projectsRef.current = projects;
    teamWorkersRef.current = teamWorkers;
    salaryAdvancesRef.current = salaryAdvances;
    periodCodeRef.current = config.periodCode;
    activeMonthRef.current = config.month || realDateInfo.realMonth;
    activeYearRef.current = config.year || realDateInfo.realYear;
  }, [
    config,
    employees,
    seasonalWorkers,
    projects,
    teamWorkers,
    salaryAdvances,
    realDateInfo.realMonth,
    realDateInfo.realYear,
  ]);

  // Chỉ chặn đồng bộ nền trong 2.5 giây ngay sau khi người dùng vừa gõ phím hoặc bấm sửa dữ liệu
  const isUserEditingOrTyping = (): boolean => {
    return Date.now() - lastLocalEditAtRef.current < 2500;
  };

  const isInWriteCooldown = (): boolean => {
    return Date.now() - lastWriteCompletedAtRef.current < 4500;
  };

  // Khởi tạo snapshot ban đầu
  useEffect(() => {
    markSnapshotAsSaved(config, employees, seasonalWorkers);
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
    const hasCloudList = Array.isArray(cloudList) && cloudList.length > 0;
    localList.forEach((rawW) => {
      if (!rawW) return;
      if (deletedSeaSet.has(String(rawW.id)) || (rawW.code && deletedSeaSet.has(String(rawW.code)))) return;
      if (hasCloudList && isUnmodifiedMockSeasonalWorker(rawW)) return;
      const w = materializeSeasonalMonthlyAttendance(rawW, periodCodeStr);
      const key = getUniqueWorkerMapKey(w, localMap);
      localMap.set(key, w);
      // Khi Cloud chưa có dữ liệu thì giữ danh sách thực tế ở máy; khi Cloud đã có danh sách chuẩn thì lấy danh sách từ Cloud làm chuẩn để đồng bộ xóa/thêm
      if (!hasCloudList && !isUnmodifiedMockSeasonalWorker(w)) {
        resultMap.set(key, w);
      }
    });

    const cloudKeys = new Set<string>();
    let hasCleanedPhantomRecord = false;
    cloudList.forEach((rawCw) => {
      if (!rawCw) return;
      if (deletedSeaSet.has(String(rawCw.id)) || (rawCw.code && deletedSeaSet.has(String(rawCw.code)))) return;
      const cw = materializeSeasonalMonthlyAttendance(rawCw, periodCodeStr);
      if (
        cw.monthlyAttendance &&
        Object.values(cw.monthlyAttendance).some(
          (r: any) => r?.lastSubmittedAt === '2026-11-10T00:00:00.000Z' && Number(r?.totalWorkDays || 0) === 0
        )
      ) {
        hasCleanedPhantomRecord = true;
      }
      const key = findMatchingKeyInMap(cw, localMap);
      cloudKeys.add(key);
      const candidateExisting = localMap.get(key);
      const existing =
        candidateExisting &&
        normalizeEmpName(candidateExisting.fullName) === normalizeEmpName(cw.fullName)
          ? candidateExisting
          : undefined;

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
            : Number(cw.mealAllowance ?? existing.mealAllowance ?? 0);
        const resolvedTravelAllowance =
          exAllowTime > cwAllowTime
            ? Number(existing.travelSafetyAllowance || 0)
            : cwAllowTime > exAllowTime
            ? Number(cw.travelSafetyAllowance || 0)
            : Number(cw.travelSafetyAllowance ?? existing.travelSafetyAllowance ?? 0);
        const resolvedOtherBonus =
          exAllowTime > cwAllowTime
            ? Number(existing.otherBonus || 0)
            : cwAllowTime > exAllowTime
            ? Number(cw.otherBonus || 0)
            : Number(cw.otherBonus ?? existing.otherBonus ?? 0);

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

    if (hasCleanedPhantomRecord && typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem('pncons_seasonal_phantom_cleaned_v1') !== '1') {
          sessionStorage.setItem('pncons_seasonal_phantom_cleaned_v1', '1');
          needsPushToCloud = true;
        }
      } catch {}
    }

    const mergedList = cleanSeasonalList(Array.from(resultMap.values()), activeMonth, activeYear);
    return { mergedList, needsPushToCloud };
  };

  const lastKnownCloudSigRef = useRef<string | null>(null);

  // Chuyển đổi danh sách Nhân viên chính thức từ Cloud/Server thành chuẩn hiển thị 1-1 (khi máy hiện tại không có thay đổi chưa lưu, lấy Cloud làm chuẩn 100% để mọi trình duyệt khớp tuyệt đối)
  const formatAuthoritativeEmployeesFromRemote = (
    remoteList: Employee[],
    activeMonth: number,
    activeYear: number,
    stdDays: number = 26
  ): Employee[] => {
    try {
      localStorage.removeItem(DELETED_EMP_STORAGE_KEY);
    } catch {}
    const seenIds = new Set<string>();
    return remoteList
      .filter((rawEmp) => Boolean(rawEmp && (rawEmp.fullName || rawEmp.code)))
      .map((rawEmp, idx) => {
        const cleanEmp = sanitizeEmployeeMonthlyAttendance(rawEmp);
        let uniqueId = String(cleanEmp.id || cleanEmp.code || `EMP_${idx + 1}`);
        if (seenIds.has(uniqueId)) {
          uniqueId = `${uniqueId}_${idx + 1}`;
        }
        seenIds.add(uniqueId);
        const withContract = ensureEmployeeContract({ ...cleanEmp, id: uniqueId });
        const withHistory = ensureEmployeeHistoricalMonths(withContract);
        return syncEmployeeForMonth(withHistory, activeMonth, activeYear, stdDays);
      })
      .sort((a, b) => {
        if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  };

  // Chuyển đổi danh sách Nhân viên thời vụ từ Cloud/Server thành chuẩn hiển thị 1-1 (khớp tuyệt đối 100% giữa mọi ứng dụng / trình duyệt)
  const formatAuthoritativeSeasonalFromRemote = (
    remoteList: SeasonalWorker[],
    activeMonth: number,
    activeYear: number
  ): SeasonalWorker[] => {
    try {
      localStorage.removeItem(DELETED_SEA_STORAGE_KEY);
    } catch {}
    return cleanSeasonalList(remoteList, activeMonth, activeYear);
  };

  // Hàm tải dữ liệu đã lưu từ Supabase Cloud siêu tốc (tải chọn lọc bảng vừa đổi hoặc tải chung 1 lượt attendance_records, CHỈ ĐỌC)
  const reloadLatestFromCloud = async (options?: { silent?: boolean; tables?: string[] }) => {
    if (!isSupabaseConfigured()) return;
    if (isReloadingFromCloudRef.current) return;
    // Tuyệt đối không ghi đè dữ liệu đang nhập chưa nhấn "Lưu Data"
    if (
      hasUnsavedChangesRef.current ||
      (options?.silent &&
        (isSyncingRef.current ||
          activeSyncCountRef.current > 0 ||
          isUserEditingOrTyping() ||
          isInWriteCooldown()))
    ) {
      return;
    }
    isReloadingFromCloudRef.current = true;
    try {
      const curPeriod = periodCodeRef.current;
      const curM = activeMonthRef.current;
      const curY = activeYearRef.current;
      const curMStr = curM < 10 ? `0${curM}` : `${curM}`;

      const reqTables = options?.tables && options.tables.length > 0 ? options.tables : ['all'];
      const loadAll = reqTables.includes('all');
      const wantCfg = loadAll || reqTables.includes('company_config');
      const wantEmp = loadAll || reqTables.includes('employees');
      const wantSea = loadAll || reqTables.includes('seasonal_workers');
      const wantProj = loadAll || reqTables.includes('projects');
      const wantTeam = loadAll || reqTables.includes('team_workers');
      const wantAdv = loadAll || reqTables.includes('salary_advances');

      // Nếu tải cả NV Chính thức & Thời vụ thì chỉ tải bảng attendance_records ĐÚNG 1 LẦN để dùng chung (giảm 50% truy vấn chấm công)
      const sharedAttPromise =
        wantEmp && wantSea ? loadRawAttendanceRowsFromSupabase() : undefined;

      const [cloudCfg, cloudEmp, cloudSea, cloudProj, cloudTeams, cloudAdvs] = await Promise.all([
        wantCfg ? loadCompanyConfigFromSupabase() : Promise.resolve(null),
        wantEmp
          ? (sharedAttPromise
              ? sharedAttPromise.then((att) => loadEmployeesFromSupabase(curPeriod, att))
              : loadEmployeesFromSupabase(curPeriod))
          : Promise.resolve(null),
        wantSea
          ? (sharedAttPromise
              ? sharedAttPromise.then((att) => loadSeasonalWorkersFromSupabase(curPeriod, att))
              : loadSeasonalWorkersFromSupabase(curPeriod))
          : Promise.resolve(null),
        wantProj ? loadProjectsFromSupabase() : Promise.resolve(null),
        wantTeam ? loadTeamWorkersFromSupabase(curPeriod) : Promise.resolve(null),
        wantAdv ? loadSalaryAdvancesFromSupabase(curPeriod) : Promise.resolve(null),
      ]);

      if (
        hasUnsavedChangesRef.current ||
        (options?.silent &&
          (isSyncingRef.current ||
            activeSyncCountRef.current > 0 ||
            isUserEditingOrTyping() ||
            isInWriteCooldown()))
      ) {
        return;
      }

      const latestConfig = configRef.current;
      const latestEmployees = employeesRef.current;
      const latestSeasonal = seasonalWorkersRef.current;
      const latestAdvances = salaryAdvancesRef.current;

      const effectiveProjs = cloudProj && cloudProj.length > 0 ? cloudProj : projectsRef.current;
      const effectiveTeams = cloudTeams !== null ? cloudTeams : teamWorkersRef.current;

      if (cloudProj && cloudProj.length > 0) {
        projectsRef.current = cloudProj;
        setProjects(cloudProj);
        localStorage.setItem('payroll_projects', JSON.stringify(cloudProj));
      }
      if (cloudTeams !== null) {
        teamWorkersRef.current = cloudTeams;
        setTeamWorkers(cloudTeams);
        localStorage.setItem('payroll_team_workers', JSON.stringify(cloudTeams));
      }

      const appliedCfg = cloudCfg
        ? mergeRemoteConfigPreservingPeriod(latestConfig, cloudCfg)
        : latestConfig;

      const appliedEmp =
        cloudEmp && cloudEmp.length > 0
          ? formatAuthoritativeEmployeesFromRemote(
              cloudEmp,
              curM,
              curY,
              appliedCfg.standardWorkDays || 26
            )
          : latestEmployees;

      const appliedSea =
        cloudSea && cloudSea.length > 0
          ? formatAuthoritativeSeasonalFromRemote(cloudSea, curM, curY)
          : latestSeasonal;

      const effectiveAdvs =
        cloudAdvs !== null
          ? reconcileWorkerAdvancesIntoList(cloudAdvs, appliedEmp, appliedSea)
          : latestAdvances;

      if (cloudAdvs !== null) {
        salaryAdvancesRef.current = effectiveAdvs;
        setSalaryAdvances(effectiveAdvs);
        localStorage.setItem('payroll_salary_advances', JSON.stringify(effectiveAdvs));
      }

      markCloudPartsAsSynced(
        appliedCfg,
        appliedEmp,
        appliedSea,
        effectiveTeams,
        effectiveProjs,
        effectiveAdvs
      );

      const currentMemorySnapshot = serializeDataSnapshot(
        latestConfig,
        latestEmployees,
        latestSeasonal,
        latestAdvances
      );
      const newSnapshot = serializeDataSnapshot(appliedCfg, appliedEmp, appliedSea, effectiveAdvs);
      if (options?.silent && newSnapshot && newSnapshot === currentMemorySnapshot) {
        markSnapshotAsSaved(appliedCfg, appliedEmp, appliedSea, effectiveAdvs);
        setCloudSyncStatus((prev) => (prev === 'syncing' ? prev : 'synced'));
        return;
      }

      markSnapshotAsSaved(appliedCfg, appliedEmp, appliedSea, effectiveAdvs);

      if (cloudCfg) {
        configRef.current = appliedCfg;
        setConfig(appliedCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(appliedCfg));
      }
      if (cloudEmp && cloudEmp.length > 0) {
        employeesRef.current = appliedEmp;
        setEmployees(appliedEmp);
        localStorage.setItem('payroll_employees', JSON.stringify(appliedEmp));
        localStorage.setItem(`payroll_month_${curY}_${curMStr}`, JSON.stringify(appliedEmp));
      }
      if (cloudSea && cloudSea.length > 0) {
        seasonalWorkersRef.current = appliedSea;
        setSeasonalWorkers(appliedSea);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(appliedSea));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getLastSyncedTime());

      fetchCloudSyncSignature()
        .then((sig) => {
          if (sig) lastKnownCloudSigRef.current = sig;
        })
        .catch(() => {});
    } catch (e) {
      console.warn('Error reloading from Supabase Cloud:', e);
      if (!options?.silent) setCloudSyncStatus('error');
    } finally {
      isReloadingFromCloudRef.current = false;
    }
  };

  // Áp dụng gói dữ liệu từ Máy chủ Backend khi chưa cấu hình Supabase
  const applyAuthoritativeServerData = (serverData: any) => {
    const curM = activeMonthRef.current;
    const curY = activeYearRef.current;
    const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
    const nextCfg = serverData.config
      ? mergeRemoteConfigPreservingPeriod(configRef.current, serverData.config)
      : configRef.current;

    const nextEmps =
      Array.isArray(serverData.employees) &&
      serverData.employees.length > 0 &&
      !isLegacy19MockEmployeeList(serverData.employees)
        ? formatAuthoritativeEmployeesFromRemote(
            serverData.employees,
            curM,
            curY,
            nextCfg.standardWorkDays || 26
          )
        : employeesRef.current;

    const nextSeas =
      Array.isArray(serverData.seasonalWorkers) && serverData.seasonalWorkers.length > 0
        ? formatAuthoritativeSeasonalFromRemote(serverData.seasonalWorkers, curM, curY)
        : seasonalWorkersRef.current;

    const nextAdvs = Array.isArray(serverData.salaryAdvances)
      ? reconcileWorkerAdvancesIntoList(serverData.salaryAdvances, nextEmps, nextSeas)
      : salaryAdvancesRef.current;

    markSnapshotAsSaved(nextCfg, nextEmps, nextSeas, nextAdvs);

    if (serverData.config) {
      configRef.current = nextCfg;
      setConfig(nextCfg);
      localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
    }
    if (Array.isArray(serverData.employees) && serverData.employees.length > 0) {
      employeesRef.current = nextEmps;
      setEmployees(nextEmps);
      localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
      localStorage.setItem(`payroll_month_${curY}_${curMStr}`, JSON.stringify(nextEmps));
    }
    if (Array.isArray(serverData.seasonalWorkers) && serverData.seasonalWorkers.length > 0) {
      seasonalWorkersRef.current = nextSeas;
      setSeasonalWorkers(nextSeas);
      localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
    }
    if (Array.isArray(serverData.projects) && serverData.projects.length > 0) {
      projectsRef.current = serverData.projects;
      setProjects(serverData.projects);
      localStorage.setItem('payroll_projects', JSON.stringify(serverData.projects));
    }
    if (Array.isArray(serverData.teamWorkers)) {
      teamWorkersRef.current = serverData.teamWorkers;
      setTeamWorkers(serverData.teamWorkers);
      localStorage.setItem('payroll_team_workers', JSON.stringify(serverData.teamWorkers));
    }
    if (Array.isArray(serverData.salaryAdvances)) {
      salaryAdvancesRef.current = nextAdvs;
      setSalaryAdvances(nextAdvs);
      localStorage.setItem('payroll_salary_advances', JSON.stringify(nextAdvs));
    }
    setCloudSyncStatus('synced');
    setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
  };

  // KHỞI ĐỘNG: Tự động chia sẻ kết nối Supabase qua Server (cho trình duyệt khác trên cùng máy/URL) và đọc dữ liệu mới nhất
  useEffect(() => {
    let isMounted = true;

    if (isSupabaseConfigured()) {
      syncSupabaseCredentialsToServer();
    }

    (async () => {
      try {
        const wasSupabaseConfigured = isSupabaseConfigured();
        const serverData = await fetchServerData();
        if (!isMounted || hasUnsavedChangesRef.current) return;

        if (serverData && serverData.lastUpdated > 0) {
          const nextCfg = mergeRemoteConfigPreservingPeriod(configRef.current, serverData.config);

          // Nếu trình duyệt thứ 2 chưa có khóa Supabase nhưng Server đã lưu khóa từ trình duyệt chính -> Tự động kết nối & kéo toàn bộ dữ liệu từ Supabase Cloud!
          if (!wasSupabaseConfigured && isSupabaseConfigured()) {
            configRef.current = nextCfg;
            setConfig(nextCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
            await reloadLatestFromCloud();
            return;
          }

          if (isSupabaseConfigured()) {
            await reloadLatestFromCloud();
            return;
          }

          applyAuthoritativeServerData(serverData);
        } else if (isSupabaseConfigured()) {
          await reloadLatestFromCloud();
        }
      } catch (err) {
        console.warn('Initial server load error:', err);
        if (isMounted && isSupabaseConfigured()) {
          reloadLatestFromCloud();
        }
      }
    })();

    // Lắng nghe cập nhật từ trình duyệt / thiết bị khác ĐÃ NHẤN LƯU DATA (CHỈ ĐỌC khi máy này không có thay đổi chưa lưu)
    const unsubscribe = subscribeToSync((serverData) => {
      if (!isMounted || hasUnsavedChangesRef.current) return;
      if (isSyncingRef.current || activeSyncCountRef.current > 0 || isUserEditingOrTyping() || isInWriteCooldown()) {
        return;
      }

      const wasSb = isSupabaseConfigured();
      if (!wasSb && serverData.config && (serverData.config as any).supabaseUrl && (serverData.config as any).supabaseAnonKey) {
        setSupabaseConfig((serverData.config as any).supabaseUrl, (serverData.config as any).supabaseAnonKey);
      }

      if (isSupabaseConfigured()) {
        reloadLatestFromCloud({ silent: true });
        return;
      }

      applyAuthoritativeServerData(serverData);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // KHỞI ĐỘNG KHI VỪA CẬP NHẬT CẤU HÌNH SUPABASE: Tự động kéo dữ liệu mới nhất về (CHỈ ĐỌC, KHÔNG TỰ ĐỘNG GHI)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    syncSupabaseCredentialsToServer();
    if (!hasUnsavedChangesRef.current) {
      reloadLatestFromCloud();
    }
  }, [supabaseConfigVersion]);

  // 1. Lắng nghe BroadcastChannel khi tab khác ĐÃ NHẤN LƯU DATA (bỏ qua nếu tab này đang có dữ liệu chưa lưu)
  useEffect(() => {
    if (!syncBroadcast) return;
    const handleBroadcast = async (e: MessageEvent) => {
      if (e.data?.type === 'PAYROLL_DATA_CHANGED' && !hasUnsavedChangesRef.current) {
        if (isSupabaseConfigured()) {
          reloadLatestFromCloud({ silent: true });
        } else {
          const sData = await fetchServerData();
          if (sData && !hasUnsavedChangesRef.current) {
            applyAuthoritativeServerData(sData);
          }
        }
      }
    };
    syncBroadcast.addEventListener('message', handleBroadcast);
    return () => {
      syncBroadcast.removeEventListener('message', handleBroadcast);
    };
  }, [syncBroadcast]);

  // 2. Đồng bộ đa ứng dụng / đa trình duyệt TỨC THỜI (< 0.3s qua WebSocket Broadcast + dự phòng chữ ký 2s siêu nhẹ ~120 bytes — CHỈ ĐỌC)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const pendingTablesSet = new Set<string>();

    const triggerSafeSilentReload = (specificTables?: string[]) => {
      if (
        hasUnsavedChangesRef.current ||
        isSyncingRef.current ||
        activeSyncCountRef.current > 0 ||
        isUserEditingOrTyping() ||
        isInWriteCooldown()
      ) {
        return;
      }
      reloadLatestFromCloud({ silent: true, tables: specificTables });
    };

    const unsubscribe = subscribeToSupabaseRealtime((_tbl, _ev, payload) => {
      if (
        hasUnsavedChangesRef.current ||
        isSyncingRef.current ||
        activeSyncCountRef.current > 0 ||
        isInWriteCooldown()
      ) {
        return;
      }
      const incomingTables: string[] = Array.isArray(payload?.tables) ? payload.tables : ['all'];
      incomingTables.forEach((t) => pendingTablesSet.add(t));

      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      realtimeDebounceTimerRef.current = setTimeout(() => {
        const tablesToFetch = Array.from(pendingTablesSet);
        pendingTablesSet.clear();
        triggerSafeSilentReload(tablesToFetch.length > 0 ? tablesToFetch : undefined);
      }, 80);
    });

    const handleWindowFocus = () => {
      triggerSafeSilentReload();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerSafeSilentReload();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Kiểm tra chữ ký thay đổi siêu nhẹ (~120 bytes, <40ms) mỗi 2 giây phòng trường hợp tường lửa chặn WebSocket
    const sigInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (
        hasUnsavedChangesRef.current ||
        isSyncingRef.current ||
        isReloadingFromCloudRef.current ||
        activeSyncCountRef.current > 0 ||
        isUserEditingOrTyping() ||
        isInWriteCooldown()
      ) {
        return;
      }
      const sig = await fetchCloudSyncSignature();
      if (!sig) return;
      if (lastKnownCloudSigRef.current === null) {
        lastKnownCloudSigRef.current = sig;
        return;
      }
      if (sig !== lastKnownCloudSigRef.current) {
        lastKnownCloudSigRef.current = sig;
        triggerSafeSilentReload();
      }
    }, 2000);

    return () => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(sigInterval);
      unsubscribe();
    };
  }, [isSupabaseOpen, supabaseConfigVersion]);

  // =========================================================================
  // CÁC HÀM CẬP NHẬT TRONG BỘ NHỚ TẠM (CHỈ LƯU KHI NHẤN NÚT "LƯU DATA")
  // =========================================================================

  // Cập nhật công nhân thời vụ (chỉ cập nhật trên giao diện, chờ nhấn "Lưu Data")
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    markUnsaved();
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
    let finalWorker: SeasonalWorker;
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
      finalWorker = {
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
      next[idx] = finalWorker;
    } else {
      finalWorker = {
        ...recalculated,
        bankUpdatedAt: Date.now(),
        dailyRateUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      } as SeasonalWorker;
      next = [...prev, finalWorker];
    }

    seasonalWorkersRef.current = next;
    setSeasonalWorkers(next);

    // Đồng bộ 2 chiều: nếu người dùng nhập/sửa trực tiếp tiền Tạm ứng của thợ (tại 2.1 Sửa thợ hoặc 2.3 Bản Lương Tổ Đội), tự động tạo/cập nhật phiếu trong salaryAdvances để ghi lên bảng salary_advances khi nhấn Lưu Data
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const mStr = String(curM).padStart(2, '0');
    const monthPeriodKey = `${curY}-${mStr}_MONTH`;
    const targetAdv = Number(
      finalWorker.periodRecords?.[monthPeriodKey]?.advancePayment ??
        updated.advancePayment ??
        finalWorker.advancePayment ??
        0
    );
    syncDirectWorkerAdvanceIntoList(
      'SEASONAL',
      finalWorker.id,
      finalWorker.code,
      finalWorker.fullName,
      finalWorker.project || finalWorker.trade || 'Công trình',
      finalWorker.paymentMethod || 'BANK',
      targetAdv,
      curM,
      curY
    );
  };

  // Thêm mới công nhân thời vụ (chỉ cập nhật trên giao diện, chờ nhấn "Lưu Data")
  const handleAddSeasonalWorker = (newWorker: SeasonalWorker) => {
    markUnsaved();
    pendingDeletedSeaRef.current.removedKeys.push(
      ...[newWorker.id, newWorker.code].filter(Boolean).map((k) => String(k).trim())
    );
    const recalculated = recomputeSeasonal(newWorker);
    setSeasonalWorkers((prev) => {
      const maxOrder = prev.reduce((max, w) => Math.max(max, w.sortOrder || 0), 0);
      const workerWithOrder: SeasonalWorker = {
        ...recalculated,
        sortOrder: recalculated.sortOrder || maxOrder + 1,
      };
      const next = [...prev, workerWithOrder];
      seasonalWorkersRef.current = next;
      return next;
    });
  };

  const handleReorderSeasonalWorkers = (reordered: SeasonalWorker[]) => {
    markUnsaved();
    seasonalWorkersRef.current = reordered;
    setSeasonalWorkers(reordered);
  };

  // Xóa công nhân thời vụ (chờ nhấn "Lưu Data" mới thực thi lưu/xóa vĩnh viễn)
  const handleDeleteSeasonalWorker = (id: string) => {
    markUnsaved();
    const strId = String(id).trim();
    const currentList = seasonalWorkersRef.current;
    const target = currentList.find((w) => String(w.id) === strId || String(w.code) === strId);
    const targetId = target ? String(target.id) : strId;
    const targetCode = target?.code ? String(target.code).trim() : '';

    const filtered = currentList.filter((w) => {
      if (target) {
        return String(w.id) !== targetId;
      }
      return String(w.id) !== strId && String(w.code) !== strId;
    });

    const hasRemainingSameCode = targetCode
      ? filtered.some((w) => String(w.code).trim() === targetCode)
      : false;

    pendingDeletedSeaRef.current.ids.push(targetId, strId);
    if (!hasRemainingSameCode && targetCode) {
      pendingDeletedSeaRef.current.codes.push(targetCode);
    }

    seasonalWorkersRef.current = filtered;
    setSeasonalWorkers(filtered);
  };

  // Xóa hàng loạt công nhân thời vụ (chờ nhấn "Lưu Data")
  const handleDeleteBatchSeasonalWorkers = (ids: string[]) => {
    markUnsaved();
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

    pendingDeletedSeaRef.current.ids.push(...ids);
    pendingDeletedSeaRef.current.codes.push(...codesToDelete);

    seasonalWorkersRef.current = filtered;
    setSeasonalWorkers(filtered);
  };

  // Xóa toàn bộ công nhân thời vụ (chờ nhấn "Lưu Data")
  const handleClearAllSeasonalWorkers = () => {
    markUnsaved();
    const allIds = seasonalWorkersRef.current.map((w) => String(w.id || '').trim()).filter(Boolean);
    const allCodes = seasonalWorkersRef.current.map((w) => String(w.code || '').trim()).filter(Boolean);
    pendingDeletedSeaRef.current.ids.push(...allIds);
    pendingDeletedSeaRef.current.codes.push(...allCodes);
    pendingDeletedSeaRef.current.clearAll = true;
    seasonalWorkersRef.current = [];
    setSeasonalWorkers([]);
  };

  const handleResetSeasonalWorkers = () => {
    markUnsaved();
    pendingDeletedSeaRef.current = {
      ids: [],
      codes: [],
      removedKeys: [],
      clearAll: false,
      resetDeleted: true,
    };
    seasonalWorkersRef.current = initialSeasonalWorkers;
    setSeasonalWorkers(initialSeasonalWorkers);
  };

  // Cập nhật nhân viên chính thức (cập nhật đồng bộ tức thời vào employeesRef.current để nhấn "Lưu Data" luôn lấy đúng dữ liệu mới nhất)
  const handleUpdateEmployee = (updated: Employee) => {
    const nowTs = Date.now();
    markUnsaved();
    pendingDeletedEmpRef.current.removedKeys.push(
      ...[updated.id, updated.code].filter(Boolean).map((k) => String(k).trim())
    );
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const curMonthKey = `${curY}-${String(curM).padStart(2, '0')}`;

    const recalculated = recomputeEmployeePayroll({
      ...updated,
      updatedAt: nowTs,
    });

    const prevList = employeesRef.current;
    const nextList = prevList.map((emp) => {
      if (emp.id === recalculated.id || emp.code === recalculated.code) {
        const mergedMonthly = {
          ...(emp.monthlyAttendance || {}),
          ...(recalculated.monthlyAttendance || {}),
        };

        // Nếu số công / OT / nghỉ phép của tháng hiện tại thay đổi nhưng chưa có hoặc lệch với monthlyAttendance[curMonthKey], tự động đồng bộ chuẩn
        const existingCurRec = mergedMonthly[curMonthKey];
        const recWork = Number(existingCurRec?.totalWorkDays || 0);
        const recOt = Number(existingCurRec?.totalOtHours || 0);
        const targetWork = Number(recalculated.actualWorkDays || 0);
        const targetOt = Number(recalculated.overtimeHours || 0);
        const callerProvidedCurMonth = Boolean(updated.monthlyAttendance?.[curMonthKey]);

        if (!callerProvidedCurMonth && (targetWork !== recWork || targetOt !== recOt)) {
          mergedMonthly[curMonthKey] = buildMonthlyAttendanceRecord(
            curM,
            curY,
            targetWork,
            targetOt,
            Number(recalculated.paidLeaveDays || 0),
            Number(recalculated.unpaidLeaveDays || 0),
            true
          );
        }

        return {
          ...emp,
          ...recalculated,
          updatedAt: nowTs,
          monthlyAttendance: mergedMonthly,
          periodRecords: {
            ...(emp.periodRecords || {}),
            ...(recalculated.periodRecords || {}),
          },
        };
      }
      return emp;
    });

    employeesRef.current = nextList;
    setEmployees(nextList);

    // Đồng bộ 2 chiều: nếu người dùng nhập/sửa trực tiếp tiền Tạm ứng trong hồ sơ NV chính thức, tự động tạo/cập nhật phiếu trong salaryAdvances
    if (updated.advancePayment !== undefined) {
      const curM = configRef.current.month || realDateInfo.realMonth;
      const curY = configRef.current.year || realDateInfo.realYear;
      syncDirectWorkerAdvanceIntoList(
        'PERMANENT',
        updated.id,
        updated.code,
        updated.fullName,
        updated.department || 'Công ty Phúc Nguyên',
        'BANK',
        Number(updated.advancePayment || 0),
        curM,
        curY
      );
    }
  };

  // Thêm nhân viên chính thức (cập nhật đồng bộ vào employeesRef.current, chờ nhấn "Lưu Data")
  const handleAddEmployee = (newEmp: Employee) => {
    const nowTs = Date.now();
    markUnsaved();
    pendingDeletedEmpRef.current.removedKeys.push(
      ...[newEmp.id, newEmp.code].filter(Boolean).map((k) => String(k).trim())
    );
    const recalculated = recomputeEmployeePayroll({
      ...newEmp,
      updatedAt: nowTs,
    });
    const nextList = [...employeesRef.current, recalculated];
    employeesRef.current = nextList;
    setEmployees(nextList);
  };

  // Xóa nhân viên chính thức (chờ nhấn "Lưu Data")
  const handleDeleteEmployee = (id: string) => {
    markUnsaved();
    const strId = String(id).trim();
    const currentList = employeesRef.current;
    const target = currentList.find((e) => String(e.id) === strId || String(e.code) === strId);
    const targetId = target ? String(target.id) : strId;
    const targetCode = target?.code ? String(target.code).trim() : '';

    const filtered = currentList.filter((e) => {
      if (target) {
        return String(e.id) !== targetId;
      }
      return String(e.id) !== strId && String(e.code) !== strId;
    });

    const hasRemainingSameCode = targetCode
      ? filtered.some((e) => String(e.code).trim() === targetCode)
      : false;

    pendingDeletedEmpRef.current.items.push({
      id: targetId,
      code: hasRemainingSameCode ? undefined : targetCode || undefined,
    });
    pendingDeletedEmpRef.current.deletedStorageKeys.push(
      ...(hasRemainingSameCode ? [targetId, strId] : [targetId, targetCode, strId]).filter(Boolean)
    );

    employeesRef.current = filtered;
    setEmployees(filtered);
  };

  // =========================================================================
  // HÀM LƯU DATA CHÍNH THỨC DUY NHẤT (CHỈ CHẠY KHI NGƯỜNG DÙNG NHẤN "LƯU DATA")
  // =========================================================================
  const handleManualForceSync = async () => {
    lastLocalEditAtRef.current = Date.now();
    Object.keys(singleWorkerSyncTimersRef.current).forEach((k) => {
      if (singleWorkerSyncTimersRef.current[k]) {
        clearTimeout(singleWorkerSyncTimersRef.current[k]);
        delete singleWorkerSyncTimersRef.current[k];
      }
    });
    beginSyncTask(true);
    try {
      const saveStamp = Date.now();
      const latestCfg = configRef.current;
      const latestEmps = employeesRef.current.map((e) => ({
        ...e,
        updatedAt: e.updatedAt || saveStamp,
      }));
      const latestSeas = seasonalWorkersRef.current;
      const latestProjects = projectsRef.current;
      const latestTeams = teamWorkersRef.current;
      const latestAdvances = salaryAdvancesRef.current;
      const sbCfg = getSupabaseConfig();
      const cfgToSync: CompanyConfig = {
        ...latestCfg,
        ...(sbCfg.url && sbCfg.anonKey
          ? { supabaseUrl: sbCfg.url, supabaseAnonKey: sbCfg.anonKey }
          : {}),
      } as CompanyConfig;

      employeesRef.current = latestEmps;

      // 1. Lưu danh sách các khóa đã xóa/khôi phục vào LocalStorage
      const seaPending = pendingDeletedSeaRef.current;
      if (seaPending.resetDeleted) {
        localStorage.removeItem(DELETED_SEA_STORAGE_KEY);
      }
      if (seaPending.removedKeys.length > 0) {
        removeDeletedKeys(DELETED_SEA_STORAGE_KEY, seaPending.removedKeys);
      }
      if (seaPending.ids.length > 0 || seaPending.codes.length > 0) {
        addDeletedKeys(DELETED_SEA_STORAGE_KEY, [...seaPending.ids, ...seaPending.codes]);
      }

      const empPending = pendingDeletedEmpRef.current;
      if (empPending.resetDeleted) {
        localStorage.removeItem(DELETED_EMP_STORAGE_KEY);
      }
      if (empPending.removedKeys.length > 0) {
        removeDeletedKeys(DELETED_EMP_STORAGE_KEY, empPending.removedKeys);
      }
      if (empPending.deletedStorageKeys.length > 0) {
        addDeletedKeys(DELETED_EMP_STORAGE_KEY, empPending.deletedStorageKeys);
      }

      // 2. Lưu toàn bộ dữ liệu hiện tại vào LocalStorage
      const curM = cfgToSync.month || realDateInfo.realMonth;
      const curY = cfgToSync.year || realDateInfo.realYear;
      const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
      const curMonthKey = `${curY}-${curMStr}`;

      localStorage.setItem('payroll_company_config', JSON.stringify(cfgToSync));
      localStorage.setItem('payroll_employees', JSON.stringify(latestEmps));
      localStorage.setItem(`payroll_month_${curY}_${curMStr}`, JSON.stringify(latestEmps));
      localStorage.setItem('payroll_seasonal_workers', JSON.stringify(latestSeas));
      localStorage.setItem('payroll_projects', JSON.stringify(latestProjects));
      localStorage.setItem('payroll_team_workers', JSON.stringify(latestTeams));
      localStorage.setItem('payroll_salary_advances', JSON.stringify(latestAdvances));

      // Cập nhật cache ngày chấm công di động cho cả Nhân viên chính thức & Thời vụ trong tháng hiện tại
      latestEmps.forEach((e) => {
        if (e.code) {
          const daysObj = e.monthlyAttendance?.[curMonthKey]?.days || {};
          try {
            localStorage.setItem(`pncons_mobile_days_${e.code}_${curY}_${curM}`, JSON.stringify(daysObj));
          } catch {}
        }
      });
      latestSeas.forEach((w) => {
        if (w.code) {
          const daysObj = w.monthlyAttendance?.[curMonthKey]?.days || {};
          try {
            localStorage.setItem(`pncons_mobile_days_${w.code}_${curY}_${curM}`, JSON.stringify(daysObj));
          } catch {}
        }
      });

      // Làm sạch nhân sự đã xóa khỏi các slot tháng cũ nếu có
      if (empPending.items.length > 0) {
        const delIds = new Set(empPending.items.map((x) => String(x.id)));
        const delCodes = new Set(empPending.items.map((x) => x.code).filter(Boolean) as string[]);
        ['payroll_month_2026_09', 'payroll_month_2026_10', 'payroll_month_2026_11', 'payroll_month_2026_12'].forEach(
          (slotKey) => {
            try {
              const raw = localStorage.getItem(slotKey);
              if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                  const nextArr = arr.filter(
                    (x: any) => !delIds.has(String(x?.id)) && (!x?.code || !delCodes.has(String(x.code)))
                  );
                  localStorage.setItem(slotKey, JSON.stringify(nextArr));
                }
              }
            } catch {}
          }
        );
      }

      // Tính toán chính xác những bảng thực sự thay đổi để đẩy DELTA SIÊU TỐC (~0.25s thay vì đẩy lại toàn bộ 8 bảng!)
      const nextCfgSnap = serializeConfigSnapshot(cfgToSync);
      const nextEmpSnap = serializeEmployeesSnapshot(latestEmps);
      const nextSeaSnap = serializeSeasonalSnapshot(latestSeas);
      const nextTeamSnap = JSON.stringify(latestTeams || []);
      const nextProjSnap = JSON.stringify(latestProjects || []);
      const nextAdvSnap = serializeAdvancesSnapshot(latestAdvances);

      const prevCloud = lastCloudPartsRef.current;
      const isFirstCloudPush = !prevCloud.initialized;
      const empChanged = isFirstCloudPush || nextEmpSnap !== prevCloud.emp || empPending.items.length > 0;
      const seaChanged =
        isFirstCloudPush ||
        nextSeaSnap !== prevCloud.sea ||
        seaPending.clearAll ||
        seaPending.ids.length > 0 ||
        seaPending.codes.length > 0;
      const teamChanged = isFirstCloudPush || nextTeamSnap !== prevCloud.team;
      const projChanged = isFirstCloudPush || nextProjSnap !== prevCloud.proj;
      const advChanged = isFirstCloudPush || nextAdvSnap !== prevCloud.adv;

      markSnapshotAsSaved(cfgToSync, latestEmps, latestSeas, latestAdvances);

      // 3 & 4. Chạy SONG SONG lưu Máy chủ Backend + đẩy Delta lên Supabase Cloud (không chờ tuần tự!)
      let cloudSyncErrorMsg: string | null = null;
      const changedTableNames: string[] = [];
      if (nextCfgSnap !== prevCloud.cfg) changedTableNames.push('company_config');
      if (empChanged) changedTableNames.push('employees');
      if (seaChanged) changedTableNames.push('seasonal_workers');
      if (teamChanged) changedTableNames.push('team_workers');
      if (projChanged) changedTableNames.push('projects');
      if (advChanged) changedTableNames.push('salary_advances');

      const serverSavePromise = saveAllToServer(
        cfgToSync,
        latestEmps,
        latestSeas,
        latestProjects,
        latestTeams,
        latestAdvances
      );

      const supabaseDeltaPromise = (async () => {
        if (!isSupabaseConfigured()) return;

        // Xử lý xóa chờ sẵn song song nếu có
        const deleteTasks: Promise<any>[] = [];
        if (seaPending.clearAll && latestSeas.length === 0) {
          deleteTasks.push(clearAllSeasonalWorkersFromSupabase(cfgToSync.periodCode));
        } else if (seaPending.ids.length > 0 || seaPending.codes.length > 0) {
          deleteTasks.push(deleteBatchSeasonalWorkersFromSupabase(seaPending.ids, seaPending.codes));
        }
        empPending.items.forEach((delEmp) => {
          deleteTasks.push(deleteEmployeeFromSupabase(delEmp.id, delEmp.code));
        });
        if (deleteTasks.length > 0) {
          await Promise.all(deleteTasks);
        }

        const okRes = { success: true, count: 0, message: '', error: undefined as string | undefined };
        const [cfgRes, empRes, seaRes, teamRes, projRes, advRes] = await Promise.all([
          // Luôn cập nhật company_config (1 dòng ~600 bytes) song song để đóng dấu updated_at mới nhất cho mọi ứng dụng khác
          syncCompanyConfigToSupabase(cfgToSync),
          empChanged
            ? syncEmployeesToSupabase(latestEmps, cfgToSync.periodCode, {
                fastLocalAuthoritative: prevCloud.initialized,
              })
            : Promise.resolve(okRes),
          seaChanged
            ? syncSeasonalWorkersToSupabase(latestSeas, cfgToSync.periodCode, {
                fastLocalAuthoritative: prevCloud.initialized,
              })
            : Promise.resolve(okRes),
          teamChanged
            ? syncTeamWorkersToSupabase(latestTeams, cfgToSync.periodCode)
            : Promise.resolve(okRes),
          projChanged ? syncProjectsToSupabase(latestProjects) : Promise.resolve(okRes),
          advChanged
            ? syncSalaryAdvancesToSupabase(latestAdvances, cfgToSync.periodCode)
            : Promise.resolve(okRes),
        ]);

        if (
          !cfgRes.success ||
          !empRes.success ||
          !seaRes.success ||
          !teamRes.success ||
          !projRes.success ||
          !advRes.success
        ) {
          cloudSyncErrorMsg =
            advRes.error ||
            empRes.error ||
            seaRes.error ||
            teamRes.error ||
            projRes.error ||
            cfgRes.error ||
            'Kiểm tra kết nối Supabase Cloud';
        } else {
          localStorage.setItem('supabase_last_synced_at', new Date().toISOString());
          markCloudPartsAsSynced(
            cfgToSync,
            latestEmps,
            latestSeas,
            latestTeams,
            latestProjects,
            latestAdvances
          );
          // Phát tín hiệu WebSocket Broadcast TỨC THỜI (~80ms) tới mọi trình duyệt / ứng dụng khác!
          notifyCloudSyncInstant(
            changedTableNames.length > 0 ? changedTableNames : ['company_config'],
            false
          );
          syncSupabaseCredentialsToServer();
          fetchCloudSyncSignature()
            .then((sig) => {
              if (sig) lastKnownCloudSigRef.current = sig;
            })
            .catch(() => {});

          // Đồng bộ bảng báo cáo tổng hợp payroll_records chạy ngầm (không chặn nút Lưu của người dùng!)
          if (empChanged || seaChanged || teamChanged || advChanged) {
            void syncPayrollRecordsToSupabase(
              buildPayrollRecordsForSync(cfgToSync, latestEmps, latestSeas, latestTeams)
            ).catch(() => {});
          }
        }
      })();

      await Promise.all([serverSavePromise, supabaseDeltaPromise]);

      // Reset danh sách xóa chờ và đánh dấu đã lưu sạch sẽ
      pendingDeletedSeaRef.current = {
        ids: [],
        codes: [],
        removedKeys: [],
        clearAll: false,
        resetDeleted: false,
      };
      pendingDeletedEmpRef.current = {
        items: [],
        deletedStorageKeys: [],
        removedKeys: [],
        resetDeleted: false,
      };
      if (!cloudSyncErrorMsg) {
        hasUnsavedChangesRef.current = false;
        setHasUnsavedChanges(false);
      }

      notifyCrossTab();

      if (cloudSyncErrorMsg) {
        endSyncTask('error');
        setSaveToastMessage(`Đã lưu trên máy nhưng lỗi đồng bộ Cloud: ${cloudSyncErrorMsg}`);
        setTimeout(() => setSaveToastMessage(null), 5000);
      } else {
        endSyncTask('synced');
        const nowTime = getLastSyncedTime() || getServerLastSyncedTime() || new Date().toLocaleTimeString('vi-VN');
        setLastSyncedText(nowTime);
        setSaveToastMessage(
          isSupabaseConfigured()
            ? `✓ Đã lưu Data & đồng bộ Supabase Cloud thành công lúc ${nowTime}!`
            : `✓ Đã lưu Data thành công lúc ${nowTime}!`
        );
        setTimeout(() => {
          setSaveToastMessage((prev) => (prev?.includes(nowTime) ? null : prev));
        }, 4000);
      }
    } catch {
      endSyncTask('error');
      setSaveToastMessage('Đã lưu Data vào trình duyệt (Có lỗi kết nối máy chủ từ xa)!');
      setTimeout(() => setSaveToastMessage(null), 4000);
    }
  };

  // Chuyển đổi Tháng/Năm đồng bộ toàn diện cho Bản Chấm Công và Bản Lương (CHỈ ĐỔI KỲ ĐANG XEM, KHÔNG GÂY AUTO-SAVE)
  const handleChangeMonthYear = (newMonth: number, newYear: number) => {
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
    const nextEmployeesForMonth = employeesRef.current.map((emp) => {
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
    });

    const nextSeasonalForMonth = seasonalWorkersRef.current.map((w) =>
      syncSeasonalWorkerForMonth(ensureSeasonalHistoricalMonths(w), newMonth, newYear)
    );

    configRef.current = newConfig;
    employeesRef.current = nextEmployeesForMonth;
    seasonalWorkersRef.current = nextSeasonalForMonth;
    periodCodeRef.current = newConfig.periodCode;
    activeMonthRef.current = newMonth;
    activeYearRef.current = newYear;

    setConfig(newConfig);
    setEmployees(nextEmployeesForMonth);
    setSeasonalWorkers(nextSeasonalForMonth);
  };

  // Cập nhật hàng loạt nhân viên chính thức trong bộ nhớ (chỉ lưu khi nhấn "Lưu Data")
  const handleBatchUpdate = (updatedList: Employee[]) => {
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    markUnsaved();
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
    const curMonthKey = `${curY}-${curMStr}`;
    const stdDays = configRef.current.standardWorkDays || 26;
    const normalizedList = updatedList.map((emp) => {
      const existingRec = emp.monthlyAttendance?.[curMonthKey];
      let nextMonthly = { ...(emp.monthlyAttendance || {}) };
      const targetWork = Number(emp.actualWorkDays || 0);
      const targetOt = Number(emp.overtimeHours || 0);

      if (existingRec) {
        const recWork = Number(existingRec.totalWorkDays || 0);
        const recOt = Number(existingRec.totalOtHours || 0);
        if (Math.abs(recWork - targetWork) > 0.01 || Math.abs(recOt - targetOt) > 0.01) {
          nextMonthly[curMonthKey] = buildMonthlyAttendanceRecord(
            curM,
            curY,
            targetWork,
            targetOt,
            Number(emp.paidLeaveDays || 0),
            Number(emp.unpaidLeaveDays || 0),
            true
          );
        } else {
          nextMonthly[curMonthKey] = {
            ...existingRec,
            lastSubmittedAt: existingRec.lastSubmittedAt || nowIso,
            submittedBy: existingRec.submittedBy || 'MANUAL_USER',
          };
        }
      } else if (targetWork > 0 || targetOt > 0 || emp.selectedForAttendance) {
        nextMonthly[curMonthKey] = buildMonthlyAttendanceRecord(
          curM,
          curY,
          targetWork,
          targetOt,
          Number(emp.paidLeaveDays || 0),
          Number(emp.unpaidLeaveDays || 0),
          true
        );
      }

      return syncEmployeeForMonth(
        {
          ...emp,
          monthlyAttendance: nextMonthly,
          selectedForAttendance: targetWork > 0 || targetOt > 0 ? true : emp.selectedForAttendance,
          updatedAt: nowTs,
        },
        curM,
        curY,
        stdDays
      );
    });
    employeesRef.current = normalizedList;
    setEmployees(normalizedList);
  };

  const handleResetDefault = () => {
    markUnsaved();
    pendingDeletedEmpRef.current = {
      items: [],
      deletedStorageKeys: [],
      removedKeys: [],
      resetDeleted: true,
    };
    const clean = initialEmployees.map((emp) =>
      syncEmployeeForMonth(
        ensureEmployeeHistoricalMonths(emp),
        realDateInfo.realMonth,
        realDateInfo.realYear,
        26
      )
    );
    employeesRef.current = clean;
    configRef.current = initialCompanyConfig;
    setEmployees(clean);
    setConfig(initialCompanyConfig);
  };

  const handleAuditSelectEmployee = (_code: string) => {
    setActiveTab('PERMANENT_EMPLOYEES');
    setPermanentSubTab('PAYROLL');
    setEmployeeSubTab('PERMANENT');
  };

  // Handlers for Projects (chỉ cập nhật trên giao diện, chờ nhấn "Lưu Data")
  const handleAddProject = (p: Project) => {
    markUnsaved();
    const updated = [p, ...projectsRef.current];
    projectsRef.current = updated;
    setProjects(updated);
  };
  const handleUpdateProject = (p: Project) => {
    markUnsaved();
    const updated = projectsRef.current.map((item) => (item.id === p.id ? p : item));
    projectsRef.current = updated;
    setProjects(updated);
  };
  const handleDeleteProject = (id: string) => {
    markUnsaved();
    const updated = projectsRef.current.filter((item) => item.id !== id);
    projectsRef.current = updated;
    setProjects(updated);
  };

  // Handlers for Team Workers (chỉ cập nhật trên giao diện, chờ nhấn "Lưu Data")
  const handleAddTeamWorker = (tw: TeamWorker) => {
    markUnsaved();
    const updated = [...teamWorkersRef.current, tw];
    teamWorkersRef.current = updated;
    setTeamWorkers(updated);
  };
  const handleUpdateTeamWorker = (tw: TeamWorker) => {
    markUnsaved();
    const updated = teamWorkersRef.current.map((item) => (item.id === tw.id ? tw : item));
    teamWorkersRef.current = updated;
    setTeamWorkers(updated);
  };
  const handleDeleteTeamWorker = (id: string) => {
    markUnsaved();
    const updated = teamWorkersRef.current.filter((item) => item.id !== id);
    teamWorkersRef.current = updated;
    setTeamWorkers(updated);
  };
  const handleBatchUpdateTeamWorkers = (list: TeamWorker[]) => {
    markUnsaved();
    teamWorkersRef.current = list;
    setTeamWorkers(list);
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

  function generateNextUniqueAdvanceCode(existingList: SalaryAdvance[], yearNum: number): string {
    const used = new Set(existingList.map((a) => String(a.advanceCode || '').trim()));
    let maxSeq = existingList.reduce((maxN, a) => {
      const m = String(a.advanceCode || '').match(/(\d+)\s*$/);
      if (!m) return maxN;
      const num = parseInt(m[1], 10);
      return !isNaN(num) && num < 100000 ? Math.max(maxN, num) : maxN;
    }, 0);
    let seq = Math.max(existingList.length + 1, maxSeq + 1);
    let candidate = `TU-${yearNum}-${seq < 100 ? String(seq).padStart(3, '0') : seq}`;
    while (used.has(candidate)) {
      seq += 1;
      candidate = `TU-${yearNum}-${seq < 100 ? String(seq).padStart(3, '0') : seq}`;
    }
    return candidate;
  }

  // Khôi phục tự động các khoản tạm ứng thực tế đã ghi trong periodRecords của công nhân / nhân viên nếu bảng salary_advances bị thiếu
  function reconcileWorkerAdvancesIntoList(
    baseAdvances: SalaryAdvance[],
    empList: Employee[],
    seaList: SeasonalWorker[]
  ): SalaryAdvance[] {
    const deletedAdvKeys = getDeletedKeys(DELETED_ADV_STORAGE_KEY);
    const nextList = [...baseAdvances];

    seaList.forEach((w) => {
      if (!w || isUnmodifiedMockSeasonalWorker(w)) return;
      const pRecs = w.periodRecords || {};
      Object.entries(pRecs).forEach(([pKey, rec]) => {
        if (!rec || !pKey.endsWith('_MONTH')) return;
        const amt = Number(rec.advancePayment || 0);
        if (amt <= 0) return;
        const mMatch = pKey.match(/^(\d{4})-(\d{2})_MONTH$/);
        if (!mMatch) return;
        const yr = Number(mMatch[1]);
        const mo = Number(mMatch[2]);
        if (yr === 2026 && mo === 9 && INITIAL_SEASONAL_CODES.has(w.code)) return;

        const periodKeyStr = `${String(mo).padStart(2, '0')}/${yr}`;
        const delSig = `SEASONAL:${w.code || w.id}:${periodKeyStr}`;
        if (deletedAdvKeys.has(delSig)) return;

        const alreadyHas = nextList.some(
          (a) =>
            (a.targetType === 'SEASONAL' || a.targetType === 'TEAM') &&
            (a.workerId === w.id || a.workerCode === w.code) &&
            doesAdvanceMatchMonthYear(a, mo, yr)
        );
        if (!alreadyHas) {
          nextList.push({
            id: `adv-sea-${yr}${String(mo).padStart(2, '0')}-${w.code || w.id}`,
            advanceCode: generateNextUniqueAdvanceCode(nextList, yr),
            targetType: 'SEASONAL',
            workerId: w.id,
            workerCode: w.code,
            workerName: w.fullName,
            departmentOrProject: w.project || w.trade || 'Công trình',
            amount: amt,
            requestDate: `10/${String(mo).padStart(2, '0')}/${yr}`,
            paymentDate: `10/${String(mo).padStart(2, '0')}/${yr}`,
            reason: w.payrollCycleType === 'TEAM' ? 'Tạm ứng lương Tổ đội' : 'Tạm ứng lương công trường',
            paymentMethod: w.paymentMethod || 'BANK',
            status: 'APPROVED',
            approvedBy: 'Admin (Giám đốc)',
            periodKey: periodKeyStr,
          });
        }
      });
    });

    empList.forEach((e) => {
      if (!e) return;
      const pRecs = e.periodRecords || {};
      Object.entries(pRecs).forEach(([pKey, rec]: [string, any]) => {
        const amt = Number(rec?.advancePayment || 0);
        if (amt <= 0) return;
        const mMatch = pKey.match(/^(\d{4})-(\d{2})/);
        if (!mMatch) return;
        const yr = Number(mMatch[1]);
        const mo = Number(mMatch[2]);
        const periodKeyStr = `${String(mo).padStart(2, '0')}/${yr}`;
        const delSig = `PERMANENT:${e.code || e.id}:${periodKeyStr}`;
        if (deletedAdvKeys.has(delSig)) return;

        const alreadyHas = nextList.some(
          (a) =>
            a.targetType === 'PERMANENT' &&
            (a.workerId === e.id || a.workerCode === e.code) &&
            doesAdvanceMatchMonthYear(a, mo, yr)
        );
        if (!alreadyHas) {
          nextList.push({
            id: `adv-emp-${yr}${String(mo).padStart(2, '0')}-${e.code || e.id}`,
            advanceCode: generateNextUniqueAdvanceCode(nextList, yr),
            targetType: 'PERMANENT',
            workerId: e.id,
            workerCode: e.code,
            workerName: e.fullName,
            departmentOrProject: e.department || 'Công ty Phúc Nguyên',
            amount: amt,
            requestDate: `10/${String(mo).padStart(2, '0')}/${yr}`,
            paymentDate: `10/${String(mo).padStart(2, '0')}/${yr}`,
            reason: 'Tạm ứng tiền lương giữa kỳ',
            paymentMethod: 'BANK',
            status: 'APPROVED',
            approvedBy: 'Admin (Giám đốc)',
            periodKey: periodKeyStr,
          });
        }
      });
    });

    return nextList;
  }

  // Đồng bộ khi người dùng sửa trực tiếp ô Tạm ứng trong modal nhân sự hoặc bảng lương Tổ đội
  function syncDirectWorkerAdvanceIntoList(
    targetType: 'PERMANENT' | 'SEASONAL',
    workerId: string,
    workerCode: string,
    workerName: string,
    deptOrProj: string,
    paymentMethod: 'BANK' | 'CASH',
    newAmount: number,
    mo: number,
    yr: number
  ) {
    const curList = salaryAdvancesRef.current;
    const matching = curList.filter(
      (a) =>
        (targetType === 'PERMANENT'
          ? a.targetType === 'PERMANENT'
          : a.targetType === 'SEASONAL' || a.targetType === 'TEAM') &&
        (a.workerId === workerId || a.workerCode === workerCode) &&
        doesAdvanceMatchMonthYear(a, mo, yr)
    );
    const currentSum = matching.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const cleanTarget = Math.max(0, Math.round(Number(newAmount || 0)));
    if (cleanTarget === currentSum) return;

    const mStr = String(mo).padStart(2, '0');
    const periodKeyStr = `${mStr}/${yr}`;
    const dayStr = String(Math.min(new Date().getDate(), 28)).padStart(2, '0');
    let nextAdvances: SalaryAdvance[];

    if (cleanTarget === 0) {
      const matchIds = new Set(matching.map((x) => x.id));
      nextAdvances = curList.filter((a) => !matchIds.has(a.id));
      addDeletedKeys(DELETED_ADV_STORAGE_KEY, [`${targetType}:${workerCode || workerId}:${periodKeyStr}`]);
    } else if (matching.length === 1) {
      const targetId = matching[0].id;
      nextAdvances = curList.map((a) => (a.id === targetId ? { ...a, amount: cleanTarget } : a));
      removeDeletedKeys(DELETED_ADV_STORAGE_KEY, [`${targetType}:${workerCode || workerId}:${periodKeyStr}`]);
    } else if (matching.length > 1) {
      const firstId = matching[0].id;
      const otherIds = new Set(matching.slice(1).map((x) => x.id));
      nextAdvances = curList
        .filter((a) => !otherIds.has(a.id))
        .map((a) => (a.id === firstId ? { ...a, amount: cleanTarget } : a));
      removeDeletedKeys(DELETED_ADV_STORAGE_KEY, [`${targetType}:${workerCode || workerId}:${periodKeyStr}`]);
    } else {
      const created: SalaryAdvance = {
        id: `adv-${targetType === 'PERMANENT' ? 'emp' : 'sea'}-${yr}${mStr}-${workerCode || workerId}`,
        advanceCode: generateNextUniqueAdvanceCode(curList, yr),
        targetType,
        workerId,
        workerCode,
        workerName,
        departmentOrProject: deptOrProj,
        amount: cleanTarget,
        requestDate: `${dayStr}/${mStr}/${yr}`,
        paymentDate: `${dayStr}/${mStr}/${yr}`,
        reason: targetType === 'PERMANENT' ? 'Tạm ứng tiền lương giữa kỳ' : 'Tạm ứng tiền công trường',
        paymentMethod,
        status: 'APPROVED',
        approvedBy: 'Admin (Giám đốc)',
        periodKey: periodKeyStr,
      };
      nextAdvances = [created, ...curList];
      removeDeletedKeys(DELETED_ADV_STORAGE_KEY, [`${targetType}:${workerCode || workerId}:${periodKeyStr}`]);
    }

    salaryAdvancesRef.current = nextAdvances;
    setSalaryAdvances(nextAdvances);
  }

  // Đồng bộ danh sách phiếu tạm ứng vào Nhân viên chính thức & Nhân viên thời vụ trong bộ nhớ (chờ nhấn "Lưu Data")
  const syncAdvancesIntoWorkers = (nextAdvances: SalaryAdvance[]) => {
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const mStr = String(curM).padStart(2, '0');
    const monthPeriodKey = `${curY}-${mStr}_MONTH`;

    const nextEmployees = employeesRef.current.map((e) => {
      const empAdvances = nextAdvances.filter(
        (a) =>
          a.targetType === 'PERMANENT' &&
          (a.workerId === e.id || a.workerCode === e.code) &&
          doesAdvanceMatchMonthYear(a, curM, curY)
      );
      const sumAdv = empAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return recomputeEmployeePayroll({ ...e, advancePayment: sumAdv });
    });

    const nextSeasonal = seasonalWorkersRef.current.map((w) => {
      const workerAdvances = nextAdvances.filter(
        (a) =>
          (a.targetType === 'SEASONAL' || a.targetType === 'TEAM') &&
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

    employeesRef.current = nextEmployees;
    seasonalWorkersRef.current = nextSeasonal;
    setEmployees(nextEmployees);
    setSeasonalWorkers(nextSeasonal);
  };

  // Handlers for Salary Advances (chỉ cập nhật trên giao diện, chờ nhấn "Lưu Data")
  const handleAddSalaryAdvance = (adv: SalaryAdvance) => {
    markUnsaved();
    const grp = adv.targetType === 'PERMANENT' ? 'PERMANENT' : 'SEASONAL';
    removeDeletedKeys(DELETED_ADV_STORAGE_KEY, [
      `${grp}:${adv.workerCode || adv.workerId}:${adv.periodKey}`,
    ]);
    const updated = [adv, ...salaryAdvancesRef.current];
    salaryAdvancesRef.current = updated;
    setSalaryAdvances(updated);
    syncAdvancesIntoWorkers(updated);
  };
  const handleUpdateSalaryAdvance = (adv: SalaryAdvance) => {
    markUnsaved();
    const grp = adv.targetType === 'PERMANENT' ? 'PERMANENT' : 'SEASONAL';
    removeDeletedKeys(DELETED_ADV_STORAGE_KEY, [
      `${grp}:${adv.workerCode || adv.workerId}:${adv.periodKey}`,
    ]);
    const updated = salaryAdvancesRef.current.map((item) => (item.id === adv.id ? adv : item));
    salaryAdvancesRef.current = updated;
    setSalaryAdvances(updated);
    syncAdvancesIntoWorkers(updated);
  };
  const handleDeleteSalaryAdvance = (id: string) => {
    markUnsaved();
    const target = salaryAdvancesRef.current.find((item) => item.id === id);
    if (target) {
      const grp = target.targetType === 'PERMANENT' ? 'PERMANENT' : 'SEASONAL';
      addDeletedKeys(DELETED_ADV_STORAGE_KEY, [
        `${grp}:${target.workerCode || target.workerId}:${target.periodKey}`,
      ]);
    }
    const updated = salaryAdvancesRef.current.filter((item) => item.id !== id);
    salaryAdvancesRef.current = updated;
    setSalaryAdvances(updated);
    syncAdvancesIntoWorkers(updated);
  };

  // Cập nhật hàng loạt công nhân thời vụ trong bộ nhớ (chỉ lưu khi nhấn "Lưu Data")
  const handleBatchUpdateSeasonalWorkers = (list: SeasonalWorker[]) => {
    const nowTs = Date.now();
    markUnsaved();
    const curM = configRef.current.month || realDateInfo.realMonth;
    const curY = configRef.current.year || realDateInfo.realYear;
    const syncedList = list.map((w) =>
      syncSeasonalWorkerForMonth({ ...w, updatedAt: nowTs }, curM, curY)
    );
    seasonalWorkersRef.current = syncedList;
    setSeasonalWorkers(syncedList);
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
          (a.targetType === 'SEASONAL' || a.targetType === 'TEAM') &&
          (a.workerId === synced.id || a.workerCode === synced.code) &&
          doesAdvanceMatchMonthYear(a, m, y)
      );
      const fallbackAdv =
        isUnmodifiedMockSeasonalWorker(w) && !(y === 2026 && m === 9)
          ? 0
          : Number(synced.advancePayment || 0);
      const sumAdv =
        matchingAdvances.length > 0
          ? matchingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0)
          : fallbackAdv;
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
        onSaveWorkerAttendance={async (updatedWorker, targetYear, targetMonth) => {
          beginSyncTask(false);
          try {
            autoApplyUrlConfig();
            if (!isSupabaseConfigured()) {
              const srv = await fetchServerData(false);
              const cfgAny = srv?.config as any;
              if (cfgAny?.supabaseUrl && cfgAny?.supabaseAnonKey) {
                setSupabaseConfig(cfgAny.supabaseUrl, cfgAny.supabaseAnonKey);
              }
            }

            const nowTs = Date.now();
            const mStr = String(targetMonth).padStart(2, '0');
            const targetMonthKey = `${targetYear}-${mStr}`;
            const targetPeriodCode = `${mStr}/${targetYear}`;
            const curActiveM = activeMonthRef.current || configRef.current.month || realDateInfo.realMonth;
            const curActiveY = activeYearRef.current || configRef.current.year || realDateInfo.realYear;
            const curActiveMStr = String(curActiveM).padStart(2, '0');
            const stdDays = configRef.current.standardWorkDays || 26;

            const matchedPerm = employeesRef.current.find(
              (e) =>
                e.code === updatedWorker.code ||
                String(e.id) === String(updatedWorker.id) ||
                `PERM_${e.id}` === String(updatedWorker.id)
            );

            let cloudSaved = false;

            if (matchedPerm) {
              const incomingRec = updatedWorker.monthlyAttendance?.[targetMonthKey];
              const mergedMonthly = {
                ...(matchedPerm.monthlyAttendance || {}),
                ...(incomingRec ? { [targetMonthKey]: incomingRec } : {}),
              };
              const empForTargetMonth = syncEmployeeForMonth(
                {
                  ...matchedPerm,
                  monthlyAttendance: mergedMonthly,
                  updatedAt: nowTs,
                },
                targetMonth,
                targetYear,
                stdDays
              );
              const empForActiveView = syncEmployeeForMonth(
                {
                  ...matchedPerm,
                  monthlyAttendance: mergedMonthly,
                  updatedAt: nowTs,
                },
                curActiveM,
                curActiveY,
                stdDays
              );

              const nextEmployees = employeesRef.current.map((item) =>
                item.id === matchedPerm.id || item.code === matchedPerm.code
                  ? empForActiveView
                  : item
              );
              employeesRef.current = nextEmployees;
              setEmployees(nextEmployees);
              try {
                localStorage.setItem('payroll_employees', JSON.stringify(nextEmployees));
                localStorage.setItem(
                  `payroll_month_${curActiveY}_${curActiveMStr}`,
                  JSON.stringify(nextEmployees)
                );
              } catch {}

              const [, sbRes] = await Promise.all([
                saveAttendanceToServer({
                  ...updatedWorker,
                  id: matchedPerm.id,
                  code: matchedPerm.code,
                  actualWorkDays: empForTargetMonth.actualWorkDays,
                  overtimeHours: empForTargetMonth.overtimeHours,
                  monthlyAttendance: mergedMonthly,
                }),
                isSupabaseConfigured()
                  ? syncSingleEmployeeToSupabase(empForTargetMonth, targetPeriodCode)
                  : Promise.resolve({ success: false, message: '' }),
              ]);
              cloudSaved = Boolean(sbRes.success);
            } else {
              const matchedSea = seasonalWorkersRef.current.find(
                (w) =>
                  w.code === updatedWorker.code || String(w.id) === String(updatedWorker.id)
              );
              const incomingDays = updatedWorker.monthlyAttendance?.[targetMonthKey]?.days || {};
              const authoritativeWorker = matchedSea
                ? updateWorkerMonthlyAttendance(
                    matchedSea,
                    targetYear,
                    targetMonth,
                    incomingDays,
                    isAdminPreview ? 'MANUAL_USER' : 'WORKER'
                  )
                : updatedWorker;

              const workerWithStamp: SeasonalWorker = {
                ...authoritativeWorker,
                updatedAt: nowTs,
              };
              const workerForActiveView = syncSeasonalWorkerForMonth(
                workerWithStamp,
                curActiveM,
                curActiveY
              );

              if (matchedSea) {
                const nextSeasonal = seasonalWorkersRef.current.map((item) =>
                  item.id === matchedSea.id || item.code === matchedSea.code
                    ? workerForActiveView
                    : item
                );
                seasonalWorkersRef.current = nextSeasonal;
                setSeasonalWorkers(nextSeasonal);
                try {
                  localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeasonal));
                } catch {}
              } else if (!(updatedWorker as any).__isUrlFallback) {
                const nextSeasonal = [...seasonalWorkersRef.current, workerForActiveView];
                seasonalWorkersRef.current = nextSeasonal;
                setSeasonalWorkers(nextSeasonal);
                try {
                  localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeasonal));
                } catch {}
              }

              const [, sbRes] = await Promise.all([
                saveAttendanceToServer(workerWithStamp),
                isSupabaseConfigured()
                  ? syncSingleSeasonalWorkerToSupabase(workerWithStamp, targetPeriodCode)
                  : Promise.resolve({ success: false, message: '' }),
              ]);
              cloudSaved = Boolean(sbRes.success);
            }

            markSnapshotAsSaved(
              configRef.current,
              employeesRef.current,
              seasonalWorkersRef.current,
              salaryAdvancesRef.current
            );
            lastCloudPartsRef.current = {
              ...lastCloudPartsRef.current,
              emp: serializeEmployeesSnapshot(employeesRef.current),
              sea: serializeSeasonalSnapshot(seasonalWorkersRef.current),
            };
            hasUnsavedChangesRef.current = false;
            setHasUnsavedChanges(false);
            const savedAt = new Date().toLocaleTimeString('vi-VN');
            setLastSyncedText(getLastSyncedTime() || savedAt);
            notifyCrossTab();
            endSyncTask(cloudSaved || !isSupabaseConfigured() ? 'synced' : 'error');
            return { cloudSaved, savedAt };
          } catch (err) {
            endSyncTask('error');
            throw err;
          }
        }}
        onUpdateWorker={(updatedWorker) => {
          if ((updatedWorker as any).__isUrlFallback) return;
          const matchedPerm = employeesRef.current.find(
            (e) =>
              e.code === updatedWorker.code ||
              String(e.id) === String(updatedWorker.id) ||
              `PERM_${e.id}` === String(updatedWorker.id)
          );
          if (matchedPerm) {
            const curM = configRef.current.month || realDateInfo.realMonth;
            const curY = configRef.current.year || realDateInfo.realYear;
            const stdDays = configRef.current.standardWorkDays || 26;
            const mergedMonthly = {
              ...(matchedPerm.monthlyAttendance || {}),
              ...(updatedWorker.monthlyAttendance || {}),
            };
            const syncedPerm = syncEmployeeForMonth(
              {
                ...matchedPerm,
                monthlyAttendance: mergedMonthly,
              },
              curM,
              curY,
              stdDays
            );
            handleUpdateEmployee(syncedPerm);
          } else {
            const matchedSea = seasonalWorkersRef.current.find(
              (w) => w.code === updatedWorker.code || String(w.id) === String(updatedWorker.id)
            );
            if (matchedSea) {
              handleUpdateSeasonalWorker({
                ...matchedSea,
                ...updatedWorker,
                id: matchedSea.id,
                code: matchedSea.code,
                dailyRate:
                  Number(updatedWorker.dailyRate || 0) > 0
                    ? updatedWorker.dailyRate
                    : matchedSea.dailyRate,
                bankAccount: updatedWorker.bankAccount || matchedSea.bankAccount,
                bankName: updatedWorker.bankName || matchedSea.bankName,
                mealAllowance: matchedSea.mealAllowance,
                travelSafetyAllowance: matchedSea.travelSafetyAllowance,
                otherBonus: matchedSea.otherBonus,
                advancePayment: matchedSea.advancePayment,
                periodRecords: {
                  ...(matchedSea.periodRecords || {}),
                  ...(updatedWorker.periodRecords || {}),
                },
                monthlyAttendance: {
                  ...(matchedSea.monthlyAttendance || {}),
                  ...(updatedWorker.monthlyAttendance || {}),
                },
              });
            } else {
              handleUpdateSeasonalWorker(updatedWorker);
            }
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
      {/* Thông báo xác nhận khi nhấn nút Lưu Data */}
      {saveToastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/50 text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveToastMessage}</span>
          <button
            type="button"
            onClick={() => setSaveToastMessage(null)}
            className="ml-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thanh nhắc nhở nổi khi có dữ liệu mới nhập chưa nhấn Lưu Data */}
      {hasUnsavedChanges && (
        <div className="bg-amber-100 border-b border-amber-300 px-3 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs text-amber-950 no-print">
          <div className="flex items-center gap-2 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping shrink-0" />
            <span>
              Bạn vừa nhập hoặc chỉnh sửa dữ liệu. Vui lòng nhấn nút <strong>"Lưu Data"</strong> để lưu chính thức!
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualForceSync}
            disabled={cloudSyncStatus === 'syncing'}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer transition shrink-0 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{cloudSyncStatus === 'syncing' ? 'Đang lưu Data...' : 'Lưu Data ngay'}</span>
          </button>
        </div>
      )}

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
        onReloadCloud={async () => {
          if (hasUnsavedChangesRef.current) return;
          beginSyncTask(true);
          try {
            await reloadLatestFromCloud();
            endSyncTask('synced');
            const nowTime = new Date().toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            setSaveToastMessage(`✓ Đã đồng bộ dữ liệu mới nhất từ Supabase Cloud (${nowTime})!`);
            setTimeout(() => setSaveToastMessage(null), 3500);
          } catch {
            endSyncTask('error');
            setSaveToastMessage('⚠️ Không thể tải dữ liệu từ Supabase Cloud, vui lòng kiểm tra kết nối!');
            setTimeout(() => setSaveToastMessage(null), 4000);
          }
        }}
        onManualSync={handleManualForceSync}
        onSaveData={handleManualForceSync}
        hasUnsavedChanges={hasUnsavedChanges}
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
          onSaveData={handleManualForceSync}
          hasUnsavedChanges={hasUnsavedChanges}
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
                      onSaveData={handleManualForceSync}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isSavingData={cloudSyncStatus === 'syncing'}
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
                      onSaveData={handleManualForceSync}
                      hasUnsavedChanges={hasUnsavedChanges}
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
                      onReloadFromCloud={() => reloadLatestFromCloud()}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      cloudSyncStatus={cloudSyncStatus}
                      hasUnsavedChanges={hasUnsavedChanges}
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
                      onSaveData={handleManualForceSync}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isSavingData={cloudSyncStatus === 'syncing'}
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
                            {salaryAdvances.filter((a) => a.targetType === 'SEASONAL' || a.targetType === 'TEAM').length}
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
                      onSaveData={handleManualForceSync}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isSavingData={cloudSyncStatus === 'syncing'}
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
                      onSaveData={handleManualForceSync}
                      hasUnsavedChanges={hasUnsavedChanges}
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
                      onReloadFromCloud={() => reloadLatestFromCloud()}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      cloudSyncStatus={cloudSyncStatus}
                      hasUnsavedChanges={hasUnsavedChanges}
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
                      onSaveData={handleManualForceSync}
                      onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isSavingData={cloudSyncStatus === 'syncing'}
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
                  onSaveData={handleManualForceSync}
                  hasUnsavedChanges={hasUnsavedChanges}
                  isSavingData={cloudSyncStatus === 'syncing'}
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

              {/* Tab: Tổng Hợp Theo Bộ Phận */}
              {activeTab === 'DEPARTMENT' && (
                <DepartmentSummaryTab employees={syncedEmployees} />
              )}

              {/* Tab 5: Kiểm Tra Dữ Liệu */}
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
                  onSavePayrollToCloud={handleManualForceSync}
                  onReloadFromCloud={() => reloadLatestFromCloud()}
                  onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                  cloudSyncStatus={cloudSyncStatus}
                  hasUnsavedChanges={hasUnsavedChanges}
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
                  onSavePayrollToCloud={handleManualForceSync}
                  onReloadFromCloud={() => reloadLatestFromCloud()}
                  onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                  cloudSyncStatus={cloudSyncStatus}
                  hasUnsavedChanges={hasUnsavedChanges}
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
                  onManualSync={handleManualForceSync}
                  onSaveData={handleManualForceSync}
                  hasUnsavedChanges={hasUnsavedChanges}
                  cloudSyncStatus={cloudSyncStatus}
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
                  onSaveData={handleManualForceSync}
                  onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
                  hasUnsavedChanges={hasUnsavedChanges}
                  isSavingData={cloudSyncStatus === 'syncing'}
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
          markUnsaved();
          employeesRef.current = newEmployees;
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
          markUnsaved();
          configRef.current = newCfg;
          setConfig(newCfg);
          if (newCfg.standardWorkDays && newCfg.standardWorkDays !== config.standardWorkDays) {
            setEmployees((prev) => {
              const next = prev.map((emp) =>
                recomputeEmployeePayroll({
                  ...emp,
                  standardWorkDays: newCfg.standardWorkDays,
                })
              );
              employeesRef.current = next;
              return next;
            });
          }
        }}
      />

      <ZaloOASettingsModal
        isOpen={isZaloSettingsOpen}
        onClose={() => setIsZaloSettingsOpen(false)}
        config={config}
        onSave={(newZaloConfig) => {
          markUnsaved();
          setConfig((prev) => {
            const next = {
              ...prev,
              zaloOA: newZaloConfig,
            };
            configRef.current = next;
            return next;
          });
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
          const curM = activeMonthRef.current;
          const curY = activeYearRef.current;
          const curMStr = curM < 10 ? `0${curM}` : `${curM}`;

          if (newEmps && newEmps.length > 0) {
            removeDeletedKeys(
              DELETED_EMP_STORAGE_KEY,
              newEmps.flatMap((e) => [e.id, e.code])
            );
          }
          if (newSeas && newSeas.length > 0) {
            removeDeletedKeys(
              DELETED_SEA_STORAGE_KEY,
              newSeas.flatMap((w) => [w.id, w.code])
            );
          }

          const appliedCfg = newCfg
            ? mergeRemoteConfigPreservingPeriod(configRef.current, newCfg)
            : configRef.current;
          const stdDays = appliedCfg.standardWorkDays || 26;

          const appliedEmps =
            newEmps && newEmps.length > 0
              ? formatAuthoritativeEmployeesFromRemote(newEmps, curM, curY, stdDays)
              : employeesRef.current;

          const appliedSeas =
            newSeas && newSeas.length > 0
              ? formatAuthoritativeSeasonalFromRemote(newSeas, curM, curY)
              : seasonalWorkersRef.current;

          const appliedTeams = newTeams !== undefined ? newTeams : teamWorkersRef.current;
          const appliedProjs =
            newProjs && newProjs.length > 0 ? newProjs : projectsRef.current;
          const rawAdvs = newAdvs !== undefined ? newAdvs : salaryAdvancesRef.current;
          const appliedAdvs = reconcileWorkerAdvancesIntoList(rawAdvs, appliedEmps, appliedSeas);

          markSnapshotAsSaved(appliedCfg, appliedEmps, appliedSeas, appliedAdvs);
          syncSupabaseCredentialsToServer();

          configRef.current = appliedCfg;
          setConfig(appliedCfg);
          localStorage.setItem('payroll_company_config', JSON.stringify(appliedCfg));

          if (newEmps && newEmps.length > 0) {
            employeesRef.current = appliedEmps;
            setEmployees(appliedEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(appliedEmps));
            localStorage.setItem(`payroll_month_${curY}_${curMStr}`, JSON.stringify(appliedEmps));
          }
          if (newSeas && newSeas.length > 0) {
            seasonalWorkersRef.current = appliedSeas;
            setSeasonalWorkers(appliedSeas);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(appliedSeas));
          }
          if (newTeams !== undefined) {
            teamWorkersRef.current = appliedTeams;
            setTeamWorkers(appliedTeams);
            localStorage.setItem('payroll_team_workers', JSON.stringify(appliedTeams));
          }
          if (newProjs && newProjs.length > 0) {
            projectsRef.current = appliedProjs;
            setProjects(appliedProjs);
            localStorage.setItem('payroll_projects', JSON.stringify(appliedProjs));
          }
          if (newAdvs !== undefined || appliedAdvs.length !== rawAdvs.length) {
            salaryAdvancesRef.current = appliedAdvs;
            setSalaryAdvances(appliedAdvs);
            localStorage.setItem('payroll_salary_advances', JSON.stringify(appliedAdvs));
          }

          saveAllToServer(
            appliedCfg,
            appliedEmps,
            appliedSeas,
            appliedProjs,
            appliedTeams,
            appliedAdvs
          ).catch(() => {});

          fetchCloudSyncSignature()
            .then((sig) => {
              if (sig) lastKnownCloudSigRef.current = sig;
            })
            .catch(() => {});

          pendingDeletedSeaRef.current = {
            ids: [],
            codes: [],
            removedKeys: [],
            clearAll: false,
            resetDeleted: false,
          };
          pendingDeletedEmpRef.current = {
            items: [],
            deletedStorageKeys: [],
            removedKeys: [],
            resetDeleted: false,
          };
          hasUnsavedChangesRef.current = false;
          setHasUnsavedChanges(false);
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        }}
        onSyncSuccess={() => {
          lastWriteCompletedAtRef.current = Date.now();
          markSnapshotAsSaved(
            configRef.current,
            employeesRef.current,
            seasonalWorkersRef.current,
            salaryAdvancesRef.current
          );
          syncSupabaseCredentialsToServer();
          fetchCloudSyncSignature()
            .then((sig) => {
              if (sig) lastKnownCloudSigRef.current = sig;
            })
            .catch(() => {});
          hasUnsavedChangesRef.current = false;
          setHasUnsavedChanges(false);
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        }}
      />
    </div>
  );
}
