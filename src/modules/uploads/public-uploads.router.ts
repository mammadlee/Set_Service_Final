import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import {
  createUploadService,
  UploadObjectNotFoundError,
  UploadObjectTooLargeError,
} from '../../lib/uploads';
import { Errors } from '../../lib/errors';

const router = Router();
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PUBLIC_PROFILE_PHOTO_KEY = new RegExp(
  `^workers/${UUID}/profile-photo/${UUID}\\.(?:jpg|jpeg|png|webp)$`,
  'i',
);
const PUBLIC_PROFILE_PHOTO_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isPublicProfilePhotoKey(value: string): boolean {
  return PUBLIC_PROFILE_PHOTO_KEY.test(value);
}

router.get('/*', async (req: Request, res: Response, next: NextFunction) => {
  const key = req.params[0];
  if (!key || !isPublicProfilePhotoKey(key)) {
    return next(Errors.notFound('Profile photo not found.', 'PROFILE_PHOTO_NOT_FOUND'));
  }

  try {
    const object = await createUploadService().getPublicObject(key);
    if (!PUBLIC_PROFILE_PHOTO_CONTENT_TYPES.has(object.contentType.toLowerCase())) {
      return next(Errors.notFound('Profile photo not found.', 'PROFILE_PHOTO_NOT_FOUND'));
    }

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    if (object.etag) res.set('ETag', object.etag);
    return res.status(200).type(object.contentType).send(object.body);
  } catch (error) {
    if (error instanceof UploadObjectNotFoundError) {
      return next(Errors.notFound('Profile photo not found.', 'PROFILE_PHOTO_NOT_FOUND'));
    }
    if (error instanceof UploadObjectTooLargeError) {
      return next(Errors.payloadTooLarge(
        'Profile photo exceeds the maximum supported size.',
        'PROFILE_PHOTO_TOO_LARGE',
      ));
    }
    return next(error);
  }
});

export default router;
