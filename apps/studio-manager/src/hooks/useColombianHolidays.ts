import { useState, useEffect, useMemo } from 'react';

export function useColombianHolidays() {
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const map = new Map<string, string>();
    const currentYear = new Date().getFullYear();

    const loadYear = async (year: number) => {
      const cacheKey = `bhumi_holidays_co_${year}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          JSON.parse(cached).forEach((h: { date: string; localName: string }) => map.set(h.date, h.localName));
          return;
        }
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CO`);
        if (!res.ok) return;
        const data: { date: string; localName: string }[] = await res.json();
        localStorage.setItem(cacheKey, JSON.stringify(data));
        data.forEach(h => map.set(h.date, h.localName));
      } catch {
        // Fail silently — no holidays loaded, no classes blocked
      }
    };

    Promise.all([loadYear(currentYear), loadYear(currentYear + 1)]).then(() => {
      setHolidayMap(new Map(map));
    });
  }, []);

  // Stable references — only recreated when holidayMap changes (once, after fetch)
  const holidays = useMemo(() => new Set(holidayMap.keys()), [holidayMap]);
  const getHolidayName = useMemo(() => (date: string) => holidayMap.get(date), [holidayMap]);

  return { holidays, getHolidayName };
}
