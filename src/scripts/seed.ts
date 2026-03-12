import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { connectDB, disconnectDB } from '../config/database';
import User from '../modules/users/user.model';
import Category from '../modules/categories/category.model';
import Brand from '../modules/brands/brand.model';
import Unit from '../modules/units/unit.model';
import Product from '../modules/products/product.model';
import Warehouse from '../modules/warehouses/warehouse.model';
import Customer from '../modules/sales/customer.model';
import Supplier from '../modules/suppliers/supplier.model';
import RoomType from '../modules/hotel/roomType.model';
import Room from '../modules/hotel/room.model';
import Staff from '../modules/staff/staff.model';
import Role from '../modules/roles/role.model';
import Currency from '../modules/currencies/currency.model';
import Settings from '../modules/settings/settings.model';
import { roleService } from '../modules/roles/role.service';
import { currencyService } from '../modules/currencies/currency.service';
import { hashPassword } from '../shared/utils/password';
import logger from '../config/logger';

const TENANT = 'default';

async function seed(): Promise<void> {
  logger.info('Starting database seed...');
  await connectDB();

  if (process.env.NODE_ENV !== 'production') {
    await Promise.all([
      User.deleteMany({ tenantId: TENANT }),
      Category.deleteMany({ tenantId: TENANT }),
      Brand.deleteMany({ tenantId: TENANT }),
      Unit.deleteMany({ tenantId: TENANT }),
      Product.deleteMany({ tenantId: TENANT }),
      Warehouse.deleteMany({ tenantId: TENANT }),
      Customer.deleteMany({ tenantId: TENANT }),
      Supplier.deleteMany({ tenantId: TENANT }),
      RoomType.deleteMany({ tenantId: TENANT }),
      Room.deleteMany({ tenantId: TENANT }),
      Staff.deleteMany({ tenantId: TENANT }),
      Role.deleteMany({ tenantId: TENANT }),
      Currency.deleteMany({ tenantId: TENANT }),
      Settings.deleteMany({ tenantId: TENANT }),
    ]);
    logger.info('Cleared existing data');
  }

  const usersData = [
    { name:'Super Admin',       email:'247okolo@gmail.com',  password:'spotenugu123', role:'super_admin',     employeeId:'EBA-0001', department:'Management' },
    { name:'Store Manager',     email:'manager@ebeano.com',  password:'Manager@123',  role:'manager',         employeeId:'EBA-0002', department:'Operations' },
    { name:'Head Cashier',      email:'cashier@ebeano.com',  password:'Cashier@123',  role:'cashier',         employeeId:'EBA-0003', department:'Sales' },
    { name:'Warehouse Manager', email:'warehouse@ebeano.com',password:'Warehouse@123',role:'warehouse_staff', employeeId:'EBA-0004', department:'Warehouse' },
    { name:'Hotel Staff',       email:'hotel@ebeano.com',    password:'Hotel@123',    role:'hotel_staff',     employeeId:'EBA-0005', department:'Hotel' },
    { name:'Accountant',        email:'accounts@ebeano.com', password:'Accounts@123', role:'accountant',      employeeId:'EBA-0006', department:'Finance' },
  ];

  const createdUsers = await User.insertMany(
    await Promise.all(usersData.map(async u => ({
      ...u, password: await hashPassword(u.password),
      tenantId: TENANT, isActive: true, isEmailVerified: true,
    })))
  );
  const adminId = createdUsers[0]._id;
  logger.info(`${createdUsers.length} users seeded`);

  const unitDefs = [
    { name:'Piece', abbreviation:'pcs', type:'count', isBase:true },
    { name:'Dozen', abbreviation:'dz', type:'count', conversionFactor:12 },
    { name:'Carton', abbreviation:'ctn', type:'count', conversionFactor:12 },
    { name:'Pack', abbreviation:'pk', type:'count', conversionFactor:1 },
    { name:'Kilogram', abbreviation:'kg', type:'weight', isBase:true },
    { name:'Gram', abbreviation:'g', type:'weight', baseUnit:'kg', conversionFactor:0.001 },
    { name:'Tonne', abbreviation:'t', type:'weight', baseUnit:'kg', conversionFactor:1000 },
    { name:'Litre', abbreviation:'L', type:'volume', isBase:true },
    { name:'Millilitre', abbreviation:'mL', type:'volume', baseUnit:'L', conversionFactor:0.001 },
    { name:'Metre', abbreviation:'m', type:'length', isBase:true },
    { name:'Centimetre', abbreviation:'cm', type:'length', baseUnit:'m', conversionFactor:0.01 },
  ];

  const createdUnits = await Unit.insertMany(
    unitDefs.map(u => ({ ...u, tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  const unitMap: Record<string, mongoose.Types.ObjectId> = {};
  createdUnits.forEach(u => { unitMap[u.abbreviation] = u._id as mongoose.Types.ObjectId; });
  logger.info(`${createdUnits.length} units seeded`);

  const rootCatsData = [
    { name:'Food & Beverages', description:'Groceries, drinks', sortOrder:1 },
    { name:'Household',        description:'Cleaning, toiletries', sortOrder:2 },
    { name:'Electronics',      description:'Gadgets', sortOrder:3 },
    { name:'Fashion',          description:'Clothing', sortOrder:4 },
    { name:'Health & Beauty',  description:'Personal care', sortOrder:5 },
  ];
  const createdCats = await Category.insertMany(
    rootCatsData.map(c => ({ ...c, tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  const catMap: Record<string, mongoose.Types.ObjectId> = {};
  createdCats.forEach(c => { catMap[c.name] = c._id as mongoose.Types.ObjectId; });

  const subCatsData = [
    { name:'Soft Drinks',   parentId:catMap['Food & Beverages'], sortOrder:1 },
    { name:'Dairy',         parentId:catMap['Food & Beverages'], sortOrder:2 },
    { name:'Grains & Rice', parentId:catMap['Food & Beverages'], sortOrder:3 },
    { name:'Snacks',        parentId:catMap['Food & Beverages'], sortOrder:4 },
    { name:'Detergents',    parentId:catMap['Household'],        sortOrder:1 },
    { name:'Phones',        parentId:catMap['Electronics'],      sortOrder:1 },
  ];
  const createdSubCats = await Category.insertMany(
    subCatsData.map(c => ({ ...c, tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  createdSubCats.forEach(c => { catMap[c.name] = c._id as mongoose.Types.ObjectId; });
  logger.info(`${createdCats.length + createdSubCats.length} categories seeded`);

  const brandDefs = [
    { name:'Coca-Cola', country:'USA' },
    { name:'Indomie',   country:'Nigeria' },
    { name:'Dangote',   country:'Nigeria' },
    { name:'Unilever',  country:'UK' },
    { name:'Nestle',    country:'Switzerland' },
    { name:'Samsung',   country:'South Korea' },
    { name:'Techno',    country:'China' },
    { name:'Peak Milk', country:'Nigeria' },
  ];
  const createdBrands = await Brand.insertMany(
    brandDefs.map(b => ({ ...b, tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  const brandMap: Record<string, mongoose.Types.ObjectId> = {};
  createdBrands.forEach(b => { brandMap[b.name] = b._id as mongoose.Types.ObjectId; });
  logger.info(`${createdBrands.length} brands seeded`);

  const productsData = [
    { name:'Coca-Cola 60cl',           sku:'CCL-60CL',    barcode:'5449000000439', categoryId:catMap['Soft Drinks'],   brandId:brandMap['Coca-Cola'], unitId:unitMap['pcs'], costPrice:180,   sellingPrice:250,   wholesalePrice:210,  stockQuantity:240, minStockLevel:48,  tags:['drinks','cola'] },
    { name:'Indomie Chicken (70g)',     sku:'IDM-CHK-70',  barcode:'8996001300047', categoryId:catMap['Snacks'],        brandId:brandMap['Indomie'],   unitId:unitMap['pcs'], costPrice:120,   sellingPrice:150,   wholesalePrice:130,  stockQuantity:500, minStockLevel:100, tags:['noodles','snack'] },
    { name:'Dangote Sugar 1kg',         sku:'DAN-SUG-1KG',                          categoryId:catMap['Food & Beverages'],brandId:brandMap['Dangote'],  unitId:unitMap['kg'],  costPrice:650,   sellingPrice:800,                        stockQuantity:200, minStockLevel:50 },
    { name:'Peak Milk Powder 400g',     sku:'PKM-400G',                             categoryId:catMap['Dairy'],         brandId:brandMap['Peak Milk'], unitId:unitMap['g'],   costPrice:1400,  sellingPrice:1800,                       stockQuantity:80,  minStockLevel:20,  tags:['milk','dairy'] },
    { name:'Omo Detergent 500g',        sku:'OMO-DET-500',                          categoryId:catMap['Detergents'],    brandId:brandMap['Unilever'],  unitId:unitMap['g'],   costPrice:600,   sellingPrice:750,                        stockQuantity:150, minStockLevel:30,  tags:['detergent'] },
    { name:'Tecno Spark 10 Pro',        sku:'TEC-SP10P',                            categoryId:catMap['Phones'],        brandId:brandMap['Techno'],    unitId:unitMap['pcs'], costPrice:85000, sellingPrice:110000,wholesalePrice:95000, stockQuantity:15,  minStockLevel:3,   tags:['phone','smartphone'] },
    { name:'Golden Penny Semolina 1kg', sku:'GPS-SEM-1KG',                          categoryId:catMap['Grains & Rice'], brandId:undefined,             unitId:unitMap['kg'],  costPrice:700,   sellingPrice:900,                        stockQuantity:300, minStockLevel:60,  tags:['semolina'] },
    { name:'Vaseline Petroleum 250ml',  sku:'VAS-PET-250',                          categoryId:catMap['Health & Beauty'],brandId:brandMap['Unilever'], unitId:unitMap['mL'],  costPrice:550,   sellingPrice:700,                        stockQuantity:120, minStockLevel:25,  tags:['vaseline','skincare'] },
  ];

  const createdProducts = await Product.insertMany(
    productsData.map(p => ({
      ...p, tenantId:TENANT, status:'active', type:'simple', isTrackingStock:true, createdBy:adminId,
    }))
  );
  logger.info(`${createdProducts.length} products seeded`);

  // Update counts
  const catCounts: Record<string,number> = {};
  const brandCounts: Record<string,number> = {};
  for (const p of createdProducts) {
    const cid = p.categoryId.toString();
    catCounts[cid] = (catCounts[cid] ?? 0) + 1;
    if (p.brandId) {
      const bid = p.brandId.toString();
      brandCounts[bid] = (brandCounts[bid] ?? 0) + 1;
    }
  }
  await Promise.all([
    ...Object.entries(catCounts).map(([id, n]) => Category.findByIdAndUpdate(id, { $inc:{ productCount:n } })),
    ...Object.entries(brandCounts).map(([id, n]) => Brand.findByIdAndUpdate(id, { $inc:{ productCount:n } })),
  ]);

  // ── Warehouses ──────────────────────────────────────────────────────────────
  const warehouseDefs = [
    { name:'Main Store',   code:'MAIN', city:'Benin City', state:'Edo', isDefault:true,  capacity:10000 },
    { name:'Warehouse B',  code:'WHB',  city:'Benin City', state:'Edo', isDefault:false, capacity:5000  },
    { name:'Abuja Branch', code:'ABJ',  city:'Abuja',      state:'FCT', isDefault:false, capacity:3000  },
  ];
  const createdWarehouses = await Warehouse.insertMany(
    warehouseDefs.map(w => ({ ...w, country:'Nigeria', tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  logger.info(`${createdWarehouses.length} warehouses seeded`);

  // ── Customers ───────────────────────────────────────────────────────────────
  const customerDefs = [
    { name:'Emeka Okafor',    phone:'+2348012345678', type:'retail',    customerNumber:'CUST-0001', city:'Benin City', state:'Edo' },
    { name:'Fatima Abdullahi',phone:'+2348023456789', type:'wholesale', customerNumber:'CUST-0002', creditLimit:500000, discountPercent:5, city:'Kano', state:'Kano' },
    { name:'Chidinma Stores', phone:'+2348034567890', type:'credit',    customerNumber:'CUST-0003', creditLimit:200000 },
    { name:'Bello Traders',   phone:'+2348045678901', type:'wholesale', customerNumber:'CUST-0004', creditLimit:300000, discountPercent:3 },
    { name:'Ngozi Eze',       phone:'+2348056789012', type:'retail',    customerNumber:'CUST-0005', loyaltyPoints:150 },
  ];
  await Customer.insertMany(
    customerDefs.map(c => ({ ...c, tenantId:TENANT, isActive:true, createdBy:adminId }))
  );
  logger.info(`${customerDefs.length} customers seeded`);

  // ── Suppliers ────────────────────────────────────────────────────────────────
  const supplierDefs = [
    {
      supplierNumber: 'SUP-0001', name: 'Dangote Industries Ltd',
      contactPerson: 'Alhaji Musa', phone: '+2348011111111', email: 'procurement@dangote.com',
      city: 'Lagos', state: 'Lagos', paymentTerms: 30, creditLimit: 5000000, leadTimeDays: 7, rating: 5,
    },
    {
      supplierNumber: 'SUP-0002', name: 'UAC Foods Nigeria',
      contactPerson: 'Chidi Okonkwo', phone: '+2348022222222', email: 'orders@uacfoods.com',
      city: 'Lagos', state: 'Lagos', paymentTerms: 14, creditLimit: 2000000, leadTimeDays: 3, rating: 4,
    },
    {
      supplierNumber: 'SUP-0003', name: 'Chi Limited',
      contactPerson: 'Adaeze Nwosu', phone: '+2348033333333',
      city: 'Abia', state: 'Abia', paymentTerms: 21, creditLimit: 1000000, leadTimeDays: 5, rating: 4,
    },
    {
      supplierNumber: 'SUP-0004', name: 'Honeywell Flour Mills',
      contactPerson: 'Emeka Eze', phone: '+2348044444444',
      city: 'Lagos', state: 'Lagos', paymentTerms: 30, leadTimeDays: 2, rating: 3,
    },
    {
      supplierNumber: 'SUP-0005', name: 'Lagos Fresh Distributors',
      contactPerson: 'Bisi Adeyemi', phone: '+2348055555555',
      city: 'Lagos', state: 'Lagos', paymentTerms: 7, discountPercent: 2, leadTimeDays: 1, rating: 4,
    },
  ];
  const createdSuppliers = await Supplier.insertMany(
    supplierDefs.map(s => ({ ...s, country: 'Nigeria', tenantId: TENANT, isActive: true, createdBy: adminId }))
  );
  logger.info(`${createdSuppliers.length} suppliers seeded`);

  // ── Hotel Room Types & Rooms ──────────────────────────────────────────────
  const roomTypeDefs = [
    { name:'Standard Room',  code:'STD', basePrice:15000, weekendPrice:18000, maxOccupancy:2, bedType:'double', amenities:['WiFi','AC','TV','Hot Water'],           sortOrder:1 },
    { name:'Deluxe Room',    code:'DLX', basePrice:25000, weekendPrice:30000, maxOccupancy:2, bedType:'queen',  amenities:['WiFi','AC','TV','Minibar','Safe Box'],   sortOrder:2 },
    { name:'Executive Suite',code:'EXE', basePrice:45000, weekendPrice:55000, maxOccupancy:3, bedType:'king',   amenities:['WiFi','AC','TV','Minibar','Safe Box','Sitting Area','Bathtub'], sortOrder:3 },
    { name:'Family Room',    code:'FAM', basePrice:35000, weekendPrice:40000, maxOccupancy:4, bedType:'twin',   amenities:['WiFi','AC','TV','Extra Beds'],           sortOrder:4 },
  ];
  const createdRoomTypes = await RoomType.insertMany(
    roomTypeDefs.map(rt => ({ ...rt, isActive:true, tenantId:TENANT, createdBy:adminId }))
  );
  const rtMap = new Map(createdRoomTypes.map(rt => [rt.code, rt._id]));
  logger.info(`${createdRoomTypes.length} room types seeded`);

  const roomDefs = [
    // Floor 1 — Standard
    { roomNumber:'101', floor:1, roomTypeId: rtMap.get('STD') },
    { roomNumber:'102', floor:1, roomTypeId: rtMap.get('STD') },
    { roomNumber:'103', floor:1, roomTypeId: rtMap.get('STD') },
    { roomNumber:'104', floor:1, roomTypeId: rtMap.get('FAM') },
    // Floor 2 — Deluxe
    { roomNumber:'201', floor:2, roomTypeId: rtMap.get('DLX') },
    { roomNumber:'202', floor:2, roomTypeId: rtMap.get('DLX') },
    { roomNumber:'203', floor:2, roomTypeId: rtMap.get('DLX') },
    { roomNumber:'204', floor:2, roomTypeId: rtMap.get('FAM') },
    // Floor 3 — Executive
    { roomNumber:'301', floor:3, roomTypeId: rtMap.get('EXE') },
    { roomNumber:'302', floor:3, roomTypeId: rtMap.get('EXE') },
  ];
  const createdRooms = await Room.insertMany(
    roomDefs.map(r => ({ ...r, status:'available', isClean:true, tenantId:TENANT, createdBy:adminId }))
  );
  logger.info(`${createdRooms.length} rooms seeded`);

  // ── Staff ────────────────────────────────────────────────────────────────────
  const mainWarehouseId = createdWarehouses[0]._id;
  const staffDefs = [
    { staffNumber:'EMP-0001', firstName:'Tunde',  lastName:'Adeyemi',   department:'Sales',          jobTitle:'Sales Manager',       basicSalary:250000, hireDate: new Date('2022-01-10'), employmentType:'full_time', warehouseId: mainWarehouseId },
    { staffNumber:'EMP-0002', firstName:'Ngozi',  lastName:'Okonkwo',   department:'Accounts',       jobTitle:'Accountant',           basicSalary:200000, hireDate: new Date('2022-03-15'), employmentType:'full_time', warehouseId: mainWarehouseId },
    { staffNumber:'EMP-0003', firstName:'Musa',   lastName:'Ibrahim',   department:'Warehouse',      jobTitle:'Store Keeper',         basicSalary:120000, hireDate: new Date('2023-06-01'), employmentType:'full_time', warehouseId: mainWarehouseId },
    { staffNumber:'EMP-0004', firstName:'Amaka',  lastName:'Eze',       department:'Hotel',          jobTitle:'Front Desk Officer',   basicSalary:100000, hireDate: new Date('2023-01-20'), employmentType:'full_time', warehouseId: mainWarehouseId },
    { staffNumber:'EMP-0005', firstName:'Emeka',  lastName:'Nwosu',     department:'Hotel',          jobTitle:'Housekeeping Staff',   basicSalary:80000,  hireDate: new Date('2023-09-05'), employmentType:'full_time', warehouseId: mainWarehouseId },
    { staffNumber:'EMP-0006', firstName:'Fatima', lastName:'Abdullahi', department:'Administration', jobTitle:'HR Manager',           basicSalary:220000, hireDate: new Date('2021-11-01'), employmentType:'full_time', warehouseId: mainWarehouseId },
  ];
  const createdStaff = await Staff.insertMany(
    staffDefs.map(s => ({
      ...s, status:'active', isActive:true, country:'Nigeria',
      currency:'NGN', payFrequency:'monthly',
      annualLeaveBalance:20, sickLeaveBalance:10, leavesTaken:0,
      tenantId:TENANT, createdBy:adminId,
    }))
  );
  logger.info(`${createdStaff.length} staff members seeded`);

  // ── Roles ─────────────────────────────────────────────────────────────────
  await roleService.seedSystemRoles(TENANT, adminId.toString());
  const roleCount = await Role.countDocuments({ tenantId: TENANT });
  logger.info(`${roleCount} system roles seeded`);

  // ── Currencies ────────────────────────────────────────────────────────────
  await currencyService.seedDefaults(TENANT, adminId.toString());
  const currencyCount = await Currency.countDocuments({ tenantId: TENANT });
  logger.info(`${currencyCount} currencies seeded`);

  // ── Settings / Business Info ──────────────────────────────────────────────
  await Settings.findOneAndUpdate(
    { tenantId: TENANT },
    {
      $setOnInsert: {
        tenantId: TENANT,
        businessInfo: {
          name:     'Ebeano Supermarket & Hotel',
          tagline:  'Your one-stop shop for everything',
          email:    '247okolo@gmail.com',
          phone:    '+234 800 000 0001',
          address:  '12 Ebeano Street, Independence Layout',
          city:     'Enugu',
          state:    'Enugu State',
          country:  'Nigeria',
          taxId:    'TIN-000123456',
          rcNumber: 'RC-1234567',
        },
        baseCurrency: 'NGN',
        tax: { enabled: true, defaultRate: 7.5, taxName: 'VAT', inclusive: false },
        receipt: { showLogo: true, showTaxBreakdown: true, copies: 1, paperSize: 'thermal_80mm' },
        invoice: { prefix: 'INV', nextNumber: 1001, dueDays: 30 },
        pos: { requireCustomer: false, allowNegativeStock: false, defaultTaxRate: 7.5 },
        hotel: { checkInTime: '14:00', checkOutTime: '11:00', taxRate: 7.5 },
        notifications: { lowStockAlerts: true, lowStockThreshold: 10, emailAlerts: true },
        timezone: 'Africa/Lagos',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12h',
        fiscalYearStart: 1,
      },
    },
    { upsert: true }
  );
  logger.info('Business settings seeded');

  console.log('\n📋 Seed complete!');
  console.log('Login credentials:');
  usersData.forEach(u => console.log(`  ${u.role.padEnd(18)} ${u.email.padEnd(30)} ${u.password}`));
  console.log();

  await disconnectDB();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });




// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import path from 'path';

// dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// import { connectDB, disconnectDB } from '../config/database';
// import User from '../modules/users/user.model';
// import { hashPassword } from '../shared/utils/password';
// import logger from '../config/logger';

// const SEED_DATA = {
//   users: [
//     {
//       name:       'Super Admin',
//       email:      'trackstock123@gmail.com',
//       password:   'trackstock@123',
//       role:       'super_admin',
//       tenantId:   'default',
//       employeeId: 'TRA-0001',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Management',
//     },
//     {
//       name:       'Store Manager',
//       email:      'manager@trackstock.com',
//       password:   'Manager@123',
//       role:       'manager',
//       tenantId:   'default',
//       employeeId: 'TRA-0002',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Operations',
//     },
//     {
//       name:       'Head Cashier',
//       email:      'cashier@trackstock.com',
//       password:   'Cashier@123',
//       role:       'cashier',
//       tenantId:   'default',
//       employeeId: 'TRA-0003',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Sales',
//     },
//     {
//       name:       'Warehouse Manager',
//       email:      'warehouse@trackstock.com',
//       password:   'Warehouse@123',
//       role:       'warehouse_staff',
//       tenantId:   'default',
//       employeeId: 'TRA-0004',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Warehouse',
//     },
//     {
//       name:       'Hotel Staff',
//       email:      'hotel@trackstock.com',
//       password:   'Hotel@123',
//       role:       'hotel_staff',
//       tenantId:   'default',
//       employeeId: 'TRA-0005',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Hotel',
//     },
//     {
//       name:       'Accountant',
//       email:      'accounts@trackstock.com',
//       password:   'Accounts@123',
//       role:       'accountant',
//       tenantId:   'default',
//       employeeId: 'TRA-0006',
//       isActive:   true,
//       isEmailVerified: true,
//       department: 'Finance',
//     },
//   ],
// };

// async function seed(): Promise<void> {
//   logger.info('🌱 Starting database seed...');

//   try {
//     await connectDB();

//     // Clear existing users (only in dev/test)
//     if (process.env.NODE_ENV !== 'production') {
//       await User.deleteMany({ tenantId: 'default' });
//       logger.info('Cleared existing seed data');
//     }

//     // Create users
//     const usersToCreate = await Promise.all(
//       SEED_DATA.users.map(async (userData) => ({
//         ...userData,
//         password: await hashPassword(userData.password),
//       }))
//     );

//     const createdUsers = await User.insertMany(usersToCreate);
//     logger.info(`✅ Created ${createdUsers.length} users`);

//     // Print credentials for dev use
//     if (process.env.NODE_ENV !== 'production') {
//       console.log('\n📋 Seed Credentials:');
//       console.log('═══════════════════════════════════════════════════');
//       SEED_DATA.users.forEach(u => {
//         console.log(`${u.role.padEnd(20)} | ${u.email.padEnd(30)} | ${u.password}`);
//       });
//       console.log('═══════════════════════════════════════════════════\n');
//     }

//     logger.info('✅ Database seeding complete!');
//   } catch (error) {
//     logger.error('❌ Seeding failed:', error);
//     throw error;
//   } finally {
//     await disconnectDB();
//     process.exit(0);
//   }
// }

// seed().catch(error => {
//   console.error('Fatal seed error:', error);
//   process.exit(1);
// });
