const categoryInformation = {
  podveska: {
    title: "Запчасти для подвески",
    description:
      "Амортизаторы, пружины, рычаги, ступицы и другие детали ходовой части для легковых и коммерческих автомобилей. При подборе учитывайте модель, год выпуска и модификацию автомобиля — уточнить наличие и совместимость можно в нашем магазине в Талдоме."
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
      className="scroll-reveal mt-5 rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.88),rgba(17,24,39,0.96))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:mt-6 sm:px-5 sm:py-4"
    >
      <span className="mb-3 block h-1 w-8 rounded-full bg-[#2563EB] sm:w-10" />
      <h2 id={`category-information-${categorySlug}`} className="text-lg font-semibold leading-snug text-white sm:text-xl">
        {content.title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-5 text-[#CBD5E1] sm:leading-6">
        {content.description}
      </p>
    </section>
  );
}
