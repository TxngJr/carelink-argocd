import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId, type Db, type Document } from 'mongodb'
import {
  DEVELOPMENT_ACCOUNTS,
  developmentRoleDetails,
  type DevelopmentAccount,
} from '@/lib/development-accounts'
import type { Role } from '@/lib/types'

const DEVELOPMENT_ACCOUNT_USERNAMES = DEVELOPMENT_ACCOUNTS.map((account) => account.username)

export function developmentLoginEnabled() {
  return ['development', 'public_demo'].includes(process.env.APP_ENV || '') || process.env.NODE_ENV === 'development'
}

/**
 * Reconcile the public-demo/mock staff database with the canonical account
 * definitions. This intentionally updates the complete profile of existing mock
 * users instead of only inserting missing rows, so Atlas/local databases cannot
 * keep stale roles, departments, station access or permissions after a deploy.
 */
export async function ensureDevelopmentAccounts(db: Db) {
  const passwordHash = await bcrypt.hash(process.env.DEVELOPMENT_LOGIN_PASSWORD || 'password123', 10)
  const now = new Date()

  await db.collection('users').bulkWrite(DEVELOPMENT_ACCOUNTS.map((account) => ({
    updateOne: {
      filter: { username: account.username },
      update: {
        $set: {
          username: account.username,
          role: account.role,
          display_name: account.display_name,
          department: account.department,
          station_codes: account.station_codes,
          permissions: account.permissions,
          is_active: true,
          is_development_account: true,
          development_account_order: account.order,
          updated_at: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          password_hash: passwordHash,
          created_at: now,
        },
      },
      upsert: true,
    },
  })), { ordered: false })

  // Keep historical/demo usernames in the database for audit references, but
  // remove them from the one-click testing table and development-login surface
  // when they are no longer part of the canonical mock account set.
  await db.collection('users').updateMany(
    {
      is_development_account: true,
      username: { $nin: DEVELOPMENT_ACCOUNT_USERNAMES },
    },
    {
      $set: { is_development_account: false, updated_at: now },
      $unset: { development_account_order: '' },
    },
  )

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
    username: { $in: DEVELOPMENT_ACCOUNT_USERNAMES },
    is_development_account: true,
    is_active: { $ne: false },
    role: { $ne: 'patient' },
  }).sort({ development_account_order: 1, username: 1 }).toArray()
  return users.map(toDevelopmentAccount)
}

export async function findDevelopmentAccount(db: Db, username: string) {
  return db.collection('users').findOne({
    username: username.trim(),
    username: { $in: DEVELOPMENT_ACCOUNT_USERNAMES },
    is_development_account: true,
    is_active: { $ne: false },
    role: { $ne: 'patient' },
  })
}
