import { CloudinaryUploadResult } from '../types';

export class CloudinaryUploadException extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'CloudinaryUploadException';
    this.statusCode = statusCode;
  }
}

/**
 * Service for uploading vehicle photos to Cloudinary using client-safe unsigned presets.
 * Follows exact configuration from Flutter's CloudinaryService and AppConfig.
 */
export async function uploadVehiclePhoto(
  ticketId: string,
  imageBlob: Blob,
  timeoutMs: number = 30000
): Promise<CloudinaryUploadResult> {
  if (!imageBlob || imageBlob.size === 0) {
    throw new CloudinaryUploadException('Mandatory vehicle photo cannot be empty.');
  }

  const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env
    : ((typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>);
  const cloudName = (metaEnv.VITE_CLOUDINARY_CLOUD_NAME || 'dwzlw6jeu').trim();
  const uploadPreset = (metaEnv.VITE_CLOUDINARY_UPLOAD_PRESET || 'car_parking_dev').trim();
  const baseFolder = (metaEnv.VITE_CLOUDINARY_FOLDER || 'parking_records').trim();

  if (!cloudName) {
    throw new CloudinaryUploadException('Cloudinary cloud name is not configured.');
  }
  if (!uploadPreset) {
    throw new CloudinaryUploadException('Cloudinary unsigned upload preset is not configured.');
  }

  const uploadUrl = "https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload";
  const folderPath = baseFolder + "/" + ticketId;

  const formData = new FormData();
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', folderPath);
  formData.append('file', imageBlob, 'vehicle_photo.jpg');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errorMsg = "Cloudinary upload failed (HTTP " + response.status + ").";
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMsg = errorJson.error.message;
        }
      } catch (_) {}
      throw new CloudinaryUploadException(errorMsg, response.status);
    }

    const data = await response.json();
    return {
      secureUrl: data.secure_url || '',
      publicId: data.public_id || '',
      bytes: data.bytes || 0,
      format: data.format || 'jpg',
      deleteToken: data.delete_token,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof CloudinaryUploadException) {
      throw err;
    }
    const error = err as Error;
    if (error.name === 'AbortError') {
      throw new CloudinaryUploadException(
        "Vehicle photo upload timed out after " + Math.round(timeoutMs / 1000) + "s. Please check internet connection."
      );
    }
    throw new CloudinaryUploadException(
      "Cloudinary upload network error: " + (error.message || 'Unknown network failure')
    );
  }
}
