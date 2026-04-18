# Solana Sniper Bot — Installatiegids

> **Bijwerken:** voeg nieuwe systeemafhankelijkheden hier toe zodra ze worden geïntroduceerd.

---

## Systeemvereisten

| Component | Minimaal | Getest op |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Node.js | 18.x LTS | 18.19.1 |
| npm | 9.x | 9.2.0 |
| RAM | 1 GB | 2 GB |
| Schijf | 2 GB vrij | — |

---

## 1. Systeem voorbereiding

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 18 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Native module compiler (vereist voor better-sqlite3)
sudo apt install -y build-essential python3 make

# Git
sudo apt install -y git

# Optioneel: firewall openen voor dashboard + bot socket
sudo ufw allow 3000/tcp   # dashboard
sudo ufw allow 3001/tcp   # bot Socket.io
```

---

## 2. Project klonen

```bash
sudo mkdir -p /opt/claude
cd /opt/claude
git clone https://github.com/wnjinvest/solana_sniper_bot.git solana-sniper-bot
cd solana-sniper-bot
```

---

## 3. Afhankelijkheden installeren

```bash
# Bot
cd bot && npm install && cd ..

# Dashboard (--legacy-peer-deps vereist vanwege peer conflicts)
cd dashboard && npm install --legacy-peer-deps && cd ..
```

### Dashboard bouwen (productie)

```bash
cd dashboard && npm run build && cd ..
```

---

## 4. Omgevingsvariabelen configureren

```bash
cp bot/.env.example bot/.env
nano bot/.env
```

Vul minimaal in:

| Variabele | Beschrijving |
|---|---|
| `HELIUS_API_KEY` | API-sleutel van [helius.dev](https://helius.dev) |
| `HELIUS_RPC_URL` | RPC endpoint (inclusief API-sleutel) |
| `HELIUS_WS_URL` | WebSocket endpoint (inclusief API-sleutel) |
| `WALLET_PRIVATE_KEY` | Base58 private key van je Solana-wallet |
| `DRY_RUN` | `true` voor test, `false` voor echte trades |
| `BUY_AMOUNT_SOL` | Inzet per trade in SOL (bijv. `0.05`) |

Alle overige variabelen hebben werkende standaardwaarden in `.env.example`.

---

## 5. Mappen aanmaken

```bash
mkdir -p /opt/claude/solana-sniper-bot/logs
mkdir -p /opt/claude/solana-sniper-bot/dashboard/data
```

---

## 6. Diensten instellen met systemd

Maak twee service-units aan — één voor de bot, één voor het dashboard.

### 6a. Bot service

```bash
sudo nano /etc/systemd/system/sniper-bot.service
```

Inhoud:

```ini
[Unit]
Description=Solana Sniper Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/claude/solana-sniper-bot/bot
ExecStart=/usr/bin/npx ts-node src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/claude/solana-sniper-bot/logs/bot.out.log
StandardError=append:/opt/claude/solana-sniper-bot/logs/bot.err.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 6b. Dashboard service

```bash
sudo nano /etc/systemd/system/sniper-dashboard.service
```

Inhoud:

```ini
[Unit]
Description=Solana Sniper Dashboard
After=network-online.target sniper-bot.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/claude/solana-sniper-bot/dashboard
ExecStart=/usr/bin/npx next start -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/claude/solana-sniper-bot/logs/dashboard.out.log
StandardError=append:/opt/claude/solana-sniper-bot/logs/dashboard.err.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 6c. Services activeren

```bash
sudo systemctl daemon-reload

sudo systemctl enable sniper-bot
sudo systemctl enable sniper-dashboard

sudo systemctl start sniper-bot
sudo systemctl start sniper-dashboard
```

---

## 7. Controleren

```bash
# Status
sudo systemctl status sniper-bot
sudo systemctl status sniper-dashboard

# Live logs
sudo journalctl -u sniper-bot -f
sudo journalctl -u sniper-dashboard -f

# Of rechtstreeks de logfiles
tail -f /opt/claude/solana-sniper-bot/logs/bot.out.log
tail -f /opt/claude/solana-sniper-bot/logs/dashboard.out.log
```

Dashboard bereikbaar op: `http://<server-ip>:3000`

---

## 8. Alternatief: PM2

PM2 is ook geconfigureerd via `ecosystem.config.js` als alternatief voor systemd:

```bash
npm install -g pm2

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # volg de instructies om autostart in te stellen
```

---

## 9. Bijwerken

```bash
cd /opt/claude/solana-sniper-bot
git pull origin main

cd bot && npm install && cd ..
cd dashboard && npm install --legacy-peer-deps && npm run build && cd ..

sudo systemctl restart sniper-bot
sudo systemctl restart sniper-dashboard
```

---

## Bekende afhankelijkheden per module

| Module | Extra systeemvereiste |
|---|---|
| `better-sqlite3` | `build-essential`, `python3`, `make` |
| `@solana/web3.js` | geen extra |
| `ts-node` | `nodejs >= 18` |
| `next` (dashboard) | `nodejs >= 18`, `--legacy-peer-deps` bij install |

> Voeg hier een rij toe wanneer een nieuwe module systeemafhankelijkheden vereist.
