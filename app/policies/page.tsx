import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { PaymentLogos } from "@/app/_components/PaymentLogos";
import { formatEurMinor } from "@/lib/format";
import { depositAmountMinor } from "@/lib/deposit";
import { classPriceMinor } from "@/lib/pricing";
import {
  ACQUIRER,
  COMPANY,
  CPC,
  DPA,
  POLICIES_LAST_UPDATED,
  PROCESSORS,
} from "@/lib/legal/company";

export const metadata = {
  title: "FitLab Varna — Политики",
  description:
    "Поверителност (GDPR), Общи условия, Плащания и депозити, Бисквитки — как ФИЗИОЛАЙФ 22 ЕООД обработва данните ти.",
};

export const dynamic = "force-dynamic";

const sectionTitle =
  "font-display text-lg font-bold tracking-tight text-[color:var(--brand-purple)]";
const subTitle = "mt-5 font-display text-sm font-bold text-[color:var(--brand-ink)]";
const p = "mt-2 text-sm leading-relaxed text-[color:var(--brand-ink)]/80";
const li = "text-sm leading-relaxed text-[color:var(--brand-ink)]/80";
const card =
  "mt-6 scroll-mt-6 rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)]";

const ANCHORS = [
  { href: "#controller", label: "Търговец" },
  { href: "#prices", label: "Цени" },
  { href: "#privacy", label: "Поверителност" },
  { href: "#payments", label: "Плащания" },
  { href: "#terms", label: "Общи условия" },
  { href: "#cookies", label: "Бисквитки" },
];

export default async function PoliciesPage() {
  const [studio, practices] = await Promise.all([
    prisma.studio.findUnique({
      where: { slug: "fitlab-varna" },
      select: {
        name: true,
        address: true,
        phone: true,
        cancelWindowHours: true,
        cardPaymentsEnabled: true,
        defaultClassPrice: true,
        defaultDeposit: true,
      },
    }),
    prisma.practice.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceMinor: true },
    }),
  ]);

  const name = studio?.name ?? COMPANY.brand;
  const address = studio?.address ?? "Варна";
  const phone = studio?.phone;
  const cancelHours = studio?.cancelWindowHours ?? 4;
  const cardEnabled = studio?.cardPaymentsEnabled ?? true;
  // The studio-level deposit — what a client is quoted for a regular class. A
  // class carrying its own override states its amount on its own screens.
  const deposit = formatEurMinor(depositAmountMinor(null, studio));
  const standardPrice = formatEurMinor(classPriceMinor(null, studio));
  // Only practices that deviate from the studio price are worth listing.
  const pricedExceptions = practices.filter(
    (pr) =>
      pr.priceMinor !== null && pr.priceMinor !== (studio?.defaultClassPrice ?? null),
  );

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-6 font-sans text-[color:var(--brand-ink)] md:max-w-2xl">
      <header className="mb-8">
        <div className="flex items-center justify-center">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Image
              src="/logo.png"
              alt={name}
              width={180}
              height={90}
              priority
              className="h-16 w-auto"
            />
          </Link>
        </div>
        <Breadcrumb current="Политики" />
        <h1 className="mt-6 text-center font-display text-2xl font-bold tracking-tight">
          Политики
        </h1>
        <p className="mt-2 text-center text-xs text-[color:var(--brand-purple)]/60">
          Последна актуализация: {POLICIES_LAST_UPDATED}
        </p>
        {/* Quick anchors */}
        <nav className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {ANCHORS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="rounded-full border border-[color:var(--brand-pink)] bg-white px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
            >
              {a.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ─── Данни за търговеца / администратора ───────────────────── */}
      <section id="controller" className={`${card} mt-0`}>
        <h2 className={sectionTitle}>Кои сме ние</h2>
        <p className={p}>
          <strong>{name}</strong> е търговско наименование на студиото, което се
          стопанисва от:
        </p>
        <dl className="mt-3 space-y-2 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 p-4">
          <IdRow label="Дружество" value={COMPANY.legalName} />
          <IdRow label="ЕИК" value={COMPANY.eik} />
          <IdRow label="Седалище и адрес на управление" value={COMPANY.seat} />
          <IdRow label="Управител" value={COMPANY.representative} />
          <IdRow label="Адрес на студиото" value={address} />
          {phone && <IdRow label="Телефон" value={phone} />}
          <IdRow label="Имейл" value={COMPANY.email} />
        </dl>
        <p className={p}>
          {COMPANY.legalName} е <strong>администратор на личните данни</strong>,
          които обработваме през това приложение, и <strong>търговец</strong> по
          смисъла на Закона за защита на потребителите и Закона за електронната
          търговия. Не сме длъжни да назначаваме длъжностно лице по защита на
          данните; по всички въпроси, свързани с данните ти, пиши на{" "}
          <a
            href={`mailto:${COMPANY.email}`}
            className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
          >
            {COMPANY.email}
          </a>
          .
        </p>
      </section>

      {/* ─── Цени и как става покупката ────────────────────────────── */}
      <section id="prices" className={card}>
        <h2 className={sectionTitle}>Цени и как се резервира</h2>

        <h3 className={subTitle}>Цени</h3>
        <dl className="mt-3 space-y-2 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 p-4">
          <IdRow label="Групова тренировка (едно посещение)" value={standardPrice} />
          {pricedExceptions.map((pr) => (
            <IdRow
              key={pr.id}
              label={pr.name}
              value={formatEurMinor(pr.priceMinor as number)}
            />
          ))}
          <IdRow label="Депозит (еднократно, за да резервираш онлайн)" value={deposit} />
        </dl>
        <p className={p}>
          Всички цени са в <strong>евро (EUR)</strong> и са{" "}
          <strong>крайни</strong> — включват всички данъци и такси, няма скрити
          добавки. Цената на съответната тренировка е видима в графика, в
          резервационната форма и в електронната разписка. Специалните събития
          могат да имат отделна цена, обявена в описанието на събитието.
        </p>
        <p className={p}>
          <strong>Цената на тренировката се заплаща на място</strong> в студиото
          — с абонаментна карта, в брой или чрез Multisport. Онлайн през сайта се
          заплаща единствено <strong>еднократният депозит</strong>, който дава
          възможност да запазваш място.
        </p>

        <h3 className={subTitle}>Как става онлайн резервацията — стъпка по стъпка</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li className={li}>
            Избираш клас от графика и натискаш „Избор“. Виждаш дата, час,
            продължителност, треньор, свободни места и цената на тренировката.
          </li>
          <li className={li}>
            Влизаш в профила си с имейл и <strong>еднократен код</strong> — без
            парола.
          </li>
          <li className={li}>
            В резервационната форма се показват условията за ползване, усвояване и
            възстановяване на депозита и{" "}
            <strong>отбелязваш съгласието си с тези Общи условия</strong>. Без
            отметка бутонът „Потвърди“ остава неактивен.
          </li>
          <li className={li}>
            Ако вече имаш депозит по профила — избираш как ще платиш тренировката
            на място и потвърждаваш. <strong>Готово, мястото е запазено.</strong>
          </li>
          <li className={li}>
            Ако още нямаш депозит — избираш „Плати депозит с карта“. Показва се
            екран с точната сума и името на търговеца, след което си пренасочен/а
            към защитената платежна страница на {ACQUIRER.name}, където въвеждаш
            данните на картата.
          </li>
          <li className={li}>
            След успешна транзакция се връщаш в сайта, където се генерира{" "}
            <strong>електронна разписка</strong> с опция за печат. Копие от нея
            получаваш и на имейл. <strong>Запази или отпечатай разписката.</strong>
          </li>
        </ol>
        <p className={p}>
          <strong>Една резервация = една поръчка.</strong> В момента не се
          поддържа запазване на няколко класа в една поръчка — всеки клас се
          резервира отделно. Депозитът обаче се плаща само веднъж и важи за
          всички следващи резервации.
        </p>

        <h3 className={subTitle}>Кой може да ползва услугата</h3>
        <p className={p}>
          Услугата е предназначена за <strong>лица над 18 години</strong>.
          Профил за лице между 16 и 18 години се създава и управлява от родител
          или настойник, който дава съгласие и носи отговорност за резервациите и
          за плащанията с карта. Не обслужваме лица под 16 години.{" "}
          Плащане с карта се приема само от <strong>картодържателя</strong> или с
          негово изрично съгласие.
        </p>
      </section>

      {/* ─── Поверителност ─────────────────────────────────────────── */}
      <section id="privacy" className={card}>
        <h2 className={sectionTitle}>Политика за поверителност (GDPR)</h2>
        <p className={p}>
          Тази политика обяснява какви лични данни събираме през приложението за
          резервации, на какво правно основание, с кого ги споделяме и какви са
          правата ти. Изготвена е в съответствие с Регламент (ЕС) 2016/679
          (GDPR) и Закона за защита на личните данни.
        </p>

        <h3 className={subTitle}>Какви данни събираме</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>Профил:</strong> име, имейл адрес (използва се за вход с
            еднократен код) и по избор — телефонен номер.
          </li>
          <li className={li}>
            <strong>Резервации:</strong> за кои класове си записан/а, кога си
            направил/а или отменил/а резервация, отбелязано присъствие или
            неявяване.
          </li>
          <li className={li}>
            <strong>Плащания:</strong> сума, дата, статус и референция на
            транзакцията, начин на плащане и наличен баланс от възстановени
            депозити. <strong>Данните на картата ти никога не достигат до
            нас</strong> — виж раздел „Плащания и депозити“.
          </li>
          <li className={li}>
            <strong>Кореспонденция:</strong> имейлите, които ти изпращаме
            (разписки, напомняния, известия), и запитванията, които ни пращаш.
          </li>
          <li className={li}>
            <strong>Технически данни:</strong> сървърни логове (IP адрес, време
            на заявката, тип браузър), които се създават автоматично при
            посещение и служат за сигурност и отстраняване на грешки.
          </li>
        </ul>
        <p className={p}>
          Не събираме данни за здравословното ти състояние през приложението. Ако
          споделиш такива на място в студиото (напр. контузия, относима към
          тренировката), те се обработват отделно и само с твое изрично съгласие.
        </p>

        <h3 className={subTitle}>Защо ги обработваме и на какво основание</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li className={li}>
            <strong>Управление на резервациите и местата</strong> — изпълнение на
            договора с теб (чл. 6, § 1, б. „б“ GDPR). Без тези данни не можем да
            запазим място.
          </li>
          <li className={li}>
            <strong>Обработка на депозити и възстановявания</strong> — изпълнение
            на договора (чл. 6, § 1, б. „б“).
          </li>
          <li className={li}>
            <strong>Транзакционни имейли</strong> — електронна разписка,
            напомняне преди клас, известие при освободено място: изпълнение на
            договора (чл. 6, § 1, б. „б“).
          </li>
          <li className={li}>
            <strong>Счетоводство и данъчни задължения</strong> — законово
            задължение (чл. 6, § 1, б. „в“).
          </li>
          <li className={li}>
            <strong>Сигурност, предотвратяване на измами и злоупотреби</strong>{" "}
            (напр. ограничаване на честотата на заявките, логове) — легитимен
            интерес (чл. 6, § 1, б. „е“).
          </li>
        </ul>
        <p className={p}>
          Не изпращаме рекламни съобщения и не използваме данните ти за
          маркетинг. Ако някога въведем такива съобщения, това ще става само с
          предварително съгласие, което можеш да оттеглиш по всяко време.
        </p>

        <h3 className={subTitle}>Кой получава данните</h3>
        <p className={p}>
          Работим с внимателно подбрани доставчици, които действат като
          обработващи лични данни по договор с нас (чл. 28 GDPR) и нямат право да
          ползват данните за свои цели:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          {PROCESSORS.map((proc) => (
            <li key={proc.name} className={li}>
              <strong>{proc.name}</strong> — {proc.purpose}.{" "}
              <span className="text-[color:var(--brand-ink)]/60">
                {proc.safeguard}.
              </span>
            </li>
          ))}
          <li className={li}>
            <strong>{ACQUIRER.name}</strong> — обработва картовото плащане през
            своя {ACQUIRER.product}. Банката и картовите организации (Visa,
            Mastercard) обработват картовите данни{" "}
            <strong>като самостоятелни администратори</strong>, съгласно своите
            правила и приложимото законодателство.
          </li>
          <li className={li}>
            <strong>Държавни органи</strong> — само когато сме законово задължени
            (напр. НАП, съд, разследващи органи) и в поискания обем.
          </li>
        </ul>
        <p className={p}>
          <strong>Не продаваме</strong> личните ти данни и не ги предоставяме за
          маркетингови цели на трети лица.
        </p>

        <h3 className={subTitle}>Предаване извън ЕС/ЕИП</h3>
        <p className={p}>
          Данните се съхраняват на сървъри в Европейския съюз. Някои от
          доставчиците ни са дружества със седалище в САЩ; при евентуален достъп
          или трансфер извън ЕИП защитата се гарантира чрез{" "}
          <strong>стандартни договорни клаузи</strong> на Европейската комисия и
          допълнителни технически мерки (криптиране при пренос и при съхранение).
        </p>

        <h3 className={subTitle}>Колко време ги пазим</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>Профил:</strong> докато имаш акаунт. При заявено изтриване —
            до 30 дни, освен ако не сме длъжни да запазим отделни записи (виж
            по-долу).
          </li>
          <li className={li}>
            <strong>Резервации и транзакции:</strong> минимум 13 месеца от датата
            на транзакцията — изискване на картовите организации и на
            обслужващата банка за разрешаване на оспорвания.
          </li>
          <li className={li}>
            <strong>Счетоводни документи:</strong> 10 години съгласно чл. 12 от
            Закона за счетоводството.
          </li>
          <li className={li}>
            <strong>Сървърни логове:</strong> до 30 дни.
          </li>
        </ul>
        <p className={p}>
          След изтичане на съответния срок данните се изтриват или се
          анонимизират необратимо.
        </p>

        <h3 className={subTitle}>Как ги пазим</h3>
        <p className={p}>
          Достъпът до данните е ограничен до служители и треньори, за които е
          необходим за работата им, и се проверява на сървъра при всяка заявка.
          Връзката към сайта е криптирана (HTTPS), паролите са заменени с вход
          през еднократен код, а картовите данни не се съхраняват при нас. При
          нарушение на сигурността, което може да породи риск за правата ти, ще
          уведомим КЗЛД в срок до 72 часа и ще информираме и теб, когато рискът
          е висок.
        </p>

        <h3 className={subTitle}>Твоите права</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>Достъп</strong> — да получиш копие от данните, които пазим за
            теб.
          </li>
          <li className={li}>
            <strong>Коригиране</strong> — да поправиш неточни или непълни данни.
          </li>
          <li className={li}>
            <strong>Изтриване</strong> („правото да бъдеш забравен“) — освен
            когато закон изисква да запазим определени записи.
          </li>
          <li className={li}>
            <strong>Ограничаване</strong> на обработването и{" "}
            <strong>възражение</strong> срещу обработване, основано на легитимен
            интерес.
          </li>
          <li className={li}>
            <strong>Преносимост</strong> — да получиш данните си в машинно
            четим формат или да поискаш прехвърлянето им.
          </li>
          <li className={li}>
            <strong>Оттегляне на съгласие</strong> — когато обработваме на
            основание съгласие, можеш да го оттеглиш по всяко време, без това да
            засяга законосъобразността на предходното обработване.
          </li>
        </ul>
        <p className={p}>
          За да упражниш което и да е от тези права, пиши на{" "}
          <a
            href={`mailto:${COMPANY.email}`}
            className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
          >
            {COMPANY.email}
          </a>
          {phone ? `, обади се на ${phone}` : ""} или ни потърси на място в
          студиото. Отговаряме в срок до <strong>един месец</strong> от
          получаване на искането (срокът може да бъде удължен с още два месеца при
          сложни случаи, за което ще те уведомим).
        </p>

        <h3 className={subTitle}>Автоматизирани решения и профилиране</h3>
        <p className={p}>
          Не вземаме автоматизирани решения с правни последици за теб и не
          извършваме профилиране.
        </p>

        <h3 className={subTitle}>Деца</h3>
        <p className={p}>
          Приложението не е предназначено за лица под 16 години. Профил за
          непълнолетен се създава и управлява от родител или настойник, който
          дава съгласие за обработването и носи отговорност за резервациите.
        </p>

        <h3 className={subTitle}>Жалба до надзорния орган</h3>
        <p className={p}>
          Ако смяташ, че обработваме данните ти незаконосъобразно, можеш да
          подадеш жалба до {DPA.name}, {DPA.address}, {DPA.email},{" "}
          {DPA.site}. Ще се радваме първо да опитаме да решим въпроса заедно.
        </p>

        <h3 className={subTitle}>Промени в политиката</h3>
        <p className={p}>
          Може да актуализираме тази политика. Актуалната версия е винаги на тази
          страница с дата на последна промяна. При съществени промени ще те
          уведомим по имейл или при следващото влизане в приложението.
        </p>
      </section>

      {/* ─── Плащания и депозити ───────────────────────────────────── */}
      <section id="payments" className={card}>
        <h2 className={sectionTitle}>Плащания и депозити</h2>
        <p className={p}>
          <strong>Депозитът от {deposit} се заплаща еднократно</strong> и дава
          възможност да запазваш място за тренировка. Той остава по профила ти и
          важи за следващите резервации. При неявяване или неотписване на
          запазеното място в посочения интервал депозитът се усвоява и за нови
          резервации се дължи нов депозит. Таксата за самата тренировка се
          заплаща на място. Всички суми са в евро (EUR) и са крайни.
        </p>

        <h3 className={subTitle}>Онлайн плащане с карта (виртуален ПОС)</h3>
        <p className={p}>
          Когато избереш „Плати депозит с карта сега“, приложението те
          пренасочва към защитената платежна страница на{" "}
          <strong>
            {ACQUIRER.productDefinite} на {ACQUIRER.name}
          </strong>
          . Данните на
          картата (номер, срок на валидност, CVC) се въвеждат{" "}
          <strong>само там</strong> — на страницата на банката — и{" "}
          <strong>не преминават през нашия сайт, нито се съхраняват при нас</strong>.
          Ние получаваме единствено резултата от транзакцията: успешна или
          неуспешна, сума, дата и референтен номер.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            Приемаме карти {ACQUIRER.schemes}.
          </li>
          <li className={li}>
            Плащането е защитено с {ACQUIRER.authentication} — банката ти може да
            поиска допълнително потвърждение (SMS код, push в банковото
            приложение или биометрия).
          </li>
          <li className={li}>
            Сумата се таксува веднага при успешно потвърждение. В извлечението по
            картата ще видиш името на търговеца ({COMPANY.legalName} / {name}).
          </li>
          <li className={li}>
            Мястото ти се запазва в момента на потвърждаване на резервацията. Ако
            прекъснеш плащането, незавършената резервация се освобождава
            автоматично след около 15 минути.
          </li>
          <li className={li}>
            След успешно плащане получаваш на имейл{" "}
            <strong>електронна разписка</strong> с уникален номер на поръчката,
            дата и час, вид на услугата, платена сума и данни на търговеца.
            Запази я — тя е доказателството ти за плащането.
          </li>
        </ul>
        {cardEnabled && (
          <div className="mt-4 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 p-4 text-center">
            <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-purple)]/60">
              Приемаме плащания с
            </p>
            <PaymentLogos />
          </div>
        )}

        <h3 className={subTitle}>Плащане на място и плащане с баланс</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>На място</strong> — оставяш депозита в студиото най-късно
            деня преди класа. Мястото се пази от момента на резервацията.
          </li>
          <li className={li}>
            <strong>С вече платен депозит</strong> — щом депозитът е отбелязан по
            профила ти, запазваш място онлайн без ново плащане. Записването не
            изразходва депозита.
          </li>
        </ul>

        <h3 className={subTitle}>Условия за ползване на депозита</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li className={li}>
            Депозитът е <strong>безсрочен</strong> — стои по профила ти без краен
            срок и важи за неограничен брой следващи резервации. Не изтича и не
            се обезсилва от липса на активност.
          </li>
          <li className={li}>
            Записването за клас <strong>не изразходва</strong> депозита;
            присъствието — също. Той е гаранция, не предплатена сума.
          </li>
          <li className={li}>
            Депозитът <strong>не се приспада</strong> от цената на тренировката —
            тя се заплаща отделно, на място.
          </li>
          <li className={li}>
            Депозитът е <strong>личен</strong> — не се прехвърля на друг профил и
            не се преотстъпва на друго лице.
          </li>
          <li className={li}>
            <strong>Усвоява се</strong> при неявяване или при отписване по-късно
            от {cancelHours} часа преди началото на класа. За нови резервации се
            дължи нов депозит.
          </li>
        </ul>

        <h3 className={subTitle}>Възстановяване на депозита</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li className={li}>
            При отписване по-рано от <strong>{cancelHours} часа</strong> преди
            началото на класа депозитът се запазва по{" "}
            <strong>профила ти</strong>, готов за следваща резервация.
          </li>
          <li className={li}>
            <strong>
              Не си длъжен/на да го ползваш за друг клас.
            </strong>{" "}
            Ако не желаеш повече да ползваш депозита, пиши ни на{" "}
            <a
              href={`mailto:${COMPANY.email}`}
              className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
            >
              {COMPANY.email}
            </a>
            {phone ? ` или се обади на ${phone}` : ""} и го възстановяваме в срок
            до <strong>14 дни</strong> от получаване на искането, без да дължиш
            обяснение.
          </li>
          <li className={li}>
            <strong>
              Когато депозитът е платен с банкова карта, сумата се възстановява
              изключително чрез картова операция по същата карта
            </strong>
            , с която е извършено плащането. Възстановяване по друга карта, по
            банкова сметка или в брой не е възможно.
          </li>
          <li className={li}>
            Депозити, оставени <strong>в брой</strong> в студиото, се
            възстановяват в брой на място, срещу подпис.
          </li>
          <li className={li}>
            Вече усвоен депозит (при неявяване или късно отписване) не подлежи на
            възстановяване.
          </li>
        </ul>

        <h3 className={subTitle}>Възстановяване на други заплатени суми</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li className={li}>
            <strong>Ако ние отменим клас</strong> — депозитът ти остава
            непокътнат по профила, а ако предпочиташ, възстановяваме платената с
            карта сума по същата карта в срок до <strong>14 дни</strong>.
          </li>
          <li className={li}>
            <strong>Дублирано или грешно плащане</strong> — възстановява се
            цялата сума по същата карта, в срок до <strong>5 работни дни</strong>{" "}
            от установяването или от твоето уведомление.
          </li>
          <li className={li}>
            <strong>Неуспешна или прекъсната транзакция</strong> — ако банката е
            блокирала сума, без плащането да е завършило, блокировката се
            освобождава автоматично от издателя на картата; при нужда пиши ни и
            съдействаме.
          </li>
          <li className={li}>
            Срокът, в който сумата реално се появява по картовата ти сметка,
            зависи от банката-издател и обичайно е между 1 и 10 работни дни след
            като операцията е изпратена от нас.
          </li>
          <li className={li}>
            Възстановяване не се дължи при усвоен депозит и за вече проведена
            тренировка, на която си присъствал/а.
          </li>
        </ul>
      </section>

      {/* ─── Общи условия ──────────────────────────────────────────── */}
      <section id="terms" className={card}>
        <h2 className={sectionTitle}>Общи условия</h2>
        <p className={p}>
          Тези условия уреждат отношенията между {COMPANY.legalName}, ЕИК{" "}
          {COMPANY.eik} („ние“, търговецът), и всеки, който ползва приложението
          за резервации на {name} („ти“, клиентът). С отбелязване на съгласие в
          резервационната форма и потвърждаване на резервация приемаш условията в
          актуалната им редакция.
        </p>

        <h3 className={subTitle}>1. Данни за търговеца</h3>
        <dl className="mt-3 space-y-2 rounded-2xl bg-[color:var(--brand-pink-soft)]/50 p-4">
          <IdRow label="Наименование" value={COMPANY.legalName} />
          <IdRow label="Търговско наименование" value={COMPANY.brand} />
          <IdRow label="ЕИК" value={COMPANY.eik} />
          <IdRow label="Седалище и адрес на управление" value={COMPANY.seat} />
          <IdRow label="Адрес за кореспонденция" value={address} />
          <IdRow label="Управител" value={COMPANY.representative} />
          {phone && <IdRow label="Телефон за контакт" value={phone} />}
          <IdRow label="Имейл за кореспонденция" value={COMPANY.email} />
          <IdRow label="Интернет адрес" value={COMPANY.site} />
        </dl>
        <p className={p}>
          Надзорни органи: {CPC.name} — за потребителски спорове; {DPA.name} — за
          защита на личните данни.
        </p>

        <h3 className={subTitle}>2. Услугата и цената</h3>
        <p className={p}>
          Чрез приложението резервираш място за групови тренировки в {name},{" "}
          {address}. Класовете имат ограничен капацитет; свободните места се
          показват в реално време.
        </p>
        <p className={p}>
          Цената за едно посещение е <strong>{standardPrice}</strong> — крайна
          цена в евро, с включени всички данъци — и{" "}
          <strong>се заплаща на място</strong> в студиото. Отделни практики и
          специални събития могат да имат различна цена, която е обявена в
          графика и в описанието на събитието (виж раздел „Цени“). За да можеш да
          резервираш онлайн, е нужен <strong>еднократен депозит от {deposit}</strong>{" "}
          по профила ти.
        </p>

        <h3 className={subTitle}>3. Как се резервира</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            Влизаш с имейл и еднократен код (без парола), избираш клас и как ще
            заплатиш тренировката на място (абонаментна карта, в брой или
            Multisport).
          </li>
          <li className={li}>
            Преди да потвърдиш — и <strong>преди</strong> да бъдеш пренасочен/а
            към страницата за въвеждане на картови данни — отбелязваш изрично
            съгласие с тези Общи условия. Датата и редакцията на приетите условия
            се записват към резервацията.
          </li>
          <li className={li}>
            <strong>С карта</strong> — плащаш депозита онлайн през виртуалния ПОС
            (когато опцията е активна).
          </li>
          <li className={li}>
            <strong>На място</strong> — оставяш депозита в студиото най-късно
            деня преди класа.
          </li>
          <li className={li}>
            <strong>С вече платен депозит</strong> — резервираш направо;
            записването не изразходва депозита.
          </li>
        </ul>
        <p className={p}>
          Договорът се счита за сключен в момента, в който потвърдиш резервацията
          и получиш потвърждение в приложението и на имейл. Графикът за клиенти
          показва подвижен прозорец от 7 дни напред.
        </p>

        <h3 className={subTitle}>4. Отказ от резервация — срокове, условия и начини</h3>
        <p className={p}>
          <strong>Срок:</strong> можеш да се отпишеш свободно до{" "}
          <strong>{cancelHours} часа</strong> преди началото на класа.
        </p>
        <p className={p}>
          <strong>Начини за отказ</strong> — по всеки от тях, като важи моментът
          на получаване:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            в приложението — „Профил“ → резервацията → „Отпиши се“ (най-бързо и
            се отразява веднага);
          </li>
          <li className={li}>
            с имейл до{" "}
            <a
              href={`mailto:${COMPANY.email}`}
              className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
            >
              {COMPANY.email}
            </a>
            ;
          </li>
          {phone && <li className={li}>по телефон на {phone};</li>}
          <li className={li}>на място в студиото.</li>
        </ul>
        <p className={p}>
          <strong>Последствия:</strong>
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li className={li}>
            Отказ <strong>по-рано</strong> от {cancelHours} часа преди класа —
            мястото се освобождава и <strong>депозитът остава по профила ти</strong>{" "}
            (условията за неговото ползване и възстановяване са в раздел
            „Плащания и депозити“). Ако не желаеш да го ползваш повече, можеш да
            поискаш възстановяване на сумата.
          </li>
          <li className={li}>
            Отказ <strong>по-късно</strong> от {cancelHours} часа преди класа —
            резервацията се отменя и <strong>депозитът се усвоява</strong>, тъй
            като мястото вече не може да бъде предложено на друг.
          </li>
          <li className={li}>
            <strong>Неявяване</strong> без отказ — депозитът се усвоява.
          </li>
          <li className={li}>
            Ако <strong>ние</strong> отменим клас — независимо от срока депозитът
            ти остава непокътнат по профила или, по твой избор, ти се възстановява
            по същата карта в срок до 14 дни.
          </li>
        </ul>

        <h3 className={subTitle}>5. Възстановяване на заплатени суми</h3>
        <p className={p}>
          Срокът за възстановяване е до <strong>14 дни</strong> от получаване на
          искането (до 5 работни дни при дублирано или грешно плащане).{" "}
          <strong>
            При необходимост от възстановяване на сума, платена с карта от страна
            на потребителя, съответната сума се възстановява чрез картова операция
            по същата карта, с която е извършено плащането.
          </strong>{" "}
          Възстановяване по друг начин на плащане, по друга карта или по банкова
          сметка не е възможно. Пълните основания и срокове са описани в раздел{" "}
          <a
            href="#payments"
            className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
          >
            „Плащания и депозити“
          </a>
          .
        </p>

        <h3 className={subTitle}>6. Право на отказ от договора</h3>
        <p className={p}>
          Съгласно чл. 57, т. 12 от Закона за защита на потребителите (чл. 16,
          б. „л“ от Директива 2011/83/ЕС) законовото право на отказ в 14-дневен
          срок <strong>не се прилага</strong> за услуги, свързани със свободното
          време, които се предоставят на конкретна дата и час — какъвто е случаят
          с резервацията на място за тренировка. Вместо това важат нашите
          по-благоприятни правила за отмяна по-горе.
        </p>

        <h3 className={subTitle}>7. Твоите задължения</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            Да предоставяш вярни данни и да не ползваш чужд профил.
          </li>
          <li className={li}>
            Да прецениш дали здравословното ти състояние позволява натоварването;
            при съмнение се консултирай с лекар и уведоми треньора.
          </li>
          <li className={li}>
            Да спазваш правилата на студиото и указанията на треньора.
          </li>
        </ul>

        <h3 className={subTitle}>8. Отговорност</h3>
        <p className={p}>
          Отговаряме за услугата съгласно българското законодателство. Не носим
          отговорност за вреди от неспазване на указанията на треньора или от
          премълчано здравословно състояние, както и за кратки прекъсвания на
          приложението поради поддръжка или причини извън нашия контрол.
        </p>

        <h3 className={subTitle}>9. Рекламации и спорове</h3>
        <p className={p}>
          При проблем с резервация или плащане ни потърси на{" "}
          <a
            href={`mailto:${COMPANY.email}`}
            className="font-semibold text-[color:var(--brand-magenta)] hover:underline"
          >
            {COMPANY.email}
          </a>
          {phone ? `, на тел. ${phone}` : ""} или на място в студиото —
          отговаряме в срок до 14 дни. Ако не сме решили въпроса, можеш да се
          обърнеш към {CPC.name}, {CPC.address}, {CPC.site}, или към
          европейската платформа за онлайн решаване на спорове —
          ec.europa.eu/odr.
        </p>

        <h3 className={subTitle}>10. Приложимо право и промени</h3>
        <p className={p}>
          Прилага се българското право. Може да актуализираме тези условия;
          промените важат за резервации, направени след публикуването им на тази
          страница.
        </p>
      </section>

      {/* ─── Бисквитки ─────────────────────────────────────────────── */}
      <section id="cookies" className={card}>
        <h2 className={sectionTitle}>Политика за бисквитки</h2>
        <p className={p}>
          Използваме <strong>само строго необходими бисквитки</strong> — без
          рекламни, аналитични или проследяващи. Не ползваме Google Analytics,
          пиксели или профилиране.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>Сесийни бисквитки за вход</strong> (имена, започващи с{" "}
            <code className="rounded bg-[color:var(--brand-pink-soft)] px-1 font-mono text-[12px]">
              sb-
            </code>
            ) — пазят те логнат/а, докато ползваш приложението. Без тях
            резервациите не работят.
          </li>
          <li className={li}>
            <strong>Локално запазен избор</strong> — устройството ти помни, че
            си видял/а съобщението за бисквитки, за да не ти го показваме всеки
            път.
          </li>
        </ul>
        <p className={p}>
          Тъй като тези бисквитки са технически необходими за предоставяне на
          услугата, за тях не се изисква съгласие (чл. 4а, ал. 5 от Закона за
          електронните съобщения). Можеш да ги изтриеш по всяко време от
          настройките на браузъра си — това ще те отпише от профила ти.
        </p>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="font-display text-xs font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] hover:underline"
        >
          ← Към началото
        </Link>
      </div>
    </main>
  );
}

/** One row of the trader-identity block. */
function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--brand-purple)]/60 sm:w-52 sm:shrink-0">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-[color:var(--brand-ink)]/85">
        {value}
      </dd>
    </div>
  );
}
