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

  'user.switcher': 'عرض باسم',
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

  'widget.comingSoon': 'هذا العنصر قيد الإنشاء.',
  'widget.kpis.title': 'الأرقام الرئيسية',
  'widget.kpis.description':
    'نسب الحل والتحويل والانقطاع مقارنة بالفترة السابقة. يجيب على: هل نحل أكثر من الأسبوع الماضي؟',
  'widget.dailyTrend.title': 'الاتجاه اليومي',
  'widget.dailyTrend.description':
    'حجم المكالمات ونسبة الحل يومًا بيوم خلال الربع كامل. يجيب على: متى حدث الخلل؟',
  'widget.intentTable.title': 'أنواع الطلبات',
  'widget.intentTable.description':
    'كل نوع طلب بحجمه ونسبة حله واتجاهه. يجيب على: ما الذي يجب إصلاحه أولًا؟',
  'widget.agentComparison.title': 'الوكلاء',
  'widget.agentComparison.description':
    'نسب التحويل والحل لكل وكيل جنبًا إلى جنب. يجيب على: أي وكيل يتعثر؟',
  'widget.failureReasons.title': 'أسباب الإخفاق',
  'widget.failureReasons.description':
    'أسباب تحويل المكالمات إلى موظف، وعدد أخطاء الأنظمة. يجيب على: لماذا تخفق المكالمات؟',
  'widget.peakHours.title': 'ساعات الذروة',
  'widget.peakHours.description':
    'حجم المكالمات حسب اليوم والساعة بتوقيت الرياض. يجيب على: متى تأتي المكالمات؟',
  'widget.move': 'تحريك {title}',
  'widget.menu': 'خيارات {title}',
  'widget.glossary': 'ماذا تعني هذه الأرقام',
  'widget.glossaryFor': 'ماذا تعني هذه الأرقام: {title}',
  'widget.moveEarlier': 'تحريك للأمام',
  'widget.moveLater': 'تحريك للخلف',
  'widget.width': 'العرض',
  'widget.width.4': 'الثلث',
  'widget.width.6': 'النصف',
  'widget.width.8': 'الثلثان',
  'widget.width.12': 'العرض الكامل',
  'widget.height': 'الارتفاع',
  'widget.height.S': 'قصير',
  'widget.height.M': 'متوسط',
  'widget.height.L': 'طويل',
  'widget.remove': 'إزالة',
  'widget.removed': 'تمت إزالة العنصر',
  'widget.undo': 'تراجع',
  'widget.position': 'العنصر {index} من {total}',
  'canvas.addWidget': 'إضافة عنصر',
  'canvas.catalogTitle': 'إضافة عنصر',
  'canvas.catalogEmpty': 'كل العناصر معروضة بالفعل.',
  'canvas.add': 'إضافة',
  'canvas.close': 'إغلاق',
  'canvas.resetLayout': 'إعادة ضبط التخطيط',
  'canvas.resetConfirm': 'إعادة التخطيط إلى العناصر والأحجام الافتراضية؟',
  'canvas.resetCancel': 'إلغاء',
  'canvas.resetConfirmAction': 'إعادة الضبط',
  'canvas.empty': 'لا توجد عناصر. أضف عنصرًا للبدء.',
  'dnd.instructions':
    'اضغط مسافة أو Enter لبدء تحريك العنصر. استخدم مفاتيح الأسهم للتحريك. اضغط مسافة أو Enter مرة أخرى للإفلات، أو Escape للإلغاء.',
  'dnd.onDragStart': 'تم التقاط {title}. موضعه {index} من {total}.',
  'dnd.onDragOver': 'تم نقل {title} إلى الموضع {index} من {total}.',
  'dnd.onDragEnd': 'تم إفلات {title} في الموضع {index} من {total}.',
  'dnd.onDragCancel': 'تم الإلغاء. عاد {title} إلى الموضع {index} من {total}.',
  'glossary.resolved': 'تم الحل',
  'glossary.resolved.def': 'أنهى الوكيل الذكي المكالمة دون تحويلها إلى موظف.',
  'glossary.transferred': 'تحويل لموظف',
  'glossary.transferred.def': 'حوّل الوكيل الذكي المكالمة إلى موظف بشري.',
  'glossary.abandoned': 'انقطاع المكالمة',
  'glossary.abandoned.def': 'أنهى العميل المكالمة قبل الوصول إلى نتيجة.',
  'glossary.resolutionRate': 'نسبة الحل',
  'glossary.resolutionRate.def':
    'المكالمات المحلولة مقسومة على كل مكالمات الفترة، بما فيها المنقطعة.',
  'glossary.transferRate': 'نسبة التحويل',
  'glossary.transferRate.def': 'المكالمات المحوّلة مقسومة على كل مكالمات الفترة.',
  'glossary.abandonmentRate': 'نسبة الانقطاع',
  'glossary.abandonmentRate.def': 'المكالمات المنقطعة مقسومة على كل مكالمات الفترة.',
  'glossary.toolError': 'خطأ في الأنظمة',
  'glossary.toolError.def': 'أعاد أحد الأنظمة الخلفية خطأ أثناء المكالمة.',
  'glossary.handoffReason': 'سبب التحويل',
  'glossary.handoffReason.def':
    'سبب تحويل المكالمة: طلب العميل، أو ثقة منخفضة، أو سياسة داخلية، أو خطأ في الأنظمة.',
  'glossary.previousPeriod': 'الفترة السابقة',
  'glossary.previousPeriod.def': 'العدد نفسه من الأيام السابقة مباشرة للفترة المختارة.',
  'glossary.points': 'نقاط مئوية',
  'glossary.points.def': 'الفرق المباشر بين نسبتين. من 70% إلى 72% هو +2 نقطة، وليس +2%.',

  'perf.readout':
    'احتُسبت خلال {worker} مللي ثانية (العامل) · {roundTrip} مللي ثانية ذهابًا وإيابًا',
}
