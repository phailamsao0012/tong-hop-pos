import { POS } from '@/lib/report-model';

/** Tên POS theo id (id lạ thì trả lại id). */
export const posName = (id: string) => POS.find((p) => p.id === id)?.name ?? id;
