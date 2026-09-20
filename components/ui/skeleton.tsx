import { cn } from '@/lib/utils';

// Xương lấp lánh (shimmer 1,3 s) theo token --skel-1 / --skel-2; tự tắt hoạt ảnh khi giảm chuyển động (globals.css).
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skel rounded-md', className)}
      {...props}
    />
  );
}

export { Skeleton };
