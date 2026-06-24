import type { proto } from '@whiskeysockets/baileys';

export interface NormalizedMessage {
  waId?: string;
  chatJid: string;
  isGroup: boolean;
  senderJid?: string;
  /** Best-effort human name of the sender (pushName), falls back to JID. */
  senderName?: string;
  ts: number; // unix seconds
  body: string;
  mediaType: string;
  fromMe: boolean;
}

/** Extract plain text from the many shapes a WhatsApp message can take. */
function extractText(msg: proto.IMessage | null | undefined): { body: string; mediaType: string } {
  if (!msg) return { body: '', mediaType: 'unknown' };
  if (msg.conversation) return { body: msg.conversation, mediaType: 'text' };
  if (msg.extendedTextMessage?.text)
    return { body: msg.extendedTextMessage.text, mediaType: 'text' };
  if (msg.imageMessage)
    return { body: msg.imageMessage.caption ?? '', mediaType: 'image' };
  if (msg.videoMessage)
    return { body: msg.videoMessage.caption ?? '', mediaType: 'video' };
  if (msg.documentMessage)
    return {
      body: msg.documentMessage.caption ?? msg.documentMessage.fileName ?? '',
      mediaType: 'document',
    };
  if (msg.buttonsResponseMessage?.selectedDisplayText)
    return { body: msg.buttonsResponseMessage.selectedDisplayText, mediaType: 'text' };
  if (msg.listResponseMessage?.title)
    return { body: msg.listResponseMessage.title, mediaType: 'text' };
  return { body: '', mediaType: 'unknown' };
}

export function normalize(m: proto.IWebMessageInfo): NormalizedMessage | null {
  const chatJid = m.key?.remoteJid ?? undefined;
  if (!chatJid) return null;
  // Skip status broadcasts.
  if (chatJid === 'status@broadcast') return null;

  const isGroup = chatJid.endsWith('@g.us');
  const { body, mediaType } = extractText(m.message);

  const tsRaw = m.messageTimestamp;
  const ts =
    typeof tsRaw === 'number'
      ? tsRaw
      : tsRaw
        ? Number(tsRaw.toString())
        : Math.floor(Date.now() / 1000);

  return {
    waId: m.key?.id ?? undefined,
    chatJid,
    isGroup,
    senderJid: (isGroup ? m.key?.participant : chatJid) ?? undefined,
    senderName: m.pushName ?? undefined,
    ts,
    body: body.trim(),
    mediaType,
    fromMe: Boolean(m.key?.fromMe),
  };
}
