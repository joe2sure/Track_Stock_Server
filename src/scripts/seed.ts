import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { connectDB, disconnectDB } from '../config/database';
import User from '../modules/users/user.model';
import { hashPassword } from '../shared/utils/password';
import logger from '../config/logger';

const SEED_DATA = {
  users: [
    {
      name:       'Super Admin',
      email:      'trackstock123@gmail.com',
      password:   'trackstock@123',
      role:       'super_admin',
      tenantId:   'default',
      employeeId: 'TRA-0001',
      isActive:   true,
      isEmailVerified: true,
      department: 'Management',
    },
    {
      name:       'Store Manager',
      email:      'manager@trackstock.com',
      password:   'Manager@123',
      role:       'manager',
      tenantId:   'default',
      employeeId: 'TRA-0002',
      isActive:   true,
      isEmailVerified: true,
      department: 'Operations',
    },
    {
      name:       'Head Cashier',
      email:      'cashier@trackstock.com',
      password:   'Cashier@123',
      role:       'cashier',
      tenantId:   'default',
      employeeId: 'TRA-0003',
      isActive:   true,
      isEmailVerified: true,
      department: 'Sales',
    },
    {
      name:       'Warehouse Manager',
      email:      'warehouse@trackstock.com',
      password:   'Warehouse@123',
      role:       'warehouse_staff',
      tenantId:   'default',
      employeeId: 'TRA-0004',
      isActive:   true,
      isEmailVerified: true,
      department: 'Warehouse',
    },
    {
      name:       'Hotel Staff',
      email:      'hotel@trackstock.com',
      password:   'Hotel@123',
      role:       'hotel_staff',
      tenantId:   'default',
      employeeId: 'TRA-0005',
      isActive:   true,
      isEmailVerified: true,
      department: 'Hotel',
    },
    {
      name:       'Accountant',
      email:      'accounts@trackstock.com',
      password:   'Accounts@123',
      role:       'accountant',
      tenantId:   'default',
      employeeId: 'TRA-0006',
      isActive:   true,
      isEmailVerified: true,
      department: 'Finance',
    },
  ],
};

async function seed(): Promise<void> {
  logger.info('🌱 Starting database seed...');

  try {
    await connectDB();

    // Clear existing users (only in dev/test)
    if (process.env.NODE_ENV !== 'production') {
      await User.deleteMany({ tenantId: 'default' });
      logger.info('Cleared existing seed data');
    }

    // Create users
    const usersToCreate = await Promise.all(
      SEED_DATA.users.map(async (userData) => ({
        ...userData,
        password: await hashPassword(userData.password),
      }))
    );

    const createdUsers = await User.insertMany(usersToCreate);
    logger.info(`✅ Created ${createdUsers.length} users`);

    // Print credentials for dev use
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📋 Seed Credentials:');
      console.log('═══════════════════════════════════════════════════');
      SEED_DATA.users.forEach(u => {
        console.log(`${u.role.padEnd(20)} | ${u.email.padEnd(30)} | ${u.password}`);
      });
      console.log('═══════════════════════════════════════════════════\n');
    }

    logger.info('✅ Database seeding complete!');
  } catch (error) {
    logger.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

seed().catch(error => {
  console.error('Fatal seed error:', error);
  process.exit(1);
});
