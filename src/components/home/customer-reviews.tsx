import type { ReactNode } from "react";

const YANDEX_REVIEWS_URL = "https://yandex.ru/maps/org/avtomagazin/1112244739/reviews/";

const reviews = [
  {
    rating: 5,
    text: "Нашли и установили оригинальные детали. Всё сделали быстро и качественно."
  },
  {
    rating: 5,
    text: "Хороший ассортимент, грамотный персонал и удобная парковка."
  },
  {
    rating: 5,
    text: "Большой выбор запчастей, персонал хорошо знает ассортимент."
  },
  {
    rating: 5,
    text: "Всегда подробно расскажут, посоветуют и помогут с выбором."
  }
];

const highlights = [
  { label: "выбор товаров", value: "96%" },
  { label: "запчасти", value: "87%" },
  { label: "персонал", value: "86%" }
];

export function CustomerReviewsSection() {
  return (
    <section id="reviews" className="customer-reviews-section section-shell scroll-mt-28 sm:scroll-mt-24">
      <div className="customer-reviews-shell mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="customer-reviews-header">
          <h2 className="customer-reviews-title">Отзывы покупателей</h2>
          <div className="customer-reviews-rating">
            <span className="customer-reviews-score">5,0</span>
            <div className="customer-reviews-rating-detail">
              <span className="customer-reviews-stars" role="img" aria-label="5 из 5">★★★★★</span>
              <p>160 отзывов на Яндекс Картах</p>
            </div>
          </div>
        </div>

        <div className="customer-reviews-highlights">
          <h3>Покупатели отмечают:</h3>
          <div className="customer-reviews-stats">
            {highlights.map((item) => (
              <div className="customer-reviews-stat" key={item.label}>
                <strong className="customer-reviews-stat-value">{item.value}</strong>
                <span className="customer-reviews-stat-label">{item.label}</span>
                <div className="customer-reviews-track" aria-hidden="true">
                  <span style={{ width: item.value }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="customer-reviews-list">
          {reviews.map((review) => (
            <article className="customer-review" key={review.text}>
              <span className="customer-review-stars" role="img" aria-label={`${review.rating} из 5`}>★★★★★</span>
              <p className="customer-review-text">{review.text}</p>
            </article>
          ))}
        </div>

        <div className="customer-reviews-actions">
          <ReviewActionLink variant="primary">Смотреть все отзывы</ReviewActionLink>
          <ReviewActionLink>Оставить отзыв</ReviewActionLink>
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
        "customer-reviews-action tap-target",
        variant === "primary" ? "customer-reviews-action-primary" : "customer-reviews-action-secondary"
      ].join(" ")}
    >
      {children}
    </a>
  );
}
