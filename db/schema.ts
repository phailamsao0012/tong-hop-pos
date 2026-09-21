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
  // Đồng bộ khách hàng (mục Khách hàng Pancake): mốc gần đây và con trỏ duyệt lịch sử.
  customersSyncedAt: text('customers_synced_at'),
  customerCursor: text('customer_cursor'),
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
    // Doanh thu theo Pancake: tổng tiền sau MỌI giảm trừ (kể cả voucher sàn), = total_price_after_sub_discount.
    netTotal: integer('net_total'),
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
    /** Chỉ mục bao phủ cho các thống kê theo trạng thái/SĐT trong kỳ (cohort mua lại…): tránh đọc dòng đơn kèm raw_json ~10 KB. */
    index('idx_raw_orders_pos_created_status_phone').on(t.posId, t.createdAt, t.statusCode, t.phone),
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
  // owner: chủ web (duy nhất được phân quyền, vào Cấu hình); director / lead / staff: chỉ xem theo quyền được cấp.
  role: text('role').notNull().default('staff'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLoginAt: text('last_login_at'),
  // Chức vụ hiển thị, người quản lý trực tiếp, và phạm vi được xem: trang (JSON), POS (JSON; '' = tất cả), nhóm Sale/CSKH.
  title: text('title').notNull().default(''),
  managerId: text('manager_id'),
  viewsJson: text('views_json').notNull().default(''),
  posIdsJson: text('pos_ids_json').notNull().default(''),
  team: text('team').notNull().default('all'),
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
// Số liệu tính sẵn theo khách (POS × SĐT): dùng cho hồ sơ khách, khách lâu chưa mua, data được cấp.
export const customerStats = sqliteTable(
  'customer_stats',
  {
    id: text('id').primaryKey(), // pos:phone
    posId: text('pos_id').notNull(),
    phone: text('phone').notNull(),
    name: text('name').notNull().default(''),
    customerId: text('customer_id'),
    sellerId: text('seller_id'), // người bán trên đơn gần nhất
    firstOrderAt: text('first_order_at'),
    lastOrderAt: text('last_order_at'),
    firstAssignedAt: text('first_assigned_at'),
    orders: integer('orders').notNull().default(0),
    closedOrders: integer('closed_orders').notNull().default(0),
    closedNet: integer('closed_net').notNull().default(0), // doanh thu đơn chốt (sau giảm giá)
    successOrders: integer('success_orders').notNull().default(0),
    successGross: integer('success_gross').notNull().default(0),
    successNet: integer('success_net').notNull().default(0),
    successQuantity: integer('success_quantity').notNull().default(0),
    returnedOrders: integer('returned_orders').notNull().default(0),
    cancelledOrders: integer('cancelled_orders').notNull().default(0),
    firstSuccessAt: text('first_success_at'),
    lastSuccessAt: text('last_success_at'),
    productKinds: integer('product_kinds').notNull().default(0),
    productsJson: text('products_json').notNull().default('[]'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_customer_stats_pos_last_success').on(t.posId, t.lastSuccessAt),
    index('idx_customer_stats_pos_seller').on(t.posId, t.sellerId),
    /** Cohort mua lại và phễu: đọc từ chỉ mục, không chạm dòng. */
    index('idx_customer_stats_pos_first_success_seller').on(t.posId, t.firstSuccessAt, t.sellerId),
    index('idx_customer_stats_pos_seller_success').on(t.posId, t.sellerId, t.successOrders),
  ],
);
// Nhật ký cảnh báo Telegram đã gửi (chống gửi lặp, hiển thị trong Cấu hình).
export const alertLog = sqliteTable(
  'alert_log',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind').notNull(), // low_rate | data_error | test
    employeeId: text('employee_id'),
    day: text('day').notNull(),
    sentAt: text('sent_at').notNull(),
    message: text('message').notNull(),
    ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
    error: text('error'),
  },
  (t) => [index('idx_alert_log_owner_sent').on(t.ownerId, t.sentAt)],
);
// Chat Telegram được phép ra lệnh cho bot.
export const telegramChats = sqliteTable('telegram_chats', {
  chatId: text('chat_id').primaryKey(),
  name: text('name').notNull().default(''),
  addedBy: text('added_by').notNull(),
  addedAt: text('added_at').notNull(),
  // admin: được duyệt yêu cầu và quản lý chat khác; member: chỉ xem báo cáo.
  role: text('role').notNull().default('member'),
  // Nhóm mặc định khi xem báo cáo trên bot: all | sale | cskh.
  team: text('team').notNull().default('all'),
});
// Yêu cầu xin quyền dùng bot từ chat lạ (chờ quản trị duyệt).
export const telegramRequests = sqliteTable('telegram_requests', {
  chatId: text('chat_id').primaryKey(),
  name: text('name').notNull().default(''),
  username: text('username'),
  requestedAt: text('requested_at').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | denied
  decidedAt: text('decided_at'),
});
// Cài đặt chung dạng khóa/giá trị (ví dụ mật khẩu bot đã băm).
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
// Mục tiêu tháng cho POS / nhân viên: doanh thu đơn chốt và số đơn chốt.
export const targets = sqliteTable(
  'targets',
  {
    id: text('id').primaryKey(), // `${month}:${scope}:${refId}`
    month: text('month').notNull(), // YYYY-MM
    scope: text('scope').notNull(), // pos | employee
    refId: text('ref_id').notNull(),
    revenue: integer('revenue').notNull().default(0),
    closedOrders: integer('closed_orders').notNull().default(0),
    /** Số ngày làm việc trong tháng (nhân viên): KPI ngày = mục tiêu ÷ số ngày. */
    workingDays: integer('working_days'),
    updatedBy: text('updated_by'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_targets_month').on(t.month, t.scope)],
);

// Cấu hình từng nhân viên: ca làm việc theo giờ (không cố định, đổi được bất kỳ lúc nào).
export const staffSettings = sqliteTable('staff_settings', {
  userId: text('user_id').primaryKey(),
  shiftStart: integer('shift_start'),
  shiftEnd: integer('shift_end'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at').notNull(),
});

// Khách hàng Pancake (mục Khách hàng): người được phân công, ghi chú, số liệu Pancake tự tính.
export const posCustomers = sqliteTable(
  'pos_customers',
  {
    id: text('id').primaryKey(), // `${posId}:${customerId}`
    posId: text('pos_id').notNull(),
    customerId: text('customer_id').notNull(),
    name: text('name').notNull().default(''),
    phone: text('phone'),
    phonesJson: text('phones_json').notNull().default('[]'),
    assignedUserId: text('assigned_user_id'),
    level: text('level'),
    orderCount: integer('order_count').notNull().default(0),
    succeedOrderCount: integer('succeed_order_count').notNull().default(0),
    purchasedAmount: integer('purchased_amount').notNull().default(0),
    lastOrderAt: text('last_order_at'),
    insertedAt: text('inserted_at'),
    updatedAt: text('updated_at'),
    tagsJson: text('tags_json').notNull().default('[]'),
    noteCount: integer('note_count').notNull().default(0),
    lastNoteAt: text('last_note_at'),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [index('idx_pos_customers_assigned').on(t.posId, t.assignedUserId), index('idx_pos_customers_phone').on(t.posId, t.phone), index('idx_pos_customers_updated').on(t.posId, t.updatedAt),
    /** Huy hiệu CSKH + "N ngày chưa note" đếm theo người phụ trách trên mọi POS. */ index('idx_pos_customers_assigned_note').on(t.assignedUserId, t.lastNoteAt)],
);
// Ghi chú trên hồ sơ khách (mỗi ghi chú = một lần chăm sóc / cuộc gọi), gom từ API khách hàng và từ đơn hàng.
export const customerNotes = sqliteTable(
  'customer_notes',
  {
    id: text('id').primaryKey(), // mã ghi chú của Pancake
    posId: text('pos_id').notNull(),
    customerId: text('customer_id'),
    phone: text('phone'),
    authorId: text('author_id'),
    authorName: text('author_name'),
    message: text('message').notNull().default(''),
    orderId: text('order_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at'),
    fetchedAt: text('fetched_at').notNull(),
    source: text('source').notNull().default('customer'),
  },
  (t) => [index('idx_customer_notes_author_created').on(t.authorId, t.createdAt), index('idx_customer_notes_pos_created').on(t.posId, t.createdAt), index('idx_customer_notes_customer').on(t.posId, t.customerId)],
);

// ---- Bảo mật đăng nhập ----
// Thiết bị đã xác minh (cookie thp_device, băm SHA-256): đăng nhập ở thiết bị này không cần OTP email nữa.
export const trustedDevices = sqliteTable('trusted_devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  lastUsedAt: text('last_used_at'),
  userAgent: text('user_agent'),
}, (t) => [index('idx_trusted_devices_user').on(t.userId)]);
// Thử thách đăng nhập đang chờ: OTP email (secret = băm mã), TOTP (secret rỗng), WebAuthn (secret = challenge).
export const loginChallenges = sqliteTable('login_challenges', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  secret: text('secret').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  meta: text('meta'),
});
// Mã ứng dụng (TOTP) của người dùng; secret mã hóa AES-GCM bằng khóa dẫn xuất từ AUTH_SECRET.
export const userMfa = sqliteTable('user_mfa', {
  userId: text('user_id').primaryKey(),
  totpSecret: text('totp_secret'),
  totpEnabledAt: text('totp_enabled_at'),
  updatedAt: text('updated_at').notNull(),
});
// Passkey (WebAuthn): mỗi dòng một thiết bị/khóa.
export const passkeys = sqliteTable('passkeys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  transports: text('transports'),
  deviceType: text('device_type'),
  backedUp: integer('backed_up').notNull().default(0),
  name: text('name').notNull().default(''),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
}, (t) => [index('idx_passkeys_user').on(t.userId)]);
// Nhật ký hoạt động: đăng nhập, thao tác thay đổi, xuất dữ liệu, trang đã mở — ai, làm gì, lúc nào, từ đâu.
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  userId: text('user_id'),
  email: text('email'),
  name: text('name'),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
  status: integer('status'),
  ip: text('ip'),
  device: text('device'),
  userAgent: text('user_agent'),
}, (t) => [index('idx_audit_at').on(t.at), index('idx_audit_user_at').on(t.userId, t.at), index('idx_audit_action_at').on(t.action, t.at)]);

// ---- Tuyển dụng: ứng viên đồng bộ từ 4 file Google Sheets (Apps Script đẩy về qua /api/recruit/webhook) ----
export const recruitCandidates = sqliteTable('recruit_candidates', {
  id: text('id').primaryKey(), // file:tab:khóa dòng (tên|SĐT hoặc row:N)
  fileId: text('file_id').notNull(),
  fileName: text('file_name').notNull().default(''),
  tab: text('tab').notNull().default(''),
  rowNum: integer('row_num').notNull().default(0),
  name: text('name').notNull().default(''),
  phone: text('phone'),
  position: text('position'),
  team: text('team'),
  handler: text('handler'),
  birthYear: text('birth_year'),
  receivedOn: text('received_on'),
  cvUrl: text('cv_url'),
  cvFileId: text('cv_file_id'),
  status: text('status').notNull().default('new'), // new | review | booked | rejected | interviewed | passed | trial
  dataJson: text('data_json').notNull().default('{}'), // {cột: giá trị} toàn bộ dòng
  firstSeenAt: text('first_seen_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
}, (t) => [index('idx_recruit_candidates_file_tab').on(t.fileId, t.tab)]);
export const recruitEvents = sqliteTable('recruit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  candidateId: text('candidate_id').notNull(),
  kind: text('kind').notNull(), // new | update | delete | cv
  changesJson: text('changes_json').notNull().default('[]'), // [{col, from, to}]
  createdAt: text('created_at').notNull(),
  notifiedAt: text('notified_at'),
}, (t) => [index('idx_recruit_events_pending').on(t.notifiedAt, t.createdAt), index('idx_recruit_events_candidate').on(t.candidateId, t.createdAt)]);
export const recruitCv = sqliteTable('recruit_cv', {
  candidateId: text('candidate_id').primaryKey(),
  driveFileId: text('drive_file_id').notNull(),
  name: text('name').notNull().default(''),
  mime: text('mime').notNull().default(''),
  size: integer('size').notNull().default(0),
  telegramFileId: text('telegram_file_id'), // file_id sau khi gửi lên Telegram; web xem CV qua /api/recruit/cv
  sentAt: text('sent_at'),
  updatedAt: text('updated_at').notNull(),
});
export const recruitSources = sqliteTable('recruit_sources', {
  fileId: text('file_id').primaryKey(),
  fileName: text('file_name').notNull().default(''),
  tabsJson: text('tabs_json').notNull().default('[]'),
  lastSnapshotAt: text('last_snapshot_at').notNull(),
  lastChangeAt: text('last_change_at'),
});
