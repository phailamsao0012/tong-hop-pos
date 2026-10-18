'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';

export type SearchState = { text: string; filters: Record<string, string>; groupBy: string };
export type SearchFilter = { key: string; label: string; options: { value: string; label: string }[]; multiple?: boolean };
export function searchParams(values: Record<string, string | number | undefined>) {
  return new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string | number] => entry[1] !== undefined).map(([key, value]) => [key, String(value)]));
}
export function groupRows<T>(rows: T[], keyOf?: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const key = keyOf ? keyOf(row) : ''; const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  return [...groups].map(([key, items]) => ({ key, items }));
}
export function GroupedRows<T>({ rows, keyOf, columns, summary, children }: { rows: T[]; keyOf?: (row: T) => string; columns: number; summary: (rows: T[]) => ReactNode; children: (row: T, index: number) => ReactNode }) {
  const indices = new Map(rows.map((row, index) => [row, index]));
  return <>{groupRows(rows, keyOf).map(({ key, items }) => <Fragment key={key}>{keyOf && <tr className="bg-surface-2"><th colSpan={columns} scope="rowgroup" className="whitespace-normal">{key || 'Chưa có'} · {summary(items)} · trên trang đã tải</th></tr>}{items.map(row => children(row, indices.get(row)!))}</Fragment>)}</>;
}
export function readSearchState(value: unknown, filters: SearchFilter[], groups: { value: string }[]): SearchState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<SearchState>;
  if (typeof v.text !== 'string' || typeof v.groupBy !== 'string' || !v.filters || typeof v.filters !== 'object') return null;
  const clean: Record<string, string> = {};
  for (const filter of filters) { const value = v.filters[filter.key]; clean[filter.key] = typeof value === 'string' ? value.split(',').filter(x => filter.options.some(o => o.value === x)).join(',') : ''; }
  return { text: v.text, filters: clean, groupBy: groups.some(g => g.value === v.groupBy) ? v.groupBy : '' };
}
type Favorite = { id: string; title: string; config: { type: string; state: unknown } };
export function SearchBar({ pageKey, value, onChange, filters, groups, placeholder, children, onTextChange, onSearch, onGroupChange }: { pageKey: string; value: SearchState; onChange: (value: SearchState) => void; filters: SearchFilter[]; groups: { value: string; label: string }[]; placeholder: string; children?: ReactNode; onTextChange?: (text: string) => void; onSearch?: () => void; onGroupChange?: (group: string) => void }) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const type = 'search:' + pageKey;
  useEffect(() => { const controller = new AbortController(); void fetch('/api/presets', { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error('Không tải được Yêu thích.'); const rows = await r.json() as Favorite[]; setFavorites(rows.filter(row => row.config?.type === type)); }).catch(() => { if (!controller.signal.aborted) setError('Không tải được Yêu thích.'); }); return () => controller.abort(); }, [type]);
  const toggle = (filter: SearchFilter, option: string) => {
    const selected = (value.filters[filter.key] || '').split(',').filter(Boolean);
    const next = selected.includes(option) ? selected.filter(v => v !== option) : filter.multiple ? [...selected, option] : [option];
    onChange({ ...value, filters: { ...value.filters, [filter.key]: next.join(',') } });
  };
  return <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-3">
    <div className="flex flex-wrap items-center gap-2"><search className="min-w-0 flex-1 basis-64"><form className="flex min-w-0 flex-1 basis-64 gap-2" onSubmit={e => { e.preventDefault(); if (onSearch) onSearch(); else onChange(value); }}><input className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" aria-label={placeholder} placeholder={placeholder} value={value.text} onChange={e => onTextChange ? onTextChange(e.target.value) : onChange({ ...value, text: e.target.value })} /><button className="btn sm" type="submit">Tìm</button>{value.text && <button type="button" className="btn sm" aria-label="Xóa ô tìm" onClick={() => onChange({ ...value, text: '' })}>×</button>}</form></search>
      <details><summary className="btn sm cursor-pointer">Bộ lọc</summary><div className="flex max-h-72 flex-wrap gap-3 overflow-auto py-2">{filters.map(filter => <fieldset key={filter.key} className="min-w-0"><legend className="text-xs text-ink-3">{filter.label}</legend><div className="flex flex-wrap gap-1">{filter.options.map(option => <button key={option.value} type="button" aria-pressed={(value.filters[filter.key] || '').split(',').includes(option.value)} className={"btn sm " + ((value.filters[filter.key] || '').split(',').includes(option.value) ? 'border-primary bg-tint text-ink' : '')} onClick={() => toggle(filter, option.value)}>{option.label}</button>)}</div></fieldset>)}</div></details>
      <label className="text-xs text-ink-3">Nhóm theo <select aria-label="Nhóm theo" className="max-w-full rounded-lg border border-line bg-surface p-2 text-ink" value={value.groupBy} onChange={e => onGroupChange ? onGroupChange(e.target.value) : onChange({ ...value, groupBy: e.target.value })}><option value="">Không nhóm</option>{groups.map(group => <option key={group.value} value={group.value}>{group.label}</option>)}</select></label>
      <details><summary className="btn sm cursor-pointer">Yêu thích</summary><div className="space-y-2 py-2">{favorites.map(favorite => <button key={favorite.id} type="button" className="btn sm" onClick={() => { const state = readSearchState(favorite.config.state, filters, groups); if (state) onChange(state); else setError('Bộ lọc đã lưu không hợp lệ.'); }}>{favorite.title}</button>)}<form className="flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); if (!name.trim() || saving) return; setSaving(true); setError(''); try { const r = await fetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name.trim(), config: { type, state: value } }) }); if (!r.ok) throw new Error(); const saved = await r.json() as Favorite; setFavorites(rows => [saved, ...rows]); setName(''); } catch { setError('Không lưu được Yêu thích.'); } finally { setSaving(false); } }}><input aria-label="Tên Yêu thích" maxLength={80} required className="min-w-0 rounded-lg border border-line bg-surface p-2 text-sm text-ink" value={name} onChange={e => setName(e.target.value)} /><button type="submit" className="btn sm" disabled={saving}>Lưu bộ lọc đang dùng</button></form></div></details>
    </div>
    <div className="flex flex-wrap gap-1">{filters.flatMap(filter => (value.filters[filter.key] || '').split(',').filter(Boolean).map(selected => <button key={filter.key + selected} type="button" className="btn sm" aria-label={'Bỏ ' + filter.label + ': ' + (filter.options.find(o => o.value === selected)?.label ?? selected)} onClick={() => toggle(filter, selected)}>{filter.label}: {filter.options.find(o => o.value === selected)?.label ?? selected} ×</button>))}</div>
    {children}{error && <p role="alert" className="text-sm text-ink-2">{error}</p>}
  </div>;
}
