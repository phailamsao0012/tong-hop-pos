-- Bản sao chỉ đọc của web nhân sự (megatech-crm), kéo về định kỳ; nguồn gốc dữ liệu là web nhân sự.
CREATE TABLE IF NOT EXISTS hr_offices (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hr_departments (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, parent_id TEXT, kind TEXT, office_id TEXT, director_employee_id TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS hr_levels (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, rank INTEGER NOT NULL, is_manager INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS hr_titles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hr_employees (
  id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT, phone TEXT, office_id TEXT,
  joined_on TEXT, status TEXT NOT NULL, left_on TEXT, main_user_id TEXT
);
CREATE TABLE IF NOT EXISTS hr_assignments (
  id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, department_id TEXT, level_id TEXT, title_id TEXT,
  manager_employee_id TEXT, is_primary INTEGER NOT NULL DEFAULT 0, start_on TEXT, end_on TEXT
);
CREATE INDEX IF NOT EXISTS idx_hr_assignments_employee ON hr_assignments (employee_id);
-- Team, Leader, Trưởng phòng của từng tài khoản Pancake POS theo vai trò chính bên web nhân sự (tính sẵn khi kéo).
CREATE TABLE IF NOT EXISTS hr_pos_team (
  pos_user_id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, team TEXT NOT NULL,
  department TEXT, level TEXT, title TEXT, leader_employee_id TEXT, leader_name TEXT, head_name TEXT, manager_pos_user_id TEXT, status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_pos_team_team ON hr_pos_team (team);
-- Ứng viên đã tạo hồ sơ bên web nhân sự (nút "Tạo hồ sơ" ở mục Ứng viên đạt): lưu mã nhân viên để không tạo trùng.
ALTER TABLE recruit_candidates ADD COLUMN hr_employee_id TEXT;
