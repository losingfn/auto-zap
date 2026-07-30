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
      className="scroll-reveal relative isolate mt-5 px-4 py-5 sm:mt-6 sm:px-5 sm:py-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-10 -top-10 z-0 h-[calc(100%+5rem)] w-[calc(100%+5rem)] bg-[radial-gradient(ellipse_at_42%_48%,rgba(71,85,105,0.12)_0%,rgba(40,52,72,0.075)_35%,rgba(15,23,42,0.02)_58%,transparent_76%)] sm:-left-16 sm:-top-12 sm:h-[calc(100%+6rem)] sm:w-[760px] sm:bg-[radial-gradient(ellipse_at_32%_46%,rgba(71,85,105,0.15)_0%,rgba(40,52,72,0.09)_34%,rgba(15,23,42,0.025)_58%,transparent_78%)]"
      />
      <h2 id={`category-information-${categorySlug}`} className="relative z-10 text-lg font-medium leading-snug text-[#E5E7EB] sm:text-xl">
        {content.title}
      </h2>
      <p className="relative z-10 mt-2 max-w-[680px] text-sm leading-5 text-[#CBD5E1] sm:leading-6">
        {content.description}
      </p>
    </section>
  );
}
