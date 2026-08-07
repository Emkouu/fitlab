# Миграция Vercel → Hetzner + HestiaCP

Причината за преместването е **фиксираният изходящ IP адрес**, който Fibank иска за
виртуалния ПОС (виж `fitlab-fibank-integration.md` §B1). Vercel е serverless и не
може да го даде; Hetzner сървърът го дава веднага и това решава блокера.

**Изходна точка:** сървърът е **CCX23** с вече инсталиран **HestiaCP**, на който
работи **kude.bg** (WordPress) — жив production сайт. FitLab се добавя като втори
домейн до него. Целият документ е написан с това наум: нищо глобално за сървъра не
се пипа, всичко за FitLab е на ниво домейн и на ниво отделен системен потребител.

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

## 1. Сървърът вече работи — какво НЕ правим

Сървърът е **CCX23** (4 dedicated vCPU, 16 GB RAM, 160 GB NVMe), HestiaCP е
инсталиран и на него живее **kude.bg** (WordPress) — production сайт. FitLab се
добавя като **втори домейн до него**, без да пипаме нищо общо за сървъра.

⚠️ **Тези команди НЕ се изпълняват** (в по-ранна версия на този документ ги
имаше, преди да знаем, че сървърът е зает):

| Не прави това | Защото |
|---|---|
| `hst-install.sh …` повторно | Пренаписва конфигурацията на HestiaCP и събаря kude.bg. HestiaCP се инсталира **веднъж**. |
| `--apache no` / деинсталиране на Apache | WordPress работи през PHP. Ако Apache е backend-ът на kude.bg, махането му убива сайта. |
| `hostnamectl set-hostname fitlab` | Hostname-ът на HestiaCP е вързан за сертификата на панела и за Exim. Остава както е. |
| Смяна на **Reverse DNS** на `fitlabvarna.com` | rDNS е един за целия сървър. Ако kude.bg праща поща оттук, смяната ѝ вреди на доставимостта. Оставя се както е. |
| `apt upgrade -y` „между другото" | Има жив сайт. Ъпгрейдът се прави съзнателно, в тих час, след като знаеш, че имаш бекъп. |
| Пипане на глобални nginx/Apache конфигурации | Всичко за FitLab се прави **на ниво домейн** — шаблон само за `fitlabvarna.com`. |

Ресурсно няма проблем: WordPress + MariaDB + един Next процес на 16 GB се
разминават спокойно. Двата сайта се разделят по `server_name` в nginx и по
отделни системни потребители.

### 1.1 Конфигурацията на сървъра — установена

```
# systemctl is-active apache2 nginx
active
active
# ls /usr/local/hestia/data/templates/web/
apache2  awstats  nginx  php-fpm  skel  suspend  unassigned
```

Режимът е **nginx (proxy) + Apache (backend)** — стандартният HestiaCP за
WordPress. Оттук следват две неща, които определят §7:

- Шаблоните за nginx в този режим са **proxy templates** и живеят в
  `/usr/local/hestia/data/templates/web/nginx/`.
- Прилагат се с **`v-change-web-domain-proxy-tpl`** (не с
  `v-change-web-domain-tpl` — тя сменя Apache шаблона).
- Домейнът трябва да има включен **Proxy Support**, иначе nginx няма конфигурация
  за него и Apache отговаря директно на 80/443.

Остава да провериш, че порт 3000 е свободен, и кой е потребителят на kude.bg:

```bash
ss -ltnp | grep -E ':3000|:3001' ; v-list-users ; v-list-web-domains-all
```

Ако нещо вече слуша на 3000, ползвай 3010 и смени порта навсякъде по-долу.
(Порт `8080`/`8443` са на Apache — това е нормално и не пречи.)

### 1.2 Бекъп, преди да пипаш

Има жив сайт — направи snapshot, за да има връщане назад:

Hetzner Console → сървърът → **Snapshots → Take Snapshot**. Отделно, ако
автоматичните бекъпи не са включени: **Backups: Enable**.

```bash
v-backup-user <потребителят-на-kude>
```

---

## 2. Firewall и изходяща свързаност

Firewall-ът вече е настроен за kude.bg — `22`, `80`, `443`, `8083` са отворени и
това е всичко, което трябва. **Порт 3000 не се отваря** — Node слуша само на
`127.0.0.1` и nginx го проксира.

Единственото ново изискване е изходяща връзка до банката. Изходящите не се
филтрират по подразбиране, така че само проверяваме:

```bash
curl -sv https://mdpay-test.fibank.bg:10443/ecomm_v2/MerchantHandler --max-time 10 2>&1 | grep -E 'Connected|SSL|certificate'
```

Очаква се да се свърже и да иска клиентски сертификат — това е правилното
поведение.

Изходящият IP е **един и същ за двата сайта** — това е адресът, който банката
слага в whitelist-а:

```bash
curl -s https://ifconfig.me/ip
```

---

## 3. Отделен потребител и домейн в HestiaCP

FitLab получава **свой HestiaCP потребител**, не се слага при kude.bg. Причината
е изолация: отделен `/home`, отделен cron, отделни бекъпи и отделни права — грешка
в едното не стига до другото.

1. HestiaCP → **Users → Add User**: потребител `fitlab`, пакет `default`.
2. Server → Users → **Login as fitlab** → **Web → Add Web Domain**:
   - Domain: `fitlabvarna.com`
   - ✅ Alias `www.fitlabvarna.com`
   - Остави SSL за по-късно (нужно е DNS-ът да сочи насам).

Това създава `/home/fitlab/web/fitlabvarna.com/`. Приложението ще живее в
`/home/fitlab/web/fitlabvarna.com/nodeapp` — извън `public_html`, така че nginx
никога не може да сервира сорса или `.env` като статичен файл.

### 3.1 Изключи `nodeapp` от бекъпите на HestiaCP

Важно и лесно се пропуска: HestiaCP архивира целия `/home/fitlab`. В `nodeapp`
има `node_modules` и `.next` — стотици мегабайти, които се възстановяват с
`npm ci` и `npm run build`. Без изключение бекъпите на сървъра ще надуят диска и
ще станат бавни за двата сайта.

HestiaCP → (като `fitlab`) **Backup → Backup Exclusions** → в секцията Web за
`fitlabvarna.com` добави:

```
nodeapp/node_modules
nodeapp/.next
nodeapp/.git
```

Или от конзолата:

```bash
v-add-user-backup-exclusions fitlab 'fitlabvarna.com:nodeapp/node_modules:nodeapp/.next:nodeapp/.git'
```

⚠️ Обратната страна: `.env` **остава** в бекъпа, а вътре има service-role ключ на
Supabase и паролата на банковия сертификат. Дръж бекъпите там, където държиш и
останалите тайни — не в публично достъпно място.

---

## 4. Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt install -y nodejs && node -v && npm -v
```

Next 16 иска Node ≥ 20.9; 24 LTS е правилният избор.

Това е безопасно за kude.bg: NodeSource добавя само пакета `nodejs` и не пипа
PHP, Apache, nginx или MariaDB. Ако HestiaCP е инсталирал свой Node (за някои
свои инструменти), NodeSource го подменя с по-нов — панелът продължава да работи.

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

## 7. nginx proxy шаблон само за fitlabvarna.com

HestiaCP презаписва конфигурациите на домейните при всяка промяна в панела —
затова **никога не се редактира конфигурацията на домейна ръчно**. Прави се
шаблон, който се прилага **само** за `fitlabvarna.com`. kude.bg си остава на своя
шаблон и не се докосва.

Режимът е nginx + Apache (§1.1), значи: **proxy templates** в
`/usr/local/hestia/data/templates/web/nginx/`.

```bash
D=/usr/local/hestia/data/templates/web/nginx; nano $D/nodejs.tpl
```

**Порт 80.** Не е просто пренасочване към HTTPS — пътят на Let's Encrypt трябва
да мине **преди** редиректа. HestiaCP валидира по HTTP-01, като слага файл в
`public_html/.well-known/acme-challenge/`; ако порт 80 връща 301 безусловно,
първото издаване на сертификата се проваля (още няма HTTPS, към който да
пренасочва).

```nginx
server {
    listen      %ip%:%web_port%;
    server_name %domain_idn% %alias_idn%;

    # Let's Encrypt HTTP-01 — обслужва се от диска, не от Node.
    location ^~ /.well-known/acme-challenge/ {
        root  /home/%user%/web/%domain%/public_html;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

```bash
nano $D/nodejs.stpl
```

**Порт 443.**

```nginx
server {
    listen      %ip%:%web_ssl_port% ssl;
    http2       on;
    server_name %domain_idn% %alias_idn%;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 12m;   # качване на снимки на треньори

    location ^~ /.well-known/acme-challenge/ {
        root  /home/%user%/web/%domain%/public_html;
        try_files $uri =404;
    }

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

        # Тези редове не са козметика:
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

Забележи, че `location /` изобщо не подава към Apache — за този домейн Apache
остава неизползван. Неговият vhost стои на вътрешния порт, HestiaCP го очаква да е
там, но никой не стига до него. Не го изтривай.

### 7.0 Включи Proxy Support и приложи шаблона

В този режим nginx получава конфигурация за домейна **само** ако Proxy Support е
включен. Без него Apache отговаря директно и шаблонът е без значение.

HestiaCP → (като `fitlab`) **Web → fitlabvarna.com → Edit**:
- ✅ **Proxy Support**
- Proxy Template: **nodejs**
- Proxy Extensions: остави празно — иначе nginx ще прихваща разширения, които
  трябва да минат през Node.

Или от конзолата:

```bash
chown root:root $D/nodejs.* && v-change-web-domain-proxy-tpl fitlab fitlabvarna.com nodejs yes
```

Последният аргумент `yes` презарежда nginx. Ако предпочиташ да провериш преди
презареждането, подай `no` и продължи с §7.1.

### 7.1 Провери, че kude.bg не е засегнат

Това е стъпката, която не се пропуска. HestiaCP пише конфигурацията и презарежда
nginx — ако шаблонът има грешка, пада **и** другият сайт.

```bash
nginx -t && systemctl reload nginx && curl -I https://kude.bg && curl -I https://fitlabvarna.com
```

Ако `nginx -t` даде грешка, **не презареждай** — оправи шаблона, приложи го
отново и пробвай пак. Докато nginx не е презаредил, kude.bg работи със старата
валидна конфигурация.

Полезно за поглед какво реално е генерирал HestiaCP за нашия домейн:

```bash
cat /home/fitlab/conf/web/fitlabvarna.com/nginx.ssl.conf
```

Ако файлът не съществува, Proxy Support не е включен (§7.0).

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

**DNS-ът на kude.bg не се пипа.** Двата домейна сочат към същия IP и nginx ги
разделя по `server_name` — това е нормалната работа на сървъра, не конфликт.

⚠️ Ако DNS зоната на `fitlabvarna.com` ще се държи в HestiaCP (`--named yes`),
не забравяй да смениш и NS записите при регистратора. По-простото е да оставиш
зоната там, където е сега (Cloudflare, регистратор), и в HestiaCP да имаш само
web домейна — тогава Let's Encrypt минава по HTTP-01 през `.well-known`, за което
шаблонът в §7 вече прави изключение.

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
2. В шаблона `nodejs.stpl` портът е зашит на `3000`. Направи копие
   `nodejs-staging.{tpl,stpl}` с `3001` на мястото на `3000` и го приложи само за
   поддомейна (не забравяй Proxy Support и за него):
   ```bash
   v-change-web-domain-proxy-tpl fitlab test.fitlabvarna.com nodejs-staging yes
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
| **kude.bg е непокътнат** | `curl -I https://kude.bg` | `200` — първата и най-важна проверка |
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

Първият ред е също толкова важен: FitLab не е сам на този сървър и „работи" значи
двата сайта да работят.

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
(`.next/cache`, `npm` кешът и бекъпите на HestiaCP растат при всеки деплой) и
логовете за грешки. Периодично: `npm cache clean --force` и
`rm -rf ~/.npm/_cacache` при нужда.

Двата сайта делят един диск, така че препълването е споделен риск — това е
единственият начин, по който FitLab може да събори kude.bg. Затова изключването на
`node_modules` и `.next` от бекъпите (§3.1) не е разкош, а част от настройката.

```bash
du -sh /home/*/web/*/nodeapp /backup 2>/dev/null   # кой яде мястото
```

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
