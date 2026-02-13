import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile based on a max-width media query.
 * @param breakpoint The max-width in pixels (default: 768)
 * @returns boolean
 */
export function useMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    
    const onChange = () => {
      setIsMobile(mql.matches);
    };

    // Set initial value
    setIsMobile(mql.matches);

    // Listen for changes
    mql.addEventListener('change', onChange);
    
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, [breakpoint]);

  return isMobile;
}
