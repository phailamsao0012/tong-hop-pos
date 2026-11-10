'use client';
import type { ReactNode } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { StatusChip, dmy, timeOnly } from './ui-kit';
import { STATUS_LABELS, type Status } from '@/lib/zalo/zalo-work';
export const statusTones = { moi: 'gray', da_nhan: 'blue', dang_lam: 'teal', xong: 'green', chua_xong: 'orange', huy: 'gray' } as const;
export function TaskChip({ status }: { status: Status }) { return <StatusChip tone={statusTones[status]}>{STATUS_LABELS[status]}</StatusChip>; }
export function workDay(day: string) { return dmy(day) + (day.slice(0, 4) !== new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 4) ? `/${day.slice(0, 4)}` : ''); }
export function workDate(iso: string | null | undefined) { return iso ? `${workDay(new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10))} ${timeOnly(iso)}` : '—'; }
export function ConfirmWork({ title, open, onClose, onConfirm, busy }: { title: string; open: boolean; onClose: () => void; onConfirm: () => void; busy: boolean }) { return <AlertDialog open={open} onOpenChange={v => { if (!v) onClose(); }}><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>Thao tác này sẽ cập nhật và gửi thông báo Zalo theo cài đặt hiện tại.</AlertDialogDescription><div className="flex justify-end gap-2"><AlertDialogCancel disabled={busy}>Quay lại</AlertDialogCancel><button className="btn sm text-red-600" disabled={busy} onClick={onConfirm}>Xác nhận</button></div></AlertDialogContent></AlertDialog>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1 text-sm">{label}{children}</label>; }
export const hours = (from: number, to: number, step: number) => Array.from({ length: (to - from) * 60 / step + 1 }, (_, i) => { const n = from * 60 + i * step; return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; });
