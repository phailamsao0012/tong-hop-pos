'use client';

// Cấu hình › Con vật chờ tải (plan mục 4, QA A5): Ngẫu nhiên (mặc định) / luôn một con / Tắt. Lưu trên máy này (localStorage), không ghi D1.
import type { ComponentType, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { SegmentedControl } from '../ui-kit';
import { SCENES, SCENE_LABELS, readSetting, subscribeSetting, writeSetting, type CritterSetting } from './pick';

type SurfaceComponent = ComponentType<{ title: string; description?: string; children: ReactNode; action?: ReactNode }>;

const OPTIONS: { value: CritterSetting; label: string }[] = [
  { value: 'random', label: 'Ngẫu nhiên' },
  ...SCENES.map((s) => ({ value: s as CritterSetting, label: SCENE_LABELS[s] })),
  { value: 'off', label: 'Tắt' },
];

export function CritterSettingPanel({ Surface, demo }: { Surface: SurfaceComponent; demo?: boolean }) {
  const value = useSyncExternalStore(subscribeSetting, readSetting, () => 'random' as CritterSetting);
  return (
    <Surface title="Con vật chờ tải" description="Khi trang chưa có số, ô số liệu hiện một con vật đang làm việc. Chọn ở đây chỉ áp dụng trên máy này.">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<CritterSetting> ariaLabel="Con vật chờ tải" size="sm" className="overflow-x-auto" value={value} onChange={writeSetting} options={OPTIONS} />
        {demo && <button type="button" className="text-[12.5px] text-primary underline-offset-2 hover:underline" onClick={() => window.location.assign('/?xem-thu=con-vat')}>Mở trang xem thử</button>}
      </div>
    </Surface>
  );
}
