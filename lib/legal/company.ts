/**
 * Legal identity of the operator, in one place.
 *
 * `FitLab Varna` is a trade name — the trader and GDPR data controller is the
 * company below. Anything that has to name a legal person (policies page,
 * electronic receipts, complaint handling) reads it from here, so a change of
 * seat or contact touches exactly one file.
 *
 * Sources of the obligations these fields satisfy:
 *  - GDPR (Regulation (EU) 2016/679) Art. 13(1)(a) — identity + contact of the
 *    controller must be given to the data subject.
 *  - Закон за електронната търговия чл. 4 — trader identification must be
 *    permanently and easily accessible on the site.
 *  - Fibank virtual-POS instruction §I — merchant identity on the site and on
 *    the electronic receipt.
 */

export const COMPANY = {
  /** Trade name the clients know. */
  brand: "FitLab Varna",
  legalName: "ФИЗИОЛАЙФ 22 ЕООД",
  eik: "207009324",
  seat:
    "гр. Варна 9000, р-н Младост, ж.к. Младост, бл. 150, вх. 5, ет. 6, ап. 16",
  /** Управител / законен представител. */
  representative: "Стивиян Иванов Иванов",
  /** Contact for GDPR requests, complaints and everything legal. */
  email: "info@fitlabvarna.com",
} as const;

/**
 * Acquiring bank behind the online card deposits. Card data is entered on the
 * bank's own secure page — it never reaches our servers — so the bank and the
 * card schemes act as separate controllers for the payment itself.
 */
export const ACQUIRER = {
  name: "Първа инвестиционна банка АД (Fibank)",
  /** What the client actually sees when paying online. */
  product: "виртуален ПОС терминал",
  /** Same thing with the definite article, for mid-sentence use. */
  productDefinite: "виртуалния ПОС терминал",
  schemes: "Visa, Visa Electron, V PAY, Mastercard, Maestro",
  /** Strong customer authentication marks shown at checkout. */
  authentication: "Visa Secure и Mastercard Identity Check (3-D Secure)",
} as const;

/**
 * Processors (GDPR Art. 28) we hand personal data to, with the purpose and the
 * transfer safeguard. Rendered as-is on the policies page — keep it truthful:
 * if a provider is swapped or added, this list is the thing to update.
 */
export const PROCESSORS = [
  {
    name: "Supabase, Inc.",
    purpose: "хостинг на базата данни, вход с еднократен код и съхранение на снимки",
    safeguard: "сървъри в ЕС; при трансфер извън ЕИП — стандартни договорни клаузи",
  },
  {
    name: "Vercel, Inc.",
    purpose: "хостинг на сайта и на приложението за резервации",
    safeguard: "стандартни договорни клаузи на Европейската комисия",
  },
  {
    name: "Resend (Plus Five Five, Inc.)",
    purpose: "изпращане на транзакционни имейли — разписки, напомняния, известия",
    safeguard: "стандартни договорни клаузи на Европейската комисия",
  },
] as const;

/** Регулаторът по защита на личните данни. */
export const DPA = {
  name: "Комисия за защита на личните данни (КЗЛД)",
  address: "гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2",
  site: "cpdp.bg",
  email: "kzld@cpdp.bg",
} as const;

/** Комисия за защита на потребителите — потребителски спорове. */
export const CPC = {
  name: "Комисия за защита на потребителите (КЗП)",
  address: "гр. София 1000, пл. „Славейков“ № 4А, ет. 3, 4 и 6",
  site: "kzp.bg",
} as const;

/** Shown as „Последна актуализация" on the policies page. Bump on every edit. */
export const POLICIES_LAST_UPDATED = "04.08.2026 г.";
