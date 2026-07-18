import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Breadcrumb } from "@/app/_components/Breadcrumb";

export const metadata = {
  title: "FitLab Varna — Политики",
  description:
    "Поверителност, Общи условия и Бисквитки — как FitLab Varna обработва данните ти.",
};

export const dynamic = "force-dynamic";

const sectionTitle =
  "font-display text-lg font-bold tracking-tight text-[color:var(--brand-purple)]";
const subTitle = "mt-5 font-display text-sm font-bold text-[color:var(--brand-ink)]";
const p = "mt-2 text-sm leading-relaxed text-[color:var(--brand-ink)]/80";
const li = "text-sm leading-relaxed text-[color:var(--brand-ink)]/80";

export default async function PoliciesPage() {
  const studio = await prisma.studio.findUnique({
    where: { slug: "fitlab-varna" },
    select: {
      name: true,
      address: true,
      phone: true,
      cancelWindowHours: true,
    },
  });

  const name = studio?.name ?? "FitLab Varna";
  const address = studio?.address ?? "Варна";
  const phone = studio?.phone;
  const cancelHours = studio?.cancelWindowHours ?? 4;

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
          Последна актуализация: 16.07.2026 г.
        </p>
        {/* Quick anchors */}
        <nav className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <a
            href="#privacy"
            className="rounded-full border border-[color:var(--brand-pink)] bg-white px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
          >
            Поверителност
          </a>
          <a
            href="#terms"
            className="rounded-full border border-[color:var(--brand-pink)] bg-white px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
          >
            Общи условия
          </a>
          <a
            href="#cookies"
            className="rounded-full border border-[color:var(--brand-pink)] bg-white px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-[color:var(--brand-magenta)] transition-colors hover:bg-[color:var(--brand-pink-soft)]"
          >
            Бисквитки
          </a>
        </nav>
      </header>

      {/* ─── Поверителност ─────────────────────────────────────────── */}
      <section
        id="privacy"
        className="scroll-mt-6 rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)]"
      >
        <h2 className={sectionTitle}>Политика за поверителност</h2>
        <p className={p}>
          Администратор на личните данни е {name}, {address}
          {phone ? `, тел. ${phone}` : ""}. Тази политика обяснява какви данни
          събираме чрез приложението за резервации и защо.
        </p>

        <h3 className={subTitle}>Какви данни събираме</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>Профил:</strong> име, имейл адрес (използва се за вход с код
            за потвърждение) и по избор — телефонен номер.
          </li>
          <li className={li}>
            <strong>Резервации:</strong> за кои класове си записан/а, кога си
            направил/а или отменил/а резервация, присъствие.
          </li>
          <li className={li}>
            <strong>Плащания:</strong> сума, дата, статус и референция на
            транзакцията при плащане на депозит, както и вътрешен баланс от
            възстановени депозити. <strong>Номерът на картата ти никога не
            достига до нас</strong> — той се въвежда само на защитената страница
            на доставчика на плащания.
          </li>
        </ul>

        <h3 className={subTitle}>За какво ги използваме</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>Управление на резервациите и местата в класовете.</li>
          <li className={li}>Обработка на депозити и възстановявания.</li>
          <li className={li}>
            Имейл известия: потвърждение на резервация (електронна разписка),
            напомняния преди клас и известие при освободено място.
          </li>
        </ul>

        <h3 className={subTitle}>Кой обработва данните</h3>
        <p className={p}>
          Използваме следните доставчици (обработващи лични данни): Supabase
          (база данни и удостоверяване), Vercel (хостинг), доставчик на картови
          плащания и Resend (изпращане на имейли). Не продаваме и не споделяме
          данните ти за маркетингови цели.
        </p>

        <h3 className={subTitle}>Колко време ги пазим</h3>
        <p className={p}>
          Записите за резервации и плащания се съхраняват минимум 13 месеца от
          датата на транзакцията (изискване на картовите организации). Данните
          за профила се пазят, докато имаш акаунт.
        </p>

        <h3 className={subTitle}>Твоите права</h3>
        <p className={p}>
          Имаш право на достъп, коригиране и изтриване на данните си, както и на
          жалба до Комисията за защита на личните данни (кзлд.bg). За да
          упражниш правата си, свържи се с нас на място в студиото
          {phone ? ` или на тел. ${phone}` : ""}.
        </p>
      </section>

      {/* ─── Общи условия ──────────────────────────────────────────── */}
      <section
        id="terms"
        className="mt-6 scroll-mt-6 rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)]"
      >
        <h2 className={sectionTitle}>Общи условия</h2>

        <h3 className={subTitle}>Услугата</h3>
        <p className={p}>
          Чрез приложението резервираш място за групови тренировки в {name},
          {" "}{address}. За всяка резервация се дължи депозит, чийто размер е
          посочен на класа. Всички цени са крайни, в евро (EUR), и се виждат
          преди потвърждаване на резервацията.
        </p>

        <h3 className={subTitle}>Как се резервира</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            <strong>С карта</strong> — плащаш депозита онлайн при резервация
            (когато опцията е активна).
          </li>
          <li className={li}>
            <strong>На място</strong> — оставяш депозита в студиото най-късно
            деня преди класа.
          </li>
          <li className={li}>
            <strong>С баланс</strong> — използваш натрупан баланс от
            възстановени депозити.
          </li>
        </ul>
        <p className={p}>
          Мястото ти се запазва в момента на потвърждаване. След успешна
          резервация получаваш имейл с електронна разписка — уникален номер,
          дата, услуга, сума и данни на търговеца.
        </p>

        <h3 className={subTitle}>Отказ и възстановяване</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={li}>
            Можеш да отмениш резервация до <strong>{cancelHours} часа</strong>{" "}
            преди началото на класа — депозитът се запазва: връща се като баланс
            в профила ти, който можеш да ползваш за следваща резервация.
          </li>
          <li className={li}>
            При отказ по-късно от {cancelHours} часа преди класа или при
            неявяване депозитът се удържа.
          </li>
          <li className={li}>
            Депозити, оставени на място, не се движат по карта или баланс —
            уреждат се в студиото.
          </li>
        </ul>

        <h3 className={subTitle}>Рекламации и спорове</h3>
        <p className={p}>
          При проблем с резервация или плащане се свържи с нас на място в
          студиото{phone ? `, на тел. ${phone}` : ""} — ще съдействаме за
          разрешаване на въпроса. Ако не сме успели да го разрешим, можеш да се
          обърнеш към Комисията за защита на потребителите (kzp.bg) или към
          европейската платформа за онлайн решаване на спорове
          (ec.europa.eu/odr).
        </p>
      </section>

      {/* ─── Бисквитки ─────────────────────────────────────────────── */}
      <section
        id="cookies"
        className="mt-6 scroll-mt-6 rounded-3xl border border-[color:var(--brand-pink)]/40 bg-white p-6 shadow-[0_8px_30px_-18px_rgba(123,45,142,0.25)]"
      >
        <h2 className={sectionTitle}>Политика за бисквитки</h2>
        <p className={p}>
          Използваме <strong>само строго необходими бисквитки</strong> — без
          рекламни, аналитични или проследяващи.
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
          Тъй като тези бисквитки са необходими за работата на услугата, за тях
          не се изисква съгласие. Можеш да ги изтриеш по всяко време от
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
