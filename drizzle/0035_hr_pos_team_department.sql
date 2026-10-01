-- Mã team (phòng/nhóm bên web nhân sự) của từng tài khoản POS, để đo lường và đặt KPI theo team (01/10/2026).
-- Điền ở lần kéo web nhân sự kế tiếp; trong lúc chờ, lib/hr-teams.ts tra theo tên team.
ALTER TABLE hr_pos_team ADD COLUMN department_id TEXT;
