import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const posShops = sqliteTable('pos_shops', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shopId: text('shop_id'),
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
