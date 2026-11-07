import type { JsonValue } from "@/contracts/json";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { getOwnedChatInTransaction } from "@/modules/chats/chat.service";
import { getMessageInTransaction } from "@/modules/messages/message.service";
import { createHmac, randomUUID } from "node:crypto";
import { maxAttachmentsPerUpload, maxAttachmentBytes, mediaTypeSchema, type AttachmentRecord } from "@/contracts/attachments";
import { getTransloaditConfig } from "@/lib/config";
import { attachToMessage, createAttachment, completeAttachment, failAttachments, findOwnedAttachments, findReadyUnattachedByUrls } from "./attachment.repository";

export interface AttachmentService {
  create(input: CreateOwnedAttachmentInput): ReturnType<typeof createOwnedAttachment>;
}

export type CreateOwnedAttachmentInput = {
  ownerId: string;
  chatId: string;
  messageId?: string;
  storageKey: string;
  filename: string;
  mediaType: string;
  byteSize: bigint;
  position: number;
  metadata?: JsonValue;
};

export class UploadConfigurationError extends Error {}
export class UploadNotFoundError extends Error {}
export class UploadVerificationError extends Error {}

export function createOwnedAttachment(input: CreateOwnedAttachmentInput) {
  return withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat) throw new Error("Chat not found.");
    if (input.messageId) {
      const message = await getMessageInTransaction(transaction, input.messageId);
      if (!message || message.chatId !== input.chatId) throw new Error("Message not found.");
    }
    return createAttachment(transaction, input);
  });
}

export async function createUploadOptions(input: { ownerId: string; chatId: string; files: Array<{ name: string; type: string; size: number }> }) {
  const config = getTransloaditConfig();
  if (!config) throw new UploadConfigurationError();
  if (input.files.length === 0 || input.files.length > maxAttachmentsPerUpload) throw new UploadVerificationError();
  for (const file of input.files) {
    if (!mediaTypeSchema.safeParse(file.type).success || file.size <= 0 || file.size > maxAttachmentBytes) throw new UploadVerificationError();
  }
  const attachments = await withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat) throw new UploadNotFoundError();
    return Promise.all(input.files.map((file, position) => createAttachment(transaction, {
      chatId: input.chatId,
      ownerId: input.ownerId,
      storageKey: `transloadit:${input.chatId}:${randomUUID()}`,
      filename: file.name,
      mediaType: file.type,
      byteSize: BigInt(file.size),
      position,
      metadata: { originalName: file.name, expectedBytes: file.size },
    })));
  });
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  const params = JSON.stringify({
    auth: { key: config.key, expires },
    template_id: config.templateId,
    nonce: randomUUID(),
    fields: { chat_id: input.chatId, owner_id: input.ownerId, attachment_ids: attachments.map((attachment) => attachment.id).join(",") },
  });
  const signature = `${config.signatureAlgorithm}:${createHmac(config.signatureAlgorithm, config.secret).update(params).digest("hex")}`;
  return { params, signature, attachments: attachments.map(toAttachment) };
}

export async function completeUpload(input: { ownerId: string; chatId: string; attachmentIds: string[]; assemblyUrl: string }) {
  if (!isTransloaditAssemblyUrl(input.assemblyUrl)) throw new UploadVerificationError();
  const attachments = await withTransaction(async (transaction) => findOwnedAttachments(transaction, input.attachmentIds, input.ownerId, input.chatId));
  if (attachments.length !== input.attachmentIds.length || attachments.some((attachment) => attachment.status !== "pending")) throw new UploadNotFoundError();
  const response = await fetch(input.assemblyUrl, { signal: AbortSignal.timeout(15_000) });
  const status = await response.json().catch(() => null) as unknown;
  if (!response.ok || !status || typeof status !== "object") throw new UploadVerificationError();
  const record = status as { ok?: unknown; fields?: unknown; uploads?: unknown };
  if (record.ok !== "ASSEMBLY_COMPLETED" || !validFields(record.fields, input)) {
    await withTransaction((transaction) => failAttachments(transaction, input.attachmentIds));
    throw new UploadVerificationError();
  }
  const uploads = Array.isArray(record.uploads) ? record.uploads : [];
  if (uploads.length !== attachments.length) throw new UploadVerificationError();
  const completed = await withTransaction(async (transaction) => Promise.all(attachments.map((attachment, index) => {
    const upload = uploads[index] as { ssl_url?: unknown; size?: unknown; mime?: unknown } | undefined;
    const mediaType = mediaTypeSchema.safeParse(upload?.mime);
    if (!upload || typeof upload.ssl_url !== "string" || !mediaType.success || typeof upload.size !== "number" || upload.size <= 0 || upload.size > maxAttachmentBytes) throw new UploadVerificationError();
    return completeAttachment(transaction, attachment.id, { assemblyId: assemblyId(input.assemblyUrl), url: upload.ssl_url, byteSize: BigInt(upload.size), mediaType: mediaType.data });
  })));
  return completed.map(toAttachment);
}

export async function attachUploadedMediaInTransaction(transaction: DatabaseTransaction, input: { ownerId: string; chatId: string; messageId: string; text: string }) {
  const urls = [...new Set(input.text.match(/https:\/\/[^\s]+/g) ?? [])];
  if (urls.length === 0) return;
  const attachments = await findReadyUnattachedByUrls(transaction, input.ownerId, input.chatId, urls);
  for (const [position, attachment] of attachments.entries()) {
    await attachToMessage(transaction, attachment.id, input.messageId, position);
  }
}

function validFields(fields: unknown, input: { ownerId: string; chatId: string; attachmentIds: string[] }) {
  if (!fields || typeof fields !== "object") return false;
  const values = fields as Record<string, unknown>;
  return values.chat_id === input.chatId && values.owner_id === input.ownerId && values.attachment_ids === input.attachmentIds.join(",");
}

function isTransloaditAssemblyUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && /(^|\.)transloadit\.com$/.test(url.hostname) && /^\/assemblies\/[a-z0-9]+$/.test(url.pathname); } catch { return false; }
}

function assemblyId(value: string) { return new URL(value).pathname.split("/").at(-1)!; }

function toAttachment(attachment: { id: string; filename: string; mediaType: string; byteSize: bigint; position: number; status: string; url: string | null }): AttachmentRecord {
  return { id: attachment.id, filename: attachment.filename, mediaType: mediaTypeSchema.parse(attachment.mediaType), byteSize: Number(attachment.byteSize), position: attachment.position, status: attachment.status as AttachmentRecord["status"], url: attachment.url };
}
