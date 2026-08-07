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

Портовете и наличните потребители:

```bash
ss -ltnp | grep -E ':3000|:3001' ; v-list-users ; v-list-web-domains emkou ; df -h /
```

(`v-list-web-domains-all` не съществува — домейните се листват per-user, а
собственикът на даден домейн се намира с `v-search-domain-owner <домейн> web`.)

Установено на този сървър:

| | |
|---|---|
| Публичен IPv4 | **178.104.200.13** — адресът за whitelist-а на банката |
| Съществуващи домейни | `kude.bg` (55,9 GB) и `search.kude.bg`, шаблон `default`, и двата със SSL, потребител `emkou` |
| `fitlabvarna.com` | **не е на сървъра** — добавя се чист, нищо не се мести |
| Порт 3000 / 3001 | **свободни** — работим на 3000 |
| Диск | 150 GB общо, 64 GB заети, **81 GB свободни** (45%) — предостатъчно |
| Порт 8080 / 8443 | Apache backend — нормално, не пречи |

Ако нещо все пак заеме 3000 по-късно, ползвай 3010 и го смени на три места:
`PORT` в `.env`, systemd unit-а (§6) и `proxy_pass` в шаблона (§7).

Две бележки встрани, нито една от които не е блокер:

- `kude.bg` заема **55,9 GB**. За WordPress сайт е много — обикновено са качени
  файлове или бекъпи в самата home папка. Заслужава си да се погледне
  (`du -sh /home/emkou/web/kude.bg/public_html/* | sort -h | tail`), защото двата
  сайта делят един том. Със 81 GB свободни няма спешност.
- `Hyperlink` е втори **admin** акаунт без домейни. Ако не се ползва, свали го до
  роля `user` или го изтрий — админ акаунт с достъп до целия панел е ненужна
  повърхност за атака.

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

1. HestiaCP → **Users → Add User**: потребител `fitlab`, пакет `default`,
   роля **user** (не admin — приложението няма работа с панела).
2. Server → Users → **Login as fitlab** → **Web → Add Web Domain**:
   - Domain: `fitlabvarna.com`
   - ✅ Alias `www.fitlabvarna.com`
   - Остави SSL за по-късно (нужно е DNS-ът да сочи насам).

Това създава `/home/fitlab/web/fitlabvarna.com/` с `public_html` вътре. От тази
папка ще се ползва **само** `public_html` — и то единствено за ACME challenge
файла на Let's Encrypt (§7).

**Кодът на приложението НЕ отива в `/home`, а в `/opt/fitlab/app`** — причината е
в §3.1.

### 3.1 Защо кодът е в `/opt/fitlab`, а не в `/home/fitlab`

Първоначално този документ слагаше приложението в
`/home/fitlab/web/fitlabvarna.com/nodeapp` и после изключваше `node_modules` и
`.next` от бекъпите на HestiaCP. По-простото решение е кодът просто да не е там,
където HestiaCP гледа:

| Проблем при `/home` | Решение с `/opt` |
|---|---|
| HestiaCP архивира целия `/home/fitlab` — `node_modules` + `.next` са ~2 GB на всеки бекъп, а се възстановяват с `npm ci` и `npm run build` | извън `/home` → просто не влиза в бекъпите |
| `.env` попада в бекъп архивите, а вътре има service-role ключ на Supabase и паролата на банковия сертификат | тайните остават само на сървъра |
| Синтаксисът за backup exclusions е различен по версии на HestiaCP | няма нужда от него |
| Дисковата квота на потребителя се пълни от билд артефакти | квотата остава за реалното съдържание |

Създай папката:

```bash
mkdir -p /opt/fitlab && chown fitlab:fitlab /opt/fitlab && chmod 755 /opt/fitlab
```

Приложението ще е в `/opt/fitlab/app`, притежавано от същия потребител `fitlab`,
така че systemd услугата и правата остават прости.

> Ако все пак предпочиташ кодът да е под `/home` по конвенцията на HestiaCP,
> изключенията се настройват от панела: **User → Backup → Backup Exclusions**.
> Не ползвай CLI команда по памет — имената се различават между версиите. Ако
> искаш да видиш какво поддържа твоята инсталация:
> ```bash
> ls /usr/local/hestia/bin | grep -i exclu
> ```

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

Папката `/opt/fitlab` вече е създадена и е на потребителя `fitlab` (§3.1).
Клонирането става **като `fitlab`**, не като root — иначе файловете стават на root
и systemd услугата няма да може да пише в `.next`.

⚠️ `su - fitlab` ще откаже с **„This account is currently not available"**.
HestiaCP създава потребителите с shell `nologin` и **това е правилно** — акаунт,
който само върти приложение, няма нужда да може да влиза по SSH. Не го променяй;
изпълнявай командите му с `runuser` от root:

Репото е **`https://github.com/Emkouu/fitlab.git`** (виждаш го по всяко време с
`git remote -v` в локалната папка на проекта).

⚠️ **Първо push от локалната машина.** Сървърът клонира това, което е в GitHub — а
всичко по Fibank и този runbook живее само локално, докато не бъде пушнато:

```bash
git status -sb        # трябва да НЕ пише "ahead N"
git push origin main
```

После, на сървъра:

```bash
runuser -u fitlab -- git clone https://github.com/Emkouu/fitlab.git /opt/fitlab/app
```

Ако репото е **частно**, HTTPS ще поиска парола, а deploy key работи само по SSH —
тогава ползвай SSH адреса:

```bash
runuser -u fitlab -- git clone git@github.com:Emkouu/fitlab.git /opt/fitlab/app
```

```bash
runuser -u fitlab -- bash -lc 'cd /opt/fitlab/app && npm ci --include=dev'
```

⚠️ **`--include=dev` не е излишно.** Билдът на този проект зависи от пакети, които
са в `devDependencies`: `prisma` (CLI за `prisma generate`), `typescript`,
`tailwindcss` и `@tailwindcss/postcss`. Ако npm пропусне dev пакетите — например
защото `NODE_ENV=production` е в средата или `omit=dev` е в `.npmrc` — билдът пада с:

```
sh: 1: prisma: not found
```

Диагностика, ако все пак се случи:

```bash
ls /opt/fitlab/app/node_modules/.bin | grep -E 'prisma|next|tsc'
npm config get omit
```

Очаква се да видиш `prisma`, `next` и `tsc`. Ако липсват, повтори `npm ci` с
`--include=dev`.

За SSH достъпа направи deploy key за същия потребител:

```bash
runuser -u fitlab -- ssh-keygen -t ed25519 -C fitlab-deploy -f /home/fitlab/.ssh/id_ed25519 -N ""
```

…и добави съдържанието на `/home/fitlab/.ssh/id_ed25519.pub`
(`cat /home/fitlab/.ssh/id_ed25519.pub`) в GitHub → `Emkouu/fitlab` → Settings →
**Deploy keys → Add deploy key**, без „Allow write access".

Първото свързване иска потвърждение на host key-а — направи го веднъж, иначе
`git clone` в скрипта ще увисне:

```bash
runuser -u fitlab -- ssh -T -o StrictHostKeyChecking=accept-new git@github.com
```

Очаква се „You've successfully authenticated, but GitHub does not provide shell
access." — това е успех.

#### Трябва ли ти deploy key изобщо?

Само ако репото е частно. Проверката е една команда, изпълнима отвсякъде:

```bash
git ls-remote https://github.com/Emkouu/fitlab.git >/dev/null 2>&1 && echo PUBLIC || echo PRIVATE
```

`PUBLIC` → клонирай по HTTPS и прескочи целия SSH раздел.

#### „Key is invalid. You must supply a key in OpenSSH public key format"

GitHub отхвърля ключа. Почти винаги е едно от три неща:

1. **Подаден е частният ключ.** Публичният е файлът с разширение **`.pub`**.
   Частният започва с `-----BEGIN OPENSSH PRIVATE KEY-----` — той никога не се
   качва никъде.
2. **Копието е разчупено на няколко реда.** Публичният ключ е **един ред**;
   терминалът го пренася визуално и при копиране влизат нови редове.
3. **Влязъл е и промптът на shell-а** (`root@server:~#`) или празен ред.

Провери, че самият файл е валиден:

```bash
ssh-keygen -l -f /home/fitlab/.ssh/id_ed25519.pub
```

Ако изведе отпечатък (`256 SHA256:… fitlab-deploy (ED25519)`), файлът е наред и
проблемът е в копирането. Правилният вид е точно един ред:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI… fitlab-deploy
```

За чисто копиране без пренасяне провери дължината и я сравни с това, което си
поставил в GitHub (ed25519 ключ е ~100–110 знака):

```bash
wc -c /home/fitlab/.ssh/id_ed25519.pub
```

Ако `ssh-keygen -l` даде грешка, ключът не е генериран успешно — изтрий двата
файла и повтори:

```bash
runuser -u fitlab -- rm -f /home/fitlab/.ssh/id_ed25519 /home/fitlab/.ssh/id_ed25519.pub
```

> Ако предпочиташ да можеш да влизаш като `fitlab` по SSH, това се включва от
> панела: **Users → fitlab → Edit → SSH Access → `bash`**. Тогава `su - fitlab`
> работи и можеш да пропуснеш `runuser` навсякъде по-долу. Аз препоръчвам да
> остане `nologin` — един акаунт по-малко за пазене.

### 5.1 Environment файл

Файлът се създава от root, но трябва да е притежаван от `fitlab`:

```bash
nano /opt/fitlab/app/.env
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
RESEND_FROM="FitLab Varna <noreply@fitlabvarna.com>"

# Cron
CRON_SECRET=<дълъг случаен низ: openssl rand -hex 32>

# Fibank ECOMM
ECOMM_ENVIRONMENT=test
ECOMM_CERT_PFX_BASE64=<base64 на keystore-а от банката>
ECOMM_CERT_PASSWORD=<паролата от банката>
```

**Стойности с интервали се ограждат в кавички.** `RESEND_FROM` съдържа интервал и
ъглови скоби, така че се пише така:

```ini
RESEND_FROM="FitLab Varna <noreply@fitlabvarna.com>"
```

Next и systemd свалят обграждащите кавички сами, така че стойността стига чиста до
приложението.

Заключи файла — вътре има service-role ключ и паролата на банковия сертификат:

```bash
chown fitlab:fitlab /opt/fitlab/app/.env && chmod 600 /opt/fitlab/app/.env
```

Стойностите от Vercel се изнасят с `vercel env pull .env.production` локално, за да
не се преписват на ръка.

`ECOMM_CERT_PFX_BASE64` се прави от файла на банката:
`base64 -i keystore.p12 | tr -d '\n'`. Така сертификатът не стои като файл на
диска и не може да се сервира по погрешка.

### 5.2 Билд

```bash
runuser -u fitlab -- bash -lc 'cd /opt/fitlab/app && npm run build'
```

`npm run build` вика `prisma generate && next build`. `sharp` (за `next/image`)
идва като зависимост на Next 16 — не се инсталира отделно.

⚠️ **Не подавай `.env` през shell-а** (`set -a && . ./.env`). Първо е излишно:
Next чете `.env` сам, а `prisma.config.ts` импортва `dotenv/config`. Второ, чупи
се — shell-ът тълкува стойност със интервали и `<>` като пренасочване:

```
./.env: line 14: syntax error near unexpected token `newline'
./.env: line 14: `RESEND_FROM=FitLab Varna <noreply@fitlabvarna.com>'
```

Затова командата по-горе е просто `npm run build`, без sourcing.

Проверката, че приложението наистина се стартира, е **по-лесна през systemd** —
мини директно на §6 и я направи там. Ръчният старт държи процеса на преден план и
изисква втора сесия, а `journalctl` дава повече информация от него.

⚠️ Ако все пак го правиш ръчно: `curl` се изпълнява **на сървъра**, във втора SSH
сесия. `127.0.0.1` на твоя лаптоп сочи към лаптопа, не към сървъра — оттам
неизбежно идва `Failed to connect to 127.0.0.1 port 3000`.

```bash
runuser -u fitlab -- bash -lc 'cd /opt/fitlab/app && ./node_modules/.bin/next start -p 3000 >/tmp/smoke.log 2>&1 & sleep 8; curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/schedule; pkill -f "next start -p 3000"'
```

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
WorkingDirectory=/opt/fitlab/app
EnvironmentFile=/opt/fitlab/app/.env
# Директно бинарито, не през npx: npx резолвва пакети и пише в npm кеша,
# което е ненужна работа и ненужни права за една production услуга.
ExecStart=/opt/fitlab/app/node_modules/.bin/next start -p 3000
Restart=always
RestartSec=3
# Приложението пише само в .next/cache — всичко останало е излишно достъпно.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
# Вече нищо нужно не живее в /home, откакто кодът е в /opt (§3.1) — значи
# /home може да се скрие напълно, включително home папката на kude.bg.
ProtectHome=yes
ReadWritePaths=/opt/fitlab/app/.next
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fitlab

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now fitlab && sleep 5 && systemctl status fitlab --no-pager
```

Трябва да е `active (running)`. Проверка, че наистина отговаря — **на сървъра**:

```bash
curl -I http://127.0.0.1:3000/schedule
```

Очаква се `HTTP/1.1 200`. Това е вратата към §7: тук вече знаеш, че приложението,
`.env` и връзката към Supabase работят.

Ако се рестартира в цикъл: `journalctl -u fitlab -n 60 --no-pager`.

Логове занапред: `journalctl -u fitlab -f`.

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
        alias /opt/fitlab/app/.next/static/;
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

### 7.0 Първо провери, че домейнът съществува в HestiaCP

```bash
v-list-web-domains fitlab
```

Ако `fitlabvarna.com` не е в списъка, върни се на §3 — командата в §7.0.1 иска
домейнът да е добавен под потребителя `fitlab`.

### 7.0.1 Включи Proxy Support и приложи шаблона

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
ls /home/fitlab/conf/web/fitlabvarna.com/
```

Ако няма `nginx.conf`, Proxy Support не е включен (§7.0.1). `nginx.ssl.conf`
се появява само след като SSL е включен — виж §7.2.

### 7.2 Тествай проксито ПРЕДИ да местиш DNS

Тук има подводен камък в реда на стъпките: `fitlabvarna.com` още сочи към Vercel,
така че Let's Encrypt не може да издаде сертификат (валидацията ще стигне до
Vercel, не до нас). А без сертификат `nginx.ssl.conf` не съществува и целият
`location /` от §7 е неактивен — port 80 само пренасочва към HTTPS.

Заобикалянето е да включиш **SSL Support с временен самоподписан сертификат**.
HestiaCP **не** генерира такъв сам — ако оставиш полетата празни, отказва с
„Field 'ssl certificate, ssl key' can not be blank". Затова първо си направи един:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout /tmp/fitlab-temp.key -out /tmp/fitlab-temp.crt \
  -subj "/CN=fitlabvarna.com" \
  -addext "subjectAltName=DNS:fitlabvarna.com,DNS:www.fitlabvarna.com"
```

После HestiaCP → Web → `fitlabvarna.com` → Edit → ✅ **SSL Support**,
❌ Let's Encrypt, и попълни двете полета със съдържанието на файловете:

```bash
echo "── SSL Certificate ──"; cat /tmp/fitlab-temp.crt
echo "── SSL Key ──";         cat /tmp/fitlab-temp.key
```

Копирай всеки блок **целия**, включително редовете `-----BEGIN …-----` и
`-----END …-----`. Save.

Сертификатът е валиден 30 дни и служи само за този тест — Let's Encrypt го заменя
в §8. Изтрий временните файлове след това:
`rm -f /tmp/fitlab-temp.key /tmp/fitlab-temp.crt`.

После, на сървъра:

```bash
curl -kI --resolve fitlabvarna.com:443:127.0.0.1 https://fitlabvarna.com/schedule
```

`--resolve` кара curl да пита локалния nginx вместо DNS; `-k` приема
самоподписания сертификат. Очаква се **`HTTP/2 200`** — това доказва цялата верига
nginx → Node, преди какъвто и да е трафик да е преместен.

Провери и че `X-Forwarded-For` стига до приложението (от него зависи
`client_ip_addr` към банката):

```bash
journalctl -u fitlab -n 20 --no-pager | grep -i forwarded
```

Истинската проверка на този header е при първата картова резервация (§12) — тук
поне се убеждаваш, че заявките минават през nginx, не директно.

Едва след като това дава 200, мини на §8 и премести DNS. Тогава превключи на
Let's Encrypt и самоподписаният сертификат се сменя с истински.

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
   ✅ **Let's Encrypt**, ✅ Force HTTPS → Save. (SSL Support вече е включен от
   §7.2 със самоподписан сертификат — тук само добавяш Let's Encrypt, който го
   заменя с истински. ACME пътят минава покрай Node благодарение на шаблона.)
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
EnvironmentFile=/opt/fitlab/app/.env
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

Скриптът се държи от root и вика `runuser` за всичко, което пипа файлове — така
`fitlab` остава без shell и без sudo права, а рестартът е единственото, което
изисква root.

```bash
nano /opt/fitlab/deploy.sh
```

```bash
#!/usr/bin/env bash
# Деплой на FitLab. Билдът е ПРЕДИ рестарта, така че провален билд
# не оставя сайта долу. Изпълнява се като root.
set -euo pipefail

APP=/opt/fitlab/app
as_fitlab() { runuser -u fitlab -- bash -lc "$1"; }

as_fitlab "cd $APP && git fetch --all && git reset --hard origin/main"
as_fitlab "cd $APP && npm ci --include=dev"   # билдът иска prisma/tsc/tailwind от devDeps
# Без sourcing на .env — Prisma и Next си го четат сами (dotenv), а през shell
# стойности с интервали (RESEND_FROM) чупят изпълнението.
as_fitlab "cd $APP && npx prisma migrate deploy"
as_fitlab "cd $APP && npm run build"

systemctl restart fitlab
sleep 3
curl -fsS -o /dev/null http://127.0.0.1:3000/schedule \
  && echo "✅ деплой ок" \
  || { echo "❌ приложението не отговаря — journalctl -u fitlab -n 50"; exit 1; }
```

```bash
chmod 750 /opt/fitlab/deploy.sh
```

Оттук нататък деплоят е `ssh root@<IP> /opt/fitlab/deploy.sh`.

> Предишната версия на този документ даваше на `fitlab` sudo право за
> `systemctl restart` и деплой по `ssh fitlab@`. То отпада — акаунтът е `nologin`
> (§5), така че sudoers файлът не е нужен. Ако си го създал:
> `rm -f /etc/sudoers.d/fitlab-restart`.

### 11.1 Staging инстанция (силно препоръчително на този сървър)

CCX23 има ресурс да върти втора инстанция, а тя ти трябва по конкретна причина:
**тестовата среда на Fibank трябва да се пробва някъде.** Иначе първото истинско
завъртане на картовия поток ще е върху продукцията, с реални клиенти.

Схемата е същата, само с друг поддомейн, друг порт и друга папка:

1. HestiaCP → Web → **Add Web Domain**: `test.fitlabvarna.com`, същият шаблон
   `nodejs`, включи Let's Encrypt.
2. В шаблона `nodejs.stpl` са зашити две неща — портът `3000` и пътят
   `/opt/fitlab/app`. Направи копие `nodejs-staging.{tpl,stpl}` с `3001` и
   `/opt/fitlab-staging/app` и го приложи само за поддомейна (не забравяй Proxy
   Support и за него):
   ```bash
   v-change-web-domain-proxy-tpl fitlab test.fitlabvarna.com nodejs-staging yes
   ```
3. Клонирай кода в `/opt/fitlab-staging/app` (`mkdir -p` +
   `chown fitlab:fitlab`, после `runuser -u fitlab -- git clone …`), направи
   собствен `.env` с:
   - `PORT=3001`
   - `NEXT_PUBLIC_APP_URL=https://test.fitlabvarna.com`
   - `ECOMM_ENVIRONMENT=test`
   - ⚠️ **отделна Supabase база** (нов Supabase проект) — иначе тестовите
     резервации ще влизат в реалния график и клиентите ще ги виждат.
4. Втори systemd unit `fitlab-staging.service`, идентичен на §6, но с
   `WorkingDirectory=/opt/fitlab-staging/app`, съответния `EnvironmentFile`,
   `ReadWritePaths` и `SyslogIdentifier=fitlab-staging`.
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
du -sh /opt/fitlab* /home/*/web /backup 2>/dev/null   # кой яде мястото
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
