// Tên hiển thị của các hành động trong nhật ký (dùng chung server + trình duyệt, không import env).
export const AUDIT_ACTIONS: Record<string, string> = {
  'login': 'Đăng nhập',
  'login.fail': 'Đăng nhập sai',
  'login.blocked': 'Đăng nhập bị chặn (sai quá nhiều)',
  'logout': 'Đăng xuất',
  'password.change': 'Đổi mật khẩu',
  'password.reset.request': 'Yêu cầu mã đặt lại mật khẩu',
  'password.reset': 'Đặt lại mật khẩu qua email',
  'totp.enable': 'Bật mã ứng dụng (2FA)',
  'totp.disable': 'Tắt mã ứng dụng (2FA)',
  'passkey.add': 'Thêm passkey',
  'passkey.remove': 'Gỡ passkey',
  'device.remove': 'Gỡ thiết bị tin cậy',
  'user.create': 'Tạo tài khoản',
  'user.update': 'Sửa tài khoản / phân quyền',
  'user.delete': 'Xóa tài khoản',
  'targets.update': 'Đặt mục tiêu',
  'config.update': 'Đổi cấu hình',
  'connection.update': 'Sửa kết nối POS',
  'telegram.update': 'Quyền bot Telegram',
  'sync.run': 'Chạy đồng bộ POS',
  'sync.scheduler': 'Bộ hẹn giờ đồng bộ',
  'import': 'Nhập dữ liệu',
  'preset.update': 'Mẫu báo cáo tùy chỉnh',
  'export': 'Xuất Excel / xem toàn bộ',
  'view': 'Mở trang',
  'api': 'Thao tác khác',
};
export const auditLabel = (action: string) => AUDIT_ACTIONS[action] ?? action;
/** Nhóm hành động để lọc nhanh. */
export const AUDIT_GROUPS: { id: string; label: string; actions: string[] }[] = [
  { id: 'auth', label: 'Đăng nhập & bảo mật', actions: ['login', 'login.fail', 'login.blocked', 'logout', 'password.change', 'password.reset.request', 'password.reset', 'totp.enable', 'totp.disable', 'passkey.add', 'passkey.remove', 'device.remove'] },
  { id: 'admin', label: 'Quản trị & cấu hình', actions: ['user.create', 'user.update', 'user.delete', 'targets.update', 'config.update', 'connection.update', 'telegram.update', 'sync.run', 'sync.scheduler', 'import', 'preset.update', 'api'] },
  { id: 'export', label: 'Xuất dữ liệu', actions: ['export'] },
  { id: 'view', label: 'Mở trang', actions: ['view'] },
];
