/** Malá písmena bez diakritiky – pro porovnávání ("Kancelář" → "kancelar"). */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
