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
      className="scroll-reveal mt-5 rounded-card bg-[#151C2A] bg-[radial-gradient(ellipse_at_18%_0%,rgba(71,85,105,0.07),transparent_62%)] px-4 py-5 sm:mt-6 sm:bg-[radial-gradient(ellipse_at_18%_0%,rgba(71,85,105,0.1),transparent_62%)] sm:px-5 sm:py-6"
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
