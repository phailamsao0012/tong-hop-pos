'use client';

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Database,
  Truck,
  LayoutDashboard,
  Save,
  Search,
  Settings2,
  ScrollText,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { LogOut, Maximize2, MonitorPlay, X, ChevronLeft, Menu, PhoneCall } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
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
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
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
















import { SecurityPanel } from './security-panel';

import { TEAM_LABELS, setTeam, useTeam } from './team-store';
import { ErrorBox, PageHeader, SkeletonTable, SyncPill, TeamSwitch, ThemeSwitch, Toaster, Toolbar, motionOK, timeOnly, toast, useMotionOK } from './ui-kit';
import { watchSystemTheme } from './ui/theme';

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
import { installApiFetch } from './api-fetch';
import { setScope } from './access-store';
import { ROLE_LABELS, canView, isOwner } from '@/lib/access';
import {
  POS,
  PRODUCTS,
  customerKey,
  type Dataset,
  type Filters,
  type Order,
} from '@/lib/report-model';

// Mỗi trang là một gói mã riêng, chỉ tải khi mở (trang đầu nhẹ hơn nhiều); mã của trang đã mở được giữ lại.
const UsersPanel = lazy(() => import('./users-panel').then((m) => ({ default: m.UsersPanel })));
const OverviewView = lazy(() => import('./overview-view').then((m) => ({ default: m.OverviewView })));
const SchedulerPanel = lazy(() => import('./scheduler-panel').then((m) => ({ default: m.SchedulerPanel })));
const BatchesView = lazy(() => import('./cskh-view').then((m) => ({ default: m.BatchesView })));
const CustomersView = lazy(() => import('./cskh-view').then((m) => ({ default: m.CustomersView })));
const RepurchaseView = lazy(() => import('./cskh-view').then((m) => ({ default: m.RepurchaseView })));
const MonthlyView = lazy(() => import('./monthly-view').then((m) => ({ default: m.MonthlyView })));
const ShiftView = lazy(() => import('./shift-view').then((m) => ({ default: m.ShiftView })));
const CompareView = lazy(() => import('./compare-view').then((m) => ({ default: m.CompareView })));
const RawOrdersView = lazy(() => import('./raw-orders-view').then((m) => ({ default: m.RawOrdersView })));
const CustomersPage = lazy(() => import('./customers-view').then((m) => ({ default: m.CustomersPage })));
const PipelineView = lazy(() => import('./pipeline-view').then((m) => ({ default: m.PipelineView })));
const CenterView = lazy(() => import('./center-view').then((m) => ({ default: m.CenterView })));
const CallsView = lazy(() => import('./calls-view').then((m) => ({ default: m.CallsView })));
const CareView = lazy(() => import('./care-view').then((m) => ({ default: m.CareView })));
const CskhKpiView = lazy(() => import('./cskh-kpi-view').then((m) => ({ default: m.CskhKpiView })));
const AuditView = lazy(() => import('./audit-view').then((m) => ({ default: m.AuditView })));
const CatalogPanel = lazy(() => import('./catalog-panel').then((m) => ({ default: m.CatalogPanel })));
const TargetsPanel = lazy(() => import('./targets-panel').then((m) => ({ default: m.TargetsPanel })));
const AlertPanel = lazy(() => import('./alert-panel').then((m) => ({ default: m.AlertPanel })));
import { clearSnapshots, setSnapshotScope } from './use-api';
import { SkeletonKpis } from './ui-kit';

type View =
  | 'center'
  | 'overview'
  | 'dormant'
  | 'shift'
  | 'custom'
  | 'compare'
  | 'batches'
  | 'customers'
  | 'repurchase'
  | 'monthly'
  | 'pipeline'
  | 'calls'
  | 'care'
  | 'cskh-kpi'
  | 'security'
  | 'raw-orders'
  | 'audit'
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
  { id: 'center', label: 'Điều khiển trung tâm', icon: LayoutDashboard },
  { id: 'overview', label: 'Tổng quan POS', icon: BarChart3 },
  { id: 'shift', label: 'Điều hành trong ca', icon: Activity },
  { id: 'custom', label: 'Báo cáo tùy chỉnh', icon: BarChart3 },
  { id: 'compare', label: 'So sánh nhân viên', icon: UsersRound },
  { id: 'batches', label: 'Data được cấp', icon: Database },
  { id: 'customers', label: 'Hồ sơ khách hàng', icon: UsersRound },
  { id: 'repurchase', label: 'Mua lại & Upsell', icon: Activity },
  { id: 'dormant', label: 'Khách lâu chưa mua', icon: UsersRound },
  { id: 'monthly', label: 'Báo cáo cuối tháng', icon: CalendarDays },
  { id: 'pipeline', label: 'Vận hành đơn', icon: Truck },
  { id: 'calls', label: 'Cuộc gọi CSKH', icon: PhoneCall },
  { id: 'care', label: 'Khách theo nhân viên', icon: UsersRound },
  { id: 'cskh-kpi', label: 'KPI CSKH', icon: Settings2 },
  { id: 'raw-orders', label: 'Đơn nguồn Pancake POS', icon: Database },
  { id: 'config', label: 'Cấu hình & kết nối', icon: Settings2 },
  { id: 'audit', label: 'Nhật ký hoạt động', icon: ScrollText },
  { id: 'security', label: 'Bảo mật tài khoản', icon: Settings2 },
];
// Menu trái gom theo nhóm việc; CSKH đứng riêng và luôn mở (ưu tiên của công ty).
const NAV_GROUPS: { title: string; ids: View[]; accent?: boolean }[] = [
  { title: 'Tổng quan', ids: ['center', 'overview', 'shift'] },
  { title: 'CSKH', ids: ['calls', 'care', 'repurchase', 'dormant', 'cskh-kpi'], accent: true },
  { title: 'Sale & vận hành', ids: ['compare', 'batches', 'pipeline'] },
  { title: 'Khách hàng & báo cáo', ids: ['customers', 'monthly', 'custom', 'raw-orders'] },
  { title: 'Hệ thống', ids: ['config', 'audit'] },
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
  ['deliveredRevenue', 'Doanh thu giao thành công'],
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
// Nhãn và định dạng số (vi-VN) cho tooltip biểu đồ Báo cáo tùy chỉnh theo chỉ số đang sắp xếp.
const metricLabel = (key: string) => metricOptions.find(([k]) => k === key)?.[1] ?? 'Giá trị';
const metricText = (key: string, value: number) => key === 'rate' ? (value < 0 ? 'Chưa tính' : pct(value)) : key === 'hotValue' || key === 'deliveredRevenue' ? money(value) : vi.format(value);

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
            className="min-w-36 justify-between"
          />
        }
      >
        {label}
        {selected.length ? ` (${selected.length})` : ''}
        <SlidersHorizontal size={15} />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-xs font-semibold text-ink-3">
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
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 hover:bg-surface-2"
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
type NavItem = { id: View; label: string; icon: typeof Activity };
type NavCounts = Partial<Record<View, { value: number; hot?: boolean; title: string }>>;
/** Menu trái theo nhóm: thanh lime cố định ở mục đang chọn, viên hover chạy theo con trỏ, nhóm gập/mở (nhớ theo trình duyệt), CSKH luôn mở. */
function SidebarNav({ groups, view, onSelect, navOpen, onToggleGroup, counts }: {
  groups: { title: string; items: NavItem[]; accent?: boolean }[]; view: View; onSelect: (id: View) => void;
  navOpen: Record<string, boolean>; onToggleGroup: (title: string) => void; counts: NavCounts;
}) {
  const { setOpenMobile } = useSidebar();
  const root = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const hov = useRef<HTMLSpanElement>(null);
  // Thanh lime: đo vị trí mục đang chọn so với khung menu (không phụ thuộc cuộn), đo lại khi đổi trang / gập nhóm / đổi cỡ.
  const place = useCallback(() => {
    const r = root.current, bar = ind.current; if (!r || !bar) return;
    const item = r.querySelector<HTMLElement>('.nav-item.is-active');
    if (!item) { r.classList.remove('has-ind'); return; }
    const a = r.getBoundingClientRect(), b = item.getBoundingClientRect();
    bar.style.top = `${b.top - a.top}px`; bar.style.height = `${b.height}px`;
    r.classList.add('has-ind');
  }, []);
  useLayoutEffect(place, [view, navOpen, groups, place]);
  useEffect(() => {
    const r = root.current; if (!r || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place); ro.observe(r);
    document.fonts?.ready.then(place).catch(() => undefined);
    return () => ro.disconnect();
  }, [place]);
  const hideHov = () => hov.current?.classList.remove('on');
  const moveHov = (e: ReactMouseEvent<HTMLDivElement>) => {
    const r = root.current, pill = hov.current; if (!r || !pill) return;
    const item = (e.target as HTMLElement).closest<HTMLElement>('.nav-item');
    if (!item || item.classList.contains('is-active')) { hideHov(); return; }
    const a = r.getBoundingClientRect(), b = item.getBoundingClientRect();
    pill.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`;
    pill.style.width = `${b.width}px`; pill.style.height = `${b.height}px`;
    pill.classList.add('on');
  };
  return (
    <div ref={root} className="nav-root" onMouseOver={moveHov} onMouseLeave={hideHov} onFocus={hideHov}>
      <span ref={ind} className="nav-ind" aria-hidden="true" />
      <span ref={hov} className="nav-hov" aria-hidden="true" />
      {groups.map((g) => {
        const open = g.accent || (navOpen[g.title] ?? true);
        const listId = `nav-${g.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`;
        return (
          <div key={g.title} className={`nav-group mb-2 ${g.accent ? 'accent' : ''}`}>
            {g.accent
              ? <div className="nav-title"><span className="truncate">{g.title}</span></div>
              : (
                <button type="button" className="nav-title" aria-expanded={open} aria-controls={listId} onClick={() => onToggleGroup(g.title)}>
                  <span className="truncate">{g.title}</span><ChevronDown size={13} className="chev" aria-hidden="true" />
                </button>
              )}
            {open && (
              <ul id={listId} className="m-0 flex list-none flex-col gap-px p-0">
                {g.items.map((n) => {
                  const c = counts[n.id];
                  return (
                    <li key={n.id}>
                      <button type="button" className={`nav-item ${view === n.id ? 'is-active' : ''}`} aria-current={view === n.id ? 'page' : undefined}
                        onClick={() => { onSelect(n.id); setOpenMobile(false); }}>
                        <n.icon size={15} aria-hidden="true" /><span>{n.label}</span>
                        {c && c.value > 0 && <span className={`cnt ${c.hot ? 'hot' : ''}`} title={c.title}>{vi.format(c.value)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
/** Nút đóng ngăn kéo menu trên điện thoại (Sheet của sidebar ẩn nút mặc định). */
function DrawerClose() {
  const { setOpenMobile, isMobile } = useSidebar();
  if (!isMobile) return null;
  return <button type="button" aria-label="Đóng menu" onClick={() => setOpenMobile(false)} className="ml-auto grid size-8 place-items-center rounded-lg text-sb-ink-2 transition-colors duration-[var(--dur)] hover:bg-sb-accent hover:text-white focus-visible:outline-2 focus-visible:outline-lime"><X size={16} /></button>;
}
/** Khung trạng thái cuối sidebar: đếm POS đồng bộ tốt / lỗi, bấm mở Cấu hình & kết nối. */
function SidebarStatus({ good, bad, sub, onOpen }: { good: number; bad: { name: string; reason: string }[]; sub: string; onOpen?: () => void }) {
  const { setOpenMobile } = useSidebar();
  const tone = bad.length === 0 ? 'bg-good' : bad.length >= 3 ? 'bg-bad' : 'bg-warn';
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag type={onOpen ? 'button' : undefined} onClick={onOpen ? () => { onOpen(); setOpenMobile(false); } : undefined}
      title={bad.length ? `Cần xem: ${bad.map((b) => `${b.name} (${b.reason})`).join(', ')}` : 'Cả 6 POS đồng bộ trong 15 phút qua'}
      className={`block w-full rounded-xl bg-sb-box p-3.5 text-left text-[12.5px] text-sb-ink transition-colors duration-[var(--dur)] ${onOpen ? 'hover:bg-sb-accent focus-visible:outline-2 focus-visible:outline-lime' : ''}`}>
      <span className="flex items-center gap-2 font-medium"><span className={`inline-block size-[7px] rounded-full ${tone}`} aria-hidden="true" />{good}/6 POS đang hoạt động</span>
      <span className="mt-0.5 block text-[11px] text-sb-ink-2">{bad.length ? `Cần xem: ${bad.map((b) => b.name).join(', ')}` : sub}</span>
    </Tag>
  );
}
const TABS: [View, string, typeof Activity][] = [['center', 'Trung tâm', LayoutDashboard], ['overview', 'Tổng quan', BarChart3], ['shift', 'Trong ca', Activity], ['customers', 'Khách', UsersRound]];
/** Thanh tab dưới cùng trên điện thoại; "Thêm" mở ngăn kéo menu (state openMobile của SidebarProvider). */
function MobileTabBar({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav className="tabbar md:hidden" aria-label="Điều hướng nhanh">
      {TABS.map(([id, label, Icon]) => (
        <button key={id} type="button" onClick={() => onSelect(id)} aria-current={view === id ? 'page' : undefined} className={`tab ${view === id ? 'is-active' : ''}`}><Icon size={20} aria-hidden="true" />{label}</button>
      ))}
      <button type="button" onClick={() => setOpenMobile(true)} className="tab" aria-label="Mở menu đầy đủ"><Menu size={20} aria-hidden="true" />Thêm</button>
    </nav>
  );
}
function Surface({
  title,
  description,
  children,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 max-sm:px-4">
        <div className="min-w-0">
          <h2 className="display text-xl font-semibold tracking-[-.02em] text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5 max-sm:p-4">{children}</div>
    </section>
  );
}
installApiFetch();

export default function Dashboard({ user }: { user: SessionUser }) {
  setSnapshotScope(user.userId);
  const [view, setView] = useState<View>('center');
  // Vai trò bắt buộc 2 lớp mà chưa bật: chỉ được vào trang Bảo mật cho tới khi bật xong.
  const gated = user.mfaRequired && !user.mfaEnabled && view !== 'security';
  // Báo trang vừa mở cho nhật ký hoạt động (một dòng mỗi lần đổi trang).
  useEffect(() => { if (gated) return; void fetch('/api/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view }), keepalive: true }).catch(() => undefined); }, [view, gated]);
  const [searchQuery, setSearchQuery] = useState('');
  const team = useTeam();
  // Chế độ trình chiếu: toàn màn hình, ẩn khung, phóng chữ; ← → chuyển trang báo cáo, Esc thoát.
  const [presenting, setPresenting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Toàn màn hình là bất đồng bộ: theo dõi fullscreenchange để nút "Toàn màn hình" ẩn đúng lúc (đọc DOM trong lúc render thì không cập nhật).
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    onFs();
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const motionOn = useMotionOK();
  const PRESENT_VIEWS: View[] = ['center', 'overview', 'shift', 'compare', 'pipeline', 'batches', 'customers', 'repurchase', 'dormant', 'monthly'];
  const startPresenting = () => {
    setPresenting(true); setSidebarOpen(false);
    if (!PRESENT_VIEWS.includes(view)) setView('center');
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const stopPresenting = () => {
    setPresenting(false); setSidebarOpen(true);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement | null)?.isContentEditable) return;
      const i = PRESENT_VIEWS.indexOf(view);
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); setView(PRESENT_VIEWS[(i + 1) % PRESENT_VIEWS.length]); window.scrollTo({ top: 0 }); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setView(PRESENT_VIEWS[(i - 1 + PRESENT_VIEWS.length) % PRESENT_VIEWS.length]); window.scrollTo({ top: 0 }); }
      else if (e.key === 'Escape') stopPresenting();
    };
    const onFs = () => { if (!document.fullscreenElement) stopPresenting(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, view]);
  const [searchDraft, setSearchDraft] = useState('');
  // Nhóm menu đang mở (nhớ theo trình duyệt) và số nhanh của nhóm CSKH.
  // Khởi tạo rỗng để HTML máy chủ và lần render đầu trên máy khách giống nhau (tránh lỗi hydration); đọc localStorage sau khi mount.
  const [navOpen, setNavOpen] = useState<Record<string, boolean>>({});
  const navHydrated = useRef(false);
  useEffect(() => { try { setNavOpen(JSON.parse(localStorage.getItem('thp_nav_open') ?? '{}')); } catch { /* bỏ qua */ } navHydrated.current = true; }, []);
  useEffect(() => { if (!navHydrated.current) return; try { localStorage.setItem('thp_nav_open', JSON.stringify(navOpen)); } catch { /* bỏ qua */ } }, [navOpen]);
  useEffect(() => watchSystemTheme(), []);
  // Phạm vi xem của tài khoản: POS và nhóm bị khóa theo quyền; trang không được cấp thì chuyển về trang đầu tiên được cấp.
  useEffect(() => {
    setScope({ posIds: user.posIds, team: user.team });
    if (user.team !== 'all') setTeam(user.team);
  }, [user.posIds, user.team]);
  useEffect(() => {
    if (!canView(user, view)) {
      const first = NAV_GROUPS.flatMap((g) => g.ids).find((id) => canView(user, id));
      if (first) setView(first);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [cskhBadge, setCskhBadge] = useState<{ callsToday: number; over20: number } | null>(null);
  useEffect(() => {
    const tick = () => { void fetch('/api/reports/cskh-badge', { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<{ callsToday: number; over20: number }> : null).then((b) => { if (b) setCskhBadge(b); }).catch(() => undefined); };
    tick(); const t = setInterval(tick, 120000); return () => clearInterval(t);
  }, []);
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
  // Thông báo trong trang: thành công tự tắt sau 6 giây, lỗi đứng lại tới khi bấm đóng.
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const notify = (text: string, kind: 'ok' | 'error' = 'ok') => setMessage({ text, kind });
  useEffect(() => {
    if (!message || message.kind !== 'ok') return;
    const t = window.setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);
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
      if (manual) {
        if (failed) notify(`Đã cập nhật ${updated}/6 POS; ${failed} POS chưa phản hồi và sẽ thử lại sau 5 phút.`, 'error');
        else toast(`Đã cập nhật số liệu từ ${updated} POS`);
      }
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
      notify(`Đã lưu ${result.records ?? 0} đơn nguồn mới nhất của ${posName(posId)}. Chưa dùng để tính tỷ lệ chốt nóng.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không lấy được đơn POS.', 'error');
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
      notify(cursor?.completed
        ? `Đã đi hết lịch sử có thể đọc của ${posName(posId)}; cần đối chiếu độ đầy đủ trước khi tính báo cáo.`
        : `Đã lưu ${saved} đơn lịch sử của ${posName(posId)}; tiếp tục từ tháng ${cursor?.month ?? 'chưa rõ'}, trang ${cursor?.page ?? 1}.`);
    } catch (error) {
      await refreshRawSync();
      notify(`${error instanceof Error ? error.message : 'Chưa lấy được trang lịch sử.'} Đã lưu ${saved} đơn trong lần chạy này; tiến độ được giữ để tiếp tục.`, 'error');
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
      notify('Đã đọc mẫu đơn thật từ Pancake POS. Báo cáo chốt nóng chưa được tính.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không khảo sát được POS.', 'error');
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
  // Đồng bộ định kỳ do bộ lập lịch trên Cloudflare đảm nhiệm (5 phút/lần); trình duyệt chỉ làm mới số liệu.
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      setLiveRefresh((value) => value + 1);
      setRawRefresh((value) => value + 1);
      void refreshRawSync();
    };
    const interval = window.setInterval(run, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
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
  const lastSyncIso = Object.values(rawSync).map((r) => r.fetchedAt).filter(Boolean).sort().at(-1) ?? null;
  const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  const SELF_HEADED: View[] = ['center', 'overview', 'customers', 'dormant', 'repurchase', 'batches', 'monthly', 'shift', 'compare', 'raw-orders', 'pipeline', 'calls', 'care', 'cskh-kpi', 'security', 'audit'];
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
      notify('Nhập tên báo cáo trước khi lưu.', 'error');
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
      notify('Chưa lưu được báo cáo. Vui lòng thử lại.', 'error');
      return;
    }
    const preset = (await response.json()) as Preset;
    setPresets((p) => [preset, ...p]);
    setPresetName('');
    notify('Đã lưu cấu hình báo cáo.');
  };
  const saveAlert = async () => {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'alert', alert }),
    });
    if (response.ok) notify('Đã lưu quy tắc cảnh báo. Chỉ kích hoạt gửi sau khi kết nối dữ liệu và bot.');
    else notify('Chưa lưu được quy tắc cảnh báo.', 'error');
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
      notify(shopId
        ? 'Đã lưu Shop ID. Dữ liệu báo cáo chỉ xuất hiện sau khi chạy đồng bộ.'
        : 'Đã xóa giá trị lưu nhầm trong ô Shop ID.');
    } else notify(result.error || 'Chưa lưu được Shop ID.', 'error');
  };

  // Sức khoẻ đồng bộ từng POS cho khung cuối sidebar và viên "Đồng bộ": lỗi hoặc quá 15 phút chưa lấy đơn thì báo.
  const posHealth = POS.map((p) => {
    const fetched = rawSync[p.id]?.fetchedAt ?? null;
    const err = shops.find((sh) => sh.id === p.id)?.lastError ?? null;
    const stale = !fetched || Date.now() - Date.parse(fetched) > 15 * 60000;
    return { id: p.id, name: p.name, fetched, reason: err ? 'lỗi API' : !fetched ? 'chưa đồng bộ' : stale ? `cũ ${Math.round((Date.now() - Date.parse(fetched)) / 60000)} phút` : '', bad: Boolean(err) || stale };
  });
  const badPos = posHealth.filter((p) => p.bad);
  const syncState: 'ok' | 'warn' | 'bad' = badPos.length === 0 ? 'ok' : badPos.length >= 3 ? 'bad' : 'warn';
  const syncDetail = (
    <>
      <b>Đồng bộ Pancake theo POS</b>
      {posHealth.map((p) => <span key={p.id} className="r"><span>{p.name}</span><span className={p.bad ? 'text-warn' : ''}>{p.fetched ? timeOnly(p.fetched) : '—'}{p.reason ? ` · ${p.reason}` : ''}</span></span>)}
      <span className="how block">Bộ lập lịch Cloudflare lấy đơn mới 5 phút/lần; quá 15 phút chưa lấy được thì báo vàng.</span>
    </>
  );
  const navGroups = useMemo(() => NAV_GROUPS.filter((g) => g.ids.some((id) => canView(user, id))).map((g) => ({
    title: g.title, accent: g.accent, items: g.ids.filter((id) => canView(user, id)).map((id) => navigation.find((n) => n.id === id)!),
  })), [user]);
  const navCounts: NavCounts = cskhBadge && canView(user, 'calls')
    ? { calls: { value: cskhBadge.callsToday, title: 'Cuộc gọi CSKH hôm nay' }, care: { value: cskhBadge.over20, hot: true, title: 'Khách quá 20 ngày chưa note' } }
    : {};
  const goTo = (id: View) => {
    setView(id);
    if (id === 'monthly' && period === 'today') setPeriodChoice('month');
    window.scrollTo({ top: 0 });
  };
  const updatedText = !gated && view === 'raw-orders'
    ? dateText(rawSync[rawPosId]?.fetchedAt ?? null)
    : usingRawReport ? dateText(liveReport!.updatedAt)
    : data.mode === 'demo' ? 'minh họa' : dateText(data.updatedAt);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar collapsible="offcanvas" className="border-r-0">
        <SidebarHeader className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="MEGATECH" width={34} height={34} className="size-[34px] rounded-[9px] shadow-[0_2px_10px_rgba(0,0,0,.25)]" />
            <div className="min-w-0">
              <strong className="block text-[15px] font-bold leading-tight tracking-[.03em] text-sb-ink">MEGATECH</strong>
              <span className="block text-[11px] text-sb-ink-2">Tổng hợp POS · CSKH & Sale</span>
            </div>
            <DrawerClose />
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2.5">
          <SidebarNav groups={navGroups} view={view} onSelect={goTo} navOpen={navOpen} counts={navCounts}
            onToggleGroup={(title) => setNavOpen((o) => ({ ...o, [title]: !(o[title] ?? true) }))} />
        </SidebarContent>
        <SidebarFooter className="px-3 pb-4 pt-1">
          <div className="mb-2 flex items-center justify-between gap-2 sm:hidden"><span className="text-[11px] text-[var(--sb-ink-2)]">Giao diện</span><ThemeSwitch /></div>
          <SidebarStatus good={6 - badPos.length} bad={badPos.map((p) => ({ name: p.name, reason: p.reason }))}
            sub={data.mode === 'demo'
              ? 'Chờ kết nối nguồn dữ liệu'
              : usingRawReport
                ? `Cập nhật ${dateText(liveReport!.updatedAt)}`
              : data.mode === 'empty'
                ? 'Chờ đồng bộ dữ liệu báo cáo'
              : `Cập nhật ${dateText(data.updatedAt)}`}
            onOpen={canView(user, 'config') ? () => goTo('config') : undefined} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-canvas">
        {!presenting && <header className="topbar">
          <SidebarTrigger className="shrink-0 text-ink-2" aria-label="Mở / đóng menu" />
          <div className="hidden items-baseline gap-2 xl:flex">
            <strong className="whitespace-nowrap text-[12.5px] font-bold tracking-[.08em] text-ink">TỔNG HỢP POS</strong>
            <span className="whitespace-nowrap text-[11px] text-ink-3">CSKH & Sale</span>
          </div>
          <form className="relative mx-auto hidden w-full min-w-24 max-w-xs md:block lg:max-w-sm" onSubmit={(e) => { e.preventDefault(); setSearchQuery(searchDraft.trim()); setView('customers'); }}>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Tìm khách theo SĐT hoặc tên…" aria-label="Tìm khách theo số điện thoại hoặc tên"
              className="field pl-8" />
          </form>
          <button type="button" className="btn icon ml-auto md:hidden" title="Tìm khách" aria-label="Tìm khách" onClick={() => setView('customers')}><Search size={15} /></button>
          {user.team === 'all' && <TeamSwitch size="sm" />}
          <SyncPill lastSyncAt={lastSyncIso} state={syncState} detail={syncDetail} className="hidden md:inline-flex" />
          <button type="button" onClick={startPresenting} title="Trình chiếu toàn màn hình (Esc để thoát)" aria-label="Trình chiếu toàn màn hình"
            className="btn primary hidden md:inline-flex xl:px-3 max-xl:w-8 max-xl:px-0">
            <MonitorPlay size={14} /><span className="hidden xl:inline">Trình chiếu</span>
          </button>
          <ThemeSwitch className="hidden sm:inline-flex" />
          <div className="user">
            <button type="button" title="Bảo mật tài khoản" aria-label="Bảo mật tài khoản" onClick={() => setView('security')} className="grid size-[26px] place-items-center rounded-full bg-primary text-[10.5px] font-semibold tracking-[.02em] text-primary-ink transition-colors duration-[var(--dur)] hover:bg-primary-2">{initials(user.displayName)}</button>
            <div className="hidden whitespace-nowrap leading-[1.15] lg:block" title={`${ROLE_LABELS[user.role]}${user.title ? ` · ${user.title}` : ''}`}>
              <div className="text-xs font-semibold text-ink">{user.displayName}</div>
              <div className="text-[10.5px] text-ink-3">{user.title || ROLE_LABELS[user.role]}</div>
            </div>
            <button type="button" title="Đăng xuất" aria-label="Đăng xuất" className="out"
              onClick={async () => { await clearSnapshots(); await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}>
              <LogOut size={15} />
            </button>
          </div>
        </header>}
        {presenting && (
          <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface/95 px-2 py-1.5 text-[13px] text-ink shadow-float backdrop-blur">
            <button type="button" className="rounded-full p-1.5 transition-colors duration-[var(--dur)] hover:bg-surface-2" title="Trang trước (←)" aria-label="Trang trước" onClick={() => { const i = PRESENT_VIEWS.indexOf(view); setView(PRESENT_VIEWS[(i - 1 + PRESENT_VIEWS.length) % PRESENT_VIEWS.length]); window.scrollTo({ top: 0 }); }}><ChevronLeft size={16} /></button>
            <span className="px-2 font-medium">{title}</span>
            <span className="num text-xs text-ink-3">{PRESENT_VIEWS.indexOf(view) + 1} / {PRESENT_VIEWS.length}</span>
            <button type="button" className="rounded-full p-1.5 transition-colors duration-[var(--dur)] hover:bg-surface-2" title="Trang sau (→)" aria-label="Trang sau" onClick={() => { const i = PRESENT_VIEWS.indexOf(view); setView(PRESENT_VIEWS[(i + 1) % PRESENT_VIEWS.length]); window.scrollTo({ top: 0 }); }}><ChevronRight size={16} /></button>
            <span className="mx-1 h-4 w-px bg-line-2" />
            {!fullscreen && <button type="button" className="rounded-full p-1.5 transition-colors duration-[var(--dur)] hover:bg-surface-2" title="Toàn màn hình" aria-label="Toàn màn hình" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize2 size={15} /></button>}
            <button type="button" className="rounded-full p-1.5 transition-colors duration-[var(--dur)] hover:bg-bad-bg hover:text-bad" title="Thoát trình chiếu (Esc)" aria-label="Thoát trình chiếu" onClick={stopPresenting}><X size={16} /></button>
          </div>
        )}
        {!presenting && <MobileTabBar view={view} onSelect={goTo} />}
        <main className={presenting ? 'w-full px-8 pb-20 pt-6' : 'mx-auto w-full max-w-[1440px] px-4 pt-4 pb-[calc(88px+env(safe-area-inset-bottom,0px))] sm:pt-6 md:px-8 md:pb-12'} style={presenting ? { zoom: 1.15 } : undefined}>
          {team !== 'all' && !['config', 'audit'].includes(view) && (
            <div className="notice info mb-4 items-center justify-between">
              <span>Đang xem riêng nhóm <strong>{TEAM_LABELS[team]}</strong>: số liệu chỉ tính đơn, khách và data do nhân viên thuộc bộ phận {team === 'sale' ? 'Sale / bán hàng' : 'CSKH'} phụ trách.</span>
              <button type="button" className="link ml-auto shrink-0 text-xs font-semibold underline" onClick={() => setTeam('all')}>Xem tất cả</button>
            </div>
          )}
          {!SELF_HEADED.includes(view) && (
            <PageHeader
              eyebrow={['overview', 'customers', 'repurchase', 'dormant', 'batches'].includes(view) ? 'Số liệu Pancake POS tại thời điểm đồng bộ'
                : filters.start === filters.end
                ? dateText(`${filters.start}T00:00:00+07:00`)
                : `${filters.start.split('-').reverse().join('/')} – ${filters.end.split('-').reverse().join('/')}`}
              title={title}
              actions={!['overview', 'customers', 'repurchase', 'dormant', 'batches'].includes(view) ? (
                <div className="rounded-xl border border-card-line bg-surface px-3.5 py-2 text-[12.5px] text-ink-2 shadow-card">Cập nhật: <strong className="num text-ink">{updatedText}</strong></div>
              ) : undefined}
            />
          )}
          {!['config', 'center', 'raw-orders', 'overview', 'customers', 'repurchase', 'dormant', 'batches', 'monthly', 'shift', 'compare', 'pipeline', 'calls', 'care', 'cskh-kpi', 'security', 'audit'].includes(view) && (
            <Toolbar className="mb-5">
              <span className="px-1.5 text-[12.5px] font-semibold text-ink-2">
                Bộ lọc
              </span>
              <Select
                value={period}
                items={{ today: 'Hôm nay', week: '7 ngày qua', month: 'Tháng này', lastMonth: 'Tháng trước', custom: 'Tùy chọn' }}
                onValueChange={(v) => setPeriodChoice(String(v))}
              >
                <SelectTrigger className="min-w-36" aria-label="Kỳ báo cáo">
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
                <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto sm:flex-none">
                  <Input
                    aria-label="Từ ngày"
                    type="date"
                    value={filters.start}
                    onChange={(e) => changeFilters({ start: e.target.value })}
                    className="w-40"
                  />
                  <span className="text-ink-4" aria-hidden="true">→</span>
                  <Input
                    aria-label="Đến ngày"
                    type="date"
                    value={filters.end}
                    onChange={(e) => changeFilters({ end: e.target.value })}
                    className="w-40"
                  />
                </div>
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
            </Toolbar>
          )}
          {message && (
            <div role={message.kind === 'error' ? 'alert' : 'status'} className={`notice ${message.kind} mb-5`}>
              <span className="min-w-0 flex-1">{message.text}</span>
              <button type="button" className="x" aria-label="Đóng" onClick={() => setMessage(null)}><X size={14} /></button>
            </div>
          )}
          {dataWarning && !usingRawReport && (
            <div role="alert" className="notice warn mb-5 flex-wrap">
              <span className="min-w-0 flex-1">{dataWarning}</span>
              {data.mode === 'empty' && (
                <button type="button" className="link shrink-0 text-xs font-semibold underline" onClick={() => {
                  setData(demoData);
                  setPeriod('today');
                  setFilters((f) => ({ ...f, start: '2026-09-15', end: '2026-09-15' }));
                }}>
                  Xem ví dụ minh họa
                </button>
              )}
              {data.mode === 'demo' && (
                <button type="button" className="link shrink-0 text-xs font-semibold underline" onClick={() => {
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

          {gated && <SecurityPanel user={user} gate />}
          <Suspense fallback={<div className="space-y-4" aria-busy="true"><SkeletonKpis count={4} /><div className="skel h-64 w-full rounded-2xl" /></div>}>
          {!gated && view === 'center' && <CenterView onNavigate={(v) => { setView(v as View); window.scrollTo({ top: 0 }); }} />}
          {!gated && view === 'overview' && <OverviewView />}
          {!gated && view === 'shift' && <ShiftView />}
          {!gated && view === 'custom' && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
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
                    items={{ table: 'Bảng', chart: 'Biểu đồ' }}
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
                    items={Object.fromEntries(metricOptions.map(([key, label]) => [key, `Sắp xếp: ${label}`]))}
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
                    <p className="text-sm text-ink-3">
                      Chưa có báo cáo đã lưu.
                    </p>
                  ) : (
                    presets.map((p) => (
                      <button
                        key={p.id}
                        className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2"
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
                description={`${filters.start.split('-').reverse().join('/')} – ${filters.end.split('-').reverse().join('/')}`}
                action={
                  <span className="num text-[12.5px] text-ink-3">
                    {liveReportLoading && data.mode === 'empty' ? 'Đang cập nhật…' : `${vi.format(usingRawReport ? liveReport!.employees.length : employees.length)} nhân viên`}
                  </span>
                }
              >
                {liveReportError && data.mode === 'empty' && <ErrorBox className="mb-4" error={liveReportError} onRetry={() => setLiveRefresh((v) => v + 1)} />}
                {data.mode === 'empty' && liveReportLoading && !liveReport ? (
                  <SkeletonTable rows={6} cols={1 + metrics.length} />
                ) : (
                <div className={`transition-opacity duration-[var(--dur)] ${liveReportLoading && liveReport ? 'opacity-60' : ''}`} aria-busy={liveReportLoading || undefined}>
                {display === 'table' ? (
                  usingRawReport ? (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Nhân viên</TableHead>
                        {metricOptions.filter(([key]) => metrics.includes(key)).map(([key, label]) =>
                          <TableHead key={key} className="text-right">{key === 'hotValue' ? 'Giá trị hiện tại đơn chốt' : label}</TableHead>)}
                      </TableRow></TableHeader>
                      <TableBody>
                        {liveReport!.employees.length === 0 && (
                          <TableRow><TableCell colSpan={1 + metrics.length} className="py-8 text-center text-ink-3">Không có dữ liệu trong kỳ</TableCell></TableRow>
                        )}
                        {[...liveReport!.employees]
                          .sort((a, b) => (liveMetricNumber(sort, b) ?? -1) - (liveMetricNumber(sort, a) ?? -1))
                          .map((employee) => <TableRow key={employee.id}>
                            <TableCell className="font-medium">{employee.name}</TableCell>
                            {metricOptions.filter(([key]) => metrics.includes(key)).map(([key]) =>
                              <TableCell key={key} className="num text-right">{liveMetricValue(key, employee)}</TableCell>)}
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
                      {employees.length === 0 && (
                        <TableRow><TableCell colSpan={1 + metrics.length} className="py-8 text-center text-ink-3">
                          {data.mode === 'empty' ? 'Không có dữ liệu trong kỳ' : 'Chưa có tệp số được cấp và danh sách nhân viên thật để tính báo cáo.'}
                        </TableCell></TableRow>
                      )}
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
                                <TableCell key={key} className="num text-right">
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
                      config={{ value: { label: metricLabel(sort), color: 'var(--primary)' } }}>
                      <BarChart data={liveReport!.employees.map((employee) => ({
                        name: employee.name.split(' ').at(-1),
                        value: liveMetricNumber(sort, employee) ?? 0,
                      }))}>
                        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                        <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full items-center justify-between gap-4"><span className="text-ink-3">{metricLabel(String(name))}</span><span className="num text-[12.5px] text-ink">{metricText(sort, Number(value))}</span></span>} />} />
                        <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} isAnimationActive={motionOn} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                  <ChartContainer
                    className="h-90 w-full aspect-auto"
                    config={{ value: { label: metricLabel(sort), color: 'var(--primary)' } }}
                  >
                    <BarChart
                      data={employees.map((e) => ({
                        name: e.name.split(' ').at(-1),
                        value: Number(
                          e.scope[sort as keyof typeof e.scope] ?? 0,
                        ),
                      }))}
                    >
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full items-center justify-between gap-4"><span className="text-ink-3">{metricLabel(String(name))}</span><span className="num text-[12.5px] text-ink">{metricText(sort, Number(value))}</span></span>} />} />
                      <Bar
                        dataKey="value"
                        fill="var(--color-value)"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={motionOn}
                      />
                    </BarChart>
                  </ChartContainer>
                  )
                )}
                </div>
                )}
                {usingRawReport && <p className="mt-4 text-[12.5px] text-ink-3">
                  Doanh thu giao thành công, mua lại và khách đang phụ trách cần trạng thái giao hàng được đối chiếu trước nên hiện “Chưa tính”.
                </p>}
              </Surface>
            </div>
          )}

          {!gated && view === 'compare' && <CompareView />}
          {!gated && view === 'batches' && <BatchesView />}
          {!gated && view === 'raw-orders' && <RawOrdersView onSyncNow={() => { void syncRecentAll(true); }} syncing={autoSyncing} />}
          {!gated && view === 'customers' && <CustomersPage key={searchQuery} initialQ={searchQuery} />}
          {!gated && view === 'dormant' && <CustomersView mode="dormant" />}
          {!gated && view === 'repurchase' && <RepurchaseView />}
          {!gated && view === 'monthly' && <MonthlyView />}
          {!gated && view === 'pipeline' && <PipelineView />}
          {!gated && view === 'calls' && <CallsView />}
          {!gated && view === 'care' && <CareView />}
          {!gated && view === 'cskh-kpi' && isOwner(user) && <CskhKpiView />}
          {!gated && view === 'security' && <SecurityPanel user={user} />}
          {!gated && view === 'audit' && isOwner(user) && <AuditView />}
          {!gated && view === 'config' && isOwner(user) && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="xl:col-span-2">
                <TargetsPanel canEdit={isOwner(user)} />
                {isOwner(user) && <CatalogPanel />}
              </div>
              <div className="xl:col-span-2">
                <SchedulerPanel Surface={Surface} />
              </div>
              <Surface
                title="Kết nối 6 POS"
                description="Kiểm tra API trước, sau đó chọn đúng mã cửa hàng cho từng POS"
                className="xl:col-span-2"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm md:col-span-2 2xl:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong>Trạng thái API Pancake POS</strong>
                      <Button variant="outline" onClick={checkConnection} disabled={checkingConnection}>
                        {checkingConnection ? 'Đang kiểm tra...' : 'Kiểm tra API'}
                      </Button>
                    </div>
                    <p className="mt-2 text-ink-2">
                      {connection?.message ?? 'Đang kiểm tra cấu hình bí mật của web...'}
                    </p>
                    {connection?.status === 'missing_key' && (
                      <p className="mt-2 text-ink-2">
                        Đặt biến bí mật <strong>PANCAKE_POS_API_KEY</strong> cho Worker bằng lệnh
                        {' '}<code>wrangler secret put PANCAKE_POS_API_KEY</code> (API key tạo tại Pancake POS →
                        Cài đặt → Nâng cao → Kết nối bên thứ ba → Webhook/API).
                      </p>
                    )}
                    {connection?.status === 'verified' && (
                      <p className="mt-2 text-ink-2">
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
                      className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-line p-3 [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1 [&>div:first-child]:basis-full"
                    >
                      <div>
                        <strong className="block text-sm">{s.name}</strong>
                        <span className="text-xs text-ink-3">
                          {s.status === 'connected'
                            ? `Đồng bộ ${dateText(s.lastSyncAt)} · lịch sử từ ${s.historyStart ?? 'chưa rõ'}`
                            : 'Chưa có báo cáo chốt nóng'}
                        </span>
                        {s.invalidSavedId && (
                          <p className="mt-1 text-xs font-medium text-warn">
                            Giá trị đã lưu không phải Shop ID dạng số. Nếu đó là API key,
                            hãy xóa khỏi ô này và thay key trong Pancake POS.
                          </p>
                        )}
                        {inspections[s.id] && (
                          <p className="mt-1 text-xs text-ink-2">
                            API có {vi.format(inspections[s.id].totalOrders ?? 0)} đơn;
                            mẫu {inspections[s.id].sampledOrders} đơn có{' '}
                            {inspections[s.id].coverage.phone} số điện thoại,{' '}
                            {inspections[s.id].coverage.seller} người bán,{' '}
                            {inspections[s.id].coverage.firstConfirmationEvent} mốc xác nhận.
                            Lịch sử bắt đầu từ {dateText(inspections[s.id].earliestCreatedAt)}.
                          </p>
                        )}
                        {inspections[s.id]?.pageSizeProbe?.success && (
                          <p className="mt-1 text-xs text-ink-2">
                            Thử trang 100 đơn: API trả {inspections[s.id].pageSizeProbe!.returned}
                            {' '}đơn{inspections[s.id].pageSizeProbe!.reported
                              ? `, cỡ trang báo về ${inspections[s.id].pageSizeProbe!.reported}` : ''}.
                          </p>
                        )}
                        {inspections[s.id] && (
                          <p className="mt-1 text-xs text-warn">
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
                          <details className="mt-1 text-xs text-ink-3">
                            <summary className="cursor-pointer">Tên trường lịch sử API để đối chiếu</summary>
                            <p className="mt-1 break-words">{inspections[s.id].otherHistoryFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {inspections[s.id]?.historyCoverage && (
                          <p className="mt-1 text-xs text-ink-2">
                            Sự kiện thay đổi món hàng trước khi xác nhận:{' '}
                            {inspections[s.id].historyCoverage!.itemSnapshotBeforeConfirmation}/
                            {inspections[s.id].sampledOrders} đơn; sự kiện giảm giá trước mốc:{' '}
                            {inspections[s.id].historyCoverage!.discountBeforeConfirmation}/
                            {inspections[s.id].sampledOrders}. Chưa kết luận được giá trị đơn tại lúc chốt.
                          </p>
                        )}
                        {inspections[s.id]?.historyItemFields?.length ? (
                          <details className="mt-1 text-xs text-ink-3">
                            <summary className="cursor-pointer">Tên trường món hàng trong lịch sử API</summary>
                            <p className="mt-1 break-words">{inspections[s.id].historyItemFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {inspections[s.id]?.customersReadable && inspections[s.id].customerCoverage && (
                          <p className="mt-1 text-xs text-ink-2">
                            Khách hàng API: {vi.format(inspections[s.id].totalCustomers ?? 0)} bản ghi;
                            mẫu {inspections[s.id].sampledCustomers ?? 0} có{' '}
                            {inspections[s.id].customerCoverage!.phone} số điện thoại,{' '}
                            {inspections[s.id].customerCoverage!.assignedUser} người được giao và{' '}
                            {inspections[s.id].customerCoverage!.assignmentTime} thời điểm giao.
                          </p>
                        )}
                        {inspections[s.id]?.customersReadable && inspections[s.id].customerFields?.length ? (
                          <details className="mt-1 text-xs text-ink-3">
                            <summary className="cursor-pointer">Tên trường khách hàng API để đối chiếu</summary>
                            <p className="mt-1 break-words">{inspections[s.id].customerFields!.join(', ')}</p>
                          </details>
                        ) : null}
                        {(rawSync[s.id]?.records ?? 0) > 0 && (
                          <p className="mt-1 text-xs font-medium text-primary">
                            Đã lưu {vi.format(rawSync[s.id].records)} đơn nguồn;
                            {' '}{vi.format(rawSync[s.id].withConfirmation)} có mốc xác nhận,
                            {' '}{vi.format(rawSync[s.id].withSeller)} có người bán,
                            {' '}{vi.format(rawSync[s.id].withAssignmentTime)} có thời điểm phân công ·
                            {' '}kiểm tra {dateText(rawSync[s.id].fetchedAt)}
                          </p>
                        )}
                        {(rawSync[s.id]?.records ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-ink-2">
                            Kho đơn nguồn: {dateText(rawSync[s.id].earliestCreatedAt ?? null)}
                            {' '}– {dateText(rawSync[s.id].latestCreatedAt ?? null)}.
                          </p>
                        )}
                        {rawSync[s.id]?.backfillCursor && (
                          <p className="mt-1 text-xs text-ink-2">
                            {rawSync[s.id].backfillCursor?.completed
                              ? 'Đã đi hết các tháng lịch sử API'
                              : `Lịch sử đang ở ${rawSync[s.id].backfillCursor?.month}, trang ${rawSync[s.id].backfillCursor?.page} (${rawSync[s.id].backfillCursor?.pageSize ?? 50} đơn/trang)`}
                          </p>
                        )}
                        {s.shopId && (
                          backfillingPos === s.id ? (
                            <button
                              className="mt-1 text-xs font-semibold text-warn underline disabled:opacity-50"
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
                          className="field h-8 w-auto text-[12.5px]"
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
                <p className="mt-4 text-sm text-ink-3">
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
          </Suspense>
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
            <div className="rounded-xl bg-surface-2 p-3">
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
                <p className="text-sm text-ink-3">
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
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4 text-sm">
                <div>
                  <span className="block text-ink-3">Tổng tiền</span>
                  <strong>{money(customerDetail.total)}</strong>
                </div>
                <div>
                  <span className="block text-ink-3">Số đơn</span>
                  <strong>{customerDetail.count}</strong>
                </div>
                <div>
                  <span className="block text-ink-3">Upsell</span>
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
                  <p className="text-sm text-ink-3">
                    Chưa từng mua.
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Ghi chú</h3>
                <p className="text-sm text-ink-3">
                  {customerDetail.note || 'Chưa có ghi chú.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Toaster />
    </SidebarProvider>
  );
}
