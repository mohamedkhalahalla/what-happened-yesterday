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

  'filters.preset.lastWeek': 'الأسبوع الماضي',
  'filters.preset.last7Days': 'آخر 7 أيام',
  'filters.preset.last30Days': 'آخر 30 يومًا',
  'filters.preset.quarter': 'الربع كامل',
  'filters.preset.custom': 'مخصص',
  'filters.presetsLegend': 'الفترة الزمنية',
  'filters.from': 'من',
  'filters.to': 'إلى',

  'filters.agents': 'الوكلاء',
  'filters.intents': 'أنواع الطلبات',
  'filters.languages': 'اللغات',
  'filters.allOf': 'كل {dimension}',
  'filters.nSelected': 'تم اختيار {count}',
  'filters.selectAll': 'اختيار الكل',
  'filters.clear': 'مسح',
  'filters.clearAll': 'مسح الكل',
  'filters.searchIntents': 'ابحث في أنواع الطلبات',
  'filters.noMatches': 'لا توجد نتائج',
  'filters.activeFilters': 'عوامل التصفية النشطة',
  'filters.remove': 'إزالة {label}',

  'filters.compare': 'المقارنة بالفترة السابقة',
  'filters.comparing': 'مقارنة {current} بـ {previous}',
  'filters.comparisonOff': 'عرض {current} بدون مقارنة',
  'filters.noComparison': 'لا تتوفر بيانات للمقارنة',
  'filters.noComparisonWhy': 'الفترة السابقة لـ {current} خارج نطاق هذه البيانات.',
  'filters.partialComparison': 'مقارنة جزئية',
  'filters.partialComparisonWhy': 'جزء فقط من {previous} متوفر في هذه البيانات.',

  'filters.correctedNotice': 'بعض عوامل التصفية في الرابط كانت غير صالحة وتمت إعادة ضبطها',
  'filters.dismiss': 'إغلاق',

  'state.updating': 'جارٍ التحديث…',

  'kpi.deltaIncreased': 'ارتفع بمقدار {delta}',
  'kpi.deltaDecreased': 'انخفض بمقدار {delta}',
  'kpi.deltaUnchanged': 'دون تغيير',

  'perf.readout':
    'احتُسبت خلال {worker} مللي ثانية (العامل) · {roundTrip} مللي ثانية ذهابًا وإيابًا',
}
