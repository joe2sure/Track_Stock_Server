import { Request, Response, NextFunction } from 'express';
import { mediaService, upload } from './media.service';
import Product from '../products/product.model';
import Staff from '../staff/staff.model';
import Asset from '../assets/asset.model';
import Expense from '../expenses/expense.model';
import Settings from '../settings/settings.model';
import respond from '../../shared/utils/response';
import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { BadRequestError } from '../../shared/utils/errors';

// ── Product images ────────────────────────────────────────────────────────────
export async function uploadProductImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw new BadRequestError('No files uploaded');

    const tenantId = req.user?.tenantId ?? 'default';
    const results  = await mediaService.uploadMultiple(files, 'product', tenantId, req.params.id);

    // Append URLs to product gallery
    const urls = results.map(r => r.secureUrl);
    await Product.findOneAndUpdate({ _id: req.params.id, tenantId }, { $push: { images: { $each: urls } } });

    respond.success(res, { message: `${results.length} image(s) uploaded`, data: { images: results } });
  } catch (e) { next(e); }
}

export async function deleteProductImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { publicId } = req.body;
    if (!publicId) throw new BadRequestError('publicId is required');

    const tenantId = req.user?.tenantId ?? 'default';
    await mediaService.deleteImage(publicId);

    // Derive Cloudinary URL from publicId and remove from product array
    await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $pull: { images: { $regex: publicId } } }
    );

    respond.noContent(res);
  } catch (e) { next(e); }
}

// ── Staff profile photo ───────────────────────────────────────────────────────
export async function uploadStaffPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded');

    const tenantId = req.user?.tenantId ?? 'default';
    const result   = await mediaService.uploadImage(file, 'staff', tenantId, {
      entityId: req.params.id,
      resize:   { width: 400, height: 400, crop: 'fill' },
    });

    await Staff.findOneAndUpdate({ _id: req.params.id, tenantId }, { profileImage: result.secureUrl });

    respond.success(res, { message: 'Staff photo uploaded', data: { photo: result } });
  } catch (e) { next(e); }
}

// ── Asset images ──────────────────────────────────────────────────────────────
export async function uploadAssetImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw new BadRequestError('No files uploaded');

    const tenantId = req.user?.tenantId ?? 'default';
    const results  = await mediaService.uploadMultiple(files, 'asset', tenantId, req.params.id);

    const urls = results.map(r => r.secureUrl);
    await Asset.findOneAndUpdate({ _id: req.params.id, tenantId }, { $push: { images: { $each: urls } } });

    respond.success(res, { message: `${results.length} image(s) uploaded`, data: { images: results } });
  } catch (e) { next(e); }
}

// ── Expense receipts ──────────────────────────────────────────────────────────
export async function uploadExpenseReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded');

    const tenantId = req.user?.tenantId ?? 'default';
    const isPDF    = file.mimetype === 'application/pdf';

    const result = isPDF
      ? await mediaService.uploadDocument(file, 'expense', tenantId, `receipt-${req.params.id}`)
      : await mediaService.uploadImage(file, 'expense', tenantId, { entityId: req.params.id });

    await Expense.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $push: { receipts: { name: file.originalname, url: result.secureUrl, uploadedAt: new Date() } } }
    );

    respond.success(res, { message: 'Receipt uploaded', data: { receipt: result } });
  } catch (e) { next(e); }
}

// ── Business logo ─────────────────────────────────────────────────────────────
export async function uploadBusinessLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded');

    const tenantId = req.user?.tenantId ?? 'default';
    const result   = await mediaService.uploadImage(file, 'business_logo', tenantId, {
      resize: { width: 400, height: 200, crop: 'limit' },
    });

    await Settings.findOneAndUpdate({ tenantId }, { 'businessInfo.logoUrl': result.secureUrl }, { upsert: true });

    respond.success(res, { message: 'Logo uploaded', data: { logo: result } });
  } catch (e) { next(e); }
}

// ── Direct upload signature ───────────────────────────────────────────────────
export async function getUploadSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { context } = req.query as { context: string };
    const tenantId    = req.user?.tenantId ?? 'default';
    const folder      = `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'ebeano'}/${tenantId}/${context ?? 'misc'}`;
    const sig         = mediaService.generateUploadSignature(folder);
    respond.success(res, { message: 'Upload signature', data: sig });
  } catch (e) { next(e); }
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager';
const mgr: Role[] = ['super_admin','admin','manager'];

router.get('/signature',                                                  getUploadSignature);
router.post('/products/:id/images',   upload.array('images', 10),        uploadProductImages);
router.delete('/products/:id/images', authorize(...mgr),                  deleteProductImage);
router.post('/staff/:id/photo',       upload.single('photo'),             uploadStaffPhoto);
router.post('/assets/:id/images',     upload.array('images', 5),          uploadAssetImages);
router.post('/expenses/:id/receipt',  upload.single('receipt'),           uploadExpenseReceipt);
router.post('/logo',                  authorize(...mgr), upload.single('logo'), uploadBusinessLogo);

export default router;
