/**
 * Lookup tables for the columnar dataset.
 *
 * The **array index is the stored code**: `language[i] === 1` means
 * `LANGUAGES[1]`. Never reorder these arrays without regenerating the data —
 * the codes are positional, not symbolic.
 */

import type { HandoffReason, Language, Outcome } from './types'

/** Stored in the `language` column as its index here. */
export const LANGUAGES = ['ar', 'en', 'mixed'] as const satisfies readonly Language[]

/** Stored in the `outcome` column as its index here. */
export const OUTCOMES = [
  'resolved',
  'transferred',
  'abandoned',
] as const satisfies readonly Outcome[]

/** Stored in the `handoff` column as its index here (255 means "no handoff"). */
export const HANDOFF_REASONS = [
  'customer_request',
  'low_confidence',
  'policy',
  'tool_error',
] as const satisfies readonly HandoffReason[]

export type Agent = {
  id: string
  nameAr: string
  nameEn: string
}

/** The eight AI agent personas. Stored in the `agent` column as its index here. */
export const AGENTS: readonly Agent[] = [
  { id: 'agent_01', nameAr: 'سارة', nameEn: 'Sara' },
  { id: 'agent_02', nameAr: 'فهد', nameEn: 'Fahad' },
  { id: 'agent_03', nameAr: 'نورة', nameEn: 'Noura' },
  { id: 'agent_04', nameAr: 'خالد', nameEn: 'Khalid' },
  { id: 'agent_05', nameAr: 'ريم', nameEn: 'Reem' },
  { id: 'agent_06', nameAr: 'ماجد', nameEn: 'Majed' },
  { id: 'agent_07', nameAr: 'لمى', nameEn: 'Lama' },
  { id: 'agent_08', nameAr: 'تركي', nameEn: 'Turki' },
]

export type Intent = {
  id: string
  labelAr: string
  labelEn: string
  /** Relative frequency; only the ratios matter, the generator normalises. */
  weight: number
  /** Probability the AI agent resolves it unaided, before trend/language/tool adjustments. */
  baseResolve: number
  /** True if handling it calls a backend system (billing, provisioning, …). */
  toolBacked: boolean
}

/**
 * The 25 intents a Saudi telecom's front line actually sees.
 *
 * `baseResolve` follows the obvious shape: simple informational lookups are
 * easy (0.83–0.88), disputes, cancellations and hard technical faults are not
 * (0.60–0.68). `toolBacked` marks the intents that hit a backend system, which
 * is what makes them vulnerable to the bad-deploy anomaly.
 */
export const INTENTS: readonly Intent[] = [
  // Billing and payments
  {
    id: 'bill_inquiry',
    labelAr: 'استفسار عن الفاتورة',
    labelEn: 'Bill inquiry',
    weight: 95,
    baseResolve: 0.86,
    toolBacked: true,
  },
  {
    id: 'bill_dispute',
    labelAr: 'اعتراض على الفاتورة',
    labelEn: 'Bill dispute',
    weight: 45,
    baseResolve: 0.62,
    toolBacked: true,
  },
  {
    id: 'payment_issue',
    labelAr: 'مشكلة في السداد',
    labelEn: 'Payment issue',
    weight: 60,
    baseResolve: 0.7,
    toolBacked: true,
  },
  {
    id: 'balance_check',
    labelAr: 'الاستعلام عن الرصيد',
    labelEn: 'Balance check',
    weight: 85,
    baseResolve: 0.88,
    toolBacked: true,
  },
  {
    id: 'recharge_failed',
    labelAr: 'فشل تعبئة الرصيد',
    labelEn: 'Recharge failed',
    weight: 50,
    baseResolve: 0.66,
    toolBacked: true,
  },
  // Packages and bundles
  {
    id: 'package_change',
    labelAr: 'تغيير الباقة',
    labelEn: 'Package change',
    weight: 60,
    baseResolve: 0.78,
    toolBacked: true,
  },
  {
    id: 'package_inquiry',
    labelAr: 'استفسار عن الباقات',
    labelEn: 'Package inquiry',
    weight: 70,
    baseResolve: 0.87,
    toolBacked: true,
  },
  {
    id: 'data_bundle_purchase',
    labelAr: 'شراء باقة بيانات',
    labelEn: 'Data bundle purchase',
    weight: 65,
    baseResolve: 0.84,
    toolBacked: true,
  },
  // Travel and voice
  {
    id: 'roaming',
    labelAr: 'التجوال الدولي',
    labelEn: 'Roaming',
    weight: 45,
    baseResolve: 0.82,
    toolBacked: true,
  },
  {
    id: 'international_calling',
    labelAr: 'الاتصال الدولي',
    labelEn: 'International calling',
    weight: 30,
    baseResolve: 0.8,
    toolBacked: false,
  },
  // SIM and number lifecycle
  {
    id: 'sim_replacement',
    labelAr: 'استبدال الشريحة',
    labelEn: 'SIM replacement',
    weight: 40,
    baseResolve: 0.74,
    toolBacked: true,
  },
  {
    id: 'esim_activation',
    labelAr: 'تفعيل الشريحة الإلكترونية',
    labelEn: 'eSIM activation',
    weight: 35,
    baseResolve: 0.72,
    toolBacked: true,
  },
  {
    id: 'number_porting',
    labelAr: 'نقل الرقم',
    labelEn: 'Number porting',
    weight: 25,
    baseResolve: 0.64,
    toolBacked: false,
  },
  // Network faults
  {
    id: 'network_coverage',
    labelAr: 'تغطية الشبكة',
    labelEn: 'Network coverage',
    weight: 35,
    baseResolve: 0.68,
    toolBacked: false,
  },
  {
    id: 'slow_internet',
    labelAr: 'بطء الإنترنت',
    labelEn: 'Slow internet',
    weight: 55,
    baseResolve: 0.63,
    toolBacked: false,
  },
  {
    id: 'no_service',
    labelAr: 'انقطاع الخدمة',
    labelEn: 'No service',
    weight: 40,
    baseResolve: 0.61,
    toolBacked: false,
  },
  // Contracts and account admin
  {
    id: 'device_installment',
    labelAr: 'تقسيط جهاز',
    labelEn: 'Device installment',
    weight: 30,
    baseResolve: 0.73,
    toolBacked: false,
  },
  {
    id: 'contract_termination',
    labelAr: 'إلغاء الاشتراك',
    labelEn: 'Contract termination',
    weight: 25,
    baseResolve: 0.6,
    toolBacked: false,
  },
  {
    id: 'address_update',
    labelAr: 'تحديث العنوان',
    labelEn: 'Address update',
    weight: 22,
    baseResolve: 0.85,
    toolBacked: false,
  },
  {
    id: 'id_verification',
    labelAr: 'توثيق الهوية',
    labelEn: 'ID verification',
    weight: 28,
    baseResolve: 0.76,
    toolBacked: false,
  },
  {
    id: 'loyalty_points',
    labelAr: 'نقاط الولاء',
    labelEn: 'Loyalty points',
    weight: 25,
    baseResolve: 0.86,
    toolBacked: false,
  },
  {
    id: 'complaint_escalation',
    labelAr: 'تصعيد شكوى',
    labelEn: 'Complaint escalation',
    weight: 20,
    baseResolve: 0.6,
    toolBacked: false,
  },
  // Fixed line and retail
  {
    id: 'fiber_installation',
    labelAr: 'تركيب الألياف الضوئية',
    labelEn: 'Fiber installation',
    weight: 25,
    baseResolve: 0.65,
    toolBacked: false,
  },
  {
    id: 'appointment_booking',
    labelAr: 'حجز موعد',
    labelEn: 'Appointment booking',
    weight: 22,
    baseResolve: 0.83,
    toolBacked: false,
  },
  {
    id: 'store_locator',
    labelAr: 'أقرب فرع',
    labelEn: 'Store locator',
    weight: 20,
    baseResolve: 0.88,
    toolBacked: false,
  },
]

/** Index of an intent id in {@link INTENTS}; -1 if unknown. */
export function intentIndex(id: string): number {
  return INTENTS.findIndex((it) => it.id === id)
}

/** Index of an agent id in {@link AGENTS}; -1 if unknown. */
export function agentIndex(id: string): number {
  return AGENTS.findIndex((a) => a.id === id)
}
