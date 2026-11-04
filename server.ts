import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initialCompanyConfig, initialEmployees } from './src/data/mockPayrollData';
import { initialSeasonalWorkers } from './src/data/mockSeasonalWorkers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parser
app.use(express.json({ limit: '20mb' }));

// CORS headers for all origins to ensure multi-device & link sync works
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Storage file location
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'payroll_storage.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredData {
  lastUpdated: number;
  config: any;
  employees: any[];
  seasonalWorkers: any[];
}

function sanitizeSeasonalList(list: any[]): any[] {
  if (!Array.isArray(list)) return initialSeasonalWorkers;
  const seen = new Set<string>();
  const cleaned: any[] = [];
  for (const w of list) {
    if (!w) continue;
    const codeStr = String(w.code || '');
    // Filter out permanent employees that may have been mapped for share modal
    if (codeStr.startsWith('PNC00') || w.trade === 'Nhân viên chính thức') {
      continue;
    }
    const key = codeStr || String(w.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(w);
  }
  return cleaned;
}

function readStorage(): StoredData {
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      if (content.trim()) {
        const parsed = JSON.parse(content);
        const cleanedSeasonal = Array.isArray(parsed.seasonalWorkers)
          ? sanitizeSeasonalList(parsed.seasonalWorkers)
          : initialSeasonalWorkers;
        return {
          lastUpdated: Number(parsed.lastUpdated) || 0,
          config: parsed.config || initialCompanyConfig,
          employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : initialEmployees,
          seasonalWorkers: cleanedSeasonal.length > 0 ? cleanedSeasonal : initialSeasonalWorkers,
        };
      }
    }
  } catch (err) {
    console.error('Error reading payroll_storage.json:', err);
  }
  const defaultData: StoredData = {
    lastUpdated: Date.now(),
    config: initialCompanyConfig,
    employees: initialEmployees,
    seasonalWorkers: initialSeasonalWorkers,
  };
  writeStorage(defaultData);
  return defaultData;
}

function writeStorage(data: StoredData): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing payroll_storage.json:', err);
  }
}

// ================= API ROUTES =================

// Server info & base URL
app.get('/api/server-info', (req, res) => {
  res.json({
    appUrl: process.env.APP_URL || '',
    port: PORT,
    timestamp: Date.now(),
  });
});

// Full state sync (GET)
app.get('/api/sync', (req, res) => {
  const data = readStorage();
  res.json(data);
});

// Full state sync (POST)
app.post('/api/sync', (req, res) => {
  const { config, employees, seasonalWorkers } = req.body;
  const current = readStorage();

  const updated: StoredData = {
    lastUpdated: Date.now(),
    config: config !== undefined ? config : current.config,
    employees: Array.isArray(employees) && employees.length > 0 ? employees : current.employees,
    seasonalWorkers: seasonalWorkers !== undefined ? sanitizeSeasonalList(seasonalWorkers) : current.seasonalWorkers,
  };

  writeStorage(updated);
  res.json({ success: true, lastUpdated: updated.lastUpdated });
});

// Worker info lookup by code (supports both Seasonal Workers and Permanent Employees)
app.get('/api/worker/:code', (req, res) => {
  const code = req.params.code;
  const current = readStorage();
  let worker = (current.seasonalWorkers || []).find(
    (w: any) => w.code === code || String(w.id) === code
  );
  if (!worker) {
    const emp = (current.employees || []).find(
      (e: any) => e.code === code || String(e.id) === code
    );
    if (emp) {
      worker = {
        ...emp,
        trade: emp.title || 'Nhân viên chính thức',
        skillLevel: emp.department || 'Chính thức',
        project: emp.department || 'Văn phòng / Dự án',
        dailyRate: emp.salaryType === 'DAILY' ? emp.baseSalary : Math.round((emp.baseSalary || 0) / (emp.standardWorkDays || 26)),
        status: emp.status || 'ACTIVE',
      };
    }
  }
  res.json({ worker: worker || null, lastUpdated: current.lastUpdated });
});

// Specific endpoint for Attendance updates from Mobile App (updates both Seasonal Workers and Permanent Employees)
app.post('/api/attendance/mark', (req, res) => {
  const { worker, workerCode, year, month, days } = req.body;
  const current = readStorage();
  let workers = [...(current.seasonalWorkers || [])];
  let employees = [...(current.employees || [])];

  const mergeMonthlyAttendance = (existingMonthly: Record<string, any> = {}, incomingMonthly: Record<string, any> = {}) => {
    const mergedMonthly: Record<string, any> = { ...existingMonthly };
    Object.entries(incomingMonthly).forEach(([mKey, incRec]: [string, any]) => {
      if (!mergedMonthly[mKey]) {
        mergedMonthly[mKey] = incRec;
      } else {
        const exDays = mergedMonthly[mKey].days || {};
        const incDays = incRec.days || {};
        const mergedDays = { ...exDays, ...incDays };
        let tWork = 0;
        let tOt = 0;
        Object.values(mergedDays).forEach((d: any) => {
          tWork += Number(d.workUnits || 0);
          tOt += Number(d.otHours || 0);
        });
        mergedMonthly[mKey] = {
          ...mergedMonthly[mKey],
          ...incRec,
          days: mergedDays,
          totalWorkDays: Math.round(tWork * 10) / 10,
          totalOtHours: tOt,
        };
      }
    });
    return mergedMonthly;
  };

  if (worker && (worker.code || worker.id)) {
    const empIdx = employees.findIndex(
      (e: any) => (worker.code && e.code === worker.code) || (worker.id && String(e.id) === String(worker.id))
    );
    const seaIdx = workers.findIndex(
      (w: any) => (worker.code && w.code === worker.code) || (worker.id && String(w.id) === String(worker.id))
    );

    if (empIdx >= 0) {
      const mergedMonthly = mergeMonthlyAttendance(employees[empIdx].monthlyAttendance, worker.monthlyAttendance);
      employees[empIdx] = {
        ...employees[empIdx],
        actualWorkDays: worker.actualWorkDays !== undefined ? worker.actualWorkDays : employees[empIdx].actualWorkDays,
        overtimeHours: worker.overtimeHours !== undefined ? worker.overtimeHours : employees[empIdx].overtimeHours,
        periodRecords: {
          ...(employees[empIdx].periodRecords || {}),
          ...(worker.periodRecords || {}),
        },
        monthlyAttendance: mergedMonthly,
      };
    }

    if (seaIdx >= 0) {
      const mergedMonthly = mergeMonthlyAttendance(workers[seaIdx].monthlyAttendance, worker.monthlyAttendance);
      workers[seaIdx] = {
        ...workers[seaIdx],
        ...worker,
        periodRecords: {
          ...(workers[seaIdx].periodRecords || {}),
          ...(worker.periodRecords || {}),
        },
        monthlyAttendance: mergedMonthly,
      };
    } else if (empIdx < 0) {
      workers.push(worker);
    }
  } else if (workerCode && days) {
    const mStr = String(month).padStart(2, '0');
    const monthKey = `${year}-${mStr}`;
    let totalWorkDays = 0;
    let totalOtHours = 0;
    Object.values(days).forEach((d: any) => {
      totalWorkDays += Number(d.workUnits || 0);
      totalOtHours += Number(d.otHours || 0);
    });
    const roundedDays = Math.round(totalWorkDays * 10) / 10;

    const seaIdx = workers.findIndex((w: any) => w.code === workerCode || String(w.id) === workerCode);
    if (seaIdx >= 0) {
      const targetWorker = { ...workers[seaIdx] };
      targetWorker.monthlyAttendance = {
        ...(targetWorker.monthlyAttendance || {}),
        [monthKey]: {
          monthKey,
          month,
          year,
          totalWorkDays: roundedDays,
          totalOtHours,
          days,
          lastSubmittedAt: new Date().toISOString(),
          submittedBy: 'WORKER',
        },
      };
      targetWorker.actualWorkDays = roundedDays;
      targetWorker.overtimeHours = totalOtHours;
      workers[seaIdx] = targetWorker;
    }

    const empIdx = employees.findIndex((e: any) => e.code === workerCode || String(e.id) === workerCode);
    if (empIdx >= 0) {
      const targetEmp = { ...employees[empIdx] };
      targetEmp.monthlyAttendance = {
        ...(targetEmp.monthlyAttendance || {}),
        [monthKey]: {
          monthKey,
          month,
          year,
          totalWorkDays: roundedDays,
          totalOtHours,
          days,
          lastSubmittedAt: new Date().toISOString(),
          submittedBy: 'WORKER',
        },
      };
      targetEmp.actualWorkDays = roundedDays;
      targetEmp.overtimeHours = totalOtHours;
      employees[empIdx] = targetEmp;
    }
  }

  current.seasonalWorkers = workers;
  current.employees = employees;
  current.lastUpdated = Date.now();
  writeStorage(current);

  const matchedWorker =
    workers.find(
      (w: any) => (worker && (w.code === worker.code || String(w.id) === String(worker.id))) || w.code === workerCode
    ) ||
    employees.find(
      (e: any) => (worker && (e.code === worker.code || String(e.id) === String(worker.id))) || e.code === workerCode
    );

  res.json({
    success: true,
    lastUpdated: current.lastUpdated,
    worker: matchedWorker || null,
  });
});

// Single seasonal worker update
app.post('/api/seasonal-workers/update', (req, res) => {
  const { worker } = req.body;
  if (!worker) {
    return res.status(400).json({ error: 'Worker is required' });
  }

  const current = readStorage();
  let workers = [...(current.seasonalWorkers || [])];
  const idx = workers.findIndex(
    (w: any) => (worker.code && w.code === worker.code) || (worker.id && String(w.id) === String(worker.id))
  );

  if (idx >= 0) {
    workers[idx] = {
      ...workers[idx],
      ...worker,
      periodRecords: {
        ...(workers[idx].periodRecords || {}),
        ...(worker.periodRecords || {}),
      },
      monthlyAttendance: {
        ...(workers[idx].monthlyAttendance || {}),
        ...(worker.monthlyAttendance || {}),
      },
    };
  } else {
    workers.push(worker);
  }

  current.seasonalWorkers = workers;
  current.lastUpdated = Date.now();
  writeStorage(current);

  res.json({ success: true, lastUpdated: current.lastUpdated });
});

// Start server with Vite or Static
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('Dist folder does not exist, falling back to Vite middleware');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PNCONS Server] Running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
