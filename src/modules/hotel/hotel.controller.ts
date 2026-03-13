import { Request, Response, NextFunction } from 'express';
import { hotelService } from './hotel.service';
import respond from '../../shared/utils/response';

// ── Dashboard ────────────────────────────────────────────────────────────────
export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await hotelService.getDashboard(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Hotel dashboard', data });
  } catch (e) { next(e); }
}

// ── Room Types ────────────────────────────────────────────────────────────────
export async function getRoomTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roomTypes = await hotelService.getRoomTypes(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Room types retrieved', data: { roomTypes } });
  } catch (e) { next(e); }
}

export async function createRoomType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rt = await hotelService.createRoomType(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Room type created', data: { roomType: rt } });
  } catch (e) { next(e); }
}

export async function updateRoomType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rt = await hotelService.updateRoomType(req.params.id as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Room type updated', data: { roomType: rt } });
  } catch (e) { next(e); }
}

export async function deleteRoomType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await hotelService.deleteRoomType(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.noContent(res);
  } catch (e) { next(e); }
}

// ── Rooms ─────────────────────────────────────────────────────────────────────
export async function getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await hotelService.getRooms(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Rooms retrieved');
  } catch (e) { next(e); }
}

export async function getRoomById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await hotelService.getRoomById(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Room retrieved', data: { room } });
  } catch (e) { next(e); }
}

export async function checkAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { checkInDate, checkOutDate, roomTypeId } = req.query as Record<string, string>;
    if (!checkInDate || !checkOutDate) throw new Error('checkInDate and checkOutDate are required');
    const rooms = await hotelService.getRoomAvailability(
      new Date(checkInDate), new Date(checkOutDate),
      roomTypeId, req.user?.tenantId ?? 'default'
    );
    respond.success(res, { message: 'Available rooms', data: { rooms, count: rooms.length } });
  } catch (e) { next(e); }
}

export async function createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await hotelService.createRoom(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Room created', data: { room } });
  } catch (e) { next(e); }
}

export async function updateRoomStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const room = await hotelService.updateRoomStatus(req.params.id as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Room status updated', data: { room } });
  } catch (e) { next(e); }
}

// ── Bookings ──────────────────────────────────────────────────────────────────
export async function getBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await hotelService.getBookings(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Bookings retrieved');
  } catch (e) { next(e); }
}

export async function getBookingById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.getBookingById(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Booking retrieved', data: { booking } });
  } catch (e) { next(e); }
}

export async function createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.createBooking(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Booking confirmed', data: { booking } });
  } catch (e) { next(e); }
}

export async function checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.checkIn(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Guest checked in successfully', data: { booking } });
  } catch (e) { next(e); }
}

export async function checkOut(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.checkOut(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Guest checked out successfully', data: { booking } });
  } catch (e) { next(e); }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.cancelBooking(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Booking cancelled', data: { booking } });
  } catch (e) { next(e); }
}

export async function extendStay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.extendStay(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Stay extended', data: { booking } });
  } catch (e) { next(e); }
}

// ── Folio ─────────────────────────────────────────────────────────────────────
export async function addFolioCharge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.addFolioCharge(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Charge posted to folio', data: { booking } });
  } catch (e) { next(e); }
}

export async function voidFolioCharge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.voidFolioCharge(req.params.id as string, req.params.chargeId as string, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Folio charge voided', data: { booking } });
  } catch (e) { next(e); }
}

export async function addFolioPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await hotelService.addFolioPayment(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Payment posted to folio', data: { booking } });
  } catch (e) { next(e); }
}

// ── Housekeeping ──────────────────────────────────────────────────────────────
export async function getHKTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await hotelService.getHKTasks(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Housekeeping tasks retrieved');
  } catch (e) { next(e); }
}

export async function createHKTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await hotelService.createHKTask(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Housekeeping task created', data: { task } });
  } catch (e) { next(e); }
}

export async function updateHKTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await hotelService.updateHKTask(req.params.id as string, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Task updated', data: { task } });
  } catch (e) { next(e); }
}

export async function assignHKTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await hotelService.assignHKTask(req.params.id as string, req.body.assignedTo, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Task assigned', data: { task } });
  } catch (e) { next(e); }
}
