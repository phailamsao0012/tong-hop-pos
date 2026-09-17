// Gửi tin qua Telegram Bot API. Token bot nằm trong biến bí mật TELEGRAM_BOT_TOKEN.
const API = 'https://api.telegram.org';

export async function sendTelegram(token: string, chatId: string, text: string) {
  const response = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram HTTP ${response.status}`);
  return result;
}

/** Các cuộc trò chuyện đã nhắn cho bot gần đây (để tìm Chat ID). */
export async function recentChats(token: string) {
  const response = await fetch(`${API}/bot${token}/getUpdates?limit=100`, { signal: AbortSignal.timeout(10000) });
  const result = await response.json() as {
    ok?: boolean; description?: string;
    result?: { message?: { chat?: { id?: number; type?: string; title?: string; first_name?: string; last_name?: string; username?: string } } }[];
  };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram HTTP ${response.status}`);
  const chats = new Map<string, { id: string; type: string; name: string }>();
  for (const u of result.result ?? []) {
    const c = u.message?.chat;
    if (!c?.id) continue;
    chats.set(String(c.id), {
      id: String(c.id), type: c.type ?? '',
      name: c.title ?? [c.first_name, c.last_name].filter(Boolean).join(' ') ?? c.username ?? String(c.id),
    });
  }
  return [...chats.values()];
}

export async function botInfo(token: string) {
  const response = await fetch(`${API}/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) });
  const result = await response.json() as { ok?: boolean; description?: string; result?: { username?: string; first_name?: string } };
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram HTTP ${response.status}`);
  return result.result ?? {};
}
