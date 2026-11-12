import { sql } from "drizzle-orm";
import { products } from "@/db/schema";

/** Owner-requested publication restriction; independent of import/manual allowances. */
export const PUBLIC_PRODUCT_EXCLUSION_VERSION = "owner-brand-exclusions-2026-11-12";

// Keep the exact complained-about routes closed even if their visible titles change.
// These are route exclusions, not persistent product identity or inventory changes.
export const DISPUTED_GAZ_PRODUCT_SLUGS = [
  "dvg-01720-vint-koromysla-gazel-biznes-dv-4216",
  "dvg-00143-kran-maslyanogo-radiatora-gaz",
  "kz-00109-kozhuh-rulevoy-kolonki-gaz-3302",
  "dvg-00711-kollektor-vpusknoy-gaz-53-pauk",
  "zh-00174-kozhuh-oblicovki-far-gaz-31105-lev-prav",
  "zh-00096-ramka-radiatora-gaz-3302-nov-obr",
  "dvg-02214-schup-maslyanyy-gazel-next",
  "rdg-00068-zaschelka-zadney-dveri-gaz",
  "rdg-00126-karetka-bokovoy-dveri-gaz-2705",
  "kg-00030-shponka-kolenvala-gaz",
  "zh-00118-krylo-perednee-gaz-53-st-obr",
  "eog-00088-predohranitel-gazel",
  "dvg-01623-diffuzor-gazel-biznes",
  "rdg-00052-zamok-kapota-gazel-next-v-sbore",
  "rm-00154-remen-gazel-zmz-1413",
  "dvg-01895-kollektor-vypusknoy-gazel-406-dv",
  "zh-00053-napravlyayuschaya-dveri-gazel",
  "kz-00306-karetka-bokovoy-dveri-gazel-v-sbore-s-p",
  "dvg-00399-kolco-raspornoe-r-vala-gaz-24",
  "dvg-01273-benzozabornik-gaz-33106-dv-cummins",
  "dvg-01248-benzozabornik-gaz-33104-33081-3309"
] as const;

// Bounded brand/model words, not arbitrary substrings or bare numeric part codes.
// NEXT, Business, NN and the standalone letter G are deliberately not signals.
const restrictedTerms = [
  "[gг][aа][zз]", "[nн][aа][zз]", "газел[а-яё]*", "gazel[a-z]*",
  "газон", "газона", "газону", "газоном", "gazon",
  "волга", "волги", "волгу", "волге", "volga",
  "соболь", "соболя", "соболю", "соболем", "sobol", "sobolj",
  "валдай", "валдая", "валдаю", "valday", "valdai", "valdaj",
  "баргузин", "баргузина", "barguzin", "садко", "sadko",
  "сайбер", "siber", "чайка", "чайки", "chaika", "chayka", "chajka",
  "победа", "победы", "pobeda", "ермак", "ермака", "ermak", "yermak",
  "вепрь", "вепря", "vepr", "земляк", "zemlyak", "zemljak",
  "атаман", "ataman", "трофим", "trofim", "комбат", "kombat", "combat",
  "полуторка", "polutorka", "лукойл[а-яё]*", "lukoil[a-z]*", "g[ ._—–-]*part", "gpart", "джи[ ._—–-]*парт",
  // Additional makes explicitly selected by the owner on 2026-11-12.
  "[kк][aа][mм][aа][zз]", "hyundai", "hundai", "hyunday", "х[еёюу]нд[аэе]й?",
  "[kк][iи][aа]", "wabco", "вабко", "вабсо", "[bбв][mм][wв]", "bmwx[1-7]",
  "mitsubishi", "mitsubisi", "митсубиси", "митсубиши", "мицубиси", "мицубиши",
  // Common make-specific fitment names; not generic NEXT, Business, G or bare numbers.
  "solaris", "солярис", "accent", "акцент", "sonata", "соната", "elantra", "элантра",
  "getz", "гетц", "гетс", "tucson", "туссан", "туксон", "туксoн",
  "santa[ ._—–-]*fe", "санта[ ._—–-]*фе", "creta", "крета", "h[ ._—–-]*1",
  "starex", "старекс", "terracan", "терракан", "porter", "портер", "i10", "i20", "i30", "i40",
  "rio", "рио", "ceed", "сид", "cerato", "церато", "ceratto", "spectra", "спектра",
  "sportage", "спортейдж", "спортаж", "спортедж", "sorento", "соренто", "optima", "оптима",
  "picanto", "пиканто", "seltos", "селтос", "soul", "соул", "mohave", "мохаве",
  "carnival", "карнивал", "stinger", "стингер", "k5", "k7", "k9",
  "lancer", "лансер", "ланцер", "outlander", "аутлендер", "аутлендэр", "pajero", "паджеро",
  "montero", "монтеро", "galant", "галант", "carisma", "каризма", "colt", "кольт",
  "delica", "делика", "asx", "асх", "rvr", "l200", "l300", "l400"
];

// This common subset of JS/PostgreSQL ARE syntax is tested against both engines.
export const PUBLIC_BRAND_EXCLUSION_PATTERN =
  `(^|[^a-zа-яё0-9])(${restrictedTerms.join("|")})([0-9]{1,6})?($|[^a-zа-яё0-9])`;

const excludedName = new RegExp(PUBLIC_BRAND_EXCLUSION_PATTERN, "iu");
const excludedSlugs: ReadonlySet<string> = new Set(DISPUTED_GAZ_PRODUCT_SLUGS);

export function isRestrictedPublicProduct(product: {
  name?: string | null;
  rawName?: string | null;
  slug?: string | null;
}) {
  return excludedSlugs.has(product.slug ?? "") ||
    excludedName.test([product.name, product.rawName, product.slug].filter(Boolean).join(" "));
}

/** Applied before counts/limit/offset; SELECT-only and independent of feature flags. */
export function publicProductExclusionCondition() {
  return sql<boolean>`(
    COALESCE(${products.slug}, '') NOT IN (${sql.join(DISPUTED_GAZ_PRODUCT_SLUGS.map(slug => sql`${slug}`), sql`, `)})
    AND concat_ws(' ', ${products.name}, ${products.rawName}, ${products.slug}) !~* ${PUBLIC_BRAND_EXCLUSION_PATTERN}
  )`;
}
