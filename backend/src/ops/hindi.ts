// Hindi and English wording for advisories: site names in Devanagari and spoken-style time phrases.

/** Devanagari names the way Udaipur's signboards and guides write them */
export const HINDI_NAMES: Record<string, string> = {
  'city-palace': 'सिटी पैलेस',
  'jagdish-temple': 'जगदीश मंदिर',
  'bagore-ki-haveli': 'बागोर की हवेली',
  'gangaur-ghat': 'गणगौर घाट',
  'ambrai-ghat': 'अंबराई घाट',
  'pichola-boat': 'पिछोला झील की नौका सवारी',
  'saheliyon-ki-bari': 'सहेलियों की बाड़ी',
  sajjangarh: 'सज्जनगढ़ मानसून पैलेस',
  'fateh-sagar': 'फतेह सागर झील',
  'karni-mata': 'करणी माता रोपवे',
  'hathi-pol': 'हाथी पोल बाज़ार',
  'neemach-mata': 'नीमच माता पहाड़ी',
  'moti-magri': 'मोती मगरी',
  shilpgram: 'शिल्पग्राम',
  'lok-kala-mandal': 'भारतीय लोक कला मंडल',
  'ahar-cenotaphs': 'आहड़ की छतरियाँ',
  'gulab-bagh': 'गुलाब बाग',
  'vintage-cars': 'विंटेज कार संग्रहालय',
  'badi-lake': 'बड़ी झील',
};

export const hindiName = (siteId: string, fallback: string) => HINDI_NAMES[siteId] ?? fallback;

export const DEVANAGARI = /[ऀ-ॿ]/;

const clock = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24;
  return { hour, h12: hour % 12 || 12, minute: minutes % 60, pm: hour >= 12 };
};
const number = (c: ReturnType<typeof clock>) => `${c.h12}${c.minute ? `:${String(c.minute).padStart(2, '0')}` : ''}`;

/** "10 AM", "9:30 AM", "12 PM" */
export function enTime(minutes: number) {
  const c = clock(minutes);
  return `${number(c)} ${c.pm ? 'PM' : 'AM'}`;
}

/** "10 AM–12 PM", or "10–11 AM" when both ends share AM or PM */
export function enWindow(startMinutes: number, endMinutes: number) {
  const a = clock(startMinutes);
  const b = clock(endMinutes);
  return a.pm === b.pm ? `${number(a)}–${number(b)} ${a.pm ? 'PM' : 'AM'}` : `${enTime(startMinutes)}–${enTime(endMinutes)}`;
}

/** Part of the day as people say it in Hindi */
function period(hour: number) {
  if (hour >= 4 && hour < 12) return 'सुबह';
  if (hour >= 12 && hour < 16) return 'दोपहर';
  if (hour >= 16 && hour < 20) return 'शाम';
  return 'रात';
}

/** "सुबह 9:30 बजे" */
export function hiTime(minutes: number) {
  const c = clock(minutes);
  return `${period(c.hour)} ${number(c)} बजे`;
}

/** "सुबह 10 से दोपहर 12 बजे तक", or "दोपहर 12 से 2 बजे तक" within one part of the day */
export function hiWindow(startMinutes: number, endMinutes: number) {
  const a = clock(startMinutes);
  const b = clock(endMinutes);
  return period(a.hour) === period(b.hour)
    ? `${period(a.hour)} ${number(a)} से ${number(b)} बजे तक`
    : `${period(a.hour)} ${number(a)} से ${period(b.hour)} ${number(b)} बजे तक`;
}
