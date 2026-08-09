import qrcode from 'qrcode';
import * as BaileysNS from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { ulid } from 'ulid';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index';
import { whatsappChats, whatsappMessages, customers } from '../db/schema';
import { classifyWhatsAppChat } from './classify';
import { handleCustomerMessage } from './bot';
import { waSessionDir } from '../lib/paths';

// esbuild CJS bundles make an external package's "default" resolve to the whole
// module object, so reach through to the real named exports defensively.
const _Baileys: any = BaileysNS;
const BaileysApi = (_Baileys.makeWASocket ? _Baileys : _Baileys.default) as any;
const makeWASocket = BaileysApi.makeWASocket as typeof BaileysNS.makeWASocket;
const useMultiFileAuthState = BaileysApi.useMultiFileAuthState as typeof BaileysNS.useMultiFileAuthState;
const DisconnectReason = BaileysApi.DisconnectReason as typeof BaileysNS.DisconnectReason;
const isJidBroadcast = BaileysApi.isJidBroadcast as typeof BaileysNS.isJidBroadcast;
const fetchLatestBaileysVersion = BaileysApi.fetchLatestBaileysVersion as typeof BaileysNS.fetchLatestBaileysVersion;

const SESSION_DIR = waSessionDir();

interface WaStatus {
  connected: boolean;
  connecting: boolean;
  qr: string | null;
  qrDataUrl: string | null;
  phone: string | null;
  lastError: string | null;
}

const status: WaStatus = {
  connected: false,
  connecting: false,
  qr: null,
  qrDataUrl: null,
  phone: null,
  lastError: null,
};

let sock: WASocket | null = null;
let starting = false;

export function getWhatsAppStatus(): WaStatus {
  return { ...status };
}

// Normalize a phone number or JID into a WhatsApp JID (e.g. "0821234567" -> "27821234567@s.whatsapp.net").
export function normalizeJid(input: string): string {
  if (input.includes('@')) return input;
  const digits = input.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function normalizeDisplayPhone(jid: string): string {
  // "27821234567@s.whatsapp.net" or "27632947683:78@s.whatsapp.net" -> "27632947683"
  const base = jid.split('@')[0] || '';
  return base.split(':')[0].replace(/\D/g, '');
}

export function detectMessageType(message: any): string {
  if (!message) return 'unknown';
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.contactMessage) return 'contact';
  if (message.locationMessage) return 'location';
  if (message.reactionMessage) return 'reaction';
  return 'unknown';
}

export function extractMessageContent(message: any): string | null {
  if (!message) return null;
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage) return `[Document] ${message.documentMessage.fileName || ''}`.trim();
  if (message.audioMessage) return '[Voice message]';
  if (message.stickerMessage) return '[Sticker]';
  if (message.contactMessage) return '[Contact]';
  if (message.locationMessage) return '[Location]';
  if (message.reactionMessage) return '[Reaction]';
  return null;
}

async function persistMessage(msg: any, fromHistory = false) {
  try {
    const key = msg?.key;
    if (!key?.remoteJid) return;
    if (isJidBroadcast(key.remoteJid)) return;
    // Skip our own push-name / sender-key noise
    const chatId = String(key.remoteJid);
    const messageKey = String(key.id || `${Date.now()}_${Math.random()}`);
    const existing = await db.select({ id: whatsappMessages.id }).from(whatsappMessages).where(eq(whatsappMessages.messageKey, messageKey));
    if (existing.length) return;

    const fromMe = Boolean(key.fromMe);
    const content = extractMessageContent(msg.message) || '';
    const rawTs = msg.messageTimestamp;
    const ts = typeof rawTs === 'number' ? rawTs * 1000 : typeof rawTs === 'string' ? Number(rawTs) * 1000 : Date.now();
    const timestamp = new Date(ts);
    const unread = fromHistory || fromMe ? 0 : 1;

    await db.insert(whatsappChats).values({
      id: chatId,
      contactPhone: normalizeDisplayPhone(chatId),
      lastMessageAt: timestamp,
      lastMessagePreview: content || '(media)',
      unread,
    }).onConflictDoUpdate({
      target: whatsappChats.id,
      set: {
        contactPhone: normalizeDisplayPhone(chatId),
        lastMessageAt: timestamp,
        lastMessagePreview: content || '(media)',
        unread,
      },
    });

    await db.insert(whatsappMessages).values({
      id: ulid(),
      chatId,
      messageKey,
      fromMe: fromMe ? 1 : 0,
      messageType: detectMessageType(msg.message),
      content: content || '',
      timestamp,
    });
    void classifyWhatsAppChat(chatId);
  } catch (err) {
    console.error('[whatsapp] persist failed:', err);
  }
}

async function persistHistoryChat(chat: any, contactMap: Map<string, any>) {
  try {
    const id = chat?.id;
    if (!id || isJidBroadcast(id)) return;
    const contact = contactMap.get(id);
    const contactName = contact?.name || contact?.notify || chat?.name || null;
    const rawTs = chat?.conversationTimestamp || chat?.t;
    const timestamp = rawTs ? new Date(Number(rawTs) * 1000) : new Date();
    await db.insert(whatsappChats).values({
      id,
      contactName,
      contactPhone: normalizeDisplayPhone(id),
      lastMessageAt: timestamp,
      lastMessagePreview: chat?.lastMessage?.message?.conversation || extractMessageContent(chat?.lastMessage?.message) || '(media)',
      unread: chat?.unreadCount || 0,
    }).onConflictDoUpdate({
      target: whatsappChats.id,
      set: {
        contactName,
        contactPhone: normalizeDisplayPhone(id),
        lastMessageAt: timestamp,
        lastMessagePreview: chat?.lastMessage?.message?.conversation || extractMessageContent(chat?.lastMessage?.message) || '(media)',
        unread: chat?.unreadCount || 0,
      },
    });
    void classifyWhatsAppChat(id);
  } catch (err) {
    console.error('[whatsapp] history chat persist failed:', err);
  }
}

export async function startWhatsApp() {
  if (starting) return;
  if (sock) return;
  starting = true;
  status.connecting = true;
  status.lastError = null;
  status.qr = null;
  status.qrDataUrl = null;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    let version: [number, number, number];
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = [2, 3000, 1015901307];
    }
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['DJ TECH', 'Chrome', '14.0'],
      markOnlineOnConnect: true,
      syncFullHistory: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messaging-history.set', ({ chats = [], contacts = [], messages = [] }: any) => {
      const contactMap = new Map<string, any>();
      for (const c of contacts) contactMap.set(c?.id, c);
      console.log(`[whatsapp] history sync received: ${chats.length} chats, ${messages.length} messages`);
      for (const chat of chats) {
        void persistHistoryChat(chat, contactMap);
      }
      for (const m of messages) {
        void persistMessage(m, true);
      }
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
      for (const u of updates) {
        const name = u?.name || u?.notify;
        if (u?.id && name) {
          void db.update(whatsappChats).set({ contactName: name }).where(eq(whatsappChats.id, u.id)).catch(() => { /* noop */ });
        }
      }
    });

    sock.ev.on('chats.update', (updates: any[]) => {
      for (const u of updates) {
        if (!u?.id) continue;
        const patch: Record<string, any> = {};
        if (u.unreadCount !== undefined) patch.unread = u.unreadCount || 0;
        if (u.lastMessagePreview) patch.lastMessagePreview = u.lastMessagePreview;
        if (Object.keys(patch).length) {
          void db.update(whatsappChats).set(patch).where(eq(whatsappChats.id, u.id)).catch(() => { /* noop */ });
        }
      }
    });

    sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        status.qr = qr;
        void qrcode.toDataURL(qr, { margin: 1 }).then((url) => { status.qrDataUrl = url; }).catch(() => { /* noop */ });
      }
      if (connection === 'open') {
        status.connected = true;
        status.connecting = false;
        status.qr = null;
        status.qrDataUrl = null;
        status.phone = normalizeDisplayPhone(sock?.user?.id || '') || null;
        console.log('[whatsapp] connected as', status.phone);
      }
      if (connection === 'close') {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        status.connected = false;
        status.connecting = false;
        const loggedOut = code === DisconnectReason.loggedOut;
        if (loggedOut) {
          status.lastError = 'Logged out — rescan the QR code.';
          console.log('[whatsapp] logged out');
        }
        const closed = sock;
        sock = null;
        starting = false;
        if (!loggedOut) {
          setTimeout(() => { void startWhatsApp(); }, 5000);
        } else {
          void closed?.logout().catch(() => { /* noop */ });
        }
      }
    });

    sock.ev.on('messages.upsert', (ev: any) => {
      const messages: any[] = ev?.messages || [];
      for (const m of messages) {
        void persistMessage(m);
        void handleCustomerMessage(m, {
          sendText: sendWhatsAppText,
          sendDocument: sendWhatsAppDocument,
        });
      }
    });
  } catch (err: any) {
    status.connecting = false;
    status.lastError = err?.message || String(err);
    console.error('[whatsapp] init failed:', err);
    sock = null;
  } finally {
    starting = false;
  }
}

export async function logoutWhatsApp() {
  const current = sock;
  sock = null;
  starting = false;
  status.connected = false;
  status.connecting = false;
  status.qr = null;
  status.qrDataUrl = null;
  status.phone = null;
  status.lastError = 'Logged out';
  if (current) {
    try { await current.logout(); } catch { /* noop */ }
  }
}

export async function sendWhatsAppText(to: string, text: string) {
  if (!sock) throw new Error('WhatsApp is not connected. Scan the QR code in Settings first.');
  const jid = normalizeJid(to);
  const sent = await sock.sendMessage(jid, { text });
  await persistMessage({
    key: { remoteJid: jid, fromMe: true, id: sent?.key?.id || `loc_${Date.now()}` },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });
  return sent;
}

// Send a document (e.g. PDF) as a WhatsApp document message with an optional caption.
export async function sendWhatsAppDocument(to: string, content: Buffer, filename: string, mimetype = 'application/octet-stream', caption?: string) {
  if (!sock) throw new Error('WhatsApp is not connected. Scan the QR code in Settings first.');
  const jid = normalizeJid(to);
  const sent = await sock.sendMessage(jid, {
    document: content,
    mimetype,
    fileName: filename,
    caption,
    contextInfo: { forwardingScore: 0 },
  });
  await persistMessage({
    key: { remoteJid: jid, fromMe: true, id: sent?.key?.id || `loc_${Date.now()}` },
    message: { documentMessage: { fileName: filename, mimetype } },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });
  return sent;
}

// Send a photo (e.g. device condition shot) as a WhatsApp image message.
export async function sendWhatsAppImage(to: string, content: Buffer, caption?: string) {
  if (!sock) throw new Error('WhatsApp is not connected. Scan the QR code in Settings first.');
  const jid = normalizeJid(to);
  const sent = await sock.sendMessage(jid, {
    image: content,
    caption,
    contextInfo: { forwardingScore: 0 },
  });
  await persistMessage({
    key: { remoteJid: jid, fromMe: true, id: sent?.key?.id || `loc_${Date.now()}` },
    message: { imageMessage: { caption: caption || '', mimetype: 'image/jpeg' } },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });
  return sent;
}

export async function getWhatsAppChats() {
  const rows = await db.select().from(whatsappChats).orderBy(desc(whatsappChats.lastMessageAt)).limit(200);
  return rows;
}

export async function getWhatsAppMessages(chatId: string) {
  return db.select().from(whatsappMessages).where(eq(whatsappMessages.chatId, chatId)).orderBy(desc(whatsappMessages.timestamp)).limit(200);
}

export async function markChatRead(chatId: string) {
  await db.update(whatsappChats).set({ unread: 0 }).where(eq(whatsappChats.id, chatId));
  if (sock) {
    try { await sock.readMessages([{ remoteJid: chatId, id: 'read', fromMe: false }]); } catch { /* noop */ }
  }
}

// Create a customer from a WhatsApp chat's details and link the chat to it.
export async function createCustomerFromChat(chatId: string, data: { fullName: string; phone?: string; email?: string; companyName?: string }) {
  const chatRows = await db.select().from(whatsappChats).where(eq(whatsappChats.id, chatId));
  const chat = chatRows[0];
  const fullName = (data.fullName || chat?.contactName || '').trim() || normalizeDisplayPhone(chatId);
  const phone = (data.phone || chat?.contactPhone || '').trim();
  const newId = ulid();
  await db.insert(customers).values({
    id: newId,
    fullName,
    companyName: data.companyName?.trim() || null,
    phone: phone || null,
    email: data.email?.trim() || null,
    customerType: 'individual',
    status: 'active',
  });
  await db.update(whatsappChats).set({ customerId: newId, contactName: fullName }).where(eq(whatsappChats.id, chatId));
  return { id: newId, fullName, phone, email: data.email || null };
}
