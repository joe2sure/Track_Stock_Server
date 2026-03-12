import { Router } from 'express';
import * as ctrl from './hotel.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  createRoomTypeSchema, createRoomSchema, updateRoomStatusSchema,
  createBookingSchema, checkInSchema, checkOutSchema,
  folioChargeSchema, folioPaymentSchema,
  cancelBookingSchema, extendStaySchema,
  createHKTaskSchema, updateHKTaskSchema, assignHKTaskSchema,
} from './hotel.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'hotel_staff' | 'cashier';
const mgr:   Role[] = ['super_admin', 'admin', 'manager'];
const staff: Role[] = ['super_admin', 'admin', 'manager', 'hotel_staff'];
const hk:    Role[] = ['super_admin', 'admin', 'manager', 'hotel_staff'];

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', ctrl.getDashboard);

// ── Room Types ────────────────────────────────────────────────────────────────
router.get('/room-types',        ctrl.getRoomTypes);
router.post('/room-types',       authorize(...mgr), validate(createRoomTypeSchema), ctrl.createRoomType);
router.put('/room-types/:id',    authorize(...mgr), validate(createRoomTypeSchema.fork(['name','code','basePrice'], s => s.optional())), ctrl.updateRoomType);
router.delete('/room-types/:id', authorize(...mgr), ctrl.deleteRoomType);

// ── Rooms ─────────────────────────────────────────────────────────────────────
router.get('/rooms/availability',    ctrl.checkAvailability);
router.get('/rooms',                 ctrl.getRooms);
router.get('/rooms/:id',             ctrl.getRoomById);
router.post('/rooms',                authorize(...mgr),   validate(createRoomSchema),       ctrl.createRoom);
router.patch('/rooms/:id/status',    authorize(...staff), validate(updateRoomStatusSchema),  ctrl.updateRoomStatus);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings',              ctrl.getBookings);
router.get('/bookings/:id',          ctrl.getBookingById);
router.post('/bookings',             authorize(...staff), validate(createBookingSchema),     ctrl.createBooking);
router.patch('/bookings/:id/checkin',   authorize(...staff), validate(checkInSchema),        ctrl.checkIn);
router.patch('/bookings/:id/checkout',  authorize(...staff), validate(checkOutSchema),       ctrl.checkOut);
router.patch('/bookings/:id/cancel',    authorize(...mgr),   validate(cancelBookingSchema),  ctrl.cancelBooking);
router.patch('/bookings/:id/extend',    authorize(...staff), validate(extendStaySchema),     ctrl.extendStay);

// ── Folio ─────────────────────────────────────────────────────────────────────
router.post('/bookings/:id/folio/charges',                 authorize(...staff), validate(folioChargeSchema),  ctrl.addFolioCharge);
router.patch('/bookings/:id/folio/charges/:chargeId/void', authorize(...mgr),                                 ctrl.voidFolioCharge);
router.post('/bookings/:id/folio/payments',                authorize(...staff), validate(folioPaymentSchema), ctrl.addFolioPayment);

// ── Housekeeping ──────────────────────────────────────────────────────────────
router.get('/housekeeping',              ctrl.getHKTasks);
router.post('/housekeeping',             authorize(...hk), validate(createHKTaskSchema),  ctrl.createHKTask);
router.patch('/housekeeping/:id',        authorize(...hk), validate(updateHKTaskSchema),  ctrl.updateHKTask);
router.patch('/housekeeping/:id/assign', authorize(...mgr), validate(assignHKTaskSchema), ctrl.assignHKTask);

export default router;
