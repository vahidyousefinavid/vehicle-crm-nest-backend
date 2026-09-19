import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ManagementService {
  constructor(private ds: DataSource) {}

  async providers(params: { role?: 'mechanic' | 'seller'; q?: string; page: number; pageSize: number }) {
    const roleWhere = params.role ? 'AND u.role = $1' : "AND u.role IN ('mechanic','seller')";
    const args: any[] = [];
    if (params.role) args.push(params.role);
    let qWhere = '';
    if (params.q) { args.push(`%${params.q}%`); qWhere = `AND (u.name ILIKE $${args.length} OR u.phone ILIKE $${args.length} OR u."workshopName" ILIKE $${args.length} OR u."workshopAddress" ILIKE $${args.length})`; }
    const limit = Math.min(Math.max(params.pageSize, 1), 100);
    const offset = Math.max(params.page - 1, 0) * limit;
    const totalRows = await this.ds.query(`SELECT COUNT(*)::int AS total FROM users u WHERE 1=1 ${roleWhere} ${qWhere}`, args);
    args.push(limit, offset);
    const rows = await this.ds.query(`
      SELECT u.id, u.phone, u.name, u.role, u.active, u."workshopName", u."workshopAddress", u."createdAt",
        COUNT(DISTINCT ms.id)::int AS "serviceCount",
        COUNT(DISTINCT p.id)::int AS "productCount",
        COUNT(DISTINCT a.id)::int AS "appointmentCount",
        COUNT(DISTINCT va.id)::int AS "connectedVehicleCount",
        COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float AS "avgRating"
      FROM users u
      LEFT JOIN mechanic_services ms ON ms."mechanicId" = u.id
      LEFT JOIN products p ON p."sellerId" = u.id
      LEFT JOIN appointments a ON a."mechanicId" = u.id
      LEFT JOIN vehicle_access va ON va."mechanicId" = u.id AND va.revoked = false
      LEFT JOIN reviews r ON r."mechanicId" = u.id
      WHERE 1=1 ${roleWhere} ${qWhere}
      GROUP BY u.id
      ORDER BY u."createdAt" DESC
      LIMIT $${args.length-1} OFFSET $${args.length}
    `, args);
    return { total: Number(totalRows[0]?.total || 0), page: params.page, pageSize: limit, items: rows };
  }

  async services(params: { q?: string; page: number; pageSize: number }) {
    const args: any[] = [];
    let qWhere = '';
    if (params.q) { args.push(`%${params.q}%`); qWhere = `WHERE ms."serviceType" ILIKE $1 OR ms."customName" ILIKE $1 OR u.name ILIKE $1 OR u."workshopName" ILIKE $1`; }
    const limit = Math.min(Math.max(params.pageSize, 1), 100);
    const offset = Math.max(params.page - 1, 0) * limit;
    const totalRows = await this.ds.query(`SELECT COUNT(*)::int AS total FROM mechanic_services ms LEFT JOIN users u ON u.id = ms."mechanicId" ${qWhere}`, args);
    args.push(limit, offset);
    const items = await this.ds.query(`
      SELECT ms.id, ms."serviceType", ms."customName", ms.price, ms."supportsInShop", ms."supportsOnSite", ms."createdAt",
        u.id AS "mechanicId", u.name AS "mechanicName", u.phone AS "mechanicPhone", u."workshopName", u.active AS "mechanicActive"
      FROM mechanic_services ms
      LEFT JOIN users u ON u.id = ms."mechanicId"
      ${qWhere}
      ORDER BY ms."createdAt" DESC
      LIMIT $${args.length-1} OFFSET $${args.length}
    `, args);
    const aggregates = await this.ds.query(`
      SELECT label, SUM(requests)::int AS requests, SUM(records)::int AS records FROM (
        SELECT COALESCE("serviceType", 'نامشخص') AS label, COUNT(*) AS requests, 0 AS records FROM appointments GROUP BY COALESCE("serviceType", 'نامشخص')
        UNION ALL
        SELECT COALESCE("serviceType", 'نامشخص') AS label, 0 AS requests, COUNT(*) AS records FROM service_records GROUP BY COALESCE("serviceType", 'نامشخص')
      ) x GROUP BY label ORDER BY SUM(requests)+SUM(records) DESC LIMIT 20
    `);
    return { total: Number(totalRows[0]?.total || 0), page: params.page, pageSize: limit, items, aggregates };
  }

  async activities(params: { kind?: string; page: number; pageSize: number }) {
    const allowed = new Set(['appointment','payment','service_record','vehicle','document','reminder','product','review','message','notification','fuel_log','user']);
    const kind = params.kind && allowed.has(params.kind) ? params.kind : undefined;
    const limit = Math.min(Math.max(params.pageSize, 1), 100);
    const offset = Math.max(params.page - 1, 0) * limit;
    const kindWhere = kind ? 'WHERE kind = $1' : '';
    const args: any[] = kind ? [kind, limit, offset] : [limit, offset];
    const li = kind ? 2 : 1, off = kind ? 3 : 2;
    const rows = await this.ds.query(`
      WITH feed AS (
        SELECT 'appointment' kind, id::text, COALESCE("serviceType", 'درخواست خدمت') title, status subtitle, "createdAt" FROM appointments
        UNION ALL SELECT 'payment', id::text, amount::text || ' تومان', status, "createdAt" FROM payments
        UNION ALL SELECT 'service_record', id::text, "serviceType", COALESCE(workshop, 'سابقه سرویس'), "createdAt" FROM service_records
        UNION ALL SELECT 'vehicle', id::text, make || ' ' || model, COALESCE("plateNumber", 'بدون پلاک'), "createdAt" FROM vehicles
        UNION ALL SELECT 'document', id::text, title, type, "createdAt" FROM vehicle_documents
        UNION ALL SELECT 'reminder', id::text, title, CASE WHEN "isCompleted" THEN 'انجام شده' ELSE 'باز' END, "createdAt" FROM reminders
        UNION ALL SELECT 'product', id::text, name, COALESCE(category, 'محصول'), "createdAt" FROM products
        UNION ALL SELECT 'review', id::text, rating::text || ' ستاره', COALESCE(comment, 'نظر بدون متن'), "createdAt" FROM reviews
        UNION ALL SELECT 'message', id::text, 'پیام', LEFT(body, 90), "createdAt" FROM messages
        UNION ALL SELECT 'notification', id::text, title, status, "createdAt" FROM notifications
        UNION ALL SELECT 'fuel_log', id::text, liters::text || ' لیتر', COALESCE(station, 'ثبت سوخت'), "createdAt" FROM fuel_logs
        UNION ALL SELECT 'user', id::text, name, role, "createdAt" FROM users
      )
      SELECT * FROM feed ${kindWhere} ORDER BY "createdAt" DESC LIMIT $${li} OFFSET $${off}
    `, args);
    const counts = await this.ds.query(`
      WITH feed AS (
        SELECT 'appointment' kind FROM appointments UNION ALL SELECT 'payment' FROM payments UNION ALL SELECT 'service_record' FROM service_records
        UNION ALL SELECT 'vehicle' FROM vehicles UNION ALL SELECT 'document' FROM vehicle_documents UNION ALL SELECT 'reminder' FROM reminders
        UNION ALL SELECT 'product' FROM products UNION ALL SELECT 'review' FROM reviews UNION ALL SELECT 'message' FROM messages
        UNION ALL SELECT 'notification' FROM notifications UNION ALL SELECT 'fuel_log' FROM fuel_logs UNION ALL SELECT 'user' FROM users
      ) SELECT kind, COUNT(*)::int count FROM feed GROUP BY kind ORDER BY count DESC
    `);
    return { page: params.page, pageSize: limit, items: rows, counts };
  }
}
