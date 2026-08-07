# Миграция Vercel → Hetzner + HestiaCP

Причината за преместването е **фиксираният изходящ IP адрес**, който Fibank иска за
виртуалния ПОС (виж `fitlab-fibank-integration.md` §B1). Vercel е serverless и не
може да го даде; един Hetzner сървър го дава веднага и това решава блокера.

---

## 0. Какво мести и какво НЕ мести този план

**Местим само компютърната част** — Next.js приложението.

| Остава в Supabase (не пипаме) | Защо |
|---|---|
| PostgreSQL база | Managed бекъпи, point-in-time recovery, connection pooler. Локален Postgres значи ти да отговаряш за бекъпите. |
| Auth (вход с еднократен код) | Пренаписването е седмици работа и рискува да заключи всички клиенти навън. |
| Storage (снимки на треньори) | `app/admin/_actions.ts` качва в Supabase bucket; работи еднакво отвсякъде. |

Остават също **Resend** (имейли) и **Fibank** (карти). Приложението вече не ползва
нито един Vercel-специфичен API — няма `@vercel/*` пакети в `package.json`, така
че кодът тръгва без промени по логиката.

> Ако по-късно решиш да преместиш и базата — Приложение Б в края.

**Резултат:** един сървър с постоянен IPv4 адрес, който даваш на банката.

---

## 1. Сървър в Hetzner

Сървърът е **CCX23** — 4 dedicated vCPU, 16 GB RAM, 160 GB NVMe.

Това е с широк резерв за това приложение: един Next процес и nginx ще ползват
2–3 GB под нормален товар. „Dedicated vCPU" значи още, че няма steal time от
съседни виртуални машини — latency-то е равномерно, което е приятно за
резервационен поток, в който клиентът чака отговор от банката.

Практическите следствия от този размер:

- **Swap не е нужен.** Оригиналната предпазна мярка беше срещу OOM при
  `next build` на 2–4 GB машина. С 16 GB билдът е спокоен. (Ако все пак искаш
  2 GB swap „за всеки случай", не пречи, но не решава нищо.)
- **Билдът може да е на самия сървър** — няма нужда от отделен build агент или
  от пренасяне на `.next` артефакти.
- **Има място за staging инстанция** на същата машина — виж §11.1. Препоръчвам
  го, защото тестовата среда на Fibank трябва да се пробва някъде, преди да
  бута продукцията.
- **Ресурсите не са причината** да оставяме базата в Supabase. С 16 GB локален
  Postgres би бил напълно комфортен; причината е Supabase Auth (виж §0 и
  Приложение Б), а тя не се променя от размера на сървъра.

Ако сървърът още не е създаден или ще се пресъздава:
- Локация: **Nuremberg** или **Falkenstein** (най-близо до България по latency).
- Образ: **Ubuntu 24.04 LTS**.
- SSH ключ: добави своя публичен ключ. Не ползвай парола.
- Мрежа: остави IPv4 **включен** — това е адресът за банката.

След това:
1. Запиши IPv4 адреса. Той е това, което чака банката.
2. Hetzner Console → сървърът → **Backups: Enable** (+20% към цената, струва си).

### 1.1 Първи вход и основна хигиена

```bash
ssh root@<IP>
```

```bash
apt update && apt upgrade -y && timedatectl set-timezone Europe/Sofia && hostnamectl set-hostname fitlab
```

(Swap се пропуска — 16 GB RAM са предостатъчни за билда.)

### 1.2 Reverse DNS

Hetzner Console → сървърът → **Networking → Reverse DNS** → `fitlabvarna.com`.
Подобрява доставимостта на имейлите и някои банки го проверяват.

---

## 2. HestiaCP — инсталация **без Apache и без PHP**

Важно: стандартната инсталация вдига nginx + Apache + PHP-FPM. За Node приложение
Apache само пречи. Инсталирай nginx-only:

```bash
wget https://raw.githubusercontent.com/hestiacp/hestiacp/release/install/hst-install.sh
```

```bash
bash hst-install.sh --apache no --phpfpm yes --multiphp no --named yes --vsftpd no --proftpd no --exim yes --dovecot yes --clamav no --spamassassin no --iptables yes --fail2ban yes --quota no --api yes --port 8083 --hostname fitlab.fitlabvarna.com --email <твоя-имейл> --password '<силна-парола>'
```

Бележки по флаговете:
- `--phpfpm yes` — HestiaCP панелът сам е на PHP, така че PHP остава, но **без
  Apache** и без multiphp.
- `--exim yes --dovecot yes` — само ако искаш пощенски кутии `@fitlabvarna.com` на
  този сървър. Ако пощата е при друг доставчик (Google Workspace и подобни), сложи
  `--exim no --dovecot no --named no` и спести RAM.
- `--clamav no --spamassassin no` — на CCX23 има RAM и за тях (~1 GB), но нямаме
  причина да ги вдигаме: транзакционните имейли излизат през Resend, не през
  този сървър. Всяка непусната услуга е един процес по-малко за поддръжка.

Рестартирай, влез в панела на `https://<IP>:8083`.

### 2.1 Firewall

HestiaCP → **Server → Firewall**. Трябват отворени: `22` (SSH), `80`, `443`,
`8083` (панел). Порт `3000` **не** се отваря — Node слуша само на `127.0.0.1`.

Изходящите връзки не се филтрират по подразбиране, така че `mdpay.fibank.bg:10443`
е достъпен. Проверка след стъпка 4:

```bash
curl -sv https://mdpay-test.fibank.bg:10443/ecomm_v2/MerchantHandler --max-time 10 2>&1 | grep -E 'Connected|SSL|certificate'
```

Очаква се да се свърже и да иска клиентски сертификат — това е правилното
поведение.

---

## 3. Потребител и домейн в HestiaCP

1. **Users → Add User**: потребител `fitlab`, пакет `default`.
2. Влез като `fitlab` (или Server → Users → Login as) → **Web → Add Web Domain**:
   - Domain: `fitlabvarna.com`
   - ✅ Alias `www.fitlabvarna.com`
   - Остави SSL за по-късно (нужно е DNS-ът да сочи насам).

Това създава `/home/fitlab/web/fitlabvarna.com/`. Приложението ще живее в
`/home/fitlab/web/fitlabvarna.com/nodeapp` — извън `public_html`, така че nginx
никога не може да сервира сорса или `.env` като статичен файл.

---

## 4. Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt install -y nodejs && node -v && npm -v
```

Next 16 иска Node ≥ 20.9; 24 LTS е правилният избор за нов сървър.

---

## 5. Кодът на сървъра

Като `root`:

```bash
su - fitlab
```

```bash
cd ~/web/fitlabvarna.com && git clone <твоето-git-remote> nodeapp && cd nodeapp && npm ci
```

Ако репото е частно, направи deploy key:
`ssh-keygen -t ed25519 -C fitlab-deploy -f ~/.ssh/id_ed25519 -N ""` и добави
`~/.ssh/id_ed25519.pub` в GitHub → repo → Settings → Deploy keys (read-only).

### 5.1 Environment файл

```bash
nano ~/web/fitlabvarna.com/nodeapp/.env
```

```ini
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://fitlabvarna.com

# Supabase (същите стойности като във Vercel)
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://...supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Имейли
RESEND_API_KEY=...
RESEND_FROM=FitLab Varna <noreply@fitlabvarna.com>

# Cron
CRON_SECRET=<дълъг случаен низ: openssl rand -hex 32>

# Fibank ECOMM
ECOMM_ENVIRONMENT=test
ECOMM_CERT_PFX_BASE64=<base64 на keystore-а от банката>
ECOMM_CERT_PASSWORD=<паролата от банката>
```

Заключи файла — вътре има service-role ключ и паролата на банковия сертификат:

```bash
chmod 600 ~/web/fitlabvarna.com/nodeapp/.env
```

Стойностите от Vercel се изнасят с `vercel env pull .env.production` локално, за да
не се преписват на ръка.

`ECOMM_CERT_PFX_BASE64` се прави от файла на банката:
`base64 -i keystore.p12 | tr -d '\n'`. Така сертификатът не стои като файл на
диска и не може да се сервира по погрешка.

### 5.2 Билд

```bash
cd ~/web/fitlabvarna.com/nodeapp && set -a && . ./.env && set +a && npm run build
```

`npm run build` вика `prisma generate && next build`. `sharp` (за `next/image`)
идва като зависимост на Next 16 — не се инсталира отделно.

Бърза проверка, преди да пипаме nginx:

```bash
cd ~/web/fitlabvarna.com/nodeapp && set -a && . ./.env && set +a && npx next start -p 3000
```

От друга сесия: `curl -I http://127.0.0.1:3000/schedule` → очаква се `200`.
Спри с Ctrl+C.

---

## 6. systemd — приложението като услуга

Като `root`:

```bash
nano /etc/systemd/system/fitlab.service
```

```ini
[Unit]
Description=FitLab Varna (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=fitlab
Group=fitlab
WorkingDirectory=/home/fitlab/web/fitlabvarna.com/nodeapp
EnvironmentFile=/home/fitlab/web/fitlabvarna.com/nodeapp/.env
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=3
# Приложението пише само в .next/cache — всичко останало е излишно достъпно.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/home/fitlab/web/fitlabvarna.com/nodeapp/.next
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fitlab

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now fitlab && systemctl status fitlab --no-pager
```

Логове: `journalctl -u fitlab -f`.

---

## 7. nginx proxy template в HestiaCP

HestiaCP презаписва конфигурациите на домейните при всяка промяна в панела —
затова **не се редактират ръчно**. Прави се шаблон.

```bash
nano /usr/local/hestia/data/templates/web/nginx/nodejs.tpl
```

```nginx
server {
    listen      %ip%:%web_port%;
    server_name %domain_idn% %alias_idn%;
    return      301 https://$host$request_uri;
}
```

```bash
nano /usr/local/hestia/data/templates/web/nginx/nodejs.stpl
```

```nginx
server {
    listen      %ip%:%web_ssl_port% ssl;
    http2       on;
    server_name %domain_idn% %alias_idn%;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 12m;   # качване на снимки на треньори

    # Статичните файлове на Next се отдават от nginx, не от Node.
    location /_next/static/ {
        alias /home/%user%/web/%domain%/nodeapp/.next/static/;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Тези четири реда не са козметика:
        #  * X-Forwarded-For захранва client_ip_addr към ECOMM
        #    (lib/payments/ecomm/protocol.ts) — без него банката получава 0.0.0.0
        #  * X-Forwarded-Proto пази HTTPS-а, иначе Secure cookie-тата се чупят
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_buffering off;      # стриймингът на Next стига до клиента веднага
    }
}
```

Приложи:

```bash
chown root:root /usr/local/hestia/data/templates/web/nginx/nodejs.* && v-change-web-domain-tpl fitlab fitlabvarna.com nodejs yes
```

---

## 8. DNS и SSL

1. **Свали TTL** на текущия A запис за `fitlabvarna.com` до 300 секунди и изчакай
   стария TTL да изтече. Това прави връщането назад бързо, ако нещо се обърка.
2. Пусни A записа към новия IP:
   - `fitlabvarna.com` → `A` → `<IP на Hetzner>`
   - `www.fitlabvarna.com` → `A` → `<IP на Hetzner>`
   - Ако сайтът е бил на Vercel през CNAME — премахни го, A запис и CNAME не
     съжителстват.
3. Изчакай разпространението: `dig +short fitlabvarna.com`.
4. HestiaCP → Web → `fitlabvarna.com` → **Edit** → ✅ SSL Support,
   ✅ **Let's Encrypt**, ✅ Force HTTPS → Save.
5. Провери: `curl -I https://fitlabvarna.com` → `200`, валиден сертификат.

Обновяването на сертификата HestiaCP го прави сам.

---

## 9. Cron за напомнянията

⚠️ **Забележка:** в репото **няма `vercel.json`**, макар `CLAUDE.md` да описва
Vercel Cron. Това значи, че напомнящите имейли **никога не са се изпращали**.
Тук се оправя.

HestiaCP → **Cron → Add Cron Job** (като `fitlab`), на всеки 15 минути:

```
*/15 * * * * curl -fsS -m 60 -H "Authorization: Bearer <CRON_SECRET>" https://fitlabvarna.com/api/cron/reminders > /dev/null
```

Или по-чисто, без секрета в crontab (видим е за всеки с достъп до потребителя):

```bash
nano /etc/systemd/system/fitlab-reminders.service
```

```ini
[Unit]
Description=FitLab class reminders sweep

[Service]
Type=oneshot
EnvironmentFile=/home/fitlab/web/fitlabvarna.com/nodeapp/.env
ExecStart=/bin/sh -c 'curl -fsS -m 60 -H "Authorization: Bearer $CRON_SECRET" https://fitlabvarna.com/api/cron/reminders'
```

```bash
nano /etc/systemd/system/fitlab-reminders.timer
```

```ini
[Unit]
Description=Run FitLab reminders every 15 minutes

[Timer]
OnCalendar=*:0/15
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload && systemctl enable --now fitlab-reminders.timer && systemctl list-timers fitlab-reminders --no-pager
```

Ръчна проверка: `systemctl start fitlab-reminders && journalctl -u fitlab-reminders -n 20 --no-pager`.

---

## 10. Supabase — новите адреси

Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://fitlabvarna.com`
- **Redirect URLs**: `https://fitlabvarna.com/**`

Махни Vercel адресите (`*.vercel.app`) едва след като си сигурен, че новият сървър
работи — докато са там, старият деплой също продължава да пуска хора вътре.

---

## 11. Деплой скрипт

```bash
nano /home/fitlab/deploy.sh
```

```bash
#!/usr/bin/env bash
# Деплой на FitLab. Билдът е преди рестарта, така че провален билд
# не оставя сайта долу.
set -euo pipefail

APP=/home/fitlab/web/fitlabvarna.com/nodeapp
cd "$APP"

git fetch --all
git reset --hard origin/main

npm ci
set -a; . ./.env; set +a

npx prisma migrate deploy
npm run build

sudo systemctl restart fitlab
sleep 3
curl -fsS -o /dev/null http://127.0.0.1:3000/schedule && echo "✅ деплой ок" || { echo "❌ приложението не отговаря"; exit 1; }
```

```bash
chmod +x /home/fitlab/deploy.sh && echo 'fitlab ALL=(root) NOPASSWD: /usr/bin/systemctl restart fitlab' > /etc/sudoers.d/fitlab-restart && chmod 440 /etc/sudoers.d/fitlab-restart
```

Оттук нататък деплоят е `ssh fitlab@<IP> ./deploy.sh`.

### 11.1 Staging инстанция (силно препоръчително на този сървър)

CCX23 има ресурс да върти втора инстанция, а тя ти трябва по конкретна причина:
**тестовата среда на Fibank трябва да се пробва някъде.** Иначе първото истинско
завъртане на картовия поток ще е върху продукцията, с реални клиенти.

Схемата е същата, само с друг поддомейн, друг порт и друга папка:

1. HestiaCP → Web → **Add Web Domain**: `test.fitlabvarna.com`, същият шаблон
   `nodejs`, включи Let's Encrypt.
2. В шаблона `nodejs.stpl` портът е зашит на `3000`. За да не правиш втори
   шаблон, направи копие `nodejs-staging.stpl` (и `.tpl`) с `3001` на мястото на
   `3000` и `%domain%/nodeapp` пътя, и го приложи само за поддомейна:
   ```bash
   v-change-web-domain-tpl fitlab test.fitlabvarna.com nodejs-staging yes
   ```
3. Клонирай кода в `~/web/test.fitlabvarna.com/nodeapp`, направи собствен `.env` с:
   - `PORT=3001`
   - `NEXT_PUBLIC_APP_URL=https://test.fitlabvarna.com`
   - `ECOMM_ENVIRONMENT=test`
   - ⚠️ **отделна Supabase база** (нов Supabase проект) — иначе тестовите
     резервации ще влизат в реалния график и клиентите ще ги виждат.
4. Втори systemd unit `fitlab-staging.service`, идентичен на §6, но с другия
   `WorkingDirectory`, `EnvironmentFile` и `SyslogIdentifier`.
5. На банката дай **и двата** OK/Fail адреса, за да може да тества:
   - `https://test.fitlabvarna.com/api/payments/ecomm/return`
   - `https://test.fitlabvarna.com/api/payments/ecomm/fail`

Двете инстанции излизат от един и същ IPv4, така че whitelist-ът в банката важи
и за двете — точно това прави staging-а полезен тук.

---

## 12. Проверки преди да кажем на банката, че сме готови

| Проверка | Команда / стъпка | Очаквано |
|---|---|---|
| Сайтът е жив | `curl -I https://fitlabvarna.com` | `200`, валиден TLS |
| График + цени | `/schedule` в браузър | класове с „10,00 €" |
| ОУ | `/policies#terms` | всички раздели се зареждат |
| Вход | еднократен код по имейл | стига се до `/account` |
| Резервация | клас с депозит по профила | чекбоксът за ОУ блокира „Потвърди" |
| **Реален IP на клиента** | `journalctl -u fitlab -f` при резервация с карта | в лога **не** трябва да има `0.0.0.0` |
| Изходящ IP | `curl -s https://ifconfig.me/ip` на сървъра | **същият IPv4**, който си дал на банката |
| Напомняния | `systemctl start fitlab-reminders` | `200` в лога |
| Рестарт при срив | `systemctl kill -s SIGKILL fitlab` | вдига се сам за ~3 сек. |

Последните два реда от таблицата са същината: изходящият IP трябва да съвпада с
това, което банката е сложила в whitelist-а, а `X-Forwarded-For` трябва да стига
до приложението, иначе `client_ip_addr` към ECOMM е `0.0.0.0`.

Кодът вече **форсира IPv4** за връзките към банката
(`family: 4` в `lib/payments/ecomm/client.ts`) — иначе dual-stack сървър можеше да
излезе по IPv6 и банката да види непознат адрес.

---

## 13. Изключване на Vercel

Изчакай **поне седмица** стабилна работа. После:

1. Vercel → Project → Settings → **Domains** → махни `fitlabvarna.com`.
2. Проектът остава като код-огледало; не го трий, докато не си сигурен.
3. Махни Vercel адресите от Supabase Redirect URLs.
4. `git rm .env.production` ако е останал локално.

---

## Приложение А — какво да следиш

```bash
journalctl -u fitlab -p warning --since today   # грешки на приложението
systemctl status fitlab nginx --no-pager        # живи ли са услугите
df -h /                                          # диск (билдовете трупат .next/cache)
free -m                                          # RAM
```

На CCX23 нито RAM, нито CPU ще са тесното място — следи предимно **диска**
(`.next/cache` и `npm` кешът растат при всеки деплой) и логовете за грешки.
Периодично: `npm cache clean --force` и `rm -rf ~/.npm/_cacache` при нужда.

Логовете на nginx за домейна: `/var/log/nginx/domains/fitlabvarna.com.error.log`.

Минимален външен мониторинг — UptimeRobot или Hetzner-ски healthcheck към
`https://fitlabvarna.com/schedule` на 5 минути. Без него няма да разбереш, че
сайтът е паднал, преди клиент да се обади.

---

## Приложение Б — преместване и на базата (по-късно, ако решиш)

Прави се **само** отделно от тази миграция, никога в един и същи ден.

Пречката не е Postgres, а **Supabase Auth**: приложението разчита на
`supabaseUserId` по всеки `User` ред и на Supabase за еднократните кодове. Ако
местиш базата, но оставяш Auth в Supabase, ще имаш две системи, които трябва да
останат синхронни — по-лошо от сегашното.

Затова: или остави целия Supabase (препоръчително), или планирай отделен проект за
самостоятелен Postgres + смяна на Auth. Ако все пак местиш само базата:

```bash
pg_dump "$DIRECT_URL" -Fc -f fitlab.dump          # от Supabase
createdb fitlab && pg_restore -d fitlab fitlab.dump
```

…после `DATABASE_URL` и `DIRECT_URL` към `localhost:5432`, `npx prisma migrate deploy`,
ежедневен `pg_dump` в cron и бекъп извън сървъра. Бекъпите вече са твоя грижа.
