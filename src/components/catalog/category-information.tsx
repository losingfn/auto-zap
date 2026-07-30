const categoryInformation = {
  podveska: {
    title: "Детали подвески для ремонта и обслуживания",
    description:
      "В разделе собраны детали для ремонта ходовой части: амортизаторы, пружины, рычаги, ступицы, рулевые тяги и другие элементы подвески. При подборе важно учитывать марку, модель, год выпуска и конкретную модификацию автомобиля — внешне похожие детали могут отличаться размерами и креплениями. Уточнить наличие и совместимость запчасти можно в магазине в Талдоме."
  }
} as const;

export function CategoryInformation({ categorySlug }: { categorySlug: string }) {
  const content = categoryInformation[categorySlug as keyof typeof categoryInformation];

  if (!content) {
    return null;
  }

  return (
    <section
      aria-labelledby={`category-information-${categorySlug}`}
      className="scroll-reveal mt-5 rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.88),rgba(17,24,39,0.96))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:mt-6 sm:p-6"
    >
      <span className="mb-4 block h-1 w-10 rounded-full bg-[#2563EB]" />
      <h2 id={`category-information-${categorySlug}`} className="text-xl font-semibold leading-tight text-white sm:text-2xl">
        {content.title}
      </h2>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[#CBD5E1] sm:text-base sm:leading-7">
        {content.description}
      </p>
    </section>
  );
}
