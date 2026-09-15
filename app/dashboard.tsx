'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  Database,
  Download,
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
import {
  batchRows,
  customerProfiles,
  dormantGroup,
  employeeComparison,
  employeeName,
  posName,
  productRows,
  reportScope,
  upsellSummary,
} from '@/lib/report-metrics';
import {
  EMPLOYEES,
  POS,
  PRODUCTS,
  customerKey,
  type Dataset,
  type Filters,
  type Order,
} from '@/lib/report-model';

type View =
  | 'shift'
  | 'custom'
  | 'compare'
  | 'batches'
  | 'customers'
  | 'repurchase'
  | 'monthly'
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
  coverage: {
    phone: number;
    seller: number;
    careAssignmentTime: number;
    statusHistory: number;
    firstConfirmationEvent: number;
  };
};
type Detail = {
  title: string;
  phones: string[];
  orders: Order[];
  months?: { month: string; orders: number; revenue: number }[];
  valueKind?: 'hot' | 'net';
};
const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: 'shift', label: 'Điều hành trong ca', icon: LayoutDashboard },
  { id: 'custom', label: 'Báo cáo tùy chỉnh', icon: BarChart3 },
  { id: 'compare', label: 'So sánh nhân viên', icon: UsersRound },
  { id: 'batches', label: 'Data được cấp', icon: Database },
  { id: 'customers', label: 'Hồ sơ khách hàng', icon: UsersRound },
  { id: 'repurchase', label: 'Mua lại & chăm sóc', icon: Activity },
  { id: 'monthly', label: 'Báo cáo cuối tháng', icon: CalendarDays },
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
function BatchesView({
  rows,
  onOpen,
}: {
  rows: ReturnType<typeof batchRows>;
  onOpen: (row: ReturnType<typeof batchRows>[number]) => void;
}) {
  return (
    <Surface
      title="Kết quả từng đợt cấp data"
      description="Bấm một đợt để xem kết quả theo các tháng tiếp theo"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Đợt cấp</TableHead>
            <TableHead>POS</TableHead>
            <TableHead>Người nhận</TableHead>
            <TableHead>Tháng cấp</TableHead>
            <TableHead>Số nhận</TableHead>
            <TableHead>Khách mua</TableHead>
            <TableHead>Số đơn</TableHead>
            <TableHead className="text-right">Doanh số về sau</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow
              key={b.batchId}
              className="cursor-pointer"
              onClick={() => onOpen(b)}
            >
              <TableCell className="font-medium">
                {b.batchId.slice(0, 7)}
              </TableCell>
              <TableCell>{posName(b.posId)}</TableCell>
              <TableCell>
                {b.employeeIds.map((id) => employeeName(id)).join(', ')}
              </TableCell>
              <TableCell>{b.assignedAt}</TableCell>
              <TableCell>{b.received}</TableCell>
              <TableCell>{b.buyers}</TableCell>
              <TableCell>{b.orders}</TableCell>
              <TableCell className="text-right">{money(b.revenue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-4 text-sm text-muted-foreground">
        Đợt cấp cũ chỉ được tái dựng khi POS có thời điểm phân công. Số trùng
        giữa POS vẫn được giữ riêng.
      </p>
    </Surface>
  );
}

export default function Dashboard() {
  const [view, setView] = useState<View>('shift');
  const [data, setData] = useState<Dataset>(emptyData);
  const [filters, setFilters] = useState<Filters>({
    start: '2026-09-15',
    end: '2026-09-15',
    posIds: [],
    employeeIds: [],
    productIds: [],
  });
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
      setMessage('Đã đọc mẫu đơn thật từ Pancake POS. Số liệu trên dashboard vẫn là minh họa.');
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
    void checkConnection();
  }, []);
  const scope = useMemo(() => reportScope(data, filters), [data, filters]);
  const employees = useMemo(
    () => employeeComparison(data, filters),
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
    () => employeeComparison(data, previousFilters),
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
        {employees.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-medium">{e.name}</TableCell>
            <TableCell>{e.scope.received}</TableCell>
            <TableCell>
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
            </TableCell>
            <TableCell>{pct(e.scope.rate)}</TableCell>
            <TableCell>{e.scope.hotOrders}</TableCell>
            <TableCell className="text-right font-medium">
              {money(e.scope.hotValue)}
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
          <span
            className={
              'rounded-full border px-3 py-1.5 text-xs font-medium ' +
              (data.mode === 'demo'
                ? 'border-[#d8e8db] bg-[#f1f8f1] text-[#276349]'
                : 'border-[#b6e2bd] bg-[#e5f7e8] text-[#195b35]')
            }
          >
            {data.mode === 'demo'
              ? 'Dữ liệu minh họa'
              : data.mode === 'empty'
                ? 'Chưa có dữ liệu báo cáo'
              : dataWarning
                ? 'Dữ liệu POS · cần đối chiếu'
                : 'Dữ liệu POS'}
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 md:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-[#6a8575]">
                {filters.start === filters.end
                  ? dateText(`${filters.start}T00:00:00+07:00`)
                  : `${filters.start} — ${filters.end}`}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            </div>
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-[#547467]">
              Cập nhật:{' '}
              <strong>
                {data.mode === 'demo' ? 'minh họa' : dateText(data.updatedAt)}
              </strong>
            </div>
          </div>
          {view !== 'config' && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-[0_4px_18px_rgba(25,65,46,.03)]">
              <span className="px-2 text-sm font-semibold text-[#62796d]">
                Bộ lọc
              </span>
              <Select
                value={period}
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
                options={[...EMPLOYEES]}
                selected={filters.employeeIds}
                onChange={(v) => changeFilters({ employeeIds: v })}
              />
              <MultiFilter
                label="Sản phẩm"
                options={[...PRODUCTS]}
                selected={filters.productIds}
                onChange={(v) => changeFilters({ productIds: v })}
              />
            </div>
          )}
          {message && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-[#cce5cf] bg-[#ecf8ed] px-4 py-3 text-sm text-[#276349]"
            >
              {message}
            </div>
          )}
          {dataWarning && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-[#efd9b2] bg-[#fff7e8] px-4 py-3 text-sm text-[#856321]"
            >
              {dataWarning}
              {data.mode === 'empty' && (
                <button className="ml-2 font-semibold underline" onClick={() => setData(demoData)}>
                  Xem ví dụ minh họa
                </button>
              )}
              {data.mode === 'demo' && (
                <button className="ml-2 font-semibold underline" onClick={() => setData(emptyData)}>
                  Quay lại dữ liệu thật
                </button>
              )}
            </div>
          )}

          {view === 'shift' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Số đã nhận"
                  value={vi.format(scope.received)}
                  note="Số điện thoại duy nhất"
                  onClick={() => drill('received')}
                />
                <MetricCard
                  label="Số đã chốt"
                  value={vi.format(scope.closed)}
                  note="Trong tệp đã nhận"
                  onClick={() => drill('closed')}
                />
                <MetricCard
                  label="Tỷ lệ chốt nóng"
                  value={pct(scope.rate)}
                  note="Số chốt ÷ số nhận"
                  featured
                  onClick={() => drill('closed')}
                />
                <MetricCard
                  label="Số đơn chốt nóng"
                  value={vi.format(scope.hotOrders)}
                  note="Đếm đơn riêng"
                  onClick={() => drill('hotOrders')}
                />
                <MetricCard
                  label="Giá trị chốt nóng"
                  value={money(scope.hotValue)}
                  note="Tại lúc xác nhận"
                  onClick={() => drill('hotValue')}
                />
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
                <Surface
                  title="Hiệu quả theo nhân viên"
                  description="Tệp số được nhận trong kỳ"
                >
                  {employeeTable}
                </Surface>
                <Surface
                  title="Hoạt động chốt trong kỳ"
                  description="Gồm cả số được cấp từ kỳ trước"
                >
                  <button
                    onClick={() => drill('activity')}
                    className="mb-4 text-left"
                  >
                    <strong className="block text-3xl">
                      {scope.activityHotOrders} đơn
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      {money(scope.activityHotValue)} · xem đơn
                    </span>
                  </button>
                  <ChartContainer
                    className="h-45 w-full aspect-auto"
                    config={{ orders: { label: 'Số đơn', color: '#4ba87b' } }}
                  >
                    <BarChart data={hours}>
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
                  </ChartContainer>
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
                    {employees.length} nhân viên
                  </span>
                }
              >
                {display === 'table' ? (
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
                )}
              </Surface>
            </div>
          )}

          {view === 'compare' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {employees.map((e) => (
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
                {comparisonTable}
                <p className="mt-4 text-sm text-muted-foreground">
                  Doanh số ghi cho người chốt tại thời điểm xác nhận, kể cả khi
                  khách được chuyển người phụ trách sau đó.
                </p>
              </Surface>
            </>
          )}

          {view === 'batches' && (
            <BatchesView
              rows={batches}
              onOpen={(b) =>
                setDetail({
                  title: `Đợt cấp ${b.batchId} · ${posName(b.posId)}`,
                  phones: b.phones,
                  orders: b.relatedOrders,
                  months: b.months,
                  valueKind: 'net',
                })
              }
            />
          )}

          {view === 'customers' && (
            <Surface
              title="Hồ sơ khách hàng"
              description="Tổng tiền và lịch sử chỉ tính đơn giao thành công"
              action={
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-2.5 text-muted-foreground"
                  />
                  <Input
                    aria-label="Tìm khách hàng"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tên hoặc số điện thoại"
                    className="pl-9"
                  />
                </div>
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>POS</TableHead>
                    <TableHead>Người phụ trách</TableHead>
                    <TableHead>Số đơn</TableHead>
                    <TableHead>Trung bình đơn</TableHead>
                    <TableHead>Loại sản phẩm</TableHead>
                    <TableHead className="text-right">Tổng tiền mua</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles
                    .filter((c) =>
                      `${c.name} ${c.phone}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .slice(0, 50)
                    .map((c) => (
                      <TableRow
                        key={c.key}
                        className="cursor-pointer"
                        onClick={() => setCustomerDetail(c)}
                      >
                        <TableCell>
                          <strong className="block font-medium">
                            {c.name}
                          </strong>
                          <span className="text-xs text-muted-foreground">
                            {c.phone}
                          </span>
                        </TableCell>
                        <TableCell>{posName(c.posId)}</TableCell>
                        <TableCell>{employeeName(c.employeeId)}</TableCell>
                        <TableCell>{c.count}</TableCell>
                        <TableCell>
                          {c.avg === null ? '—' : money(c.avg)}
                        </TableCell>
                        <TableCell>{c.products.length}</TableCell>
                        <TableCell className="text-right font-medium">
                          {money(c.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Surface>
          )}

          {view === 'repurchase' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  'Upsell lần 1',
                  'Upsell lần 2',
                  'Upsell lần 3',
                  'Khách mua lại',
                  'Đơn mua lại',
                ].map((label, i) => (
                  <MetricCard
                    key={label}
                    label={label}
                    value={String(
                      [
                        upsell.first,
                        upsell.second,
                        upsell.third,
                        upsell.customers,
                        upsell.orders,
                      ][i],
                    )}
                    note="Đơn giao thành công"
                  />
                ))}
              </div>
              <Surface
                title="Khách lâu chưa mua"
                description="Tách riêng khách chưa từng mua"
                action={
                  <Select
                    value={dormant}
                    onValueChange={(v) => setDormant(String(v))}
                  >
                    <SelectTrigger className="min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Tất cả',
                        '30–45 ngày',
                        '46–60 ngày',
                        '61–90 ngày',
                        'Trên 90 ngày',
                        'Chưa từng mua',
                      ].map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              >
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    '30–45 ngày',
                    '46–60 ngày',
                    '61–90 ngày',
                    'Trên 90 ngày',
                    'Chưa từng mua',
                  ].map((g) => (
                    <button
                      key={g}
                      onClick={() => setDormant(g)}
                      className="rounded-xl border bg-[#f7faf6] p-3 text-left"
                    >
                      <strong className="block text-xl">
                        {
                          profiles.filter(
                            (c) => dormantGroup(c.daysSince) === g,
                          ).length
                        }
                      </strong>
                      <span className="text-sm text-muted-foreground">{g}</span>
                    </button>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>POS</TableHead>
                      <TableHead>Người phụ trách</TableHead>
                      <TableHead>Lần mua gần nhất</TableHead>
                      <TableHead>Số ngày</TableHead>
                      <TableHead>Nhóm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles
                      .filter((c) =>
                        dormant === 'Tất cả'
                          ? dormantGroup(c.daysSince) !== 'Dưới 30 ngày'
                          : dormantGroup(c.daysSince) === dormant,
                      )
                      .slice(0, 50)
                      .map((c) => (
                        <TableRow
                          key={c.key}
                          className="cursor-pointer"
                          onClick={() => setCustomerDetail(c)}
                        >
                          <TableCell>
                            <strong className="block">{c.name}</strong>
                            <span className="text-xs text-muted-foreground">
                              {c.phone}
                            </span>
                          </TableCell>
                          <TableCell>{posName(c.posId)}</TableCell>
                          <TableCell>{employeeName(c.employeeId)}</TableCell>
                          <TableCell>{dateText(c.last)}</TableCell>
                          <TableCell>{c.daysSince ?? '—'}</TableCell>
                          <TableCell>{dormantGroup(c.daysSince)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Surface>
            </>
          )}

          {view === 'monthly' && (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Doanh số giao thành công"
                  value={money(scope.deliveredRevenue)}
                  note="Tiền hàng thuần · theo ngày tạo đơn"
                  onClick={() =>
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
                  value={String(scope.deliveredCount)}
                  note="Không tính hủy/hoàn"
                  onClick={() =>
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
                    scope.avgOrder === null
                      ? 'Chưa có dữ liệu'
                      : money(scope.avgOrder)
                  }
                  note="Doanh số ÷ số đơn"
                />
                <MetricCard
                  label="Hoàn / hủy"
                  value={`${scope.returnedOrders.length} / ${scope.cancelledOrders.length}`}
                  note="Theo dõi riêng đơn gốc"
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
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
              </div>
            </>
          )}

          {view === 'config' && (
            <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
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
                        Vào phần cấu hình của Site, thêm biến bí mật <strong>PANCAKE_POS_API_KEY</strong>
                        {' '}bằng API key tạo tại Pancake POS → Cấu hình → Ứng dụng.
                        Kết nối Pancake với Codex không tự cấp key cho web này.
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
                      className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[1fr_180px_90px_90px] lg:items-center"
                    >
                      <div>
                        <strong className="block text-sm">{s.name}</strong>
                        <span className="text-xs text-muted-foreground">
                          {s.status === 'connected'
                            ? `Đồng bộ ${dateText(s.lastSyncAt)} · lịch sử từ ${s.historyStart ?? 'chưa rõ'}`
                            : 'Chưa kết nối dữ liệu'}
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
                        disabled={!s.shopId || inspectingPos === s.id}
                        onClick={() => inspectPos(s.id)}
                      >
                        {inspectingPos === s.id ? 'Đang đọc' : 'Khảo sát'}
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Mỗi cửa hàng được theo dõi riêng. Không gộp số điện thoại
                  trùng giữa POS khi chưa chốt quy tắc.
                </p>
              </Surface>
              <Surface
                title="Cảnh báo Telegram"
                description="Quy tắc được lưu; chưa gửi khi dữ liệu hoặc bot chưa sẵn sàng"
                action={<Bell size={18} className="text-primary" />}
              >
                <div className="grid gap-4">
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={alert.enabled}
                      onCheckedChange={(v) =>
                        setAlert((a) => ({ ...a, enabled: Boolean(v) }))
                      }
                    />
                    Bật quy tắc khi đã kết nối
                  </label>
                  <MultiFilter
                    label="Nhân viên theo dõi"
                    options={[...EMPLOYEES]}
                    selected={alert.employeeIds}
                    onChange={(v) =>
                      setAlert((a) => ({ ...a, employeeIds: v }))
                    }
                  />
                  <label className="text-sm">
                    Ngưỡng tỷ lệ chốt (%)
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={alert.threshold}
                      onChange={(e) =>
                        setAlert((a) => ({
                          ...a,
                          threshold: Number(e.target.value),
                        }))
                      }
                      className="mt-1"
                    />
                  </label>
                  <label className="text-sm">
                    Số nhận tối thiểu
                    <Input
                      type="number"
                      min={1}
                      value={alert.minReceived}
                      onChange={(e) =>
                        setAlert((a) => ({
                          ...a,
                          minReceived: Number(e.target.value),
                        }))
                      }
                      className="mt-1"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      Bắt đầu ca
                      <Input
                        type="time"
                        value={alert.shiftStart}
                        onChange={(e) =>
                          setAlert((a) => ({
                            ...a,
                            shiftStart: e.target.value,
                          }))
                        }
                        className="mt-1"
                      />
                    </label>
                    <label className="text-sm">
                      Kết thúc ca
                      <Input
                        type="time"
                        value={alert.shiftEnd}
                        onChange={(e) =>
                          setAlert((a) => ({ ...a, shiftEnd: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </label>
                  </div>
                  <label className="text-sm">
                    Nghỉ giữa thông báo (phút)
                    <Input
                      type="number"
                      min={5}
                      value={alert.cooldownMinutes}
                      onChange={(e) =>
                        setAlert((a) => ({
                          ...a,
                          cooldownMinutes: Number(e.target.value),
                        }))
                      }
                      className="mt-1"
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={alert.repeat}
                      onCheckedChange={(v) =>
                        setAlert((a) => ({ ...a, repeat: Boolean(v) }))
                      }
                    />
                    Nhắc lại nếu vẫn dưới ngưỡng
                  </label>
                  <label className="text-sm">
                    Telegram Chat ID
                    <Input
                      placeholder="Chat ID riêng của bạn"
                      value={alert.chatId}
                      onChange={(e) =>
                        setAlert((a) => ({ ...a, chatId: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </label>
                  <Button onClick={saveAlert}>Lưu quy tắc cảnh báo</Button>
                  <p className="text-xs text-muted-foreground">
                    Dữ liệu đồng bộ lỗi hoặc quá cũ sẽ chặn cảnh báo hiệu suất.
                  </p>
                </div>
              </Surface>
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
