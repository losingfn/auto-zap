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
      className="scroll-reveal mt-5 rounded-card border border-white/[0.06] bg-[#151C2A] px-4 py-5 shadow-[0_14px_40px_rgba(0,0,0,0.16)] sm:mt-6 sm:px-5 sm:py-6"
    >
      <h2 id={`category-information-${categorySlug}`} className="text-lg font-medium leading-snug text-[#E5E7EB] sm:text-xl">
        {content.title}
      </h2>
      <p className="mt-2 max-w-[680px] text-sm leading-5 text-[#CBD5E1] sm:leading-6">
        {content.description}
      </p>
    </section>
  );
}
