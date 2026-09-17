import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const posShops = sqliteTable('pos_shops', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shopId: text('shop_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  usersSyncedAt: text('users_synced_at'),
  productsSyncedAt: text('products_synced_at'),
  status: text('status').notNull().default('pending'),
  lastSyncAt: text('last_sync_at'),
  historyStart: text('history_start'),
  lastError: text('last_error'),
  cursor: text('cursor'),
});
export const customers = sqliteTable(
  'customers',
  {
    key: text('key').primaryKey(),
    posId: text('pos_id').notNull(),
    phone: text('phone').notNull(),
    name: text('name').notNull().default(''),
    note: text('note').notNull().default(''),
  },
  (t) => [index('idx_customers_pos_phone').on(t.posId, t.phone)],
);
export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    phone: text('phone').notNull(),
    employeeId: text('employee_id').notNull(),
    assignedAt: text('assigned_at').notNull(),
    batchId: text('batch_id').notNull(),
  },
  (t) => [
    index('idx_assignments_period_employee').on(t.assignedAt, t.employeeId),
    index('idx_assignments_pos_phone').on(t.posId, t.phone),
  ],
);
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    phone: text('phone').notNull(),
    closerId: text('closer_id').notNull(),
    createdAt: text('created_at').notNull(),
    confirmedAt: text('confirmed_at'),
    deliveredAt: text('delivered_at'),
    status: text('status').notNull(),
    hotValue: integer('hot_value').notNull().default(0),
    currentValue: integer('current_value').notNull().default(0),
    netMerchandise: integer('net_merchandise').notNull().default(0),
    returnValue: integer('return_value').notNull().default(0),
    itemsJson: text('items_json').notNull().default('[]'),
  },
  (t) => [
    index('idx_orders_confirmed_closer').on(t.confirmedAt, t.closerId),
    index('idx_orders_created_status').on(t.createdAt, t.status),
    index('idx_orders_pos_phone').on(t.posId, t.phone),
  ],
);
// Source records are kept separately until assignment batches, first-confirmation
// value, and employee mapping have been checked against actual POS data.
export const rawPosOrders = sqliteTable(
  'raw_pos_orders',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    shopId: text('shop_id').notNull(),
    sourceOrderId: text('source_order_id').notNull(),
    phone: text('phone'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
    statusCode: integer('status_code'),
    sellerId: text('seller_id'),
    sellerAssignedAt: text('seller_assigned_at'),
    careId: text('care_id'),
    currentTotal: integer('current_total'),
    firstConfirmedAt: text('first_confirmed_at'),
    firstConfirmedBy: text('first_confirmed_by'),
    statusHistoryJson: text('status_history_json').notNull().default('[]'),
    otherHistoryJson: text('other_history_json').notNull().default('[]'),
    itemJson: text('item_json').notNull().default('[]'),
    historyLimited: integer('history_limited', { mode: 'boolean' }).notNull().default(false),
    fetchedAt: text('fetched_at').notNull(),
    // Bổ sung từ Pancake để tổng hợp doanh số theo POS/sản phẩm và đối chiếu.
    customerName: text('customer_name'),
    customerId: text('customer_id'),
    totalDiscount: integer('total_discount'),
    shippingFee: integer('shipping_fee'),
    cod: integer('cod'),
    moneyToCollect: integer('money_to_collect'),
    totalQuantity: integer('total_quantity'),
    subStatus: integer('sub_status'),
    creatorId: text('creator_id'),
    lastEditorId: text('last_editor_id'),
    marketerId: text('marketer_id'),
    careAssignedAt: text('care_assigned_at'),
    deliveredAt: text('delivered_at'),
    returnedAt: text('returned_at'),
    cancelledAt: text('cancelled_at'),
    lastStatusAt: text('last_status_at'),
    orderSource: text('order_source'),
    warehouseId: text('warehouse_id'),
    tagsJson: text('tags_json').notNull().default('[]'),
    note: text('note'),
    isRemoved: integer('is_removed', { mode: 'boolean' }).notNull().default(false),
    // Toàn bộ JSON gốc của đơn từ Pancake (trừ `histories` rất nặng) để không mất thông số nào.
    rawJson: text('raw_json'),
  },
  // Giữ ít index để tiết kiệm lượt ghi D1 (mỗi index là một dòng ghi thêm cho mỗi đơn).
  (t) => [
    index('idx_raw_orders_pos_created').on(t.posId, t.createdAt),
    index('idx_raw_orders_phone').on(t.posId, t.phone),
    index('idx_raw_orders_pos_assignment').on(t.posId, t.sellerAssignedAt, t.sellerId),
    index('idx_raw_orders_pos_confirmation').on(t.posId, t.firstConfirmedAt, t.firstConfirmedBy),
  ],
);
export const reportPresets = sqliteTable(
  'report_presets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    configJson: text('config_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_report_presets_owner').on(t.ownerId)],
);
export const alertRules = sqliteTable('alert_rules', {
  ownerId: text('owner_id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  threshold: integer('threshold').notNull().default(40),
  minReceived: integer('min_received').notNull().default(20),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
  shiftStart: text('shift_start').notNull().default('08:00'),
  shiftEnd: text('shift_end').notNull().default('12:00'),
  repeat: integer('repeat', { mode: 'boolean' }).notNull().default(false),
  chatId: text('chat_id'),
  employeeIdsJson: text('employee_ids_json').notNull().default('[]'),
  updatedAt: text('updated_at').notNull(),
});
export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    status: text('status').notNull(),
    records: integer('records').notNull().default(0),
    error: text('error'),
  },
  (t) => [index('idx_sync_runs_pos_started').on(t.posId, t.startedAt)],
);

// Tài khoản đăng nhập riêng của web (thay cho đăng nhập ChatGPT).
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLoginAt: text('last_login_at'),
});
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('idx_sessions_user').on(t.userId)],
);
// Nhân viên và sản phẩm lấy từ từng POS để hiển thị tên thay vì mã.
export const posUsers = sqliteTable(
  'pos_users',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull().default(''),
    email: text('email'),
    phone: text('phone'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    fetchedAt: text('fetched_at').notNull(),
    // Phòng ban / nhóm bán hàng trên Pancake (lọc SALE, CSKH...).
    department: text('department'),
    saleGroup: text('sale_group'),
  },
  (t) => [index('idx_pos_users_pos').on(t.posId, t.userId)],
);
export const posProducts = sqliteTable(
  'pos_products',
  {
    id: text('id').primaryKey(),
    posId: text('pos_id').notNull(),
    productId: text('product_id').notNull(),
    variationId: text('variation_id').notNull(),
    productName: text('product_name').notNull().default(''),
    variationName: text('variation_name').notNull().default(''),
    sku: text('sku'),
    retailPrice: integer('retail_price'),
    categoryJson: text('category_json').notNull().default('[]'),
    isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [
    index('idx_pos_products_pos').on(t.posId, t.productId),
    index('idx_pos_products_variation').on(t.posId, t.variationId),
  ],
);
// Từng dòng sản phẩm của đơn nguồn, phục vụ báo cáo theo sản phẩm.
export const rawPosOrderItems = sqliteTable(
  'raw_pos_order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    posId: text('pos_id').notNull(),
    productId: text('product_id'),
    variationId: text('variation_id'),
    name: text('name').notNull().default(''),
    quantity: integer('quantity').notNull().default(0),
    returnedCount: integer('returned_count').notNull().default(0),
    retailPrice: integer('retail_price').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    lineTotal: integer('line_total').notNull().default(0),
    sellerId: text('seller_id'),
    isBonus: integer('is_bonus', { mode: 'boolean' }).notNull().default(false),
    isComposite: integer('is_composite', { mode: 'boolean' }).notNull().default(false),
    oneTime: integer('one_time', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('idx_raw_items_order').on(t.orderId)],
);
// Ghép cùng một người ở nhiều POS thành một nhân viên trong báo cáo.
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});
export const peopleLinks = sqliteTable(
  'people_links',
  {
    id: text('id').primaryKey(),
    personId: text('person_id').notNull(),
    posId: text('pos_id').notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [
    index('idx_people_links_person').on(t.personId),
    index('idx_people_links_pos_user').on(t.posId, t.userId),
  ],
);
// Số liệu tính sẵn theo POS × ngày (giờ VN) × người bán, để báo cáo không quét bảng đơn.
// Ba cơ sở thời gian trong cùng một dòng: đơn tạo (orders, nhóm trạng thái) theo ngày tạo;
// đơn chốt (closed_*) theo ngày xác nhận lần đầu — giống màn Tổng quan Pancake;
// đơn chia (assigned_orders) theo ngày giao người bán.
export const statsDaily = sqliteTable(
  'stats_daily',
  {
    id: text('id').primaryKey(), // pos:day:seller
    posId: text('pos_id').notNull(),
    day: text('day').notNull(),
    sellerId: text('seller_id').notNull().default(''),
    orders: integer('orders').notNull().default(0),
    deletedOrders: integer('deleted_orders').notNull().default(0),
    gross: integer('gross').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    net: integer('net').notNull().default(0),
    shippingFee: integer('shipping_fee').notNull().default(0),
    cod: integer('cod').notNull().default(0),
    closedOrders: integer('closed_orders').notNull().default(0),
    closedGross: integer('closed_gross').notNull().default(0),
    closedDiscount: integer('closed_discount').notNull().default(0),
    closedNet: integer('closed_net').notNull().default(0),
    closedShippingFee: integer('closed_shipping_fee').notNull().default(0),
    closedQuantity: integer('closed_quantity').notNull().default(0),
    assignedOrders: integer('assigned_orders').notNull().default(0),
    newOrders: integer('new_orders').notNull().default(0),
    newNet: integer('new_net').notNull().default(0),
    confirmedOrders: integer('confirmed_orders').notNull().default(0),
    confirmedNet: integer('confirmed_net').notNull().default(0),
    shippingOrders: integer('shipping_orders').notNull().default(0),
    shippingNet: integer('shipping_net').notNull().default(0),
    deliveredOrders: integer('delivered_orders').notNull().default(0),
    deliveredNet: integer('delivered_net').notNull().default(0),
    returnedOrders: integer('returned_orders').notNull().default(0),
    returnedNet: integer('returned_net').notNull().default(0),
    cancelledOrders: integer('cancelled_orders').notNull().default(0),
    cancelledNet: integer('cancelled_net').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_stats_daily_pos_day').on(t.posId, t.day)],
);
export const statsDailyProduct = sqliteTable(
  'stats_daily_product',
  {
    id: text('id').primaryKey(), // pos:day:product
    posId: text('pos_id').notNull(),
    day: text('day').notNull(),
    productId: text('product_id').notNull().default(''),
    name: text('name').notNull().default(''),
    orders: integer('orders').notNull().default(0),
    quantity: integer('quantity').notNull().default(0),
    total: integer('total').notNull().default(0),
    closedQuantity: integer('closed_quantity').notNull().default(0),
    closedTotal: integer('closed_total').notNull().default(0),
    deliveredQuantity: integer('delivered_quantity').notNull().default(0),
    deliveredTotal: integer('delivered_total').notNull().default(0),
    returnedQuantity: integer('returned_quantity').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_stats_daily_product_pos_day').on(t.posId, t.day)],
);
