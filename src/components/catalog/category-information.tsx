import { catalogCategories } from "@/config/categories";

type CategoryInformationContent = {
  title: string;
  description: string;
};

type MainCategorySlug = (typeof catalogCategories)[number]["slug"];

const categoryInformation = {
  podveska: {
    title: "Запчасти для подвески",
    description:
      "Амортизаторы, пружины, рычаги, ступицы и другие детали ходовой части для легковых и коммерческих автомобилей. Подобрать подходящие запчасти и уточнить наличие можно в нашем магазине автозапчастей в Талдоме."
  },
  elektrika: {
    title: "Автомобильная электрика",
    description:
      "В разделе собраны аккумуляторы, стартеры, генераторы, датчики, лампы, предохранители и другие компоненты электрооборудования. Ассортимент включает автомобильную электрику для ремонта, обслуживания и замены неисправных деталей."
  },
  "filtry-i-masla": {
    title: "Масла, фильтры и технические жидкости",
    description:
      "Моторные и трансмиссионные масла, антифризы, а также воздушные, салонные, топливные и масляные фильтры. Всё необходимое для планового технического обслуживания и надёжной работы основных узлов автомобиля."
  },
  "tormoznaya-sistema": {
    title: "Детали тормозной системы",
    description:
      "Тормозные колодки, диски, барабаны, суппорты, цилиндры и шланги для обслуживания и ремонта автомобиля. Правильно подобранные комплектующие помогают сохранить эффективное торможение и стабильную работу системы."
  },
  "kuzov-i-optika": {
    title: "Кузовные запчасти и автомобильная оптика",
    description:
      "Фары, фонари, зеркала, бамперы, крылья и другие элементы кузова для ремонта или восстановления автомобиля. При выборе деталей важно учитывать марку, модель, поколение и год выпуска машины."
  },
  "dvigatel-i-transmissiya": {
    title: "Детали двигателя и трансмиссии",
    description:
      "Запчасти для двигателя, системы охлаждения, сцепления, коробки передач и приводов. В разделе представлены комплектующие для технического обслуживания и ремонта силовых агрегатов легковых и коммерческих автомобилей."
  },
  aksessuary: {
    title: "Аксессуары для автомобиля",
    description:
      "Щётки стеклоочистителя, коврики, компрессоры, зарядные устройства, средства ухода и другие полезные товары. Автомобильные аксессуары помогают поддерживать порядок, комфорт и готовность машины к ежедневным поездкам."
  },
  "ves-assortiment": {
    title: "Каталог автозапчастей",
    description:
      "Все автозапчасти, расходные материалы, масла, технические жидкости и автомобильные аксессуары собраны в одном разделе. Найти нужный товар можно по названию или артикулу, а наличие уточнить в магазине в Талдоме."
  }
} as const satisfies Record<MainCategorySlug, CategoryInformationContent>;

function isMainCategorySlug(categorySlug: string): categorySlug is MainCategorySlug {
  return categorySlug in categoryInformation;
}

export function CategoryInformation({ categorySlug }: { categorySlug: string }) {
  if (!isMainCategorySlug(categorySlug)) {
    return null;
  }

  const content = categoryInformation[categorySlug];

  return (
    <section aria-labelledby={`category-information-${categorySlug}`} className="scroll-reveal mt-5 sm:mt-6">
      <div className="rounded-[20px] bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.034)_0%,rgba(255,255,255,0.011)_24%,transparent_50%),linear-gradient(105deg,rgba(255,255,255,0.018)_0%,rgba(255,255,255,0.008)_28%,rgba(148,163,184,0.003)_55%,transparent_84%)] p-px sm:rounded-[22px] sm:bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.018)_24%,transparent_52%),linear-gradient(105deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0.016)_28%,rgba(148,163,184,0.006)_55%,transparent_86%)]">
        <div className="overflow-hidden rounded-[19px] bg-[#111827]/[0.72] bg-[radial-gradient(ellipse_at_18%_0%,rgba(255,255,255,0.025),transparent_50%),radial-gradient(ellipse_at_86%_100%,rgba(0,0,0,0.035),transparent_60%),linear-gradient(180deg,rgba(30,41,59,0.075)_0%,rgba(15,23,42,0.045)_100%)] px-[18px] py-5 sm:rounded-[21px] sm:bg-[#111827]/[0.74] sm:bg-[radial-gradient(ellipse_at_18%_0%,rgba(255,255,255,0.038),transparent_52%),radial-gradient(ellipse_at_86%_100%,rgba(0,0,0,0.05),transparent_62%),linear-gradient(180deg,rgba(30,41,59,0.1)_0%,rgba(15,23,42,0.06)_100%)] sm:px-5 sm:py-6">
          <h2 id={`category-information-${categorySlug}`} className="text-lg font-medium leading-snug text-[#E5E7EB] sm:text-xl">
            {content.title}
          </h2>
          <p className="mt-2 max-w-[680px] text-sm leading-5 text-[#CBD5E1] sm:leading-6">
            {content.description}
          </p>
        </div>
      </div>
    </section>
  );
}
