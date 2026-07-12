import type { CSSProperties, ReactNode } from "react";

const YANDEX_REVIEWS_URL = "https://yandex.ru/maps/org/avtomagazin/1112244739/reviews/";

const reviews = [
  {
    rating: 5,
    text: "Нашли и установили оригинальные детали, всё сделали качественно и быстро.",
    author: "Александр Тихов"
  },
  {
    rating: 5,
    text: "Хороший ассортимент, грамотный персонал и удобная парковка.",
    author: "Александр Гриднев"
  },
  {
    rating: 5,
    text: "Большой выбор запчастей, персонал хорошо знает ассортимент.",
    author: "Владимир Д."
  },
  {
    rating: 5,
    text: "Всегда подробно расскажут, посоветуют и помогут с выбором.",
    author: "N M"
  }
];

const highlights = [
  { label: "выбор товаров", value: "96%" },
  { label: "персонал", value: "86%" },
  { label: "запчасти", value: "87%" }
];

export function CustomerReviewsSection() {
  return (
    <section
      id="reviews"
      className="section-shell section-soft scroll-mt-28 py-11 sm:scroll-mt-24 sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold leading-tight text-white sm:text-4xl">
              Отзывы покупателей
            </h2>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.35fr] lg:gap-5">
          <div className="scroll-reveal rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-semibold leading-none text-white sm:text-6xl">
                5,0
              </span>
              <div className="pb-1">
                <div className="flex gap-1 text-lg leading-none text-[#FBBF24]" aria-label="5 из 5">
                  {"★★★★★".split("").map((star, index) => (
                    <span key={`${star}-${index}`}>{star}</span>
                  ))}
                </div>
                <p className="mt-2 text-sm font-medium text-[#CBD5E1]">160 отзывов на Яндекс Картах</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-white">Покупатели отмечают:</p>
              <div className="mt-3 grid gap-3">
                {highlights.map((item) => (
                  <div key={item.label} className="rounded-card border border-white/10 bg-[#0B1220] p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[#D6DEE9]">{item.label}</span>
                      <span className="font-semibold text-white">{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#2563EB]"
                        style={{ width: item.value }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 hidden gap-3 lg:grid xl:grid-cols-2">
              <ReviewActionLink>Смотреть все отзывы</ReviewActionLink>
              <ReviewActionLink variant="primary">Оставить отзыв</ReviewActionLink>
            </div>
          </div>

          <div className="reviews-carousel -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0">
            {reviews.map((review, index) => (
              <article
                key={`${review.author}-${index}`}
                className="scroll-reveal stagger-card w-[86vw] max-w-[352px] shrink-0 snap-start rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.94),rgba(17,24,39,0.98))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] lg:w-auto lg:max-w-none lg:min-w-0"
                style={{ "--stagger": `${index * 70}ms` } as CSSProperties}
              >
                <div className="flex gap-1 text-sm text-[#FBBF24]" aria-label={`${review.rating} из 5`}>
                  {"★★★★★".split("").map((star, starIndex) => (
                    <span key={`${star}-${starIndex}`}>{star}</span>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-[#E5E7EB] sm:text-base sm:leading-7">
                  {review.text}
                </p>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="font-semibold text-white">{review.author}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            <ReviewActionLink>Смотреть все отзывы</ReviewActionLink>
            <ReviewActionLink variant="primary">Оставить отзыв</ReviewActionLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewActionLink({
  children,
  variant = "secondary"
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      href={YANDEX_REVIEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "tap-target inline-flex min-h-11 items-center justify-center rounded-card px-4 py-3 text-center text-sm font-semibold",
        variant === "primary"
          ? "bg-[#2563EB] text-white shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:bg-[#1D4ED8]"
          : "border border-white/10 bg-white/[0.06] text-white hover:border-[#93C5FD] hover:bg-white/[0.1]"
      ].join(" ")}
    >
      {children}
    </a>
  );
}
