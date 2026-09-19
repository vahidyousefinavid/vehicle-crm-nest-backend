/**
 * Every capability the panel can hand to an admin. The frontend renders the
 * same list, so a key added here shows up in the permission editor with no
 * further wiring — but a key removed here silently drops the grant, so retire
 * one only together with the endpoint it guards.
 */
export const PERMISSION_GROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'داشبورد و گزارش',
    items: [
      { key: 'dashboard.view', label: 'مشاهده داشبورد' },
      { key: 'activities.view', label: 'مشاهده فعالیت‌ها' },
    ],
  },
  {
    group: 'کاربران',
    items: [
      { key: 'users.view', label: 'مشاهده کاربران و جزئیات' },
      { key: 'users.edit', label: 'ویرایش اطلاعات کاربر' },
      { key: 'users.block', label: 'مسدودسازی / رفع مسدودی' },
    ],
  },
  {
    group: 'خدمات‌دهندگان',
    items: [
      { key: 'providers.view', label: 'مشاهده خدمات‌دهندگان' },
      { key: 'services.view', label: 'مشاهده خدمات ثبت‌شده' },
    ],
  },
  {
    group: 'کالا و کاتالوگ',
    items: [
      { key: 'products.view', label: 'مشاهده محصولات فروشندگان' },
      { key: 'products.edit', label: 'فعال/غیرفعال کردن محصول' },
      { key: 'catalog.view', label: 'مشاهده کاتالوگ آماده' },
      { key: 'catalog.edit', label: 'افزودن، ویرایش و حذف در کاتالوگ آماده' },
    ],
  },
  {
    group: 'عملیات',
    items: [
      { key: 'vehicles.view', label: 'مشاهده خودروها' },
      { key: 'appointments.view', label: 'مشاهده نوبت‌ها' },
      { key: 'payments.view', label: 'مشاهده پرداخت‌ها' },
      { key: 'reviews.view', label: 'مشاهده نظرات' },
      { key: 'reviews.delete', label: 'حذف نظر' },
      { key: 'organizations.view', label: 'مشاهده سازمان‌ها' },
    ],
  },
  {
    group: 'مدیران',
    items: [
      { key: 'admins.view', label: 'مشاهده فهرست مدیران' },
      { key: 'admins.manage', label: 'افزودن، حذف و تغییر دسترسی مدیران' },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);

/** A sensible starting grant for a newly created admin: read-only everywhere. */
export const READ_ONLY_PERMISSIONS: string[] = ALL_PERMISSIONS.filter((k) => k.endsWith('.view'));

export function isValidPermission(key: string): boolean {
  return ALL_PERMISSIONS.includes(key);
}
