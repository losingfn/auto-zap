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
    <section aria-labelledby={`category-information-${categorySlug}`} className="scroll-reveal mt-5 sm:mt-6">
      <div className="rounded-[20px] bg-[linear-gradient(135deg,rgba(255,255,255,0.065)_0%,rgba(148,163,184,0.035)_32%,rgba(71,85,105,0.018)_64%,rgba(255,255,255,0.006)_100%)] p-px sm:rounded-[22px]">
        <div className="overflow-hidden rounded-[19px] bg-[#111827]/[0.78] bg-[radial-gradient(ellipse_at_26%_0%,rgba(255,255,255,0.03),transparent_52%),linear-gradient(180deg,rgba(30,41,59,0.1)_0%,rgba(15,23,42,0.08)_100%)] px-[18px] py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-1px_0_rgba(0,0,0,0.12)] sm:rounded-[21px] sm:bg-[radial-gradient(ellipse_at_22%_0%,rgba(255,255,255,0.045),transparent_52%),linear-gradient(180deg,rgba(30,41,59,0.13)_0%,rgba(15,23,42,0.1)_100%)] sm:px-5 sm:py-6">
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
