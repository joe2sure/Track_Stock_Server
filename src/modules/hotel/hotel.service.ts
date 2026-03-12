import mongoose, { Types } from 'mongoose';
import RoomType, { IRoomType } from './roomType.model';
import Room, { IRoom, RoomStatus } from './room.model';
import Booking, { IBooking, IFolioCharge, IFolioPayment } from './booking.model';
import HousekeepingTask, { IHousekeepingTask } from './housekeeping.model';
import {
  parsePagination, buildPaginationMeta, buildDateRangeQuery, buildSearchQuery,
} from '../../shared/utils/pagination';
import { getOrSet, deleteCache, CachePrefix } from '../../shared/utils/cache';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import { emitToTenant } from '../../server';
import logger from '../../config/logger';

// ── Booking number generator ─────────────────────────────────────────────────
async function genBookingNumber(tenantId: string): Promise<string> {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Booking.countDocuments({
    tenantId,
    createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
  });
  return `BK-${ym}-${String(count + 1).padStart(4, '0')}`;
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6; // Fri, Sat
}

function calcRoomCharges(rate: number, nights: number, checkIn: Date, weekendRate?: number): number {
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const night = new Date(checkIn.getTime() + i * 86_400_000);
    total += (weekendRate && isWeekend(night)) ? weekendRate : rate;
  }
  return total;
}

// ── Folio totals ─────────────────────────────────────────────────────────────
function recomputeFolio(booking: IBooking): void {
  const activeCharges = booking.folioCharges.filter(c => !c.isVoid);
  const roomChargeTotal = activeCharges
    .filter(c => c.type === 'room_charge')
    .reduce((s, c) => s + c.amount, 0);
  const extraChargeTotal = activeCharges
    .filter(c => !['room_charge','discount','tax'].includes(c.type))
    .reduce((s, c) => s + c.amount, 0);
  const discountTotal = activeCharges
    .filter(c => c.type === 'discount')
    .reduce((s, c) => s + Math.abs(c.amount), 0);
  const taxTotal = activeCharges
    .filter(c => c.type === 'tax')
    .reduce((s, c) => s + c.amount, 0);

  const paidTotal = booking.folioPayments.reduce((s, p) => s + p.amount, 0);

  booking.roomCharges   = roomChargeTotal || booking.roomCharges;
  booking.extraCharges  = extraChargeTotal;
  booking.discountAmount = discountTotal;
  booking.taxAmount     = taxTotal;
  booking.totalAmount   = booking.roomCharges + extraChargeTotal + taxTotal - discountTotal;
  booking.amountPaid    = paidTotal;
  booking.balanceDue    = Math.max(0, booking.totalAmount - paidTotal);

  const diff = paidTotal - booking.totalAmount;
  if (paidTotal <= 0)       booking.paymentStatus = 'unpaid';
  else if (diff > 0.01)     booking.paymentStatus = 'overpaid';
  else if (diff > -0.01)    booking.paymentStatus = 'paid';
  else                      booking.paymentStatus = 'partial';
}

// ── Service ──────────────────────────────────────────────────────────────────
export class HotelService {

  // ── Room Types ─────────────────────────────────────────────────────────────
  async getRoomTypes(tenantId: string): Promise<IRoomType[]> {
    return RoomType.find({ tenantId, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean() as Promise<IRoomType[]>;
  }

  async createRoomType(input: Partial<IRoomType>, tenantId: string, userId: string): Promise<IRoomType> {
    const exists = await RoomType.findOne({ code: (input.code ?? '').toUpperCase(), tenantId });
    if (exists) throw new ConflictError(`Room type code "${input.code}" already exists`);
    return RoomType.create({ ...input, tenantId, createdBy: userId });
  }

  async updateRoomType(id: string, input: Partial<IRoomType>, tenantId: string): Promise<IRoomType> {
    const rt = await RoomType.findOneAndUpdate({ _id: id, tenantId }, input, { new: true, runValidators: true });
    if (!rt) throw new NotFoundError('Room type');
    return rt;
  }

  async deleteRoomType(id: string, tenantId: string): Promise<void> {
    const roomCount = await Room.countDocuments({ roomTypeId: id, tenantId });
    if (roomCount > 0) throw new BadRequestError(`Cannot delete: ${roomCount} rooms use this type`);
    await RoomType.findOneAndDelete({ _id: id, tenantId });
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────
  async getRooms(
    query: PaginationQuery & { status?: string; floor?: string; roomTypeId?: string },
    tenantId: string
  ): Promise<PaginatedResult<IRoom>> {
    const { page, limit, skip, sort } = parsePagination(query, 'roomNumber');
    const filter: Record<string, unknown> = { tenantId };
    if (query.status)     filter.status     = query.status;
    if (query.floor)      filter.floor      = parseInt(query.floor, 10);
    if (query.roomTypeId) filter.roomTypeId = query.roomTypeId;
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['roomNumber', 'building']));

    const [data, total] = await Promise.all([
      Room.find(filter)
        .populate('roomTypeId', 'name code basePrice weekendPrice maxOccupancy bedType amenities')
        .populate('currentBookingId', 'bookingNumber checkOutDate guests')
        .sort(sort).skip(skip).limit(limit).lean(),
      Room.countDocuments(filter),
    ]);
    return { data: data as IRoom[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getRoomById(id: string, tenantId: string): Promise<IRoom> {
    const room = await Room.findOne({ _id: id, tenantId })
      .populate('roomTypeId')
      .populate('currentBookingId', 'bookingNumber checkInDate checkOutDate guests status');
    if (!room) throw new NotFoundError('Room');
    return room;
  }

  async getRoomAvailability(
    checkIn: Date, checkOut: Date, roomTypeId: string | undefined, tenantId: string
  ): Promise<IRoom[]> {
    // Find rooms with overlapping bookings
    const busy = await Booking.find({
      tenantId,
      status: { $in: ['confirmed', 'reserved', 'checked_in'] },
      checkInDate:  { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
    }).select('roomId').lean();

    const busyIds = busy.map(b => b.roomId);

    const filter: Record<string, unknown> = {
      tenantId,
      status: { $in: ['available', 'cleaning'] },
      _id:    { $nin: busyIds },
    };
    if (roomTypeId) filter.roomTypeId = roomTypeId;

    return Room.find(filter)
      .populate('roomTypeId', 'name code basePrice weekendPrice maxOccupancy bedType amenities')
      .lean() as Promise<IRoom[]>;
  }

  async createRoom(input: Partial<IRoom>, tenantId: string, userId: string): Promise<IRoom> {
    const exists = await Room.findOne({ roomNumber: input.roomNumber, tenantId });
    if (exists) throw new ConflictError(`Room "${input.roomNumber}" already exists`);
    const rt = await RoomType.findOne({ _id: input.roomTypeId, tenantId });
    if (!rt) throw new NotFoundError('Room type');
    return Room.create({ ...input, tenantId, createdBy: userId });
  }

  async updateRoomStatus(id: string, input: { status: RoomStatus; notes?: string; maintenanceNote?: string }, tenantId: string): Promise<IRoom> {
    const room = await Room.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: input.status,
        ...(input.notes            && { notes: input.notes }),
        ...(input.maintenanceNote  && { maintenanceNote: input.maintenanceNote }),
        ...(input.status === 'available' && { isClean: true, lastCleanedAt: new Date() }),
      },
      { new: true }
    );
    if (!room) throw new NotFoundError('Room');
    return room;
  }

  // ── Bookings ───────────────────────────────────────────────────────────────
  async getBookings(
    query: PaginationQuery & {
      status?: string; roomId?: string; checkInDate?: string;
      checkOutDate?: string; from?: string; to?: string;
    },
    tenantId: string
  ): Promise<PaginatedResult<IBooking>> {
    const { page, limit, skip } = parsePagination(query, 'checkInDate');
    const filter: Record<string, unknown> = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.roomId) filter.roomId = query.roomId;
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['bookingNumber','roomNumber','guests.name','companyName']));

    if (query.checkInDate)  filter.checkInDate  = { $gte: new Date(query.checkInDate) };
    if (query.checkOutDate) filter.checkOutDate = { $lte: new Date(query.checkOutDate) };
    else Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'checkInDate'));

    const [data, total] = await Promise.all([
      Booking.find(filter)
        .populate('roomId', 'roomNumber floor building')
        .populate('roomTypeId', 'name code')
        .populate('createdBy', 'name')
        .sort({ checkInDate: -1 }).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter),
    ]);
    return { data: data as IBooking[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getBookingById(id: string, tenantId: string): Promise<IBooking> {
    const b = await Booking.findOne({ _id: id, tenantId })
      .populate('roomId', 'roomNumber floor building status')
      .populate('roomTypeId', 'name code basePrice amenities')
      .populate('createdBy', 'name email')
      .populate('checkedInBy', 'name')
      .populate('checkedOutBy', 'name')
      .populate('customerId', 'name phone email');
    if (!b) throw new NotFoundError('Booking');
    return b;
  }

  async createBooking(
    input: {
      roomId: string; checkInDate: Date; checkOutDate: Date;
      guests: IBooking['guests']; customerId?: string;
      adults?: number; children?: number; source?: IBooking['source'];
      ratePerNight?: number; discountAmount?: number; taxRate?: number;
      specialRequests?: string; notes?: string;
      companyName?: string; corporateRate?: number; groupCode?: string;
    },
    tenantId: string,
    userId: string
  ): Promise<IBooking> {
    const room = await Room.findOne({ _id: input.roomId, tenantId }).populate<{ roomTypeId: IRoomType }>('roomTypeId');
    if (!room) throw new NotFoundError('Room');
    if (['maintenance', 'out_of_order', 'blocked'].includes(room.status)) {
      throw new BadRequestError(`Room is ${room.status} and cannot be booked`);
    }

    const checkIn  = new Date(input.checkInDate);
    const checkOut = new Date(input.checkOutDate);

    // Check availability — no overlapping active bookings
    const overlap = await Booking.findOne({
      tenantId,
      roomId: input.roomId,
      status: { $in: ['confirmed', 'reserved', 'checked_in'] },
      checkInDate:  { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
    });
    if (overlap) throw new ConflictError(`Room is already booked from ${overlap.checkInDate.toDateString()} to ${overlap.checkOutDate.toDateString()}`);

    const nights  = nightsBetween(checkIn, checkOut);
    const rt      = room.roomTypeId as IRoomType;
    const rate    = input.ratePerNight ?? input.corporateRate ?? rt.basePrice;
    const roomCharges = calcRoomCharges(rate, nights, checkIn, rt.weekendPrice);
    const discount    = input.discountAmount ?? 0;
    const taxRate     = input.taxRate ?? 0;
    const taxAmount   = parseFloat(((roomCharges - discount) * taxRate / 100).toFixed(2));
    const totalAmount = parseFloat((roomCharges - discount + taxAmount).toFixed(2));

    // Ensure at least one guest is flagged main
    const guests = input.guests.map((g, idx) => ({ ...g, isMainGuest: g.isMainGuest || idx === 0 }));

    const bookingNumber = await genBookingNumber(tenantId);

    // Initial room charge folio entry
    const initialCharge: Omit<IFolioCharge, '_id'> = {
      type: 'room_charge',
      description: `Room ${room.roomNumber} — ${nights} night${nights > 1 ? 's' : ''} @ ₦${rate.toLocaleString()}/night`,
      quantity: nights,
      unitPrice: rate,
      amount: roomCharges,
      date: new Date(),
      postedBy: new Types.ObjectId(userId),
      isVoid: false,
    };

    const booking = await Booking.create({
      bookingNumber,
      roomId:       input.roomId,
      roomTypeId:   rt._id,
      roomNumber:   room.roomNumber,
      roomTypeName: rt.name,
      status:       'confirmed',
      source:       input.source ?? 'walk_in',
      guests,
      customerId:   input.customerId,
      checkInDate:  checkIn,
      checkOutDate: checkOut,
      nights,
      ratePerNight: rate,
      roomCharges,
      extraCharges:   0,
      discountAmount: discount,
      taxRate,
      taxAmount,
      totalAmount,
      amountPaid:     0,
      balanceDue:     totalAmount,
      folioCharges:   [initialCharge],
      folioPayments:  [],
      paymentStatus:  'unpaid',
      adults:         input.adults ?? 1,
      children:       input.children ?? 0,
      specialRequests:input.specialRequests,
      notes:          input.notes,
      companyName:    input.companyName,
      corporateRate:  input.corporateRate,
      groupCode:      input.groupCode,
      createdBy:      userId,
      tenantId,
    });

    // Update room status to reserved
    await Room.findByIdAndUpdate(input.roomId, {
      status:           'reserved',
      currentBookingId: booking._id,
    });

    logger.info(`Booking created: ${bookingNumber} room=${room.roomNumber} ${checkIn.toDateString()}→${checkOut.toDateString()}`);
    emitToTenant(tenantId, 'new_booking', { bookingId: booking._id, bookingNumber, roomNumber: room.roomNumber });

    return Booking.findById(booking._id)
      .populate('roomId', 'roomNumber floor')
      .populate('roomTypeId', 'name') as Promise<IBooking>;
  }

  async checkIn(id: string, input: { actualCheckIn?: Date; notes?: string; initialPayment?: { method: IFolioPayment['method']; amount: number; reference?: string } }, tenantId: string, userId: string): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: id, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    if (!['confirmed', 'reserved'].includes(booking.status)) {
      throw new BadRequestError(`Cannot check in — booking status is "${booking.status}"`);
    }

    booking.status        = 'checked_in';
    booking.actualCheckIn = input.actualCheckIn ?? new Date();
    booking.checkedInBy   = new Types.ObjectId(userId);
    if (input.notes) booking.internalNotes = input.notes;

    if (input.initialPayment) {
      booking.folioPayments.push({
        method:     input.initialPayment.method,
        amount:     input.initialPayment.amount,
        reference:  input.initialPayment.reference,
        paidAt:     new Date(),
        receivedBy: new Types.ObjectId(userId),
      } as IFolioPayment);
      recomputeFolio(booking);
    }

    await booking.save();

    await Room.findByIdAndUpdate(booking.roomId, { status: 'occupied' });

    // Create stayover housekeeping tasks for each day
    await this._scheduleStayoverTasks(booking, tenantId, userId);

    logger.info(`Check-in: ${booking.bookingNumber} room=${booking.roomNumber}`);
    emitToTenant(tenantId, 'hotel_checkin', { bookingId: id, roomNumber: booking.roomNumber });

    return booking;
  }

  async checkOut(id: string, input: { actualCheckOut?: Date; finalPayment?: { method: IFolioPayment['method']; amount: number; reference?: string }; notes?: string }, tenantId: string, userId: string): Promise<IBooking> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const booking = await Booking.findOne({ _id: id, tenantId }).session(session);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.status !== 'checked_in') {
        throw new BadRequestError(`Cannot check out — booking status is "${booking.status}"`);
      }

      // Post final payment if provided
      if (input.finalPayment) {
        booking.folioPayments.push({
          method:     input.finalPayment.method,
          amount:     input.finalPayment.amount,
          reference:  input.finalPayment.reference,
          paidAt:     new Date(),
          receivedBy: new Types.ObjectId(userId),
          notes:      input.notes,
        } as IFolioPayment);
      }

      booking.status          = 'checked_out';
      booking.actualCheckOut  = input.actualCheckOut ?? new Date();
      booking.checkedOutBy    = new Types.ObjectId(userId);
      recomputeFolio(booking);

      await booking.save({ session });

      // Release room — mark as needing cleaning
      await Room.findByIdAndUpdate(booking.roomId, {
        status:           'cleaning',
        isClean:          false,
        currentBookingId: null,
      }, { session });

      // Create checkout cleaning task
      await HousekeepingTask.create([{
        roomId:        booking.roomId,
        roomNumber:    booking.roomNumber,
        taskType:      'checkout_clean',
        priority:      'high',
        status:        'pending',
        scheduledDate: new Date(),
        bookingId:     booking._id,
        tenantId,
        createdBy:     userId,
      }], { session });

      await session.commitTransaction();

      logger.info(`Check-out: ${booking.bookingNumber} room=${booking.roomNumber} balance=${booking.balanceDue}`);
      emitToTenant(tenantId, 'hotel_checkout', { bookingId: id, roomNumber: booking.roomNumber, balance: booking.balanceDue });

      return booking;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ── Folio operations ───────────────────────────────────────────────────────
  async addFolioCharge(
    bookingId: string,
    charge: { type: IFolioCharge['type']; description: string; quantity: number; unitPrice: number; date?: Date },
    tenantId: string,
    userId: string
  ): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: bookingId, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status === 'checked_out') throw new BadRequestError('Cannot add charges to a checked-out booking');
    if (booking.status === 'cancelled')   throw new BadRequestError('Cannot add charges to a cancelled booking');

    booking.folioCharges.push({
      type:        charge.type,
      description: charge.description,
      quantity:    charge.quantity,
      unitPrice:   charge.unitPrice,
      amount:      parseFloat((charge.quantity * charge.unitPrice).toFixed(2)),
      date:        charge.date ?? new Date(),
      postedBy:    new Types.ObjectId(userId),
      isVoid:      false,
    } as IFolioCharge);

    recomputeFolio(booking);
    await booking.save();
    return booking;
  }

  async voidFolioCharge(bookingId: string, chargeId: string, tenantId: string): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: bookingId, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    const charge = booking.folioCharges.find(c => c._id?.toString() === chargeId);
    if (!charge) throw new NotFoundError('Folio charge');
    if (charge.isVoid) throw new BadRequestError('Charge is already voided');
    charge.isVoid = true;
    recomputeFolio(booking);
    await booking.save();
    return booking;
  }

  async addFolioPayment(bookingId: string, payment: { method: IFolioPayment['method']; amount: number; reference?: string; notes?: string }, tenantId: string, userId: string): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: bookingId, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status === 'cancelled') throw new BadRequestError('Cannot add payment to a cancelled booking');

    booking.folioPayments.push({
      method:     payment.method,
      amount:     payment.amount,
      reference:  payment.reference,
      paidAt:     new Date(),
      receivedBy: new Types.ObjectId(userId),
      notes:      payment.notes,
    } as IFolioPayment);

    recomputeFolio(booking);
    await booking.save();
    return booking;
  }

  // ── Cancel booking ─────────────────────────────────────────────────────────
  async cancelBooking(id: string, input: { reason: string; cancellationCharge?: number }, tenantId: string, userId: string): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: id, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    if (['checked_in', 'checked_out', 'cancelled'].includes(booking.status)) {
      throw new BadRequestError(`Cannot cancel a booking with status "${booking.status}"`);
    }

    await Booking.findByIdAndUpdate(id, {
      status:             'cancelled',
      cancellationReason: input.reason,
      cancelledAt:        new Date(),
      cancellationCharge: input.cancellationCharge ?? 0,
    });

    // Free the room
    await Room.findByIdAndUpdate(booking.roomId, {
      status:           'available',
      currentBookingId: null,
    });

    // Cancel pending housekeeping tasks for this booking
    await HousekeepingTask.updateMany(
      { bookingId: id, status: 'pending', tenantId },
      { status: 'skipped' }
    );

    logger.info(`Booking cancelled: ${booking.bookingNumber} reason="${input.reason}"`);
    return Booking.findById(id) as Promise<IBooking>;
  }

  // ── Extend stay ────────────────────────────────────────────────────────────
  async extendStay(id: string, input: { newCheckOutDate: Date; newRatePerNight?: number; notes?: string }, tenantId: string, userId: string): Promise<IBooking> {
    const booking = await Booking.findOne({ _id: id, tenantId });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== 'checked_in') throw new BadRequestError('Can only extend a checked-in booking');

    const newCheckOut = new Date(input.newCheckOutDate);
    if (newCheckOut <= booking.checkOutDate) throw new BadRequestError('New check-out must be after current check-out');

    // Check no other booking blocks the extra nights
    const overlap = await Booking.findOne({
      tenantId,
      roomId: booking.roomId,
      _id:    { $ne: id },
      status: { $in: ['confirmed', 'reserved', 'checked_in'] },
      checkInDate:  { $lt: newCheckOut },
      checkOutDate: { $gt: booking.checkOutDate },
    });
    if (overlap) throw new ConflictError('Room is already booked during the extension period');

    const extraNights = nightsBetween(booking.checkOutDate, newCheckOut);
    const rate        = input.newRatePerNight ?? booking.ratePerNight;
    const extraCharge = calcRoomCharges(rate, extraNights, booking.checkOutDate);

    booking.checkOutDate  = newCheckOut;
    booking.nights        += extraNights;
    booking.roomCharges   += extraCharge;

    // Post extension charge to folio
    booking.folioCharges.push({
      type:        'room_charge',
      description: `Stay extension — ${extraNights} night${extraNights > 1 ? 's' : ''} @ ₦${rate.toLocaleString()}/night`,
      quantity:    extraNights,
      unitPrice:   rate,
      amount:      extraCharge,
      date:        new Date(),
      postedBy:    new Types.ObjectId(userId),
      isVoid:      false,
    } as IFolioCharge);

    recomputeFolio(booking);
    if (input.notes) booking.internalNotes = input.notes;
    await booking.save();

    logger.info(`Stay extended: ${booking.bookingNumber} new checkout=${newCheckOut.toDateString()}`);
    return booking;
  }

  // ── Private: schedule stayover HK tasks ───────────────────────────────────
  private async _scheduleStayoverTasks(booking: IBooking, tenantId: string, userId: string): Promise<void> {
    if (booking.nights <= 1) return;
    const tasks = [];
    for (let i = 1; i < booking.nights; i++) {
      const d = new Date(booking.checkInDate.getTime() + i * 86_400_000);
      tasks.push({
        roomId:        booking.roomId,
        roomNumber:    booking.roomNumber,
        taskType:      'stayover_clean',
        priority:      'normal',
        status:        'pending',
        scheduledDate: d,
        bookingId:     booking._id,
        tenantId,
        createdBy:     userId,
      });
    }
    if (tasks.length) await HousekeepingTask.insertMany(tasks);
  }

  // ── Housekeeping ───────────────────────────────────────────────────────────
  async getHKTasks(
    query: PaginationQuery & { status?: string; assignedTo?: string; date?: string; priority?: string },
    tenantId: string
  ): Promise<PaginatedResult<IHousekeepingTask>> {
    const { page, limit, skip, sort } = parsePagination(query, 'scheduledDate');
    const filter: Record<string, unknown> = { tenantId };
    if (query.status)     filter.status     = query.status;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.priority)   filter.priority   = query.priority;
    if (query.date) {
      const d = new Date(query.date);
      filter.scheduledDate = { $gte: d, $lt: new Date(d.getTime() + 86_400_000) };
    }

    const [data, total] = await Promise.all([
      HousekeepingTask.find(filter)
        .populate('roomId', 'roomNumber floor building')
        .populate('assignedTo', 'name')
        .sort(sort).skip(skip).limit(limit).lean(),
      HousekeepingTask.countDocuments(filter),
    ]);
    return { data: data as IHousekeepingTask[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async createHKTask(input: Partial<IHousekeepingTask>, tenantId: string, userId: string): Promise<IHousekeepingTask> {
    const room = await Room.findOne({ _id: input.roomId, tenantId });
    if (!room) throw new NotFoundError('Room');
    const task = await HousekeepingTask.create({ ...input, roomNumber: room.roomNumber, tenantId, createdBy: userId });
    return task;
  }

  async updateHKTask(id: string, input: { status: IHousekeepingTask['status']; notes?: string; issueDescription?: string; checklistCompleted?: string[] }, tenantId: string, userId: string): Promise<IHousekeepingTask> {
    const task = await HousekeepingTask.findOne({ _id: id, tenantId });
    if (!task) throw new NotFoundError('Housekeeping task');

    const updates: Partial<IHousekeepingTask> = { status: input.status };
    if (input.notes)              updates.notes             = input.notes;
    if (input.issueDescription)   updates.issueDescription  = input.issueDescription;
    if (input.checklistCompleted) updates.checklistCompleted = input.checklistCompleted;

    if (input.status === 'in_progress' && !task.startedAt) updates.startedAt  = new Date();
    if (input.status === 'completed')                       updates.completedAt = new Date();

    const updated = await HousekeepingTask.findByIdAndUpdate(id, updates, { new: true });

    // When a task is completed, mark room as clean + available (if not occupied)
    if (input.status === 'completed') {
      const room = await Room.findById(task.roomId);
      if (room && room.status === 'cleaning') {
        await Room.findByIdAndUpdate(task.roomId, {
          status:        'available',
          isClean:       true,
          lastCleanedAt: new Date(),
          lastCleanedBy: userId,
        });
      }
    }

    return updated!;
  }

  async assignHKTask(id: string, assignedTo: string, tenantId: string): Promise<IHousekeepingTask> {
    const task = await HousekeepingTask.findOneAndUpdate(
      { _id: id, tenantId },
      { assignedTo, assignedAt: new Date() },
      { new: true }
    ).populate('assignedTo', 'name');
    if (!task) throw new NotFoundError('Housekeeping task');
    return task;
  }

  // ── Hotel dashboard ────────────────────────────────────────────────────────
  async getDashboard(tenantId: string) {
    return getOrSet(`hotel:dashboard:${tenantId}`, async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay   = new Date(startOfDay.getTime() + 86_400_000);

      const [
        roomStats,
        todayArrivals,
        todayDepartures,
        inHouseGuests,
        pendingHKTasks,
        weeklyRevenue,
        occupancyTrend,
      ] = await Promise.all([
        // Room status breakdown
        Room.aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        // Today's arrivals
        Booking.countDocuments({
          tenantId,
          checkInDate: { $gte: startOfDay, $lt: endOfDay },
          status: { $in: ['confirmed', 'reserved'] },
        }),
        // Today's departures
        Booking.countDocuments({
          tenantId,
          checkOutDate: { $gte: startOfDay, $lt: endOfDay },
          status: 'checked_in',
        }),
        // In-house guests
        Booking.countDocuments({ tenantId, status: 'checked_in' }),
        // Pending HK tasks
        HousekeepingTask.countDocuments({ tenantId, status: 'pending' }),
        // Revenue last 7 days
        Booking.aggregate([
          { $match: {
            tenantId,
            status: { $in: ['checked_in', 'checked_out'] },
            actualCheckIn: { $gte: new Date(Date.now() - 7 * 86_400_000) },
          }},
          { $group: {
            _id:           { $dateToString: { format: '%Y-%m-%d', date: '$actualCheckIn' } },
            revenue:       { $sum: '$totalAmount' },
            bookings:      { $sum: 1 },
          }},
          { $sort: { _id: 1 } },
        ]),
        // 30-day occupancy trend
        Booking.aggregate([
          { $match: {
            tenantId,
            status: { $in: ['checked_in', 'checked_out'] },
            checkInDate: { $gte: new Date(Date.now() - 30 * 86_400_000) },
          }},
          { $group: {
            _id:      { $dateToString: { format: '%Y-%m-%d', date: '$checkInDate' } },
            occupied: { $sum: 1 },
          }},
          { $sort: { _id: 1 } },
        ]),
      ]);

      const totalRooms = await Room.countDocuments({ tenantId });
      const roomStatusMap = roomStats.reduce<Record<string, number>>((acc, s) => {
        acc[s._id as string] = s.count as number;
        return acc;
      }, {});
      const occupiedCount = roomStatusMap['occupied'] ?? 0;
      const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedCount / totalRooms) * 100).toFixed(1)) : 0;

      return {
        rooms:          { total: totalRooms, ...roomStatusMap, occupancyRate },
        today:          { arrivals: todayArrivals, departures: todayDepartures, inHouse: inHouseGuests },
        pendingHKTasks,
        weeklyRevenue,
        occupancyTrend,
      };
    }, { prefix: CachePrefix.DASHBOARD, ttl: 120 }); // 2 min cache
  }
}

export const hotelService = new HotelService();
