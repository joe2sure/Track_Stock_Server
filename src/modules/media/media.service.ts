import { v2 as cloudinary, UploadApiResponse, TransformationOptions } from 'cloudinary';
import multer from 'multer';
import { Request } from 'express';
import streamifier from 'streamifier';
import env from '../../config/env';
import logger from '../../config/logger';
import { BadRequestError } from '../../shared/utils/errors';

// ── Configure Cloudinary ──────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ── Folder structure ──────────────────────────────────────────────────────────
const FOLDERS = {
  product:       (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/products`,
  brand:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/brands`,
  category:      (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/categories`,
  staff:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/staff`,
  asset:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/assets`,
  expense:       (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/expenses`,
  business_logo: (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/logo`,
  room:          (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/hotel/rooms`,
};

export type UploadContext = keyof typeof FOLDERS;

// ── Multer config — memory storage ───────────────────────────────────────────
const ALLOWED_MIME = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'];
const MAX_SIZE_MB  = 10;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, GIF, PDF`));
    }
  },
});

export interface UploadResult {
  publicId:    string;
  url:         string;
  secureUrl:   string;
  format:      string;
  width?:      number;
  height?:     number;
  bytes:       number;
  resourceType:string;
  folder:      string;
}

// ── Typed upload options ──────────────────────────────────────────────────────
interface UploadBufferOptions {
  transformation?: TransformationOptions;
  tags?:           string | string[];
  resource_type?:  'image' | 'video' | 'raw' | 'auto';
  [key: string]:   unknown;
}

// ── Upload a single buffer to Cloudinary ─────────────────────────────────────
async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  filename: string,
  options: UploadBufferOptions = {}
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id:            filename,
        use_filename:         true,
        unique_filename:      true,
        overwrite:            true,
        resource_type:        'auto',
        transformation:       options.transformation,
        tags:                 options.tags,
        ...options,
      },
      (err, result?: UploadApiResponse) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve({
          publicId:    result.public_id,
          url:         result.url,
          secureUrl:   result.secure_url,
          format:      result.format,
          width:       result.width,
          height:      result.height,
          bytes:       result.bytes,
          resourceType:result.resource_type,
          folder:      result.folder ?? folder,
        });
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

export class MediaService {

  isConfigured(): boolean {
    return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  }

  // ── Upload single image ───────────────────────────────────────────────────
  async uploadImage(
    file: Express.Multer.File,
    context: UploadContext,
    tenantId: string,
    options: {
      entityId?: string;
      resize?: { width: number; height: number; crop?: string };
      quality?: number;
    } = {}
  ): Promise<UploadResult> {
    if (!this.isConfigured()) {
      throw new BadRequestError('Media uploads not configured — add Cloudinary credentials to environment');
    }

    const folder   = FOLDERS[context](tenantId);
    const filename = options.entityId
      ? `${context}-${options.entityId}-${Date.now()}`
      : `${context}-${Date.now()}`;

    const transformation: TransformationOptions = options.resize
      ? [{
          width:        options.resize.width,
          height:       options.resize.height,
          crop:         options.resize.crop ?? 'limit',
          quality:      options.quality ?? 'auto',
          fetch_format: 'auto',
        }]
      : [];

    const result = await uploadBuffer(file.buffer, folder, filename, {
      transformation: (transformation as TransformationOptions[]).length
        ? transformation
        : undefined,
    });

    logger.info(`Media uploaded: ${result.publicId} (${Math.round(result.bytes / 1024)}KB) ctx=${context}`);
    return result;
  }

  // ── Upload multiple images ────────────────────────────────────────────────
  async uploadMultiple(
    files: Express.Multer.File[],
    context: UploadContext,
    tenantId: string,
    entityId?: string
  ): Promise<UploadResult[]> {
    if (files.length > 10) throw new BadRequestError('Maximum 10 files per upload');
    return Promise.all(files.map(f => this.uploadImage(f, context, tenantId, { entityId })));
  }

  // ── Upload PDF (receipt, document) ───────────────────────────────────────
  async uploadDocument(
    file: Express.Multer.File,
    context: UploadContext,
    tenantId: string,
    label?: string
  ): Promise<UploadResult> {
    if (!this.isConfigured()) throw new BadRequestError('Media uploads not configured');
    const folder   = FOLDERS[context](tenantId);
    const filename = `${label ?? context}-doc-${Date.now()}`;
    return uploadBuffer(file.buffer, folder, filename, { resource_type: 'raw' });
  }

  // ── Delete image by public ID ─────────────────────────────────────────────
  async deleteImage(publicId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (err) {
      logger.error(`Cloudinary delete failed: ${publicId} — ${(err as Error).message}`);
      return false;
    }
  }

  // ── Delete multiple images ────────────────────────────────────────────────
  async deleteMultiple(publicIds: string[]): Promise<{ deleted: number; failed: number }> {
    if (!this.isConfigured() || !publicIds.length) return { deleted: 0, failed: 0 };
    const results = await Promise.allSettled(publicIds.map(id => this.deleteImage(id)));
    const deleted = results.filter(r => r.status === 'fulfilled' && r.value).length;
    return { deleted, failed: publicIds.length - deleted };
  }

  // ── Generate thumbnail URL ────────────────────────────────────────────────
  getThumbnailUrl(secureUrl: string, width = 200, height = 200): string {
    if (!secureUrl.includes('cloudinary')) return secureUrl;
    return secureUrl.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
  }

  // ── Sign upload for direct browser upload (advanced) ─────────────────────
  generateUploadSignature(folder: string): {
    signature: string; timestamp: number; apiKey: string; cloudName: string; folder: string;
  } {
    if (!this.isConfigured()) throw new BadRequestError('Cloudinary not configured');
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      env.CLOUDINARY_API_SECRET
    );
    return {
      signature,
      timestamp,
      apiKey:    env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      folder,
    };
  }
}

export const mediaService = new MediaService();



// import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
// import multer from 'multer';
// import { Request } from 'express';
// import streamifier from 'streamifier';
// import env from '../../config/env';
// import logger from '../../config/logger';
// import { BadRequestError } from '../../shared/utils/errors';

// // ── Configure Cloudinary ──────────────────────────────────────────────────────
// cloudinary.config({
//   cloud_name: env.CLOUDINARY_CLOUD_NAME,
//   api_key:    env.CLOUDINARY_API_KEY,
//   api_secret: env.CLOUDINARY_API_SECRET,
//   secure:     true,
// });

// // ── Folder structure ──────────────────────────────────────────────────────────
// const FOLDERS = {
//   product:       (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/products`,
//   brand:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/brands`,
//   category:      (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/categories`,
//   staff:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/staff`,
//   asset:         (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/assets`,
//   expense:       (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/expenses`,
//   business_logo: (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/logo`,
//   room:          (tenantId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${tenantId}/hotel/rooms`,
// };

// export type UploadContext = keyof typeof FOLDERS;

// // ── Multer config — memory storage ───────────────────────────────────────────
// const ALLOWED_MIME = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'];
// const MAX_SIZE_MB  = 10;

// export const upload = multer({
//   storage: multer.memoryStorage(),
//   limits:  { fileSize: MAX_SIZE_MB * 1024 * 1024 },
//   fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
//     if (ALLOWED_MIME.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, GIF, PDF`));
//     }
//   },
// });

// export interface UploadResult {
//   publicId:    string;
//   url:         string;
//   secureUrl:   string;
//   format:      string;
//   width?:      number;
//   height?:     number;
//   bytes:       number;
//   resourceType:string;
//   folder:      string;
// }

// // ── Upload a single buffer to Cloudinary ─────────────────────────────────────
// async function uploadBuffer(
//   buffer: Buffer,
//   folder: string,
//   filename: string,
//   options: Record<string, unknown> = {}
// ): Promise<UploadResult> {
//   return new Promise((resolve, reject) => {
//     const stream = cloudinary.uploader.upload_stream(
//       {
//         folder,
//         public_id:            filename,
//         use_filename:         true,
//         unique_filename:      true,
//         overwrite:            true,
//         resource_type:        'auto',
//         transformation:       options.transformation,
//         tags:                 options.tags,
//         ...options,
//       },
//       (err, result?: UploadApiResponse) => {
//         if (err || !result) return reject(err ?? new Error('Upload failed'));
//         resolve({
//           publicId:    result.public_id,
//           url:         result.url,
//           secureUrl:   result.secure_url,
//           format:      result.format,
//           width:       result.width,
//           height:      result.height,
//           bytes:       result.bytes,
//           resourceType:result.resource_type,
//           folder:      result.folder ?? folder,
//         });
//       }
//     );
//     streamifier.createReadStream(buffer).pipe(stream);
//   });
// }

// export class MediaService {

//   isConfigured(): boolean {
//     return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
//   }

//   // ── Upload single image ───────────────────────────────────────────────────
//   async uploadImage(
//     file: Express.Multer.File,
//     context: UploadContext,
//     tenantId: string,
//     options: {
//       entityId?: string;
//       resize?: { width: number; height: number; crop?: string };
//       quality?: number;
//     } = {}
//   ): Promise<UploadResult> {
//     if (!this.isConfigured()) {
//       throw new BadRequestError('Media uploads not configured — add Cloudinary credentials to environment');
//     }

//     const folder   = FOLDERS[context](tenantId);
//     const filename = options.entityId
//       ? `${context}-${options.entityId}-${Date.now()}`
//       : `${context}-${Date.now()}`;

//     const transformation: Record<string, unknown>[] = [];
//     if (options.resize) {
//       transformation.push({
//         width:   options.resize.width,
//         height:  options.resize.height,
//         crop:    options.resize.crop ?? 'limit',
//         quality: options.quality ?? 'auto',
//         fetch_format: 'auto',
//       });
//     }

//     const result = await uploadBuffer(file.buffer, folder, filename, {
//       transformation: transformation.length ? transformation : undefined,
//     });

//     logger.info(`Media uploaded: ${result.publicId} (${Math.round(result.bytes / 1024)}KB) ctx=${context}`);
//     return result;
//   }

//   // ── Upload multiple images ────────────────────────────────────────────────
//   async uploadMultiple(
//     files: Express.Multer.File[],
//     context: UploadContext,
//     tenantId: string,
//     entityId?: string
//   ): Promise<UploadResult[]> {
//     if (files.length > 10) throw new BadRequestError('Maximum 10 files per upload');
//     return Promise.all(files.map(f => this.uploadImage(f, context, tenantId, { entityId })));
//   }

//   // ── Upload PDF (receipt, document) ───────────────────────────────────────
//   async uploadDocument(
//     file: Express.Multer.File,
//     context: UploadContext,
//     tenantId: string,
//     label?: string
//   ): Promise<UploadResult> {
//     if (!this.isConfigured()) throw new BadRequestError('Media uploads not configured');
//     const folder   = FOLDERS[context](tenantId);
//     const filename = `${label ?? context}-doc-${Date.now()}`;
//     return uploadBuffer(file.buffer, folder, filename, { resource_type: 'raw' });
//   }

//   // ── Delete image by public ID ─────────────────────────────────────────────
//   async deleteImage(publicId: string): Promise<boolean> {
//     if (!this.isConfigured()) return false;
//     try {
//       const result = await cloudinary.uploader.destroy(publicId);
//       return result.result === 'ok';
//     } catch (err) {
//       logger.error(`Cloudinary delete failed: ${publicId} — ${(err as Error).message}`);
//       return false;
//     }
//   }

//   // ── Delete multiple images ────────────────────────────────────────────────
//   async deleteMultiple(publicIds: string[]): Promise<{ deleted: number; failed: number }> {
//     if (!this.isConfigured() || !publicIds.length) return { deleted: 0, failed: 0 };
//     const results = await Promise.allSettled(publicIds.map(id => this.deleteImage(id)));
//     const deleted = results.filter(r => r.status === 'fulfilled' && r.value).length;
//     return { deleted, failed: publicIds.length - deleted };
//   }

//   // ── Generate thumbnail URL ────────────────────────────────────────────────
//   getThumbnailUrl(secureUrl: string, width = 200, height = 200): string {
//     if (!secureUrl.includes('cloudinary')) return secureUrl;
//     return secureUrl.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
//   }

//   // ── Sign upload for direct browser upload (advanced) ─────────────────────
//   generateUploadSignature(folder: string): {
//     signature: string; timestamp: number; apiKey: string; cloudName: string; folder: string;
//   } {
//     if (!this.isConfigured()) throw new BadRequestError('Cloudinary not configured');
//     const timestamp = Math.round(Date.now() / 1000);
//     const params    = `folder=${folder}&timestamp=${timestamp}`;
//     const signature = cloudinary.utils.api_sign_request(
//       { folder, timestamp },
//       env.CLOUDINARY_API_SECRET
//     );
//     return {
//       signature,
//       timestamp,
//       apiKey:    env.CLOUDINARY_API_KEY,
//       cloudName: env.CLOUDINARY_CLOUD_NAME,
//       folder,
//     };
//   }
// }

// export const mediaService = new MediaService();