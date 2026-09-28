/**
 * Arabic UI strings — the default language.
 *
 * Typed as `Record<MessageKey, string>`, so a missing key is a compile error
 * and an unknown key is an excess-property error. See `messages.en.ts`.
 */

import type { MessageKey } from './messages.en'

export const ar: Record<MessageKey, string> = {
  'app.title': 'ماذا حدث أمس؟',
  'app.dataAsOf': 'البيانات حتى {date}',

  'lang.toggle': 'English',
  'lang.toggleAria': 'التبديل إلى الإنجليزية',

  'user.switcher': 'تسجيل الدخول باسم',
  'user.abdullah.name': 'عبدالله',
  'user.abdullah.role': 'مدير العناية بالعملاء',
  'user.vp.name': 'ليلى',
  'user.vp.role': 'نائب رئيس تجربة العملاء',

  'kpi.resolutionRate': 'نسبة الحل',
  'kpi.transferRate': 'نسبة التحويل',
  'kpi.abandonmentRate': 'نسبة الانقطاع',
  'kpi.calls': 'المكالمات',
  'kpi.vsPrevious': 'مقارنة بالفترة السابقة',

  'outcome.breakdown': 'توزيع نتائج المكالمات',

  'state.loading': 'جارٍ التحميل…',
  'state.empty': 'لا توجد مكالمات في هذه الفترة',
  'state.error': 'تعذّر تحميل هذا الجزء',
  'state.retry': 'إعادة المحاولة',

  'perf.readout':
    'احتُسبت خلال {worker} مللي ثانية (العامل) · {roundTrip} مللي ثانية ذهابًا وإيابًا',
}
