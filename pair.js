const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { makeid } = require('./id');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');

const router = express.Router();

function removeFile(FilePath) {
  if (fs.existsSync(FilePath)) {
    fs.rmSync(FilePath, { recursive: true, force: true });
  }
}

router.get('/', async (req, res) => {
  const id = makeid();
  let number = req.query.number;

  if (!number) {
    return res.status(400).send({ error: 'Missing number in query ?number=' });
  }

  number = number.replace(/[^0-9]/g, '');

  async function startPairing() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

    try {
      const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        }
      });

      sock.ev.on('creds.update', saveCreds);

      await delay(1500);
      const code = await sock.requestPairingCode(number);

      if (!res.headersSent) {
        res.send({ code });
      }

      sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
          await delay(5000);

          const filePath = path.join(__dirname, 'temp', id, 'creds.json');
          const creds = fs.readFileSync(filePath);
          const b64data = Buffer.from(creds).toString('base64');

          const session = await sock.sendMessage(sock.user.id, {
            text: 'DELTA_BOT~' + b64data
          });

          const message = `
╔════◇
║ You Have Completed the First Step to Deploy a DELTA BOT.
╚════════════════════════╝
╔═════◇
║  『••• 𝗩𝗶𝘀𝗶𝘁 𝗙𝗼𝗿 𝗛𝗲𝗹𝗽 •••』
║❒ Ytube: COMING SOON!
║❒ Owner: wa.me/256789810043_wa.me/263788521064
║❒ Repo: https://github.com/Frontier-Lord200/DELTA-MD-V1
║❒ WaChannel: https://whatsapp.com/channel/0029VbABN6947Xe9PIApgG47
║❒ Telechannel: https://t.me/frontdelta
╚════════════════════════╝`;

          await sock.sendMessage(sock.user.id, { text: message }, { quoted: session });

          await delay(1000);
          await sock.ws.close();
          removeFile('./temp/' + id);
        } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
          await delay(10000);
          startPairing(); // retry
        }
      });
    } catch (err) {
      console.error('Pairing error:', err);
      removeFile('./temp/' + id);
      if (!res.headersSent) {
        res.status(503).send({ code: 'Service Unavailable' });
      }
    }
  }

  await startPairing();
});

module.exports = router;
