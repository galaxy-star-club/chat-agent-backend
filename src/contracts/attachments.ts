import { z } from "zod";

export const mediaTypeSchema = z.enum([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4",
]);
export const maxAttachmentBytes = 512 * 1024 * 1024;
export const maxAttachmentsPerUpload = 4;

export const uploadFileSchema = z.strictObject({
  name: z.string().min(1).max(255),
  type: mediaTypeSchema,
  size: z.number().int().positive().max(maxAttachmentBytes),
});

export const createUploadRequestSchema = z.strictObject({
  files: z.array(uploadFileSchema).min(1).max(maxAttachmentsPerUpload),
});

export const attachmentSchema = z.strictObject({
  id: z.uuid(),
  filename: z.string().min(1),
  mediaType: mediaTypeSchema,
  byteSize: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  status: z.enum(["pending", "ready", "failed"]),
  url: z.url().nullable(),
});

export const uploadOptionsResponseSchema = z.strictObject({
  params: z.string().min(1),
  signature: z.string().min(1),
  attachments: z.array(attachmentSchema).min(1),
});

export const completeUploadRequestSchema = z.strictObject({
  assemblyUrl: z.url(),
  attachmentIds: z.array(z.uuid()).min(1).max(maxAttachmentsPerUpload),
});

export const completeUploadResponseSchema = z.strictObject({
  attachments: z.array(attachmentSchema),
});

export type AttachmentRecord = z.infer<typeof attachmentSchema>;
