import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Student } from "../types";
import { differenceInDays, parseISO, addDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSimpleDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function expiryDate(s: Student): string {
  if (s.fin) return s.fin;
  if (s.inicio && s.pack && s.pack !== 31) {
    try { return addDays(parseISO(s.inicio), 30).toISOString().slice(0, 10); } catch { /* */ }
  }
  return '';
}

export function getStatusOf(s: Student) {
  if (!s.pack) return "none";

  const fin = expiryDate(s);
  if (fin) {
    const dif = differenceInDays(parseISO(fin), new Date());
    if (dif < 0) return "over";
    if (dif <= 7) return "crit";
    if (dif <= 14) return "warn";
  }

  if (s.pack === 31) return "ok";

  const remaining = Math.max(0, s.pack - (s.fechas?.length || 0));
  if (remaining === 0) return "over";
  if (remaining <= 2) return "crit";
  if (remaining <= 4) return "warn";
  return "ok";
}

export function getExpiryLabel(s: Student) {
  if (!s.pack) return { cls: "bg-warm-200 text-sage-600", txt: "Sin paquete" };

  const fin = expiryDate(s);
  const daysLeft = fin ? differenceInDays(parseISO(fin), new Date()) : null;
  const dateExpired = daysLeft !== null && daysLeft < 0;

  if (s.pack === 31) {
    if (!s.fin) return { cls: "bg-purple-100 text-purple-700", txt: "Ilimitado" };
    if (dateExpired) return { cls: "bg-red-100 text-red-600", txt: "Vencido" };
    if (daysLeft === 0) return { cls: "bg-red-100 text-red-600", txt: "Vence hoy" };
    return {
      cls: daysLeft! <= 7 ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700",
      txt: `Vence en ${daysLeft}d`
    };
  }

  if (dateExpired) return { cls: "bg-red-100 text-red-600", txt: "Vencido" };

  const remaining = Math.max(0, s.pack - (s.fechas?.length || 0));
  if (remaining === 0) return { cls: "bg-red-100 text-red-600", txt: "Agotado" };

  const txt = daysLeft !== null && daysLeft <= 7
    ? `${remaining} cls · ${daysLeft}d`
    : `${remaining} restantes`;

  return {
    cls: remaining <= 2 || (daysLeft !== null && daysLeft <= 7) ? "bg-red-100 text-red-600" : remaining <= 4 ? "bg-amber-100 text-amber-700" : "bg-sage-100 text-sage-700",
    txt
  };
}

export function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(x => x[0] || "").join("").toUpperCase();
}
