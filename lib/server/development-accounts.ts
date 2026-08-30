import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId, type Db, type Document } from 'mongodb'
import {
  DEVELOPMENT_ACCOUNTS,
  developmentRoleDetails,
  type DevelopmentAccount,
} from '@/lib/development-accounts'
import type { Role } from '@/lib/types'

export function developmentLoginEnabled() {
  return ['development', 'public_demo'].includes(process.env.APP_ENV || '') || process.env.NODE_ENV === 'development'
}

export async function ensureDevelopmentAccounts(db: Db) {
  const passwordHash = await bcrypt.hash(process.env.DEVELOPMENT_LOGIN_PASSWORD || 'password123', 10)
  const now = new Date()

  await db.collection('users').bulkWrite(DEVELOPMENT_ACCOUNTS.map((account) => ({
    updateOne: {
      filter: { username: account.username },
      update: {
        $set: {
          is_development_account: true,
          development_account_order: account.order,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          username: account.username,
          password_hash: passwordHash,
          role: account.role,
          display_name: account.display_name,
          department: account.department,
          station_codes: account.station_codes,
          permissions: account.permissions,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      },
      upsert: true,
    },
  })), { ordered: false })

  return DEVELOPMENT_ACCOUNTS.length
}

function toDevelopmentAccount(user: Document): DevelopmentAccount {
  const role = String(user.role || '') as Role
  const details = developmentRoleDetails(role)
  return {
    username: String(user.username || ''),
    display_name: String(user.display_name || ''),
    role,
    role_label: details?.title || 'เจ้าหน้าที่',
    duty: details?.duty || 'เข้าใช้งานตามสิทธิ์ที่ได้รับมอบหมาย',
    department: String(user.department || details?.department || 'ไม่ระบุหน่วยงาน'),
    order: Number(user.development_account_order || 0),
  }
}

export async function listDevelopmentAccounts(db: Db) {
  const users = await db.collection('users').find({
    is_development_account: true,
    is_active: { $ne: false },
    role: { $ne: 'patient' },
  }).sort({ development_account_order: 1, username: 1 }).toArray()
  return users.map(toDevelopmentAccount)
}

export async function findDevelopmentAccount(db: Db, username: string) {
  return db.collection('users').findOne({
    username: username.trim(),
    is_development_account: true,
    is_active: { $ne: false },
    role: { $ne: 'patient' },
  })
}
