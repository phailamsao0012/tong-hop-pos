'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  Database,
  LayoutDashboard,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { demoData } from '@/lib/demo-data';
import type { SessionUser } from '@/lib/auth';
import { UsersPanel } from './users-panel';
import { OverviewView } from './overview-view';
import { SchedulerPanel } from './scheduler-panel';
import { BatchesView, CustomersView, RepurchaseView } from './cskh-view';
import { AlertPanel } from './alert-panel';
import {
  batchRows,
  customerProfiles,
  dormantGroup,
  employeeComparison,
  employeeOptions,
  employeeName,
  posName,
  productRows,
  reportScope,
  upsellSummary,
} from '@/lib/report-metrics';
import {
  POS,
  PRODUCTS,
  customerKey,
  type Dataset,
  type Filters,
  type Order,
} from '@/lib/report-model';

type View =
  | 'overview'
  | 'dormant'
  | 'shift'
  | 'custom'
  | 'compare'
  | 'batches'
  | 'customers'
  | 'repurchase'
  | 'monthly'
  | 'raw-orders'
  | 'config';
type Preset = {
  id: string;
  title: string;
  config: {
    filters: Filters;
    metrics: string[];
    display: 'table' | 'chart';
    sort: string;
  };
  updatedAt: string;
};
type Alert = {
  enabled: boolean;
  threshold: number;
  minReceived: number;
  cooldownMinutes: number;
  shiftStart: string;
  shiftEnd: string;
  repeat: boolean;
  chatId: string;
  employeeIds: string[];
};
type Shop = {
  id: string;
  name: string;
  shopId: string;
  status: string;
  lastSyncAt: string | null;
  historyStart: string | null;
  lastError: string | null;
  invalidSavedId?: boolean;
};
type Connection = {
  status: 'missing_key' | 'verified' | 'api_error' | 'network_error';
  message: string;
  shops: { id: string; name: string }[];
};
type Inspection = {
  posId: string;
  totalOrders: number | null;
  earliestCreatedAt: string | null;
  sampledOrders: number;
  pageSizeProbe?: { requested: number; returned: number; reported: number | null; success: boolean };
  detailOrdersChecked?: number;
  detailConfirmationValueInHistory?: number;
  historyItemEvents?: number;
  historyItemShape?: string;
  historyItemFields?: string[];
  historyCoverage?: {
    itemSnapshotBeforeConfirmation: number;
    discountBeforeConfirmation: number;
    itemEventAfterConfirmation: number;
  };
  customersReadable?: boolean;
  totalCustomers?: number | null;
  sampledCustomers?: number;
  customerCoverage?: { phone: number; assignedUser: number; assignmentTime: number };
  customerFields?: string[];
  coverage: {
    phone: number;
    seller: number;
    sellerAssignmentTime: number;
    careAssignmentTime: number;
    statusHistory: number;
    firstConfirmationEvent: number;
    firstConfirmationValueInHistory: number;
  };
  orderFields?: string[];
  otherHistoryFields?: string[];
};
type RawSyncRow = {
  posId: string;
  records: number;
  earliestCreatedAt?: string | null;
  latestCreatedAt?: string | null;
  fetchedAt: string | null;
  withConfirmation: number;
  withSeller: number;
  withAssignmentTime: number;
  backfillCursor?: { month: string; page: number; pageSize?: number; completed?: boolean } | null;
};
type RawOrder = {
  orderId: string;
  phone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  statusCode: number | null;
  sellerId: string | null;
  sellerAssignedAt: string | null;
  currentTotal: number | null;
  firstConfirmedAt: string | null;
};
type RawOrdersPage = {
  page: number;
  hasMore: boolean;
  orders: RawOrder[];
};
type LiveReport = {
  source: 'pancake_order_assignment_proxy';
  period: { start: string; end: string };
  updatedAt: string | null;
  summary: {
    received: number;
    closed: number;
    rate: number | null;
    hotOrders: number;
    currentConfirmedValue: number;
    activityOrders: number;
    activityCurrentValue: number;
  };
  employees: Array<{
    id: string;
    name: string;
    received: number;
    closed: number;
    rate: number | null;
    hotOrders: number;
    currentConfirmedValue: number;
    activityOrders: number;
    activityCurrentValue: number;
  }>;
  hours: Array<{ hour: string; orders: number }>;
  monthly: {
    deliveredOrders: number;
    deliveredRevenue: number;
    averageDeliveredValue: number | null;
    returnedOrders: number;
    returnedValue: number;
    cancelledOrders: number;
    statusRule: string;
  };
  coverage: {
    sourceOrders: number;
    withAssignment: number;
    withConfirmation: number;
    assignmentSource: string;
    valueSource: string;
  };
};
type AssignmentImportRow = {
  id: string;
  posId: string;
  phone: string;
  employeeId: string;
  assignedAt: string;
  batchId: string;
};
type AssignmentImportPreview = {
  fileName: string;
  rows: AssignmentImportRow[];
  errors: string[];
};
type Detail = {
  title: string;
  phones: string[];
  orders: Order[];
  months?: { month: string; orders: number; revenue: number }[];
  valueKind?: 'hot' | 'net';
};
const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Tổng quan POS', icon: LayoutDashboard },
  { id: 'shift', label: 'Điều hành trong ca', icon: Activity },
  { id: 'custom', label: 'Báo cáo tùy chỉnh', icon: BarChart3 },
  { id: 'compare', label: 'So sánh nhân viên', icon: UsersRound },
  { id: 'batches', label: 'Data được cấp', icon: Database },
  { id: 'customers', label: 'Hồ sơ khách hàng', icon: UsersRound },
  { id: 'repurchase', label: 'Mua lại & Upsell', icon: Activity },
  { id: 'dormant', label: 'Khách lâu chưa mua', icon: UsersRound },
  { id: 'monthly', label: 'Báo cáo cuối tháng', icon: CalendarDays },
  { id: 'raw-orders', label: 'Đơn nguồn Pancake POS', icon: Database },
  { id: 'config', label: 'Cấu hình & kết nối', icon: Settings2 },
];
const vi = new Intl.NumberFormat('vi-VN');
const money = (n: number) => `${vi.format(Math.round(n))} ₫`;
const pct = (n: number | null) =>
  n === null ? 'Chưa có dữ liệu' : `${n.toFixed(1).replace('.', ',')}%`;
const dateText = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(iso))
    : 'Chưa có';
const dateTimeText = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(iso))
    : '—';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());
const startOfMonth = (day: string) => `${day.slice(0, 7)}-01`;
const priorMonth = (day: string) => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const defaultAlert: Alert = {
  enabled: false,
  threshold: 40,
  minReceived: 20,
  cooldownMinutes: 60,
  shiftStart: '08:00',
  shiftEnd: '12:00',
  repeat: false,
  chatId: '',
  employeeIds: [],
};
const emptyData: Dataset = {
  assignments: [], orders: [], customers: [], updatedAt: null,
  mode: 'empty', historyStart: null,
};
const metricOptions = [
  ['received', 'Số đã nhận'],
  ['closed', 'Số đã chốt'],
  ['rate', 'Tỷ lệ chốt nóng'],
  ['hotOrders', 'Số đơn chốt nóng'],
  ['hotValue', 'Giá trị chốt nóng'],
  ['deliveredRevenue', 'Doanh số giao thành công'],
  ['repeatCustomers', 'Khách mua lại'],
  ['managedCustomers', 'Khách đang phụ trách'],
] as const;
const metricValue = (key: string, s: ReturnType<typeof reportScope>) =>
  key === 'rate'
    ? pct(s.rate)
    : key === 'hotValue' || key === 'deliveredRevenue'
      ? money(s[key])
      : vi.format(Number(s[key as keyof typeof s] ?? 0));
const liveMetricNumber = (key: string, employee: LiveReport['employees'][number]) =>
  key === 'received' ? employee.received
    : key === 'closed' ? employee.closed
      : key === 'rate' ? employee.rate ?? -1
        : key === 'hotOrders' ? employee.hotOrders
          : key === 'hotValue' ? employee.currentConfirmedValue
            : null;
const liveMetricValue = (key: string, employee: LiveReport['employees'][number]) => {
  const value = liveMetricNumber(key, employee);
  if (value === null) return 'Chưa tính';
  if (key === 'rate') return pct(employee.rate);
  if (key === 'hotValue') return money(value);
  return vi.format(value);
};

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((values) => values.some(Boolean));
};
const normalizeHeader = (value: string) => value.trim().toLowerCase()
  .replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const assignmentHeader = (value: string) => {
  const key = normalizeHeader(value.replace(/^\uFEFF/, ''));
  const aliases: Record<string, string> = {
    pos: 'pos_id', pos_id: 'pos_id', cua_hang: 'pos_id',
    phone: 'phone', so_dien_thoai: 'phone', sdt: 'phone',
    employee_id: 'employee_id', nhan_vien: 'employee_id', nhan_vien_nhan: 'employee_id',
    assigned_at: 'assigned_at', thoi_diem_cap: 'assigned_at', ngay_gio_cap: 'assigned_at',
    batch_id: 'batch_id', ma_dot: 'batch_id', dot_cap: 'batch_id',
  };
  return aliases[key] ?? key;
};
const assignmentDate = (value: string) => {
  const source = value.trim();
  const viDate = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (viDate) {
    const [, d, m, y, h, min, sec = '00'] = viDate;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${sec}+07:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(source)) {
    const normalized = source.replace(' ', 'T');
    return /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}${normalized.length === 16 ? ':00' : ''}+07:00`;
  }
  return null;
};
const assignmentPosId = (value: string) => {
  const key = normalizeHeader(value);
  return POS.find((pos) => pos.id === value.trim() || normalizeHeader(pos.name) === key)?.id ?? null;
};
const previewAssignmentCsv = (text: string, fileName: string): AssignmentImportPreview => {
  const records = parseCsv(text);
  if (!records.length) return { fileName, rows: [], errors: ['Tệp trống.'] };
  const headers = records[0].map(assignmentHeader);
  const required = ['pos_id', 'phone', 'employee_id', 'assigned_at', 'batch_id'];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { fileName, rows: [], errors: [`Thiếu cột: ${missing.join(', ')}.`] };
  const rows: AssignmentImportRow[] = [], errors: string[] = [];
  records.slice(1).forEach((values, index) => {
    const data = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? '']));
    const posId = assignmentPosId(data.pos_id), assignedAt = assignmentDate(data.assigned_at);
    const phone = data.phone.replace(/[^0-9+]/g, '');
    if (!posId || !phone || !data.employee_id || !assignedAt || !data.batch_id) {
      errors.push(`Dòng ${index + 2}: POS, số điện thoại, nhân viên, thời điểm cấp hoặc mã đợt chưa hợp lệ.`);
      return;
    }
    rows.push({
      id: `${data.batch_id}:${data.employee_id}:${phone}:${assignedAt}`,
      posId, phone, employeeId: data.employee_id, assignedAt, batchId: data.batch_id,
    });
  });
  if (rows.length > 10000) errors.unshift('Tệp vượt 10.000 dòng; hãy chia nhỏ trước khi nhập.');
  return { fileName, rows: rows.slice(0, 10000), errors: errors.slice(0, 100) };
};

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="min-w-36 justify-between bg-white"
          />
        }
      >
        {label}
        {selected.length ? ` (${selected.length})` : ''}
        <SlidersHorizontal size={15} />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
          {label}
        </p>
        <button
          className="mb-2 text-sm font-medium text-primary"
          onClick={() => onChange([])}
        >
          Chọn tất cả
        </button>
        {options.map((o) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 hover:bg-muted"
          >
            <Checkbox
              checked={selected.includes(o.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id),
                )
              }
            />
            <span className="text-sm">{o.name}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
function MetricCard({
  label,
  value,
  note,
  featured = false,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  featured?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={
        'rounded-2xl border p-5 text-left shadow-[0_4px_18px_rgba(25,65,46,.03)] transition hover:-translate-y-0.5 hover:shadow-md ' +
        (featured ? 'border-[#315d44] bg-[#164c38] text-white' : 'bg-white') +
        (onClick ? ' cursor-pointer' : ' cursor-default')
      }
    >
      <span
        className={
          'block text-sm ' + (featured ? 'text-[#c1dcc7]' : 'text-[#718478]')
        }
      >
        {label}
      </span>
      <strong className="mt-3 block text-[29px] leading-none tracking-tight">
        {value}
      </strong>
      <span
        className={
          'mt-3 flex items-center justify-between text-xs ' +
          (featured ? 'text-[#c1dcc7]' : 'text-[#819389]')
        }
      >
        {note}
        {onClick && <ChevronRight size={15} />}
      </span>
    </button>
  );
}
function Surface({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white shadow-[0_4px_18px_rgba(25,65,46,.03)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-[#7d9184]">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
export default function Dashboard({ user }: { user: SessionUser }) {
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<Dataset>(emptyData);
  const [filters, setFilters] = useState<Filters>(() => ({
    start: today(),
    end: today(),
    posIds: [],
    employeeIds: [],
    productIds: [],
  }));
  const [period, setPeriod] = useState('today');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [customerDetail, setCustomerDetail] = useState<
    ReturnType<typeof customerProfiles>[number] | null
  >(null);
  const [search, setSearch] = useState('');
  const [dormant, setDormant] = useState('Tất cả');
  const [metrics, setMetrics] = useState<string[]>([
    'received',
    'closed',
    'rate',
    'hotOrders',
    'hotValue',
  ]);
  const [display, setDisplay] = useState<'table' | 'chart'>('table');
  const [sort, setSort] = useState('closed');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [alert, setAlert] = useState<Alert>(defaultAlert);
  const [shops, setShops] = useState<Shop[]>(
    POS.map((p) => ({
      ...p,
      shopId: '',
      status: 'pending',
      lastSyncAt: null,
      historyStart: null,
      lastError: null,
    })),
  );
  const [message, setMessage] = useState('');
  const [dataWarning, setDataWarning] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [inspections, setInspections] = useState<Record<string, Inspection>>({});
  const [inspectingPos, setInspectingPos] = useState<string | null>(null);
  const [rawSync, setRawSync] = useState<Record<string, RawSyncRow>>({});
  const [rawPosId, setRawPosId] = useState<string>('bio-nano');
  const [rawStart, setRawStart] = useState('');
  const [rawEnd, setRawEnd] = useState('');
  const [rawPage, setRawPage] = useState(1);
  const [rawRefresh, setRawRefresh] = useState(0);
  const [rawOrders, setRawOrders] = useState<RawOrdersPage | null>(null);
  const [rawOrdersLoading, setRawOrdersLoading] = useState(false);
  const [rawOrdersError, setRawOrdersError] = useState('');
  const [liveReport, setLiveReport] = useState<LiveReport | null>(null);
  const [previousLiveReport, setPreviousLiveReport] = useState<LiveReport | null>(null);
  const [liveReportLoading, setLiveReportLoading] = useState(false);
  const [liveReportError, setLiveReportError] = useState('');
  const [liveRefresh, setLiveRefresh] = useState(0);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<string | null>(null);
  const autoSyncActive = useRef(false);
  const backfillActive = useRef(false);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentImportPreview | null>(null);
  const [importingAssignments, setImportingAssignments] = useState(false);
  const [assignmentImportMessage, setAssignmentImportMessage] = useState('');
  const [syncingPos, setSyncingPos] = useState<string | null>(null);
  const [backfillingPos, setBackfillingPos] = useState<string | null>(null);
  const [backfillCount, setBackfillCount] = useState(0);
  const backfillStop = useRef(false);
  const [stoppingBackfill, setStoppingBackfill] = useState(false);

  const refreshRawSync = async () => {
    try {
      const response = await fetch('/api/sync/pos', { cache: 'no-store' });
      if (!response.ok) return;
      const rows = await response.json() as RawSyncRow[];
      setRawSync(Object.fromEntries(rows.map((r) => [r.posId, r])));
    } catch { /* The source warehouse may not yet be available. */ }
  };
  const syncRecentAll = async (manual = false) => {
    if (autoSyncActive.current || backfillActive.current) return;
    autoSyncActive.current = true;
    setAutoSyncing(true);
    let updated = 0, failed = 0;
    try {
      for (const pos of POS) {
        try {
          const response = await fetch('/api/sync/pos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ posId: pos.id, action: 'recent' }),
          });
          if (!response.ok) throw new Error();
          updated++;
        } catch { failed++; }
      }
      await refreshRawSync();
      const completedAt = new Date().toISOString();
      setLastAutoSyncAt(completedAt);
      setLiveRefresh((value) => value + 1);
      setRawRefresh((value) => value + 1);
      if (manual) setMessage(failed
        ? `Đã cập nhật ${updated}/6 POS; ${failed} POS chưa phản hồi và sẽ thử lại sau 5 phút.`
        : 'Đã cập nhật đơn mới nhất của cả 6 POS và tính lại báo cáo.');
    } finally {
      autoSyncActive.current = false;
      setAutoSyncing(false);
    }
  };
  const readAssignmentFile = async (file: File | undefined) => {
    if (!file) return;
    setAssignmentImportMessage('');
    if (file.size > 2_000_000) {
      setAssignmentPreview({ fileName: file.name, rows: [], errors: ['Tệp vượt 2 MB.'] });
      return;
    }
    try { setAssignmentPreview(previewAssignmentCsv(await file.text(), file.name)); }
    catch { setAssignmentPreview({ fileName: file.name, rows: [], errors: ['Không đọc được tệp CSV.'] }); }
  };
  const importAssignments = async () => {
    if (!assignmentPreview?.rows.length || assignmentPreview.errors.length) return;
    setImportingAssignments(true);
    setAssignmentImportMessage('');
    let imported = 0;
    try {
      for (const pos of POS) {
        const rows = assignmentPreview.rows.filter((row) => row.posId === pos.id);
        for (let start = 0; start < rows.length; start += 500) {
          const response = await fetch('/api/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ posId: pos.id, assignments: rows.slice(start, start + 500), orders: [], customers: [] }),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || `Không nhập được dữ liệu ${pos.name}.`);
          imported += Math.min(500, rows.length - start);
        }
      }
      const response = await fetch('/api/data', { cache: 'no-store' });
      const loaded = await response.json() as Dataset & { error?: string };
      if (!response.ok) throw new Error(loaded.error || 'Đã nhập nhưng chưa tải lại được báo cáo.');
      setData(loaded);
      setAssignmentImportMessage(`Đã nhập ${vi.format(imported)} dòng lịch sử cấp số. Dữ liệu được ghi lại theo mã đợt và không nhân đôi khi nhập lại cùng tệp.`);
    } catch (error) {
      setAssignmentImportMessage(error instanceof Error ? error.message : 'Không nhập được lịch sử cấp số.');
    } finally { setImportingAssignments(false); }
  };
  const downloadAssignmentTemplate = () => {
    const csv = '\uFEFFpos_id,phone,employee_id,assigned_at,batch_id\n' +
      'bio-nano,0900000000,ma_nhan_vien,16/09/2026 08:00,DOT-20260916-SANG\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'mau-data-duoc-cap.csv'; link.click();
    URL.revokeObjectURL(url);
  };
  useEffect(() => {
    if (view !== 'raw-orders') return;
    const controller = new AbortController();
    const params = new URLSearchParams({ posId: rawPosId, page: String(rawPage) });
    if (rawStart) params.set('start', rawStart);
    if (rawEnd) params.set('end', rawEnd);
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setRawOrdersLoading(true);
      setRawOrdersError('');
      setRawOrders(null);
    });
    void fetch(`/api/raw/orders?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as RawOrdersPage & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Chưa đọc được đơn nguồn.');
        setRawOrders(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setRawOrdersError(error instanceof Error ? error.message : 'Chưa đọc được đơn nguồn.');
      })
      .finally(() => { if (!controller.signal.aborted) setRawOrdersLoading(false); });
    return () => controller.abort();
  }, [view, rawPosId, rawPage, rawStart, rawEnd, rawRefresh]);
  useEffect(() => {
    if (data.mode !== 'empty') {
      setLiveReport(null);
      setPreviousLiveReport(null);
      setLiveReportError('');
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ start: filters.start, end: filters.end });
    if (filters.posIds.length) params.set('posIds', filters.posIds.join(','));
    if (filters.employeeIds.length)
      params.set('employeeIds', filters.employeeIds.join(','));
    if (view === 'shift') params.set('includeHours', '1');
    if (view === 'monthly') {
      params.set('includeMonthly', '1');
      params.set('onlyMonthly', '1');
    }
    setLiveReportLoading(true);
    setLiveReportError('');
    fetch(`/api/reports/live?${params}`, { cache: 'no-store', signal: controller.signal })
    .then(async (currentResponse) => {
      const current = await currentResponse.json() as LiveReport & { error?: string };
      if (!currentResponse.ok)
        throw new Error(current.error || 'Chưa tính được báo cáo từ đơn nguồn.');
      setLiveReport(current);
    }).catch((error) => {
      if (!controller.signal.aborted)
        setLiveReportError(error instanceof Error ? error.message : 'Chưa tính được báo cáo từ đơn nguồn.');
    }).finally(() => {
      if (!controller.signal.aborted) setLiveReportLoading(false);
    });
    return () => controller.abort();
  }, [data.mode, filters.start, filters.end, filters.posIds, filters.employeeIds, view, liveRefresh]);
  useEffect(() => {
    if (data.mode !== 'empty' || view !== 'compare') {
      setPreviousLiveReport(null);
      return;
    }
    const controller = new AbortController();
    const from = Date.parse(`${filters.start}T00:00:00Z`);
    const to = Date.parse(`${filters.end}T00:00:00Z`);
    const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
    const params = new URLSearchParams({
      start: new Date(from - days * 86400000).toISOString().slice(0, 10),
      end: new Date(from - 86400000).toISOString().slice(0, 10),
    });
    if (filters.posIds.length) params.set('posIds', filters.posIds.join(','));
    if (filters.employeeIds.length) params.set('employeeIds', filters.employeeIds.join(','));
    setPreviousLiveReport(null);
    fetch(`/api/reports/live?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setPreviousLiveReport(await response.json() as LiveReport);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [data.mode, filters.start, filters.end, filters.posIds, filters.employeeIds, view]);
  const syncPilot = async (posId: string) => {
    setSyncingPos(posId);
    try {
      const response = await fetch('/api/sync/pos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posId }),
      });
      const result = await response.json() as { error?: string; records?: number };
      if (!response.ok) throw new Error(result.error || 'Không lấy được đơn POS.');
      await refreshRawSync();
      setMessage(`Đã lưu ${result.records ?? 0} đơn nguồn mới nhất của ${posName(posId)}. Chưa dùng để tính tỷ lệ chốt nóng.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không lấy được đơn POS.');
    } finally { setSyncingPos(null); }
  };
  const backfillPages = async (posId: string, maxPages = 1, restart = false) => {
    if (autoSyncActive.current) return;
    backfillActive.current = true;
    setBackfillingPos(posId);
    setBackfillCount(0);
    backfillStop.current = false;
    setStoppingBackfill(false);
    let saved = 0, pagesRead = 0;
    try {
      let cursor: { month: string; page: number; pageSize?: number; completed?: boolean } | undefined;
      for (let page = 0; page < maxPages; page++) {
        const response = await fetch('/api/sync/pos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posId, action: page === 0 && restart ? 'restart' : 'backfill' }),
        });
        const result = await response.json() as {
          error?: string; records?: number; pagesFetched?: number; cursor?: typeof cursor; completed?: boolean;
        };
        if (!response.ok) throw new Error(result.error || 'Chưa lấy được trang lịch sử.');
        saved += result.records ?? 0;
        pagesRead += result.pagesFetched ?? 1;
        cursor = result.cursor;
        setBackfillCount(pagesRead);
        if ((page + 1) % 10 === 0) await refreshRawSync();
        if (result.completed || cursor?.completed || backfillStop.current) break;
      }
      await refreshRawSync();
      setMessage(cursor?.completed
        ? `Đã đi hết lịch sử có thể đọc của ${posName(posId)}; cần đối chiếu độ đầy đủ trước khi tính báo cáo.`
        : `Đã lưu ${saved} đơn lịch sử của ${posName(posId)}; tiếp tục từ tháng ${cursor?.month ?? 'chưa rõ'}, trang ${cursor?.page ?? 1}.`);
    } catch (error) {
      await refreshRawSync();
      setMessage(`${error instanceof Error ? error.message : 'Chưa lấy được trang lịch sử.'} Đã lưu ${saved} đơn trong lần chạy này; tiến độ được giữ để tiếp tục.`);
    } finally {
      backfillActive.current = false;
      setBackfillingPos(null);
      setBackfillCount(0);
      setStoppingBackfill(false);
      backfillStop.current = false;
    }
  };

  const checkConnection = async () => {
    setCheckingConnection(true);
    try {
      const response = await fetch('/api/connection', { cache: 'no-store' });
      const result = await response.json() as Connection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Không kiểm tra được API.');
      setConnection(result);
    } catch {
      setConnection({
        status: 'network_error',
        message: 'Không kiểm tra được API. Vui lòng tải lại trang.',
        shops: [],
      });
    } finally {
      setCheckingConnection(false);
    }
  };
  const inspectPos = async (posId: string) => {
    setInspectingPos(posId);
    try {
      const response = await fetch(`/api/connection/inspect?posId=${encodeURIComponent(posId)}`, { cache: 'no-store' });
      const result = await response.json() as Inspection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Không khảo sát được POS.');
      setInspections((all) => ({ ...all, [posId]: result }));
      setMessage('Đã đọc mẫu đơn thật từ Pancake POS. Báo cáo chốt nóng chưa được tính.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không khảo sát được POS.');
    } finally {
      setInspectingPos(null);
    }
  };

  useEffect(() => {
    fetch('/api/data')
      .then(async (r) => {
        const result = await r.json() as unknown;
        if (!r.ok) {
          setDataWarning((result as {error?:string}).error ?? 'Chưa tải được dữ liệu POS.');
          return null;
        }
        return result;
      })
      .then((result) => {
        const loaded = result as Dataset | null;
        if (loaded?.mode === 'live') {
          setData(loaded);
          const day = today();
          setFilters((f) => ({ ...f, start: day, end: day }));
          const issues: string[] = [];
          if ((loaded.quality?.connectedPos ?? 0) < 6)
            issues.push(
              `mới kết nối ${loaded.quality?.connectedPos ?? 0}/6 POS`,
            );
          if (loaded.quality?.missingConfirmed)
            issues.push(
              `${loaded.quality.missingConfirmed} đơn thiếu mốc xác nhận`,
            );
          if (loaded.quality?.limitedHistory)
            issues.push('chưa đủ lịch sử 2 năm');
          if (!loaded.assignments.length)
            issues.push('chưa có lịch sử số được cấp');
          if (!loaded.orders.length)
            issues.push('chưa có dữ liệu mốc chốt để tính KPI');
          if (
            loaded.quality?.oldestSyncAt &&
            Date.now() - Date.parse(loaded.quality.oldestSyncAt) > 10 * 60000
          )
            issues.push('dữ liệu đồng bộ đã cũ');
          setDataWarning(
            issues.length
              ? `Số liệu POS chưa chính thức: ${issues.join('; ')}.`
              : '',
          );
        } else if (loaded?.mode === 'empty') {
          setData(emptyData);
          const day = today();
          setFilters((f) => ({ ...f, start: day, end: day }));
          setDataWarning('Chưa đồng bộ lịch sử số được cấp và mốc chốt vào báo cáo. Các chỉ số dưới đây chưa có dữ liệu thật; xem kết quả khảo sát API ở Cấu hình & kết nối.');
        }
      })
      .catch(() => setDataWarning('Chưa tải được dữ liệu POS.'));
    fetch('/api/presets')
      .then((r) => (r.ok ? r.json() : []))
      .then((result) => setPresets(result as Preset[]))
      .catch(() => {});
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        const loaded = result as { alert: Alert; shops: Shop[] } | null;
        if (loaded) {
          setAlert(loaded.alert);
          setShops(loaded.shops);
        }
      })
      .catch(() => {});
    void Promise.resolve().then(() => checkConnection());
    void Promise.resolve().then(() => refreshRawSync());
  }, []);
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') void syncRecentAll();
    };
    const startup = window.setTimeout(run, 1500);
    const interval = window.setInterval(run, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const scope = useMemo(() => reportScope(data, filters), [data, filters]);
  const assignmentsReady = data.mode === 'demo' || data.assignments.length > 0;
  const hotKpisReady =
    data.mode === 'demo' ||
    (data.assignments.length > 0 && data.orders.length > 0);
  const availableEmployees = useMemo(() => employeeOptions(data), [data]);
  const usingRawReport = data.mode === 'empty' && liveReport !== null;
  const rawCoverage = useMemo(() => {
    const selected = filters.posIds.length
      ? filters.posIds
      : POS.map((pos) => pos.id);
    return selected.reduce((total, posId) => ({
      assignments: total.assignments + (rawSync[posId]?.withAssignmentTime ?? 0),
      confirmations: total.confirmations + (rawSync[posId]?.withConfirmation ?? 0),
    }), { assignments: 0, confirmations: 0 });
  }, [filters.posIds, rawSync]);
  const reportEmployees = usingRawReport
    ? (liveReport?.employees ?? []).map((employee) => ({ id: employee.id, name: employee.name }))
    : availableEmployees;
  const shiftSummary = usingRawReport ? liveReport!.summary : {
    received: scope.received,
    closed: scope.closed,
    rate: scope.rate,
    hotOrders: scope.hotOrders,
    currentConfirmedValue: scope.hotValue,
    activityOrders: scope.activityHotOrders,
    activityCurrentValue: scope.activityHotValue,
  };
  const shiftReady = usingRawReport || hotKpisReady;
  const employees = useMemo(
    () => data.mode === 'empty' ? [] : employeeComparison(data, filters),
    [data, filters],
  );
  const previousFilters = useMemo(() => {
    const from = Date.parse(`${filters.start}T00:00:00Z`),
      to = Date.parse(`${filters.end}T00:00:00Z`);
    const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
    return {
      ...filters,
      start: new Date(from - days * 86400000).toISOString().slice(0, 10),
      end: new Date(from - 86400000).toISOString().slice(0, 10),
    };
  }, [filters]);
  const previousEmployees = useMemo(
    () => data.mode === 'empty' ? [] : employeeComparison(data, previousFilters),
    [data, previousFilters],
  );
  const profiles = useMemo(
    () =>
      customerProfiles(
        data,
        filters,
        data.mode === 'demo' ? '2026-09-15' : today(),
      ),
    [data, filters],
  );
  const batches = useMemo(() => batchRows(data, filters), [data, filters]);
  const products = useMemo(() => productRows(data, filters), [data, filters]);
  const upsell = useMemo(() => upsellSummary(data, filters), [data, filters]);
  const title = navigation.find((n) => n.id === view)?.label ?? '';
  const changeFilters = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const setPeriodChoice = (choice: string) => {
    setPeriod(choice);
    const day = data.mode === 'demo' ? '2026-09-15' : today();
    if (choice === 'today') changeFilters({ start: day, end: day });
    if (choice === 'month')
      changeFilters({ start: startOfMonth(day), end: day });
    if (choice === 'lastMonth') {
      const m = priorMonth(day);
      const end = new Date(`${m}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      changeFilters({ start: `${m}-01`, end: end.toISOString().slice(0, 10) });
    }
    if (choice === 'week') {
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      changeFilters({ start: d.toISOString().slice(0, 10), end: day });
    }
  };
  const drill = (
    key: 'received' | 'closed' | 'hotOrders' | 'hotValue' | 'activity',
  ) =>
    setDetail({
      title:
        key === 'received'
          ? 'Số điện thoại đã nhận'
          : key === 'closed'
            ? 'Số điện thoại đã chốt'
            : key === 'activity'
              ? 'Hoạt động chốt trong kỳ'
              : 'Đơn chốt nóng trong tệp',
      phones:
        key === 'received'
          ? scope.cohortPhones
          : key === 'closed'
            ? scope.closedPhones
            : key === 'activity'
              ? scope.activityPhones
              : scope.closedPhones,
      orders: key === 'activity' ? scope.activityOrders : scope.cohortOrders,
    });
  const savePreset = async () => {
    if (!presetName.trim()) {
      setMessage('Nhập tên báo cáo trước khi lưu.');
      return;
    }
    const response = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: presetName,
        config: { filters, metrics, display, sort },
      }),
    });
    if (!response.ok) {
      setMessage('Chưa lưu được báo cáo. Vui lòng thử lại.');
      return;
    }
    const preset = (await response.json()) as Preset;
    setPresets((p) => [preset, ...p]);
    setPresetName('');
    setMessage('Đã lưu cấu hình báo cáo.');
  };
  const saveAlert = async () => {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'alert', alert }),
    });
    setMessage(
      response.ok
        ? 'Đã lưu quy tắc cảnh báo. Chỉ kích hoạt gửi sau khi kết nối dữ liệu và bot.'
        : 'Chưa lưu được quy tắc cảnh báo.',
    );
  };
  const saveShop = async (id: string, shopId: string) => {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'shop', id, shopId }),
    });
    const result = await response.json() as { error?: string };
    if (response.ok) {
      setShops((all) => all.map((s) => s.id === id
        ? { ...s, invalidSavedId: false, shopId }
        : s));
      setMessage(shopId
        ? 'Đã lưu Shop ID. Dữ liệu báo cáo chỉ xuất hiện sau khi chạy đồng bộ.'
        : 'Đã xóa giá trị lưu nhầm trong ô Shop ID.');
    } else setMessage(result.error || 'Chưa lưu được Shop ID.');
  };

  const employeeTable = (
    <Table>
      <TableHeader>
        <TableRow className="bg-[#f7faf6]">
          <TableHead>Nhân viên</TableHead>
          <TableHead>Số nhận</TableHead>
          <TableHead>Số chốt</TableHead>
          <TableHead>Tỷ lệ</TableHead>
          <TableHead>Số đơn</TableHead>
          <TableHead className="text-right">Giá trị chốt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.length === 0 && (
          <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
            Chưa có tệp số được cấp và danh sách nhân viên thật để tính báo cáo.
          </TableCell></TableRow>
        )}
        {employees.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-medium">{e.name}</TableCell>
            <TableCell>{e.scope.received}</TableCell>
            <TableCell>
              {hotKpisReady ? (
                <button
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    setDetail({
                      title: `Số đã chốt · ${e.name}`,
                      phones: e.scope.closedPhones,
                      orders: e.scope.cohortOrders,
                    })
                  }
                >
                  {e.scope.closed}
                </button>
              ) : 'Chưa tính'}
            </TableCell>
            <TableCell>{hotKpisReady ? pct(e.scope.rate) : 'Chưa tính'}</TableCell>
            <TableCell>{hotKpisReady ? e.scope.hotOrders : 'Chưa tính'}</TableCell>
            <TableCell className="text-right font-medium">
              {hotKpisReady ? money(e.scope.hotValue) : 'Chưa tính'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
  const comparisonTable = (
    <Table>
      <TableHeader>
        <TableRow className="bg-[#f7faf6]">
          <TableHead>Nhân viên</TableHead>
          <TableHead>Số chốt kỳ này</TableHead>
          <TableHead>Số chốt kỳ trước</TableHead>
          <TableHead>Tỷ lệ kỳ này</TableHead>
          <TableHead>Tỷ lệ kỳ trước</TableHead>
          <TableHead>Doanh số kỳ này</TableHead>
          <TableHead>Doanh số kỳ trước</TableHead>
          <TableHead className="text-right">Thay đổi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((e) => {
          const prev = previousEmployees.find((p) => p.id === e.id)?.scope;
          const delta = prev?.deliveredRevenue
            ? ((e.scope.deliveredRevenue - prev.deliveredRevenue) /
                prev.deliveredRevenue) *
              100
            : null;
          return (
            <TableRow key={e.id}>
              <TableCell className="font-medium">{e.name}</TableCell>
              <TableCell>{e.scope.closed}</TableCell>
              <TableCell>{prev?.closed ?? 0}</TableCell>
              <TableCell>{pct(e.scope.rate)}</TableCell>
              <TableCell>{pct(prev?.rate ?? null)}</TableCell>
              <TableCell>{money(e.scope.deliveredRevenue)}</TableCell>
              <TableCell>{money(prev?.deliveredRevenue ?? 0)}</TableCell>
              <TableCell className="text-right font-semibold">
                {delta === null
                  ? 'Chưa có dữ liệu'
                  : `${delta >= 0 ? '+' : ''}${pct(delta)}`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
  const hours = Array.from({ length: 12 }, (_, hour) => ({
    hour: `${String(hour + 8).padStart(2, '0')}:00`,
    orders: scope.activityOrders.filter(
      (o) => Number(o.confirmedAt?.slice(11, 13)) === hour + 8,
    ).length,
  }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="border-r-0">
        <SidebarHeader className="px-5 pt-7 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#d9f36d] text-[#14372d]">
              <Boxes size={23} />
            </span>
            <div>
              <strong className="block text-lg leading-tight tracking-tight">
                Tổng POS
              </strong>
              <span className="text-xs text-[#bad5c4]">CSKH & Sale</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[.13em] text-[#a7c6b3]">
            Không gian quản lý
          </p>
          <SidebarMenu>
            {navigation.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={view === n.id}
                  className="h-10 px-3 text-sm"
                  onClick={() => {
                    setView(n.id);
                    if (n.id === 'monthly' && period === 'today')
                      setPeriodChoice('month');
                  }}
                >
                  <n.icon size={18} />
                  <span>{n.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="m-4 rounded-xl border border-[#3c6e58] bg-[#1b4c3b] p-4 text-sm">
          <span className="font-medium">6 POS trong phạm vi</span>
          <span className="mt-1 block text-xs text-[#b3cfbb]">
            {data.mode === 'demo'
              ? 'Chờ kết nối nguồn dữ liệu'
              : usingRawReport
                ? `Cập nhật ${dateText(liveReport!.updatedAt)}`
              : data.mode === 'empty'
                ? 'Chờ đồng bộ dữ liệu báo cáo'
              : `Cập nhật ${dateText(data.updatedAt)}`}
          </span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#f5f7f3]">
        <header className="flex min-h-17 items-center justify-between gap-2 border-b bg-white px-5 md:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span className="hidden text-sm text-[#698075] sm:inline">
              Tổng quan /
            </span>
            <strong className="text-sm">{title}</strong>
          </div>
          <div className="flex items-center gap-2">
          <span className="hidden text-xs text-[#698075] md:inline">{user.displayName}</span>
          <button
            type="button"
            className="rounded-full border px-3 py-1.5 text-xs font-medium text-[#547467] hover:bg-[#f1f8f1]"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
          >
            Đăng xuất
          </button>
          <span
            className={
              'rounded-full border px-3 py-1.5 text-xs font-medium ' +
              (data.mode === 'demo' && view !== 'raw-orders'
                ? 'border-[#d8e8db] bg-[#f1f8f1] text-[#276349]'
                : 'border-[#b6e2bd] bg-[#e5f7e8] text-[#195b35]')
            }
          >
            {view === 'raw-orders'
              ? 'Đơn nguồn thật · chưa tính KPI'
              : usingRawReport
                ? 'Dữ liệu Pancake · tạm tính'
              : data.mode === 'demo'
              ? 'Dữ liệu minh họa'
              : data.mode === 'empty'
                ? 'Chưa có dữ liệu báo cáo'
              : dataWarning
                ? 'Dữ liệu POS · cần đối chiếu'
                : 'Dữ liệu POS'}
          </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 md:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-[#6a8575]">
                {['overview', 'customers', 'repurchase', 'dormant', 'batches'].includes(view) ? 'Số liệu Pancake POS tại thời điểm đồng bộ'
                  : filters.start === filters.end
                  ? dateText(`${filters.start}T00:00:00+07:00`)
                  : `${filters.start} — ${filters.end}`}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            </div>
            {!['overview', 'customers', 'repurchase', 'dormant', 'batches'].includes(view) && <div className="rounded-xl border bg-white px-4 py-2 text-sm text-[#547467]">
              Cập nhật:{' '}
              <strong>
                {view === 'raw-orders'
                  ? dateText(rawSync[rawPosId]?.fetchedAt ?? null)
                  : usingRawReport ? dateText(liveReport!.updatedAt)
                  : data.mode === 'demo' ? 'minh họa' : dateText(data.updatedAt)}
              </strong>
            </div>}
          </div>
          {!['config', 'raw-orders', 'overview', 'customers', 'repurchase', 'dormant', 'batches'].includes(view) && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-[0_4px_18px_rgba(25,65,46,.03)]">
              <span className="px-2 text-sm font-semibold text-[#62796d]">
                Bộ lọc
              </span>
              <Select
                value={period}
                items={{ today: 'Hôm nay', week: '7 ngày qua', month: 'Tháng này', lastMonth: 'Tháng trước', custom: 'Tùy chọn' }}
                onValueChange={(v) => setPeriodChoice(String(v))}
              >
                <SelectTrigger className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="week">7 ngày qua</SelectItem>
                  <SelectItem value="month">Tháng này</SelectItem>
                  <SelectItem value="lastMonth">Tháng trước</SelectItem>
                  <SelectItem value="custom">Tùy chọn</SelectItem>
                </SelectContent>
              </Select>
              {period === 'custom' && (
                <>
                  <Input
                    aria-label="Từ ngày"
                    type="date"
                    value={filters.start}
                    onChange={(e) => changeFilters({ start: e.target.value })}
                    className="w-39"
                  />
                  <Input
                    aria-label="Đến ngày"
                    type="date"
                    value={filters.end}
                    onChange={(e) => changeFilters({ end: e.target.value })}
                    className="w-39"
                  />
                </>
              )}
              <MultiFilter
                label="POS"
                options={[...POS]}
                selected={filters.posIds}
                onChange={(v) => changeFilters({ posIds: v })}
              />
              <MultiFilter
                label="Nhân viên"
                options={reportEmployees}
                selected={filters.employeeIds}
                onChange={(v) => changeFilters({ employeeIds: v })}
              />
              <MultiFilter
                label="Sản phẩm"
                options={usingRawReport || data.mode === 'empty' ? [] : [...PRODUCTS]}
                selected={filters.productIds}
                onChange={(v) => changeFilters({ productIds: v })}
              />
            </div>
          )}
          {message && (
            <output
              className="mb-5 rounded-xl border border-[#cce5cf] bg-[#ecf8ed] px-4 py-3 text-sm text-[#276349]"
            >
              {message}
            </output>
          )}
          {dataWarning && !usingRawReport && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-[#efd9b2] bg-[#fff7e8] px-4 py-3 text-sm text-[#856321]"
            >
              {dataWarning}
              {data.mode === 'empty' && (
                <button className="ml-2 font-semibold underline" onClick={() => {
                  setData(demoData);
                  setPeriod('today');
                  setFilters((f) => ({ ...f, start: '2026-09-15', end: '2026-09-15' }));
                }}>
                  Xem ví dụ minh họa
                </button>
              )}
              {data.mode === 'demo' && (
                <button className="ml-2 font-semibold underline" onClick={() => {
                  setData(emptyData);
                  setPeriod('today');
                  const day = today();
                  setFilters((f) => ({ ...f, start: day, end: day }));
                }}>
                  Quay lại dữ liệu thật
                </button>
              )}
            </div>
          )}

          {view === 'overview' && <OverviewView Surface={Surface} />}
          {view === 'shift' && (
            <>
              {data.mode === 'empty' && (
                <div className="mb-5 rounded-xl border border-[#efd9b2] bg-[#fff7e8] px-4 py-3 text-sm text-[#76591e]">
                  {liveReportLoading
                    ? 'Đang tính báo cáo trực tiếp từ kho đơn Pancake POS…'
                    : liveReportError
                      ? liveReportError
                      : usingRawReport
                        ? <><strong>Báo cáo vận hành tạm tính:</strong> số nhận lấy từ thời điểm giao người bán đang lưu trên đơn; mốc chốt là lần xác nhận đầu tiên. Giá trị hiển thị là tổng hiện tại của đơn đã chốt vì Pancake không trả ảnh chụp giá trị tại mốc xác nhận. “Đơn chốt” trên Tổng quan Pancake đếm đơn bán hàng, còn “Số đã chốt” tại đây đếm số điện thoại trong tập được giao nên hai số không đối chiếu 1:1.</>
                        : 'Chưa có đủ đơn nguồn để tính báo cáo.'}
                </div>
              )}
              {data.mode === 'empty' && (
                <div className="mb-5"><Surface
                  title="Phạm vi dữ liệu Pancake POS"
                  description="Kho đơn thật đang được dùng để tính báo cáo vận hành"
                  action={<div className="flex gap-2">
                    <Button variant="outline" disabled={autoSyncing || Boolean(backfillingPos)}
                      onClick={() => { void syncRecentAll(true); }}>
                      {autoSyncing ? 'Đang cập nhật 6 POS…' : 'Cập nhật ngay'}
                    </Button>
                    <Button variant="outline" onClick={() => setView('raw-orders')}>Xem đơn nguồn</Button>
                    <Button variant="outline" onClick={() => setView('config')}>Xem đồng bộ</Button>
                  </div>}
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#cfe4d3] bg-[#eff8f0] px-4 py-3 text-sm text-[#285d3e]">
                    <strong>Tự cập nhật 5 phút/lần khi trang này đang mở.</strong>
                    <span>{autoSyncing
                      ? 'Đang lấy đơn mới nhất của 6 POS…'
                      : lastAutoSyncAt
                        ? `Lần gần nhất: ${dateTimeText(lastAutoSyncAt)}`
                        : 'Đang chờ lượt cập nhật đầu tiên.'}</span>
                  </div>
                  <p className="mb-4 text-sm text-[#536b5c]">
                    Đã lưu <strong>{vi.format(Object.values(rawSync).reduce((sum, row) => sum + row.records, 0))}</strong> đơn duy nhất từ 6 POS.
                    {usingRawReport && <>
                      {' '}Trong các POS đang lọc, nguồn có <strong>{vi.format(rawCoverage.assignments)}</strong> đơn có thời điểm giao người bán và <strong>{vi.format(rawCoverage.confirmations)}</strong> đơn có mốc xác nhận.
                    </>}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {POS.map((p) => (
                      <div key={p.id} className="rounded-xl border bg-[#f8faf7] px-4 py-3">
                        <span className="block text-sm font-medium">{p.name}</span>
                        <strong className="mt-1 block text-xl">{vi.format(rawSync[p.id]?.records ?? 0)} đơn</strong>
                        <span className="text-xs text-muted-foreground">
                          {rawSync[p.id]?.backfillCursor?.completed
                            ? 'Đã đi hết lịch sử API; cần kiểm tra độ đầy đủ'
                            : rawSync[p.id]?.backfillCursor
                              ? `Lịch sử: ${rawSync[p.id].backfillCursor!.month}, trang ${rawSync[p.id].backfillCursor!.page} (${rawSync[p.id].backfillCursor!.pageSize ?? 50} đơn/trang)`
                              : 'Chưa lấy lịch sử'}
                        </span>
                        {(rawSync[p.id]?.records ?? 0) > 0 && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Đơn từ {dateText(rawSync[p.id].earliestCreatedAt ?? null)}
                            {' '}đến {dateText(rawSync[p.id].latestCreatedAt ?? null)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Surface></div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Số đã nhận"
                  value={!(usingRawReport || assignmentsReady) ? 'Chưa tính' : vi.format(shiftSummary.received)}
                  note="Số điện thoại duy nhất"
                  onClick={!assignmentsReady || usingRawReport ? undefined : () => drill('received')}
                />
                <MetricCard
                  label="Số đã chốt"
                  value={!shiftReady ? 'Chưa tính' : vi.format(shiftSummary.closed)}
                  note="Trong tệp đã nhận"
                  onClick={!hotKpisReady || usingRawReport ? undefined : () => drill('closed')}
                />
                <MetricCard
                  label="Tỷ lệ chốt nóng"
                  value={!shiftReady ? 'Chưa tính' : pct(shiftSummary.rate)}
                  note="Số chốt ÷ số nhận"
                  featured
                  onClick={!hotKpisReady || usingRawReport ? undefined : () => drill('closed')}
                />
                <MetricCard
                  label="Số đơn chốt nóng"
                  value={!shiftReady ? 'Chưa tính' : vi.format(shiftSummary.hotOrders)}
                  note="Đếm đơn riêng"
                  onClick={!hotKpisReady || usingRawReport ? undefined : () => drill('hotOrders')}
                />
                <MetricCard
                  label={usingRawReport ? 'Giá trị hiện tại đơn chốt' : 'Giá trị chốt nóng'}
                  value={!shiftReady ? 'Chưa tính' : money(shiftSummary.currentConfirmedValue)}
                  note={usingRawReport ? 'Chưa có ảnh chụp lúc xác nhận' : 'Tại lúc xác nhận'}
                  onClick={!hotKpisReady || usingRawReport ? undefined : () => drill('hotValue')}
                />
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
                <Surface
                  title="Hiệu quả theo nhân viên"
                  description="Tệp số được nhận trong kỳ"
                >
                  {usingRawReport ? (
                    <Table>
                      <TableHeader><TableRow className="bg-[#f7faf6]">
                        <TableHead>Nhân viên</TableHead><TableHead>Số nhận</TableHead>
                        <TableHead>Số chốt</TableHead><TableHead>Tỷ lệ</TableHead>
                        <TableHead>Số đơn</TableHead><TableHead className="text-right">Giá trị hiện tại</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {liveReport!.employees.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Không có dữ liệu trong phạm vi đang lọc.</TableCell></TableRow>}
                        {liveReport!.employees.map((employee) => <TableRow key={employee.id}>
                          <TableCell className="font-medium">{employee.name}</TableCell>
                          <TableCell>{vi.format(employee.received)}</TableCell>
                          <TableCell>{vi.format(employee.closed)}</TableCell>
                          <TableCell>{pct(employee.rate)}</TableCell>
                          <TableCell>{vi.format(employee.hotOrders)}</TableCell>
                          <TableCell className="text-right font-medium">{money(employee.currentConfirmedValue)}</TableCell>
                        </TableRow>)}
                      </TableBody>
                    </Table>
                  ) : employeeTable}
                </Surface>
                <Surface
                  title="Hoạt động xác nhận đầu tiên trong kỳ"
                  description="Đếm sự kiện xác nhận đầu tiên; không phải chỉ số Đơn chốt/Doanh thu trên Tổng quan Pancake"
                >
                  <button
                    onClick={() => drill('activity')}
                    disabled={!hotKpisReady || usingRawReport}
                    className="mb-4 text-left"
                  >
                    <strong className="block text-3xl">
                      {!shiftReady ? 'Chưa tính' : `${shiftSummary.activityOrders} đơn`}
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      {!shiftReady
                        ? 'Chờ dữ liệu xác nhận'
                        : usingRawReport
                          ? `Tổng total_price hiện tại: ${money(shiftSummary.activityCurrentValue)} · không phải doanh thu`
                          : `${money(shiftSummary.activityCurrentValue)} · xem đơn`}
                    </span>
                  </button>
                  {shiftReady && <ChartContainer
                    className="h-45 w-full aspect-auto"
                    config={{ orders: { label: 'Số đơn', color: '#4ba87b' } }}
                  >
                    <BarChart data={usingRawReport ? liveReport!.hours : hours}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tickLine={false}
                        axisLine={false}
                        interval={2}
                      />
                      <ChartTooltip />
                      <Bar
                        dataKey="orders"
                        fill="var(--color-orders)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>}
                </Surface>
              </div>
              <p className="mt-4 text-sm text-[#7a8a7f]">
                Tệp số mới nhận và toàn bộ hoạt động chốt được tách riêng. Một
                số nhiều đơn vẫn chỉ là một số đã chốt.
              </p>
            </>
          )}

          {view === 'custom' && (
            <div className="grid gap-5 xl:grid-cols-[310px_1fr]">
              <Surface
                title="Tùy chỉnh chi tiết"
                description="Chọn chỉ số và cách xem"
              >
                <div className="space-y-3">
                  {metricOptions.map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 text-sm"
                    >
                      <Checkbox
                        checked={metrics.includes(key)}
                        onCheckedChange={(checked) =>
                          setMetrics(
                            checked
                              ? [...metrics, key]
                              : metrics.filter((m) => m !== key),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-5 grid gap-3">
                  <Select
                    value={display}
                    onValueChange={(v) =>
                      setDisplay(String(v) as 'table' | 'chart')
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="table">Bảng</SelectItem>
                      <SelectItem value="chart">Biểu đồ</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={sort}
                    onValueChange={(v) => setSort(String(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {metricOptions.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          Sắp xếp: {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Tên báo cáo để lưu"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <Button onClick={savePreset}>
                    <Save size={16} />
                    Lưu cấu hình
                  </Button>
                </div>
                <div className="mt-5 border-t pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Báo cáo đã lưu</h3>
                  {presets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Chưa có báo cáo đã lưu.
                    </p>
                  ) : (
                    presets.map((p) => (
                      <button
                        key={p.id}
                        className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setFilters(p.config.filters);
                          setMetrics(p.config.metrics);
                          setDisplay(p.config.display);
                          setSort(p.config.sort);
                          setPeriod('custom');
                        }}
                      >
                        {p.title}
                      </button>
                    ))
                  )}
                </div>
              </Surface>
              <Surface
                title="Kết quả theo nhân viên"
                description={`${filters.start} — ${filters.end}`}
                action={
                  <span className="text-sm text-muted-foreground">
                    {usingRawReport ? liveReport!.employees.length : employees.length} nhân viên
                  </span>
                }
              >
                {display === 'table' ? (
                  usingRawReport ? (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Nhân viên</TableHead>
                        {metricOptions.filter(([key]) => metrics.includes(key)).map(([key, label]) =>
                          <TableHead key={key} className="text-right">{key === 'hotValue' ? 'Giá trị hiện tại đơn chốt' : label}</TableHead>)}
                      </TableRow></TableHeader>
                      <TableBody>
                        {[...liveReport!.employees]
                          .sort((a, b) => (liveMetricNumber(sort, b) ?? -1) - (liveMetricNumber(sort, a) ?? -1))
                          .map((employee) => <TableRow key={employee.id}>
                            <TableCell className="font-medium">{employee.name}</TableCell>
                            {metricOptions.filter(([key]) => metrics.includes(key)).map(([key]) =>
                              <TableCell key={key} className="text-right">{liveMetricValue(key, employee)}</TableCell>)}
                          </TableRow>)}
                      </TableBody>
                    </Table>
                  ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nhân viên</TableHead>
                        {metricOptions
                          .filter(([key]) => metrics.includes(key))
                          .map(([key, label]) => (
                            <TableHead key={key} className="text-right">
                              {label}
                            </TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...employees]
                        .sort(
                          (a, b) =>
                            Number(b.scope[sort as keyof typeof b.scope] ?? 0) -
                            Number(a.scope[sort as keyof typeof a.scope] ?? 0),
                        )
                        .map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.name}
                            </TableCell>
                            {metricOptions
                              .filter(([key]) => metrics.includes(key))
                              .map(([key]) => (
                                <TableCell key={key} className="text-right">
                                  {metricValue(key, e.scope)}
                                </TableCell>
                              ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  )
                ) : (
                  usingRawReport ? (
                    <ChartContainer className="h-90 w-full aspect-auto"
                      config={{ value: { label: 'Giá trị', color: '#32875c' } }}>
                      <BarChart data={liveReport!.employees.map((employee) => ({
                        name: employee.name.split(' ').at(-1),
                        value: liveMetricNumber(sort, employee) ?? 0,
                      }))}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                        <ChartTooltip />
                        <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                  <ChartContainer
                    className="h-90 w-full aspect-auto"
                    config={{ value: { label: 'Giá trị', color: '#32875c' } }}
                  >
                    <BarChart
                      data={employees.map((e) => ({
                        name: e.name.split(' ').at(-1),
                        value: Number(
                          e.scope[sort as keyof typeof e.scope] ?? 0,
                        ),
                      }))}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <ChartTooltip />
                      <Bar
                        dataKey="value"
                        fill="var(--color-value)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                  )
                )}
                {usingRawReport && <p className="mt-4 text-sm text-muted-foreground">
                  Doanh số giao thành công, mua lại và khách đang phụ trách cần trạng thái giao hàng được đối chiếu trước nên hiện “Chưa tính”.
                </p>}
              </Surface>
            </div>
          )}

          {view === 'compare' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {usingRawReport ? liveReport!.employees.map((employee) => (
                  <div key={employee.id} className="rounded-2xl border bg-white p-5">
                    <span className="text-sm text-muted-foreground">{employee.name}</span>
                    <strong className="mt-3 block text-3xl">{pct(employee.rate)}</strong>
                    <span className="text-sm">{employee.closed} / {employee.received} số</span>
                  </div>
                )) : employees.map((e) => (
                  <div key={e.id} className="rounded-2xl border bg-white p-5">
                    <span className="text-sm text-muted-foreground">
                      {e.name}
                    </span>
                    <strong className="mt-3 block text-3xl">
                      {pct(e.scope.rate)}
                    </strong>
                    <span className="text-sm">
                      {e.scope.closed} / {e.scope.received} số
                    </span>
                  </div>
                ))}
              </div>
              <Surface
                title="So sánh nhân viên"
                description={`Kỳ này ${filters.start}–${filters.end}; kỳ trước ${previousFilters.start}–${previousFilters.end}`}
              >
                {usingRawReport ? (
                  <Table>
                    <TableHeader><TableRow className="bg-[#f7faf6]">
                      <TableHead>Nhân viên</TableHead><TableHead>Số nhận kỳ này</TableHead>
                      <TableHead>Số chốt kỳ này</TableHead><TableHead>Tỷ lệ kỳ này</TableHead>
                      <TableHead>Tỷ lệ kỳ trước</TableHead><TableHead>Đơn kỳ này</TableHead>
                      <TableHead className="text-right">Giá trị hiện tại</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{liveReport!.employees.map((employee) => {
                      const previous = previousLiveReport?.employees.find((row) => row.id === employee.id);
                      return <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell>{vi.format(employee.received)}</TableCell>
                        <TableCell>{vi.format(employee.closed)}</TableCell>
                        <TableCell>{pct(employee.rate)}</TableCell>
                        <TableCell>{previous ? pct(previous.rate) : 'Chưa có dữ liệu'}</TableCell>
                        <TableCell>{vi.format(employee.hotOrders)}</TableCell>
                        <TableCell className="text-right">{money(employee.currentConfirmedValue)}</TableCell>
                      </TableRow>;
                    })}</TableBody>
                  </Table>
                ) : comparisonTable}
                <p className="mt-4 text-sm text-muted-foreground">
                  {usingRawReport
                    ? 'Người chốt lấy từ sự kiện xác nhận đầu tiên; giá trị là tổng hiện tại của đơn.'
                    : 'Doanh số ghi cho người chốt tại thời điểm xác nhận, kể cả khi khách được chuyển người phụ trách sau đó.'}
                </p>
              </Surface>
            </>
          )}

          {view === 'batches' && <BatchesView Surface={Surface} />}
          {view === 'raw-orders' && (
            <Surface
              title="Đơn nguồn Pancake POS"
              description="Đơn thật đã lưu để kiểm tra kết nối và độ đầy đủ của lịch sử"
              action={<Button variant="outline" onClick={() => {
                void refreshRawSync();
                setRawRefresh((value) => value + 1);
              }}>Tải lại</Button>}
            >
              <p className="mb-5 text-sm text-[#536b5c]">
                {posName(rawPosId)}: đã lưu <strong>{vi.format(rawSync[rawPosId]?.records ?? 0)}</strong> đơn duy nhất.
                {' '}Tổng tiền và trạng thái là giá trị hiện tại của đơn; mốc xác nhận lấy từ lịch sử trạng thái.
                {' '}Các hàng này chưa xác định “Số đã nhận”, “Tỷ lệ chốt nóng” hoặc “Giá trị chốt nóng”.
              </p>
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="flex min-w-48 flex-col gap-1 text-xs font-semibold text-[#536b5c]">
                  <span>POS</span>
                  <Select value={rawPosId} onValueChange={(value) => {
                    setRawPosId(String(value)); setRawPage(1);
                  }}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{POS.map((pos) =>
                      <SelectItem key={pos.id} value={pos.id}>{pos.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label htmlFor="raw-order-start" className="flex flex-col gap-1 text-xs font-semibold text-[#536b5c]">
                  Tạo từ ngày
                  <Input id="raw-order-start" type="date" value={rawStart} onChange={(event) => {
                    setRawStart(event.target.value); setRawPage(1);
                  }} className="bg-white" />
                </label>
                <label htmlFor="raw-order-end" className="flex flex-col gap-1 text-xs font-semibold text-[#536b5c]">
                  Đến ngày
                  <Input id="raw-order-end" type="date" value={rawEnd} onChange={(event) => {
                    setRawEnd(event.target.value); setRawPage(1);
                  }} className="bg-white" />
                </label>
                {(rawStart || rawEnd) && <Button variant="outline" onClick={() => {
                  setRawStart(''); setRawEnd(''); setRawPage(1);
                }}>Xóa ngày</Button>}
              </div>
              {rawOrdersError && <p role="alert" className="mb-4 text-sm text-red-700">{rawOrdersError}</p>}
              {rawOrdersLoading && <p className="mb-4 text-sm text-muted-foreground">Đang đọc đơn nguồn…</p>}
              {!rawOrdersLoading && rawOrders && rawOrders.orders.length === 0 &&
                <p className="mb-4 text-sm text-muted-foreground">Không có đơn nguồn trong trang và khoảng ngày này.</p>}
              {rawOrders && rawOrders.orders.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Mã đơn</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Số điện thoại</TableHead>
                      <TableHead>Trạng thái hiện tại</TableHead>
                      <TableHead>Người bán (ID)</TableHead>
                      <TableHead>Phân công bán</TableHead>
                      <TableHead>Xác nhận đầu tiên</TableHead>
                      <TableHead className="text-right">Tổng hiện tại</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{rawOrders.orders.map((order) =>
                      <TableRow key={order.orderId}>
                        <TableCell className="font-medium">{order.orderId}</TableCell>
                        <TableCell className="whitespace-nowrap">{dateTimeText(order.createdAt)}</TableCell>
                        <TableCell>{order.phone || '—'}</TableCell>
                        <TableCell>{order.statusCode === null ? '—' : `Mã ${order.statusCode}`}</TableCell>
                        <TableCell>{order.sellerId || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{dateTimeText(order.sellerAssignedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dateTimeText(order.firstConfirmedAt)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {order.currentTotal === null ? '—' : money(order.currentTotal)}
                        </TableCell>
                      </TableRow>)}</TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-5 flex items-center justify-end gap-3 text-sm">
                <Button variant="outline" disabled={rawPage <= 1 || rawOrdersLoading}
                  onClick={() => setRawPage((page) => page - 1)}>Trang trước</Button>
                <span>Trang {rawPage}</span>
                <Button variant="outline" disabled={!rawOrders?.hasMore || rawOrdersLoading || rawPage >= 1000}
                  onClick={() => setRawPage((page) => page + 1)}>Trang sau</Button>
              </div>
            </Surface>
          )}

          {view === 'customers' && <CustomersView Surface={Surface} mode="profiles" />}
          {view === 'dormant' && <CustomersView Surface={Surface} mode="dormant" />}
          {view === 'repurchase' && <RepurchaseView Surface={Surface} />}
          {view === 'monthly' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Doanh số giao thành công"
                  value={money(usingRawReport ? liveReport!.monthly.deliveredRevenue : scope.deliveredRevenue)}
                  note={usingRawReport ? 'Tổng hiện tại · theo ngày tạo đơn' : 'Tiền hàng thuần · theo ngày tạo đơn'}
                  onClick={usingRawReport ? undefined : () =>
                    setDetail({
                      title: 'Doanh số giao thành công',
                      phones: [
                        ...new Set(
                          scope.deliveredOrders.map((o) =>
                            customerKey(o.posId, o.phone),
                          ),
                        ),
                      ],
                      orders: scope.deliveredOrders,
                      valueKind: 'net',
                    })
                  }
                />
                <MetricCard
                  label="Đơn giao thành công"
                  value={String(usingRawReport ? liveReport!.monthly.deliveredOrders : scope.deliveredCount)}
                  note="Không tính hủy/hoàn"
                  onClick={usingRawReport ? undefined : () =>
                    setDetail({
                      title: 'Đơn giao thành công',
                      phones: [
                        ...new Set(
                          scope.deliveredOrders.map((o) =>
                            customerKey(o.posId, o.phone),
                          ),
                        ),
                      ],
                      orders: scope.deliveredOrders,
                      valueKind: 'net',
                    })
                  }
                />
                <MetricCard
                  label="Giá trị trung bình đơn"
                  value={
                    (usingRawReport ? liveReport!.monthly.averageDeliveredValue : scope.avgOrder) === null
                      ? 'Chưa có dữ liệu'
                      : money((usingRawReport ? liveReport!.monthly.averageDeliveredValue : scope.avgOrder)!)
                  }
                  note="Doanh số ÷ số đơn"
                />
                <MetricCard
                  label="Hoàn / hủy"
                  value={usingRawReport
                    ? `${liveReport!.monthly.returnedOrders} / ${liveReport!.monthly.cancelledOrders}`
                    : `${scope.returnedOrders.length} / ${scope.cancelledOrders.length}`}
                  note="Theo dõi riêng đơn gốc"
                />
              </div>
              {usingRawReport ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  <Surface title="Đối chiếu trạng thái hiện tại" description="Tính theo trạng thái đơn Pancake đang lưu">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-[#f8faf7] p-4">
                        <span className="text-sm text-muted-foreground">Giá trị đơn đang hoàn/đã hoàn</span>
                        <strong className="mt-1 block text-2xl">{money(liveReport!.monthly.returnedValue)}</strong>
                      </div>
                      <div className="rounded-xl border bg-[#f8faf7] p-4">
                        <span className="text-sm text-muted-foreground">Khoảng báo cáo</span>
                        <strong className="mt-1 block text-lg">{filters.start} — {filters.end}</strong>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">{liveReport!.monthly.statusRule}.</p>
                  </Surface>
                  <Surface title="Phần chưa khóa công thức" description="Chưa dùng để xét thưởng">
                    <p className="text-sm text-[#536b5c]">
                      Doanh số theo sản phẩm, hoàn một phần và tiền hàng thuần cần đối chiếu mẫu đơn thực tế. Website giữ riêng các số hiện tại và không tự coi đó là giá trị lịch sử.
                    </p>
                  </Surface>
                </div>
              ) : <div className="grid gap-5 xl:grid-cols-2">
                <Surface
                  title="Doanh số theo sản phẩm"
                  description="Chỉ đơn giao thành công"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sản phẩm</TableHead>
                        <TableHead>Số đơn</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead className="text-right">Doanh số</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.name}
                          </TableCell>
                          <TableCell>{p.orders}</TableCell>
                          <TableCell>{p.quantity}</TableCell>
                          <TableCell className="text-right">
                            {money(p.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Surface>
                <Surface
                  title="Đối chiếu kỳ"
                  description="Theo nhân viên chốt; hoàn/hủy hiển thị riêng"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nhân viên</TableHead>
                        <TableHead>Đơn giao</TableHead>
                        <TableHead className="text-right">Doanh số</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.name}</TableCell>
                          <TableCell>{e.scope.deliveredCount}</TableCell>
                          <TableCell className="text-right">
                            {money(e.scope.deliveredRevenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Công thức hoàn một phần và khóa kỳ thưởng cần đối chiếu quy
                    chế trước khi dùng để xét thưởng.
                  </p>
                </Surface>
              </div>}
            </>
          )}

          {view === 'config' && (
            <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
              <div className="xl:col-span-2">
                <SchedulerPanel Surface={Surface} />
              </div>
              <Surface
                title="Kết nối 6 POS"
                description="Kiểm tra API trước, sau đó chọn đúng mã cửa hàng cho từng POS"
              >
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#d5e4d8] bg-[#f5faf5] p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong>Trạng thái API Pancake POS</strong>
                      <Button variant="outline" onClick={checkConnection} disabled={checkingConnection}>
                        {checkingConnection ? 'Đang kiểm tra...' : 'Kiểm tra API'}
                      </Button>
                    </div>
                    <p className="mt-2 text-[#547467]">
                      {connection?.message ?? 'Đang kiểm tra cấu hình bí mật của web...'}
                    </p>
                    {connection?.status === 'missing_key' && (
                      <p className="mt-2 text-[#547467]">
                        Đặt biến bí mật <strong>PANCAKE_POS_API_KEY</strong> cho Worker bằng lệnh
                        {' '}<code>wrangler secret put PANCAKE_POS_API_KEY</code> (API key tạo tại Pancake POS →
                        Cài đặt → Nâng cao → Kết nối bên thứ ba → Webhook/API).
                      </p>
                    )}
                    {connection?.status === 'verified' && (
                      <p className="mt-2 text-[#547467]">
                        Chọn Shop ID từ danh sách bên dưới. Bước đồng bộ số nhận, lịch sử chốt
                        và đơn cần xác định dữ liệu nguồn trước khi số liệu được dùng chính thức.
                      </p>
                    )}
                    <a
                      className="mt-2 inline-block font-medium text-primary underline"
                      href="https://docs.pancake.biz/pos/st-f13/st-p2?lang=vi"
                      target="_blank" rel="noreferrer"
                    >
                      Hướng dẫn lấy API key của Pancake POS
                    </a>
                  </div>
                  {shops.map((s) => (
                    <div
                      key={s.id}
                      className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[1fr_180px_90px_110px_150px_90px] lg:items-center"
                    >
                      <div>
                        <strong className="block text-sm">{s.name}</strong>
                        <span className="text-xs text-muted-foreground">
                          {s.status === 'connected'
                            ? `Đồng bộ ${dateText(s.lastSyncAt)} · lịch sử từ ${s.historyStart ?? 'chưa rõ'}`
                            : 'Chưa có báo cáo chốt nóng'}
                        </span>
                        {s.invalidSavedId && (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            Giá trị đã lưu không phải Shop ID dạng số. Nếu đó là API key,
                            hãy xóa khỏi ô này và thay key trong Pancake POS.
                          </p>
                        )}
                        {inspections[s.id] && (
                          <p className="mt-1 text-xs text-[#547467]">
                            API có {vi.format(inspections[s.id].totalOrders ?? 0)} đơn;
                            mẫu {inspections[s.id].sampledOrders} đơn có{' '}
                            {inspections[s.id].coverage.phone} số điện thoại,{' '}
                            {inspections[s.id].coverage.seller} người bán,{' '}
                            {inspections[s.id].coverage.firstConfirmationEvent} mốc xác nhận.
                            Lịch sử bắt đầu từ {dateText(inspections[s.id].earliestCreatedAt)}.
                          </p>
                        )}
                        {inspections[s.id]?.pageSizeProbe?.success && (
                          <p className="mt-1 text-xs text-[#547467]">
                            Thử trang 100 đơn: API trả {inspections[s.id].pageSizeProbe!.returned}
                            {' '}đơn{inspections[s.id].pageSizeProbe!.reported
                              ? `, cỡ trang báo về ${inspections[s.id].pageSizeProbe!.reported}` : ''}.
                          </p>
                        )}
                        {inspections[s.id] && (
                          <p className="mt-1 text-xs text-amber-700">
                            Trong mẫu có {inspections[s.id].coverage.sellerAssignmentTime}/
                            {inspections[s.id].sampledOrders} mốc giao người bán và{' '}
                            {inspections[s.id].coverage.firstConfirmationValueInHistory}/
                            {inspections[s.id].sampledOrders} bản lịch sử chứa giá trị ở trạng thái xác nhận.
                            {' '}Chi tiết đơn: {inspections[s.id].detailConfirmationValueInHistory ?? 0}/
                            {inspections[s.id].detailOrdersChecked ?? 0} có giá trị tại mốc đó.
                            Vẫn cần nguồn tệp số đã cấp để tính tỷ lệ.
                          </p>
                        )}
                        {inspections[s.id]?.otherHistoryFields?.length ? (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Tên trường lịch sử API để đối chiếu</summary>
                            <p className="mt-1 break-words">{inspections[s.id].otherHistoryFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {inspections[s.id]?.historyCoverage && (
                          <p className="mt-1 text-xs text-[#547467]">
                            Sự kiện thay đổi món hàng trước khi xác nhận:{' '}
                            {inspections[s.id].historyCoverage!.itemSnapshotBeforeConfirmation}/
                            {inspections[s.id].sampledOrders} đơn; sự kiện giảm giá trước mốc:{' '}
                            {inspections[s.id].historyCoverage!.discountBeforeConfirmation}/
                            {inspections[s.id].sampledOrders}. Chưa kết luận được giá trị đơn tại lúc chốt.
                          </p>
                        )}
                        {inspections[s.id]?.historyItemFields?.length ? (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Tên trường món hàng trong lịch sử API</summary>
                            <p className="mt-1 break-words">{inspections[s.id].historyItemFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {inspections[s.id]?.customersReadable && inspections[s.id].customerCoverage && (
                          <p className="mt-1 text-xs text-[#547467]">
                            Khách hàng API: {vi.format(inspections[s.id].totalCustomers ?? 0)} bản ghi;
                            mẫu {inspections[s.id].sampledCustomers ?? 0} có{' '}
                            {inspections[s.id].customerCoverage!.phone} số điện thoại,{' '}
                            {inspections[s.id].customerCoverage!.assignedUser} người được giao và{' '}
                            {inspections[s.id].customerCoverage!.assignmentTime} thời điểm giao.
                          </p>
                        )}
                        {inspections[s.id]?.customersReadable && inspections[s.id].customerFields?.length ? (
                          <details className="mt-1 text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Tên trường khách hàng API để đối chiếu</summary>
                            <p className="mt-1 break-words">{inspections[s.id].customerFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {(rawSync[s.id]?.records ?? 0) > 0 && (
                          <p className="mt-1 text-xs font-medium text-[#276349]">
                            Đã lưu {vi.format(rawSync[s.id].records)} đơn nguồn;
                            {' '}{vi.format(rawSync[s.id].withConfirmation)} có mốc xác nhận,
                            {' '}{vi.format(rawSync[s.id].withSeller)} có người bán,
                            {' '}{vi.format(rawSync[s.id].withAssignmentTime)} có thời điểm phân công ·
                            {' '}kiểm tra {dateText(rawSync[s.id].fetchedAt)}
                          </p>
                        )}
                        {(rawSync[s.id]?.records ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-[#547467]">
                            Kho đơn nguồn: {dateText(rawSync[s.id].earliestCreatedAt ?? null)}
                            {' '}– {dateText(rawSync[s.id].latestCreatedAt ?? null)}.
                          </p>
                        )}
                        {rawSync[s.id]?.backfillCursor && (
                          <p className="mt-1 text-xs text-[#547467]">
                            {rawSync[s.id].backfillCursor?.completed
                              ? 'Đã đi hết các tháng lịch sử API'
                              : `Lịch sử đang ở ${rawSync[s.id].backfillCursor?.month}, trang ${rawSync[s.id].backfillCursor?.page} (${rawSync[s.id].backfillCursor?.pageSize ?? 50} đơn/trang)`}
                          </p>
                        )}
                        {s.shopId && (
                          backfillingPos === s.id ? (
                            <button
                              className="mt-1 text-xs font-semibold text-amber-700 underline disabled:opacity-50"
                              disabled={stoppingBackfill}
                              onClick={() => { backfillStop.current = true; setStoppingBackfill(true); }}
                            >
                              {stoppingBackfill ? 'Sẽ dừng sau trang hiện tại' : 'Dừng sau trang hiện tại'}
                            </button>
                          ) : rawSync[s.id]?.backfillCursor?.completed ? (
                            <button
                              className="mt-1 text-xs font-semibold text-primary underline disabled:opacity-50"
                              disabled={Boolean(backfillingPos)}
                              onClick={() => backfillPages(s.id, 10000, true)}
                            >
                              Đọc lại lịch sử để cập nhật trường mới (giữ trang này mở)
                            </button>
                          ) : (
                            <button
                              className="mt-1 text-xs font-semibold text-primary underline disabled:opacity-50"
                              disabled={Boolean(backfillingPos)}
                              onClick={() => backfillPages(s.id, 10000)}
                            >
                              Chạy tiếp đến hết lịch sử (giữ trang này mở)
                            </button>
                          )
                        )}
                      </div>
                      {connection?.status === 'verified' && connection.shops.length ? (
                        <select
                          aria-label={`Shop ID ${s.name}`}
                          className="h-9 rounded-md border bg-white px-3 text-sm"
                          value={s.shopId}
                          onChange={(e) => setShops((all) => all.map((x) =>
                            x.id === s.id ? { ...x, shopId: e.target.value } : x))}
                        >
                          <option value="">Chọn cửa hàng</option>
                          {connection.shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>{shop.name} · {shop.id}</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          aria-label={`Shop ID ${s.name}`}
                          placeholder="Shop ID dạng số"
                          inputMode="numeric"
                          value={s.shopId}
                          onChange={(e) => setShops((all) => all.map((x) =>
                            x.id === s.id ? { ...x, shopId: e.target.value } : x))}
                        />
                      )}
                      <Button
                        variant="outline"
                        onClick={() => saveShop(s.id, s.shopId)}
                      >
                        {s.invalidSavedId && !s.shopId ? 'Xóa giá trị' : 'Lưu ID'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!s.shopId || syncingPos === s.id || backfillingPos === s.id}
                        onClick={() => syncPilot(s.id)}
                      >
                        {syncingPos === s.id ? 'Đang lưu' : 'Lấy 50 đơn'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!s.shopId || Boolean(backfillingPos) || Boolean(rawSync[s.id]?.backfillCursor?.completed)}
                        onClick={() => backfillPages(s.id, 10)}
                      >
                        {backfillingPos === s.id ? `Đang lấy ${backfillCount} trang` : 'Lấy 10 trang lịch sử'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!s.shopId || inspectingPos === s.id}
                        onClick={() => inspectPos(s.id)}
                      >
                        {inspectingPos === s.id ? 'Đang đọc' : 'Khảo sát'}
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Đơn được lưu theo POS + mã đơn để không nhân đôi khi lấy lại.
                  Đây là dữ liệu nguồn; báo cáo chốt nóng cần lịch sử số được giao,
                  người chốt và giá trị tại lần xác nhận đầu tiên.
                </p>
              </Surface>
              <div className="xl:col-span-2">
                <AlertPanel Surface={Surface} />
              </div>
              <div className="xl:col-span-2">
                <UsersPanel currentUser={user} Surface={Surface} />
              </div>
            </div>
          )}
        </main>
      </SidebarInset>
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              {detail?.phones.length ?? 0} số điện thoại ·{' '}
              {detail?.orders.length ?? 0} đơn liên quan
            </DialogDescription>
          </DialogHeader>
          {detail?.months && (
            <div className="rounded-xl bg-[#f2f8f2] p-3">
              <h3 className="mb-2 text-sm font-semibold">Kết quả theo tháng</h3>
              {detail.months.length ? (
                detail.months.map((m) => (
                  <div
                    key={m.month}
                    className="flex justify-between border-t py-2 text-sm"
                  >
                    <span>
                      {m.month} · {m.orders} đơn
                    </span>
                    <strong>{money(m.revenue)}</strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Chưa có đơn giao thành công sau đợt cấp.
                </p>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Đơn liên quan</TableHead>
                <TableHead className="text-right">
                  {detail?.valueKind === 'net'
                    ? 'Tiền hàng thuần'
                    : 'Giá trị chốt'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail?.phones.map((key) => {
                const orders = detail.orders.filter(
                  (o) => customerKey(o.posId, o.phone) === key,
                );
                return (
                  <TableRow key={key}>
                    <TableCell>{posName(key.split(':')[0])}</TableCell>
                    <TableCell>{key.split(':')[1]}</TableCell>
                    <TableCell>
                      {orders.length ? orders.map((o) => o.id).join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(
                        orders.reduce(
                          (n, o) =>
                            n +
                            (detail?.valueKind === 'net'
                              ? o.netMerchandise
                              : o.hotValue),
                          0,
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!customerDetail}
        onOpenChange={(open) => !open && setCustomerDetail(null)}
      >
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{customerDetail?.name}</DialogTitle>
            <DialogDescription>
              {customerDetail?.phone} ·{' '}
              {customerDetail && posName(customerDetail.posId)} ·{' '}
              {customerDetail && employeeName(customerDetail.employeeId)}
            </DialogDescription>
          </DialogHeader>
          {customerDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-[#f2f8f2] p-4 text-sm">
                <div>
                  <span className="block text-muted-foreground">Tổng tiền</span>
                  <strong>{money(customerDetail.total)}</strong>
                </div>
                <div>
                  <span className="block text-muted-foreground">Số đơn</span>
                  <strong>{customerDetail.count}</strong>
                </div>
                <div>
                  <span className="block text-muted-foreground">Upsell</span>
                  <strong>{customerDetail.upsell} lần</strong>
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Sản phẩm đã mua</h3>
                <p className="text-sm">
                  {customerDetail.products.length
                    ? customerDetail.products
                        .map((p) => `${p.name}: ${p.quantity}`)
                        .join(' · ')
                    : 'Chưa có đơn giao thành công'}
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Lịch sử mua</h3>
                {customerDetail.purchases.length ? (
                  customerDetail.purchases.map((o) => (
                    <div
                      key={o.id}
                      className="flex justify-between border-b py-2 text-sm"
                    >
                      <span>
                        {dateText(o.createdAt)} · {o.id}
                      </span>
                      <strong>{money(o.netMerchandise)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Chưa từng mua.
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Ghi chú</h3>
                <p className="text-sm text-muted-foreground">
                  {customerDetail.note || 'Chưa có ghi chú.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
