// Đọc cài đặt nguồn team (Pancake hay web nhân sự) và đặt cờ cho isolate; đọc lại tối đa mỗi phút để không tốn D1.
import { env } from 'cloudflare:workers';
import { setHrTeams } from '@/lib/team';

export const TEAM_SOURCE_KEY = 'team_source';
let checkedAt = 0;

export async function refreshTeamSource(force = false) {
  if (!force && Date.now() - checkedAt < 60000) return;
  checkedAt = Date.now();
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(TEAM_SOURCE_KEY).first<{ value: string }>();
    setHrTeams(row?.value === 'hr');
  } catch (error) { console.error('team source read failed', error); }
}
