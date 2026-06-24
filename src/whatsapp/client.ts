import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const logger = pino({ level: 'warn' });

export interface WhatsAppClient {
  sock: WASocket;
  /** Resolves once the socket has connected and is ready. */
  ready: Promise<void>;
}

/**
 * Connect to WhatsApp via Baileys. Prints a QR code in the terminal on first run;
 * after pairing, auth state persists under `authDir` so subsequent runs are silent.
 *
 * NOTE: This uses an unofficial WhatsApp Web connection (against WhatsApp ToS).
 * Keep usage read-mostly to reduce the risk of the number being restricted.
 */
export async function connectWhatsApp(
  authDir: string,
  onSocket: (sock: WASocket) => void,
): Promise<WhatsAppClient> {
  const resolvedAuth = path.resolve(authDir);
  if (!fs.existsSync(resolvedAuth)) fs.mkdirSync(resolvedAuth, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(resolvedAuth);
  const { version } = await fetchLatestBaileysVersion();

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false, // less intrusive; avoids hijacking phone presence
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n[whatsapp] Scan this QR with WhatsApp > Linked Devices:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('[whatsapp] connected.');
      resolveReady();
    }
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode as
        | number
        | undefined;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.warn(
        `[whatsapp] connection closed (code ${statusCode ?? 'unknown'}).` +
          (loggedOut ? ' Logged out — delete auth_state and re-pair.' : ' Reconnecting...'),
      );
      if (!loggedOut) {
        // Reconnect with a fresh socket.
        setTimeout(() => {
          connectWhatsApp(authDir, onSocket).catch((e) =>
            console.error('[whatsapp] reconnect failed:', e),
          );
        }, 3000);
      }
    }
  });

  onSocket(sock);
  return { sock, ready };
}
