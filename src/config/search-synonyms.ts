export interface DefaultSearchSynonym {
  source: string;
  targetTerms: string[];
  isBidirectional?: boolean;
}

export interface SearchIntentBoost {
  terms: string[];
  categorySlug?: string;
  subcategorySlug?: string;
  score: number;
}

export const defaultSearchSynonyms: DefaultSearchSynonym[] = [
  synonym("акб", ["аккумулятор", "аккумуляторы", "аккумуляторная батарея"]),
  synonym("аккум", ["аккумулятор", "аккумуляторы", "акб"]),
  synonym("akb", ["акб", "аккумулятор", "аккумуляторы"]),
  synonym("акумулятор", ["аккумулятор", "аккумуляторы", "акб"]),
  synonym("akkumulyator", ["аккумулятор", "аккумуляторы", "акб"]),
  synonym("дворники", [
    "дворник",
    "щетка стеклоочистителя",
    "щётка стеклоочистителя",
    "стеклоочиститель",
    "поводок стеклоочистителя"
  ]),
  synonym("dvorniki", ["дворники", "дворник", "щетка стеклоочистителя"]),
  synonym("щетки", ["щетка стеклоочистителя", "щётка стеклоочистителя", "дворники"]),
  synonym("масло", ["масла", "моторное масло", "двигательное масло", "автомасло"]),
  synonym("maslo", ["масло", "масла", "моторное масло"]),
  synonym("тормозуха", ["тормозная жидкость", "жидкость тормозная"]),
  synonym("охлаждайка", ["антифриз", "тосол", "охлаждающая жидкость"]),
  synonym("гур", ["гидроусилитель", "жидкость гур", "шланг гур"]),
  synonym("птф", ["противотуманки", "противотуманные фары"]),
  synonym("грм", ["ремень грм", "комплект грм", "ролик грм"]),
  synonym("шрус", ["граната", "шарнир равных угловых скоростей"]),
  synonym("кпп", ["коробка передач", "мкпп", "трансмиссия"]),
  synonym("сцепа", ["сцепление", "комплект сцепления"]),
  synonym("резина", ["а/шина", "а/шины", "шина", "шины"], false),
  synonym("шины", ["а/шина", "а/шины", "резина"]),
  synonym("литые диски", ["диск колесный", "колесный диск"]),
  synonym("печка", ["отопитель", "мотор печки", "радиатор печки"]),
  synonym("бензобак", ["бак топливный", "топливный бак"]),
  synonym("bosch", ["бош"]),
  synonym("mann", ["манн"]),
  synonym("ngk", ["нжк", "энжикей"]),
  synonym("osram", ["осрам"]),
  synonym("sct", ["стс"]),
  synonym("avs", ["авс"]),
  synonym("lavr", ["лавр"]),
  synonym("motul", ["мотюль"]),
  synonym("mobil", ["мобил"]),
  synonym("zic", ["зик"]),
  synonym("shell", ["шелл"]),
  synonym("castrol", ["кастрол"]),
  synonym("luxe", ["люкс"]),
  synonym("renault", ["рено"]),
  synonym("logan", ["логан"]),
  synonym("lada", ["лада", "ваз"]),
  synonym("vaz", ["ваз", "лада"]),
  synonym("gaz", ["газ"]),
  synonym("uaz", ["уаз"]),
  synonym("chevrolet", ["шевроле"]),
  synonym("daewoo", ["дэу", "део"]),
  synonym("ford", ["форд"]),
  synonym("nissan", ["ниссан"]),
  synonym("toyota", ["тойота"]),
  synonym("hyundai", ["хендай", "хундай"]),
  synonym("kia", ["киа"]),
  synonym("vw", ["фольксваген", "volkswagen"]),
  synonym("volkswagen", ["фольксваген", "vw"])
];

export const searchIntentBoosts: SearchIntentBoost[] = [
  {
    terms: ["масло", "масла", "моторное масло", "двигательное масло", "автомасло", "maslo"],
    categorySlug: "filtry-i-masla",
    subcategorySlug: "masla",
    score: 2600
  },
  {
    terms: [
      "акб",
      "аккум",
      "акумулятор",
      "akb",
      "akkumulyator",
      "аккумулятор",
      "аккумуляторы",
      "аккумуляторная батарея"
    ],
    categorySlug: "elektrika",
    subcategorySlug: "akkumulyatory",
    score: 2600
  },
  {
    terms: ["дворник", "дворники", "dvorniki", "щетка стеклоочистителя", "щётка стеклоочистителя"],
    categorySlug: "aksessuary",
    subcategorySlug: "prochie-aksessuary",
    score: 1800
  },
  {
    terms: ["масляный фильтр", "фильтр масл"],
    categorySlug: "filtry-i-masla",
    subcategorySlug: "maslyanye-filtry",
    score: 2200
  },
  {
    terms: ["антифриз", "тосол", "охлаждающая жидкость", "охлаждайка"],
    categorySlug: "filtry-i-masla",
    subcategorySlug: "zhidkosti",
    score: 1800
  },
  {
    terms: ["шины", "шина", "а/шина", "а/шины", "резина"],
    categorySlug: "aksessuary",
    subcategorySlug: "shiny-i-diski",
    score: 1800
  }
];

function synonym(source: string, targetTerms: string[], isBidirectional = true): DefaultSearchSynonym {
  return {
    source,
    targetTerms,
    isBidirectional
  };
}
