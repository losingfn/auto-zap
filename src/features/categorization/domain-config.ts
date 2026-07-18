export const DOMAIN_DICTIONARY_VERSION = "domain-dictionary-v2";
export const DOMAIN_RULES_VERSION = "domain-rules-v2";
export const CONFIDENCE_MODEL_VERSION = "confidence-model-v2";
export const GROUPING_MODEL_VERSION = "grouping-v2";

export interface ProductFamilyDefinition {
  id: string;
  label: string;
  categorySlug: string;
  subcategorySlug: string;
  requiredAny: string[];
  requiredAll?: string[];
  strongPhrases?: string[];
  optional?: string[];
  technicalAny?: string[];
  negative?: string[];
  groupable: boolean;
  autoReadyMinEvidence: number;
  baseConfidence: number;
  description: string;
}

export const weakGeneralTokens = new Set([
  "авто",
  "автомобильный",
  "блок",
  "деталь",
  "комплект",
  "корпус",
  "модуль",
  "набор",
  "универсальный",
  "элемент"
]);

export const dangerousBroadTokens = new Set([
  "болт",
  "гайка",
  "винт",
  "втулка",
  "датчик",
  "диск",
  "жидкость",
  "клапан",
  "кольцо",
  "крепление",
  "кронштейн",
  "насос",
  "патрубок",
  "провод",
  "ремкомплект",
  "ремень",
  "ручка",
  "сальник",
  "стекло",
  "трос",
  "трубка",
  "фильтр",
  "шайба",
  "шланг",
  "шпилька",
  "штуцер"
]);

export const familyDefinitions: ProductFamilyDefinition[] = [
  family({
    id: "automotive_bulb",
    label: "Лампы",
    categorySlug: "elektrika",
    subcategorySlug: "lampy",
    requiredAny: ["лампа", "лампочка"],
    strongPhrases: ["лампа t10", "лампа w5w", "лампа h7", "лампа h4", "лампа h1"],
    technicalAny: ["t10", "w5w", "h1", "h4", "h7", "12v", "24v", "led"],
    negative: ["фара", "фонарь", "настольная", "переноска"],
    autoReadyMinEvidence: 3,
    baseConfidence: 0.91,
    description: "Автомобильная лампа с цоколем, напряжением или LED-признаком."
  }),
  family({
    id: "oil_filter",
    label: "Масляные фильтры",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "maslyanye-filtry",
    requiredAny: ["фильтр"],
    requiredAll: ["масляный"],
    strongPhrases: ["фильтр масляный", "масляный фильтр", "фильтр масл"],
    negative: ["воздушный", "салонный", "топливный", "акпп"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Фильтр с явным масляным контекстом."
  }),
  family({
    id: "air_filter",
    label: "Воздушные фильтры",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "vozdushnye-filtry",
    requiredAny: ["фильтр"],
    requiredAll: ["воздушный"],
    strongPhrases: ["фильтр воздушный", "воздушный фильтр"],
    negative: ["масляный", "салонный", "топливный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Фильтр с явным воздушным контекстом."
  }),
  family({
    id: "cabin_filter",
    label: "Салонные фильтры",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "salonnye-filtry",
    requiredAny: ["фильтр"],
    requiredAll: ["салонный"],
    strongPhrases: ["фильтр салонный", "салонный фильтр", "фильтр салона"],
    negative: ["масляный", "воздушный", "топливный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Фильтр с явным салонным контекстом."
  }),
  family({
    id: "fuel_filter",
    label: "Топливные фильтры",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "toplivnye-filtry",
    requiredAny: ["фильтр"],
    requiredAll: ["топливный"],
    strongPhrases: ["фильтр топливный", "топливный фильтр"],
    negative: ["масляный", "воздушный", "салонный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.92,
    description: "Фильтр с явным топливным контекстом."
  }),
  family({
    id: "brake_pads",
    label: "Тормозные колодки",
    categorySlug: "tormoznaya-sistema",
    subcategorySlug: "tormoznye-kolodki",
    requiredAny: ["колодка", "колодки"],
    requiredAll: ["тормозной"],
    strongPhrases: ["колодки тормозные", "тормозные колодки", "торм колодки"],
    negative: ["накладка", "диск"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.94,
    description: "Колодки с тормозным контекстом."
  }),
  family({
    id: "brake_disc",
    label: "Тормозные диски",
    categorySlug: "tormoznaya-sistema",
    subcategorySlug: "tormoznye-diski",
    requiredAny: ["диск"],
    requiredAll: ["тормозной"],
    strongPhrases: ["диск тормозной", "тормозной диск"],
    negative: ["колесный", "сцепления", "абразивный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.94,
    description: "Диск с тормозным контекстом; одиночное слово диск не используется."
  }),
  family({
    id: "brake_fluid",
    label: "Тормозная жидкость",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "zhidkosti",
    requiredAny: ["жидкость"],
    requiredAll: ["тормозной"],
    strongPhrases: ["тормозная жидкость", "жидкость тормозная", "dot 4", "dot4"],
    technicalAny: ["dot4", "dot3", "dot5"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.94,
    description: "Техническая жидкость с DOT или тормозным контекстом."
  }),
  family({
    id: "motor_oil",
    label: "Моторные масла",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "masla",
    requiredAny: ["масло"],
    strongPhrases: ["масло моторное", "моторное масло", "масло двигательное"],
    technicalAny: ["5w30", "5w-30", "10w40", "10w-40", "atf"],
    negative: ["фильтр"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.91,
    description: "Масло с вязкостью, моторным или трансмиссионным контекстом."
  }),
  family({
    id: "antifreeze",
    label: "Антифризы и тосол",
    categorySlug: "filtry-i-masla",
    subcategorySlug: "zhidkosti",
    requiredAny: ["антифриз", "тосол", "охлаждающая"],
    strongPhrases: ["охлаждающая жидкость"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.93,
    description: "Охлаждающая жидкость, антифриз или тосол."
  }),
  family({
    id: "gasket",
    label: "Прокладки",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "prokladki",
    requiredAny: ["прокладка", "паронит"],
    strongPhrases: ["прокладка гбц", "прокладка клапанной крышки", "паронит прокладочный"],
    negative: ["герметик"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Прокладки и прокладочный паронит."
  }),
  family({
    id: "spark_plug",
    label: "Свечи зажигания",
    categorySlug: "elektrika",
    subcategorySlug: "svechi-zazhiganiya",
    requiredAny: ["свеча", "свечи"],
    strongPhrases: ["свеча зажигания", "свечи зажигания"],
    negative: ["ключ", "головка"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Свечи зажигания без инструментального контекста."
  }),
  family({
    id: "ignition_coil",
    label: "Катушки зажигания",
    categorySlug: "elektrika",
    subcategorySlug: "prochaya-elektrika",
    requiredAny: ["катушка"],
    requiredAll: ["зажигания"],
    strongPhrases: ["катушка зажигания"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.91,
    description: "Катушка с явным контекстом зажигания."
  }),
  family({
    id: "battery",
    label: "Аккумуляторы",
    categorySlug: "elektrika",
    subcategorySlug: "akkumulyatory",
    requiredAny: ["акб", "аккумулятор"],
    negative: ["зарядное", "клемма"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.94,
    description: "Аккумулятор или АКБ; зарядные устройства не включаются."
  }),
  family({
    id: "starter",
    label: "Стартеры",
    categorySlug: "elektrika",
    subcategorySlug: "startery",
    requiredAny: ["стартер"],
    negative: ["ремкомплект", "бендикс", "втягивающее"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.91,
    description: "Стартер без явного признака ремкомплекта."
  }),
  family({
    id: "generator",
    label: "Генераторы",
    categorySlug: "elektrika",
    subcategorySlug: "generatory",
    requiredAny: ["генератор"],
    negative: ["ремень", "щетка", "реле"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.91,
    description: "Генератор без контекста ремня или мелких комплектующих."
  }),
  family({
    id: "electrical_misc",
    label: "Прочая электрика",
    categorySlug: "elektrika",
    subcategorySlug: "prochaya-elektrika",
    requiredAny: [
      "переключатель",
      "кнопка",
      "стеклоподъемник",
      "стеклоподъёмник",
      "электростеклоподъемник",
      "электростеклоподъёмник",
      "компьютер",
      "корректор"
    ],
    strongPhrases: ["октан корректор", "переключатель салонный", "электростеклоподъемник двери"],
    negative: ["бортовой компьютер ноутбук", "usb"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Электрические переключатели, стеклоподъёмники и автомобильные электронные блоки."
  }),
  family({
    id: "sensor",
    label: "Датчики",
    categorySlug: "elektrika",
    subcategorySlug: "datchiki",
    requiredAny: ["датчик", "дмрв", "дпкв", "дпдз", "рхх"],
    negative: ["под датчик", "без датчика"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.87,
    description: "Датчики и устойчивые сокращения датчиков; одиночный общий сигнал уходит в групповое подтверждение."
  }),
  family({
    id: "wiring",
    label: "Проводка",
    categorySlug: "elektrika",
    subcategorySlug: "provodka",
    requiredAny: ["провод", "проводка", "жгут", "разъем", "разьем", "фишка", "клемма"],
    strongPhrases: ["провод высоковольтный", "жгут проводов", "клемма аккумулятора"],
    negative: ["usb", "aux", "зарядное"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.87,
    description: "Проводка, разъёмы и клеммы с автомобильным контекстом."
  }),
  family({
    id: "belt",
    label: "Ремни",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "remni",
    requiredAny: ["ремень", "ремни"],
    negative: ["безопасности", "крепления"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Ремни двигателя/привода; ремни безопасности исключаются."
  }),
  family({
    id: "timing_kit",
    label: "ГРМ и ролики",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "remni",
    requiredAny: ["грм", "ролик"],
    strongPhrases: ["ремень грм", "комплект грм", "ролик натяжной", "ролик натяжителя"],
    negative: ["двери", "стекло"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.91,
    description: "Ремни и ролики ГРМ/натяжителя."
  }),
  family({
    id: "pump_engine",
    label: "Насосы двигателя",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "nasosy",
    requiredAny: ["насос", "помпа"],
    strongPhrases: ["насос водяной", "насос топливный", "насос масляный", "помпа водяная"],
    negative: ["ножной", "ручной", "электрический", "электр", "шин"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.86,
    description: "Насосы узлов двигателя; одиночное слово насос подтверждается группой."
  }),
  family({
    id: "engine_parts",
    label: "Детали двигателя",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "detali-dvigatelya",
    requiredAny: ["поршень", "поршневой", "коленвал", "распредвал", "гильза", "коромысло", "шестерня"],
    strongPhrases: ["кольцо поршневое", "кольца поршневые", "вал коленчатый", "вал распределительный"],
    negative: ["карданный", "приводной", "рулевой"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.86,
    description: "Узкие детали двигателя с проверяемыми контекстными словами."
  }),
  family({
    id: "cooling",
    label: "Охлаждение",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "ohlazhdenie",
    requiredAny: ["радиатор", "термостат", "вентилятор", "диффузор"],
    strongPhrases: ["вентилятор охлаждения", "радиатор охлаждения", "радиатор печки", "радиатор отопителя"],
    negative: ["салона", "лобовой", "настольный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.86,
    description: "Радиаторы, вентиляторы и элементы системы охлаждения."
  }),
  family({
    id: "cooling_hoses",
    label: "Патрубки и шланги охлаждения",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "patrubki-i-shlangi-ohlazhdeniya",
    requiredAny: ["патрубок", "патрубки", "шланг", "шланги", "тройник", "соединитель"],
    requiredAll: ["радиатор"],
    strongPhrases: ["патрубок радиатора", "шланг радиатора", "тройник радиатора", "соединитель шлангов"],
    negative: ["тормозной", "топливный", "гур"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Шланги, патрубки и соединители системы охлаждения."
  }),
  family({
    id: "fuel_system",
    label: "Топливная система",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "toplivnaya-sistema",
    requiredAny: ["бензобак", "карбюратор", "форсунка", "форсунки", "топливный", "топливная"],
    strongPhrases: ["бачок топливный", "бак топливный", "шланг топливный", "трубка топливная"],
    negative: ["фильтр"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.87,
    description: "Топливные баки, карбюраторы, форсунки и топливные магистрали."
  }),
  family({
    id: "kpp_parts",
    label: "КПП",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "kpp",
    requiredAny: ["кулиса", "муфта", "коробка"],
    strongPhrases: ["кулиса кпп", "муфта кпп", "коробки передач", "вилка кпп"],
    negative: ["сцепления", "рулевая", "кардан"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Кулисы, муфты и детали коробки передач."
  }),
  family({
    id: "engine_valves",
    label: "Детали двигателя",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "detali-dvigatelya",
    requiredAny: ["клапан", "клапанов", "тарелка"],
    strongPhrases: ["тарелки клапанов", "клапан двигателя", "клапан гбц"],
    negative: ["рециркуляции", "электромагнитный"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.84,
    description: "Клапаны и связанные детали двигателя."
  }),
  family({
    id: "exhaust",
    label: "Выхлопная система",
    categorySlug: "dvigatel-i-transmissiya",
    subcategorySlug: "vyhlopnaya-sistema",
    requiredAny: ["глушитель", "резонатор", "нейтрализатор", "гофра", "пламегаситель"],
    strongPhrases: ["приемная труба", "труба приемная", "насадка глушителя"],
    negative: ["пыльник"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.89,
    description: "Глушители, резонаторы, гофры и приемные трубы."
  }),
  family({
    id: "shock_absorber",
    label: "Амортизаторы",
    categorySlug: "podveska",
    subcategorySlug: "amortizatory",
    requiredAny: ["амортизатор", "амортиз"],
    negative: ["багажника", "капота"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.91,
    description: "Амортизаторы подвески; газовые упоры капота/багажника исключаются."
  }),
  family({
    id: "spring",
    label: "Пружины",
    categorySlug: "podveska",
    subcategorySlug: "pruzhiny",
    requiredAny: ["пружина", "пружины"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Пружины подвески и близких узлов."
  }),
  family({
    id: "hub_bearing",
    label: "Ступицы и ступичные подшипники",
    categorySlug: "podveska",
    subcategorySlug: "stupicy",
    requiredAny: ["ступица", "ступичный"],
    strongPhrases: ["подшипник ступицы", "ступичный подшипник"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.92,
    description: "Ступицы и подшипники ступицы."
  }),
  family({
    id: "bearing",
    label: "Подшипники",
    categorySlug: "podveska",
    subcategorySlug: "podshipniki",
    requiredAny: ["подшипник"],
    negative: ["ступица", "ступичный"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.88,
    description: "Подшипники без ступичного контекста идут в быстрые группы."
  }),
  family({
    id: "silentblock",
    label: "Сайлентблоки",
    categorySlug: "podveska",
    subcategorySlug: "saylentbloki",
    requiredAny: ["сайлентблок", "сайлент"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.92,
    description: "Сайлентблоки."
  }),
  family({
    id: "ball_joint",
    label: "Шаровые опоры",
    categorySlug: "podveska",
    subcategorySlug: "sharovye-opory",
    requiredAny: ["шаровая", "шаров"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.91,
    description: "Шаровые опоры."
  }),
  family({
    id: "tie_rod",
    label: "Рулевые тяги",
    categorySlug: "podveska",
    subcategorySlug: "rulevye-tyagi",
    requiredAny: ["тяга"],
    requiredAll: ["рулевой"],
    strongPhrases: ["рулевая тяга", "тяга рул"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Рулевые тяги."
  }),
  family({
    id: "steering_tip",
    label: "Рулевые наконечники",
    categorySlug: "podveska",
    subcategorySlug: "rulevye-nakonechniki",
    requiredAny: ["наконечник"],
    requiredAll: ["рулевой"],
    strongPhrases: ["рулевой наконечник", "наконечник рул"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.93,
    description: "Рулевые наконечники."
  }),
  family({
    id: "suspension_arm",
    label: "Рычаги",
    categorySlug: "podveska",
    subcategorySlug: "rychagi",
    requiredAny: ["рычаг", "растяжка"],
    negative: ["переключения", "стеклоочистителя"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.87,
    description: "Рычаги и растяжки подвески."
  }),
  family({
    id: "wiper",
    label: "Стеклоочистители",
    categorySlug: "aksessuary",
    subcategorySlug: "prochie-aksessuary",
    requiredAny: ["дворник", "дворники", "стеклоочиститель", "щетка", "щетки", "поводок"],
    strongPhrases: ["щетка стеклоочистителя", "щетки стеклоочистителя", "поводок стеклоочистителя"],
    negative: ["генератор", "стартера", "электродвигателя"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Щетки и элементы стеклоочистителя."
  }),
  family({
    id: "wheel_accessories",
    label: "Шины и диски",
    categorySlug: "aksessuary",
    subcategorySlug: "shiny-i-diski",
    requiredAny: ["колпак", "колпаки", "грибок"],
    strongPhrases: ["колпаки колес", "гайка колес", "грибок для ремонта шин", "жгут для ремонта шин"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Колёсные аксессуары и принадлежности ремонта шин."
  }),
  family({
    id: "tools",
    label: "Инструменты",
    categorySlug: "aksessuary",
    subcategorySlug: "instrumenty",
    requiredAny: ["ключ", "головка", "съемник", "щуп", "домкрат", "трещотка"],
    strongPhrases: ["ключ свечной", "головка торцевая", "съемник подшипника"],
    negative: ["ключ зажигания"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.88,
    description: "Инструменты и принадлежности для обслуживания."
  }),
  family({
    id: "interior",
    label: "Элементы салона",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "elementy-salona",
    requiredAny: ["консоль", "полка", "обшивка", "накладка", "пепельница", "бардачок", "сиденье"],
    strongPhrases: ["полка задняя", "обшивка двери", "накладка салона", "крышка бардачка"],
    negative: ["фары", "фонаря", "бампера", "крыла"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Салонные полки, консоли, обшивки и накладки."
  }),
  family({
    id: "body_locks_handles",
    label: "Замки и ручки",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "zamki-i-ruchki",
    requiredAny: ["ручка", "замок", "личинка"],
    strongPhrases: ["ручка двери", "замок двери", "ручка стеклоподъемника"],
    negative: ["инструмент"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.86,
    description: "Дверные ручки, замки и личинки."
  }),
  family({
    id: "body_glass",
    label: "Стекла",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "stekla",
    requiredAny: ["стекло", "стекла", "уплотнитель"],
    strongPhrases: ["стекло двери", "стекло заднее", "стекло лобовое", "уплотнитель стекла"],
    negative: ["фары", "фонаря", "лампа"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.86,
    description: "Автомобильные стекла и уплотнители стекол без оптики."
  }),
  family({
    id: "optics_glass",
    label: "Стекла фар и фонарей",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "stekla-far-i-fonarey",
    requiredAny: ["стекло", "защита"],
    strongPhrases: ["стекло фары", "стекло фонаря", "защита фар", "защита задних фар"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.88,
    description: "Стекла и защитные элементы фар/фонарей."
  }),
  family({
    id: "body_brackets",
    label: "Кронштейны и крепления кузова",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "kronshteyny-i-krepleniya",
    requiredAny: ["кронштейн", "скоба", "крепление"],
    strongPhrases: ["кронштейн фары", "кронштейн бампера", "скоба фары", "крепление бампера"],
    negative: ["двигателя", "генератора", "рессоры", "суппорта"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.84,
    description: "Кузовные кронштейны и крепления с явным контекстом."
  }),
  family({
    id: "body_exterior",
    label: "Кузовные детали",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "kuzovnye-detali",
    requiredAny: ["арка", "крыло", "капот", "дверь", "панель", "порог"],
    strongPhrases: ["арка колеса", "панель задняя", "крыло переднее", "порог кузова"],
    negative: ["обшивка"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Крупные кузовные элементы."
  }),
  family({
    id: "body_decor",
    label: "Обвес и декор",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "obves-i-dekor",
    requiredAny: ["кенгурятник", "молдинг", "накладка", "спойлер", "дефлектор"],
    strongPhrases: ["накладка бампера", "накладка порога", "дефлектор капота"],
    negative: ["салона", "стекла"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Декоративные и защитные кузовные элементы."
  }),
  family({
    id: "auto_chemistry",
    label: "Автохимия",
    categorySlug: "aksessuary",
    subcategorySlug: "avtohimiya",
    requiredAny: ["герметик", "очиститель", "промывка", "смазка", "полироль", "краска", "эмаль", "лак", "антикор"],
    strongPhrases: ["преобразователь ржавчины", "очиститель карбюратора", "очиститель тормозов"],
    negative: ["подкраска"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Автохимия, краски, очистители и составы."
  }),
  family({
    id: "misc_accessories",
    label: "Прочие аксессуары",
    categorySlug: "aksessuary",
    subcategorySlug: "prochie-aksessuary",
    requiredAny: ["фаркоп", "прицепное", "канистра", "тонировка", "пленка", "колпак", "колпаки", "рамка"],
    strongPhrases: ["пленка тонировочная", "рамка номера", "колпаки колес", "прицепное устройство"],
    negative: ["ремкомплект", "двигателя"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.85,
    description: "Аксессуары с явными предметными словами."
  }),
  family({
    id: "tire",
    label: "Шины",
    categorySlug: "aksessuary",
    subcategorySlug: "shiny-i-diski",
    requiredAny: ["шина", "шины", "а/шина", "резина"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.93,
    description: "Автошины."
  }),
  family({
    id: "wheel_disc",
    label: "Колесные диски",
    categorySlug: "aksessuary",
    subcategorySlug: "shiny-i-diski",
    requiredAny: ["диск"],
    requiredAll: ["колесный"],
    strongPhrases: ["диск колесный", "колесный диск", "литые диски"],
    negative: ["тормозной", "сцепления"],
    autoReadyMinEvidence: 2,
    baseConfidence: 0.92,
    description: "Колесные диски; тормозные диски исключаются."
  }),
  family({
    id: "headlight",
    label: "Фары",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "fary",
    requiredAny: ["фара", "фары", "блок-фара", "блокфара"],
    strongPhrases: ["блок фара", "блок-фара"],
    negative: ["стекло", "кронштейн", "лампа"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Фары без контекста стекла или крепления."
  }),
  family({
    id: "mirror",
    label: "Зеркала",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "zerkala",
    requiredAny: ["зеркало", "зеркал"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.91,
    description: "Автомобильные зеркала."
  }),
  family({
    id: "bumper",
    label: "Бамперы",
    categorySlug: "kuzov-i-optika",
    subcategorySlug: "bampery",
    requiredAny: ["бампер"],
    negative: ["кронштейн"],
    autoReadyMinEvidence: 1,
    baseConfidence: 0.9,
    description: "Бамперы без крепежного контекста."
  })
];

function family(input: Omit<ProductFamilyDefinition, "groupable"> & { groupable?: boolean }) {
  return {
    groupable: true,
    ...input
  };
}
