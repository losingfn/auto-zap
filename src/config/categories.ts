const CATEGORY_ICON_VERSION = "category-png-v1";

const categoryIcon = (fileName: string) =>
  `/assets/categories/${fileName}.png?v=${CATEGORY_ICON_VERSION}`;

export const catalogCategories = [
  {
    slug: "podveska",
    name: "Подвеска",
    icon: categoryIcon("podveska"),
    sortOrder: 10
  },
  {
    slug: "elektrika",
    name: "Электрика",
    icon: categoryIcon("elektrika"),
    sortOrder: 20
  },
  {
    slug: "filtry-i-masla",
    name: "Фильтры и масла",
    icon: categoryIcon("filtry-i-masla"),
    sortOrder: 30
  },
  {
    slug: "tormoznaya-sistema",
    name: "Тормозная система",
    icon: categoryIcon("tormoznaya-sistema"),
    sortOrder: 40
  },
  {
    slug: "kuzov-i-optika",
    name: "Кузов и оптика",
    icon: categoryIcon("kuzov-i-optika"),
    sortOrder: 50
  },
  {
    slug: "dvigatel-i-transmissiya",
    name: "Двигатель и трансмиссия",
    icon: categoryIcon("dvigatel-i-transmissiya"),
    sortOrder: 60
  },
  {
    slug: "aksessuary",
    name: "Аксессуары",
    icon: categoryIcon("aksessuary"),
    sortOrder: 70
  },
  {
    slug: "ves-assortiment",
    name: "Весь ассортимент",
    icon: categoryIcon("ves-assortiment"),
    sortOrder: 80,
    isAllAssortment: true
  }
] as const;
