// Tách khỏi app/api/marketing-teams/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { MARKETING_TEAMS_KEY, type MarketingTeam } from '@/lib/teams/marketing-teams';

/** Mọi người trên POS (gộp theo mã) để chọn vào team Marketing. */
export const mktPeople = () => env.DB.prepare("SELECT user_id,MAX(name) AS name,MAX(COALESCE(department,'')) AS department,MAX(is_active) AS active FROM pos_users WHERE user_id<>'' GROUP BY user_id ORDER BY name").all();
/** Lưu team Marketing chia trên web tổng. */
export const saveMarketingTeams = (checked: { teams?: MarketingTeam[] }) =>
  env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(MARKETING_TEAMS_KEY, JSON.stringify(checked.teams), new Date().toISOString()).run();
