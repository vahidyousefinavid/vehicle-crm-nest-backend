import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * The full picture of one account: everything the platform holds about them,
 * assembled per role. Written as raw SQL against the shared database rather
 * than through repositories because most of it (sales, workshop expenses,
 * invoices) belongs to tables this service deliberately does not model.
 */
@Injectable()
export class UserDetailService {
  constructor(private ds: DataSource) {}

  async detail(id: string) {
    const [user] = await this.ds.query(
      `SELECT id, phone, name, role, active, "workshopName", "workshopAddress",
              "workshopLat", "workshopLng", "createdAt"
       FROM users WHERE id = $1`,
      [id],
    );
    if (!user) throw new NotFoundException('کاربر پیدا نشد');

    const [common, roleData] = await Promise.all([
      this.commonSections(id),
      user.role === 'owner' ? this.ownerSections(id)
        : user.role === 'mechanic' ? this.mechanicSections(id)
        : user.role === 'seller' ? this.sellerSections(id)
        : this.adminSections(id),
    ]);

    const payload = { user, ...common, ...roleData } as any;
    payload.timeline = this.buildTimeline(payload);
    return payload;
  }

  /* ── shared by every role ───────────────────────────────────────────── */

  private async commonSections(id: string) {
    const [notifications, messageCount, organizations] = await Promise.all([
      this.ds.query(
        `SELECT id, type, status, title, body, read, "createdAt"
         FROM notifications WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20`, [id]),
      this.ds.query(
        `SELECT COUNT(*)::int AS count FROM messages WHERE "senderId" = $1 OR "mechanicId" = $1`, [id]),
      this.ds.query(
        `SELECT o.id, o.name, o."createdAt",
                CASE WHEN o."ownerId" = $1 THEN 'owner' ELSE COALESCE(m.role, 'member') END AS "membership",
                (SELECT COUNT(*)::int FROM organization_members om WHERE om."organizationId" = o.id) AS "memberCount"
         FROM organizations o
         LEFT JOIN organization_members m ON m."organizationId" = o.id AND m."userId" = $1
         WHERE o."ownerId" = $1 OR m."userId" = $1
         ORDER BY o."createdAt" DESC`, [id]),
    ]);

    return {
      notifications,
      messageCount: messageCount[0]?.count ?? 0,
      organizations,
    };
  }

  /* ── owner ──────────────────────────────────────────────────────────── */

  private async ownerSections(id: string) {
    // vehicles.linkedOwnerId is varchar in the shared schema while vehicles.userId
    // is uuid, so the same parameter has to be cast per column.
    const vehicleScope = `(v."userId" = $1::uuid OR v."linkedOwnerId" = $1::text)`;

    const [vehicles, serviceRecords, appointments, documents, reminders, fuelLogs, payments, invoices, reviews, totals] =
      await Promise.all([
        this.ds.query(
          `SELECT v.id, v.make, v.model, v.year, v."plateNumber", v.vin, v.color, v."currentMileage",
                  v."fuelType", v.transmission, v."linkStatus", v."insuranceExpiry", v."technicalExpiry",
                  v."registrationExpiry", v."createdAt",
                  (SELECT COUNT(*)::int FROM service_records sr WHERE sr."vehicleId" = v.id) AS "serviceCount",
                  (SELECT COUNT(*)::int FROM vehicle_documents d WHERE d."vehicleId" = v.id) AS "documentCount",
                  (SELECT COUNT(*)::int FROM vehicle_access va WHERE va."vehicleId" = v.id AND va.revoked = false) AS "mechanicCount"
           FROM vehicles v WHERE ${vehicleScope} ORDER BY v."createdAt" DESC`, [id]),

        this.ds.query(
          `SELECT sr.id, sr."serviceType", sr."serviceDate", sr.mileage, sr.cost, sr.workshop, sr.description,
                  sr."createdAt", v.make, v.model, v."plateNumber"
           FROM service_records sr JOIN vehicles v ON v.id = sr."vehicleId"
           WHERE ${vehicleScope} ORDER BY sr."serviceDate" DESC NULLS LAST, sr."createdAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT a.id, a."requestedAt", a."serviceType", a.status, a.mode, a.address, a.notes, a."createdAt",
                  v.make, v.model, v."plateNumber",
                  m.name AS "mechanicName", m."workshopName" AS "mechanicWorkshop", m.phone AS "mechanicPhone"
           FROM appointments a
           LEFT JOIN vehicles v ON v.id = a."vehicleId"
           LEFT JOIN users m ON m.id = a."mechanicId"
           WHERE a."ownerId" = $1 ORDER BY a."requestedAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT d.id, d.type, d.title, d."issueDate", d."expiryDate", d.notes, d."createdAt",
                  v.make, v.model, v."plateNumber"
           FROM vehicle_documents d JOIN vehicles v ON v.id = d."vehicleId"
           WHERE ${vehicleScope} ORDER BY d."expiryDate" DESC NULLS LAST LIMIT 30`, [id]),

        this.ds.query(
          `SELECT r.id, r.title, r.description, r."dueMileage", r."dueDate", r."isCompleted", r.priority, r."createdAt",
                  v.make, v.model, v."plateNumber"
           FROM reminders r JOIN vehicles v ON v.id = r."vehicleId"
           WHERE ${vehicleScope} ORDER BY r."isCompleted" ASC, r."dueDate" ASC NULLS LAST LIMIT 30`, [id]),

        this.ds.query(
          `SELECT f.id, f.date, f.liters, f.cost, f.mileage, f.station, f."isFullTank", f."createdAt",
                  v.make, v.model, v."plateNumber"
           FROM fuel_logs f JOIN vehicles v ON v.id = f."vehicleId"
           WHERE ${vehicleScope} ORDER BY f.date DESC NULLS LAST LIMIT 30`, [id]),

        this.ds.query(
          `SELECT p.id, p.amount, p.status, p."refId", p."createdAt", v.make, v.model, v."plateNumber"
           FROM payments p LEFT JOIN vehicles v ON v.id::text = p."vehicleId"
           WHERE p."vehicleId" IN (SELECT v2.id::text FROM vehicles v2 WHERE v2."userId" = $1::uuid OR v2."linkedOwnerId" = $1::text)
           ORDER BY p."createdAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT i.id, i.number, i.status, i.discount, i."paidAmount", i."taxPercent", i."createdAt",
                  sr."serviceType", v.make, v.model, v."plateNumber",
                  COALESCE((SELECT SUM(ii.quantity * ii."unitPrice") FROM invoice_items ii WHERE ii."invoiceId" = i.id), 0)::float AS "itemsTotal"
           FROM invoices i
           JOIN service_records sr ON sr.id = i."serviceRecordId"
           JOIN vehicles v ON v.id = sr."vehicleId"
           WHERE ${vehicleScope} ORDER BY i."createdAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT r.id, r.rating, r.comment, r."createdAt",
                  m.name AS "mechanicName", m."workshopName" AS "mechanicWorkshop"
           FROM reviews r LEFT JOIN users m ON m.id = r."mechanicId"
           WHERE r."ownerId" = $1 ORDER BY r."createdAt" DESC LIMIT 20`, [id]),

        this.ds.query(
          `SELECT
             (SELECT COUNT(*)::int FROM vehicles v WHERE ${vehicleScope}) AS "vehicleCount",
             (SELECT COUNT(*)::int FROM appointments a WHERE a."ownerId" = $1) AS "appointmentCount",
             (SELECT COUNT(*)::int FROM service_records sr JOIN vehicles v ON v.id = sr."vehicleId" WHERE ${vehicleScope}) AS "serviceRecordCount",
             (SELECT COALESCE(SUM(sr.cost), 0)::float FROM service_records sr JOIN vehicles v ON v.id = sr."vehicleId" WHERE ${vehicleScope}) AS "serviceSpend",
             (SELECT COALESCE(SUM(p.amount), 0)::float FROM payments p WHERE p.status = 'success'
                AND p."vehicleId" IN (SELECT v2.id::text FROM vehicles v2 WHERE v2."userId" = $1::uuid OR v2."linkedOwnerId" = $1::text)) AS "paidTotal",
             (SELECT COALESCE(SUM(f.cost), 0)::float FROM fuel_logs f JOIN vehicles v ON v.id = f."vehicleId" WHERE ${vehicleScope}) AS "fuelSpend",
             (SELECT COUNT(*)::int FROM reminders r JOIN vehicles v ON v.id = r."vehicleId" WHERE ${vehicleScope} AND r."isCompleted" = false) AS "openReminders"`,
          [id]),
      ]);

    return {
      stats: totals[0] ?? {},
      vehicles, serviceRecords, appointments, documents, reminders, fuelLogs, payments, invoices, reviews,
    };
  }

  /* ── mechanic / service provider ────────────────────────────────────── */

  private async mechanicSections(id: string) {
    const [services, parts, appointments, connectedVehicles, addedVehicles, reviews, invoices, expenses, serviceRecords, totals] =
      await Promise.all([
        this.ds.query(
          `SELECT id, "serviceType", "customName", price, "supportsInShop", "supportsOnSite", "createdAt"
           FROM mechanic_services WHERE "mechanicId" = $1 ORDER BY "createdAt" ASC`, [id]),

        this.ds.query(
          `SELECT id, name, category, sku, unit, "unitPrice", quantity, "inStock", "createdAt"
           FROM parts WHERE "mechanicId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, [id]),

        this.ds.query(
          `SELECT a.id, a."requestedAt", a."serviceType", a.status, a.mode, a.address, a.notes, a."createdAt",
                  v.make, v.model, v."plateNumber", o.name AS "ownerName", o.phone AS "ownerPhone"
           FROM appointments a
           LEFT JOIN vehicles v ON v.id = a."vehicleId"
           LEFT JOIN users o ON o.id = a."ownerId"
           WHERE a."mechanicId" = $1 ORDER BY a."requestedAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT va.id, va."grantedAt", va.revoked, v.id AS "vehicleId", v.make, v.model, v."plateNumber",
                  o.name AS "ownerName", o.phone AS "ownerPhone"
           FROM vehicle_access va
           JOIN vehicles v ON v.id = va."vehicleId"
           LEFT JOIN users o ON o.id = v."userId"
           WHERE va."mechanicId" = $1 ORDER BY va."grantedAt" DESC LIMIT 50`, [id]),

        this.ds.query(
          `SELECT v.id, v.make, v.model, v.year, v."plateNumber", v."customerName", v."linkStatus", v."createdAt"
           FROM vehicles v WHERE v."addedByMechanicId" = $1::text ORDER BY v."createdAt" DESC LIMIT 50`, [id]),

        this.ds.query(
          `SELECT r.id, r.rating, r.comment, r."createdAt", o.name AS "ownerName", o.phone AS "ownerPhone"
           FROM reviews r LEFT JOIN users o ON o.id = r."ownerId"
           WHERE r."mechanicId" = $1 ORDER BY r."createdAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT i.id, i.number, i.status, i.discount, i."paidAmount", i."taxPercent", i."createdAt",
                  sr."serviceType", v.make, v.model, v."plateNumber",
                  COALESCE((SELECT SUM(ii.quantity * ii."unitPrice") FROM invoice_items ii WHERE ii."invoiceId" = i.id), 0)::float AS "itemsTotal"
           FROM invoices i
           LEFT JOIN service_records sr ON sr.id = i."serviceRecordId"
           LEFT JOIN vehicles v ON v.id = sr."vehicleId"
           WHERE i."createdByUserId" = $1 ORDER BY i."createdAt" DESC LIMIT 30`, [id]),

        this.ds.query(
          `SELECT id, category, amount, "spentAt", description, recurring, reference, "createdAt"
           FROM workshop_expenses WHERE "mechanicId" = $1::text ORDER BY "spentAt" DESC NULLS LAST LIMIT 30`, [id]),

        this.ds.query(
          `SELECT sr.id, sr."serviceType", sr."serviceDate", sr.mileage, sr.cost, sr.description, sr."createdAt",
                  v.make, v.model, v."plateNumber"
           FROM service_records sr LEFT JOIN vehicles v ON v.id = sr."vehicleId"
           WHERE sr."createdByUserId" = $1 ORDER BY sr."serviceDate" DESC NULLS LAST LIMIT 30`, [id]),

        this.ds.query(
          `SELECT
             (SELECT COUNT(*)::int FROM mechanic_services WHERE "mechanicId" = $1) AS "serviceCount",
             (SELECT COUNT(*)::int FROM parts WHERE "mechanicId" = $1) AS "partCount",
             (SELECT COALESCE(SUM(quantity * "unitPrice"), 0)::float FROM parts WHERE "mechanicId" = $1 AND "inStock" = true) AS "inventoryValue",
             (SELECT COUNT(*)::int FROM appointments WHERE "mechanicId" = $1) AS "appointmentCount",
             (SELECT COUNT(*)::int FROM appointments WHERE "mechanicId" = $1 AND status = 'pending') AS "pendingAppointments",
             (SELECT COUNT(*)::int FROM appointments WHERE "mechanicId" = $1 AND status = 'completed') AS "completedAppointments",
             (SELECT COUNT(*)::int FROM vehicle_access WHERE "mechanicId" = $1 AND revoked = false) AS "connectedVehicleCount",
             (SELECT COUNT(*)::int FROM vehicles WHERE "addedByMechanicId" = $1::text) AS "addedVehicleCount",
             (SELECT COUNT(*)::int FROM reviews WHERE "mechanicId" = $1) AS "reviewCount",
             (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float FROM reviews WHERE "mechanicId" = $1) AS "avgRating",
             (SELECT COUNT(*)::int FROM invoices WHERE "createdByUserId" = $1) AS "invoiceCount",
             (SELECT COALESCE(SUM("paidAmount"), 0)::float FROM invoices WHERE "createdByUserId" = $1) AS "invoiceRevenue",
             (SELECT COALESCE(SUM(amount), 0)::float FROM workshop_expenses WHERE "mechanicId" = $1::text) AS "expenseTotal"`,
          [id]),
      ]);

    return {
      stats: totals[0] ?? {},
      services, parts, appointments, connectedVehicles, addedVehicles, reviews, invoices, expenses, serviceRecords,
    };
  }

  /* ── seller ─────────────────────────────────────────────────────────── */

  private async sellerSections(id: string) {
    const [products, sales, topProducts, totals] = await Promise.all([
      this.ds.query(
        `SELECT id, name, category, description, price, stock, unit, "imageUrl", active, "createdAt"
         FROM products WHERE "sellerId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, [id]),

      this.ds.query(
        `SELECT s.id, s."customerName", s."customerPhone", s."soldAt", s.discount, s."paidAmount", s.notes, s."createdAt",
                COALESCE((SELECT SUM(si.quantity * si."unitPrice") FROM sale_items si WHERE si."saleId" = s.id), 0)::float AS "itemsTotal",
                (SELECT COUNT(*)::int FROM sale_items si WHERE si."saleId" = s.id) AS "itemCount"
         FROM sales s WHERE s."sellerId" = $1 ORDER BY s."soldAt" DESC LIMIT 30`, [id]),

      this.ds.query(
        `SELECT si.name, SUM(si.quantity)::float AS quantity,
                SUM(si.quantity * si."unitPrice")::float AS revenue
         FROM sale_items si JOIN sales s ON s.id = si."saleId"
         WHERE s."sellerId" = $1 GROUP BY si.name ORDER BY revenue DESC LIMIT 10`, [id]),

      this.ds.query(
        `SELECT
           (SELECT COUNT(*)::int FROM products WHERE "sellerId" = $1) AS "productCount",
           (SELECT COUNT(*)::int FROM products WHERE "sellerId" = $1 AND active = true) AS "activeProductCount",
           (SELECT COUNT(*)::int FROM products WHERE "sellerId" = $1 AND stock <= 0) AS "outOfStockCount",
           (SELECT COALESCE(SUM(price * stock), 0)::float FROM products WHERE "sellerId" = $1) AS "inventoryValue",
           (SELECT COUNT(*)::int FROM sales WHERE "sellerId" = $1) AS "saleCount",
           (SELECT COALESCE(SUM("paidAmount"), 0)::float FROM sales WHERE "sellerId" = $1) AS "salesRevenue",
           (SELECT COALESCE(SUM(si.quantity), 0)::float FROM sale_items si JOIN sales s ON s.id = si."saleId" WHERE s."sellerId" = $1) AS "itemsSold"`,
        [id]),
    ]);

    return { stats: totals[0] ?? {}, products, sales, topProducts };
  }

  /* ── unified timeline ───────────────────────────────────────────────── */

  private buildTimeline(d: any) {
    const money = (n: any) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`;
    const plate = (r: any) => [r.make, r.model].filter(Boolean).join(' ') || r.plateNumber || '';

    const entries = [
      ...fold(d.appointments, 'appointment', 'نوبت',
        (r) => r.serviceType || 'درخواست خدمت',
        (r) => [plate(r), r.ownerName || r.mechanicName, fa(r.status)].filter(Boolean).join(' · '),
        (r) => r.requestedAt || r.createdAt),
      ...fold(d.serviceRecords, 'service_record', 'سابقه سرویس',
        (r) => r.serviceType, (r) => [plate(r), r.workshop].filter(Boolean).join(' · '),
        (r) => r.serviceDate || r.createdAt),
      ...fold(d.invoices, 'invoice', 'فاکتور',
        (r) => r.number ? `فاکتور ${r.number}` : 'فاکتور',
        (r) => [money(r.itemsTotal), fa(r.status)].filter(Boolean).join(' · '), (r) => r.createdAt),
      ...fold(d.payments, 'payment', 'پرداخت',
        (r) => money(r.amount), (r) => [fa(r.status), plate(r)].filter(Boolean).join(' · '), (r) => r.createdAt),
      ...fold(d.sales, 'sale', 'فروش',
        (r) => money(r.itemsTotal), (r) => [r.customerName, `${r.itemCount} قلم`].filter(Boolean).join(' · '),
        (r) => r.soldAt || r.createdAt),
      ...fold(d.reviews, 'review', 'نظر',
        (r) => `${r.rating} ستاره`, (r) => r.comment || r.ownerName || r.mechanicName || '', (r) => r.createdAt),
      ...fold(d.vehicles, 'vehicle', 'خودرو', (r) => plate(r), (r) => r.plateNumber || '', (r) => r.createdAt),
      ...fold(d.addedVehicles, 'vehicle', 'خودرو افزوده', (r) => plate(r), (r) => r.customerName || '', (r) => r.createdAt),
      ...fold(d.documents, 'document', 'مدرک', (r) => r.title, (r) => [r.type, plate(r)].filter(Boolean).join(' · '), (r) => r.createdAt),
      ...fold(d.reminders, 'reminder', 'یادآور', (r) => r.title,
        (r) => (r.isCompleted ? 'انجام‌شده' : 'باز'), (r) => r.createdAt),
      ...fold(d.fuelLogs, 'fuel_log', 'سوخت', (r) => `${r.liters} لیتر`,
        (r) => [r.station, money(r.cost)].filter(Boolean).join(' · '), (r) => r.date || r.createdAt),
      ...fold(d.products, 'product', 'محصول', (r) => r.name,
        (r) => [r.category, money(r.price)].filter(Boolean).join(' · '), (r) => r.createdAt),
      ...fold(d.services, 'service', 'خدمت', (r) => r.customName || r.serviceType,
        (r) => (r.price ? money(r.price) : ''), (r) => r.createdAt),
      ...fold(d.parts, 'part', 'قطعه', (r) => r.name,
        (r) => [r.category, `${r.quantity} ${r.unit || ''}`].filter(Boolean).join(' · '), (r) => r.createdAt),
      ...fold(d.expenses, 'expense', 'هزینه', (r) => money(r.amount),
        (r) => [fa(r.category), r.description].filter(Boolean).join(' · '), (r) => r.spentAt || r.createdAt),
      ...fold(d.connectedVehicles, 'access', 'دسترسی خودرو', (r) => plate(r),
        (r) => (r.revoked ? 'لغو شده' : 'فعال'), (r) => r.grantedAt),
      ...fold(d.notifications, 'notification', 'اعلان', (r) => r.title, (r) => fa(r.status), (r) => r.createdAt),
    ];

    return entries
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 60);
  }

  /* ── admin ──────────────────────────────────────────────────────────── */

  private async adminSections(id: string) {
    const [perms] = await this.ds.query(
      `SELECT permissions, "isSuper", note, "createdAt" FROM admin_permissions WHERE "userId" = $1`, [id]);
    return {
      stats: {},
      adminAccess: perms
        ? { permissions: String(perms.permissions || '').split(',').filter(Boolean), isSuper: perms.isSuper, note: perms.note }
        : null,
    };
  }
}

/**
 * A single chronological feed of everything this account did, folded from the
 * sections already fetched — the same rows the tabs show, so the timeline can
 * never disagree with them and costs no extra query.
 */
/** Status and category codes the consumer app stores in English. */
const LABELS: Record<string, string> = {
  // appointment
  pending: 'در انتظار', confirmed: 'تاییدشده', rejected: 'ردشده',
  completed: 'انجام‌شده', cancelled: 'لغوشده', approved: 'تاییدشده',
  success: 'موفق', failed: 'ناموفق', sent: 'ارسال‌شده',
  // workshop expense categories
  rent: 'اجاره', payroll: 'حقوق و دستمزد', utilities: 'آب، برق، گاز و تلفن',
  parts: 'خرید قطعه', tools: 'ابزار و تجهیزات', maintenance: 'تعمیر و نگهداری',
  transport: 'حمل و نقل', marketing: 'تبلیغات', tax: 'مالیات و عوارض',
  insurance: 'بیمه', other: 'متفرقه',
};
const fa = (code?: string | null): string => (code ? (LABELS[code] ?? code) : '');

function fold(rows: any[] | undefined, kind: string, label: string,
              title: (r: any) => string, subtitle: (r: any) => string, at: (r: any) => any) {
  return (rows ?? []).map((r) => ({
    kind, label, title: title(r) || '—', subtitle: subtitle(r) || '', at: at(r),
  })).filter((e) => !!e.at);
}
