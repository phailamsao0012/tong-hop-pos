'use client';

import { useEffect, useState } from 'react';

/** true khi cửa sổ khớp media query (ví dụ '(min-width: 1280px)'); mặc định false khi render phía máy chủ. */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}
