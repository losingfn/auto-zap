import type { Metadata } from "next";
import { SiteHeader } from "@/components/home/site-header";
import { PublicFooter } from "@/components/site/public-footer";
import { PrivacyBackLink } from "@/components/site/privacy-navigation";
import { buildPublicPageMetadata } from "@/features/seo/metadata";
import { privacyPolicySections } from "./policy-content";
import styles from "./privacy.module.css";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Политика обработки персональных данных | Автозапчасти на Салтыкова-Щедрина",
  description: "Политика обработки персональных данных сайта магазина «Автозапчасти на Салтыкова-Щедрина».",
  path: "/privacy"
});

function renderLinkedText(text: string) {
  return text.split(/(https?:\/\/[^\s]+|\/privacy\/analytics-consent|auto-zapchast\.taldom@rambler\.ru|autozapchast-taldom\.ru|8-496-206-33-04)/g).map((part, index) => {
    const url = part.replace(/[.,;]+$/, "");
    const href = part === "auto-zapchast.taldom@rambler.ru"
      ? `mailto:${part}`
      : part === "8-496-206-33-04"
        ? "tel:+74962063304"
        : part === "autozapchast-taldom.ru"
          ? "https://autozapchast-taldom.ru/"
        : /^https?:\/\//.test(url) || url === "/privacy/analytics-consent"
          ? url
          : null;

    return href ? <span key={index}><a href={href}>{part.slice(0, href === url ? url.length : part.length)}</a>{href === url ? part.slice(url.length) : null}</span> : part;
  });
}

export default function PrivacyPage() {
  return (
    <div className={`home-page ${styles.page}`}>
      <SiteHeader siteName="Автозапчасти на Салтыкова-Щедрина" navigationBasePath="/" />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <article className={styles.document} aria-labelledby="privacy-title">
          <PrivacyBackLink className={styles.back} />
          <h1 id="privacy-title">Политика обработки персональных данных</h1>

          {privacyPolicySections.map((section) => (
            <section key={section.number} aria-labelledby={`privacy-section-${section.number}`}>
              <h2 id={`privacy-section-${section.number}`}>{section.number}. {section.title}</h2>
              {section.number === 12 ? (
                <table className={styles.details} aria-labelledby="privacy-section-12">
                  <tbody>
                    {section.clauses.map((clause) => {
                      const block = clause.blocks[0];
                      const [label, ...value] = block.type === "paragraph" ? block.text.split("\n") : [];

                      return (
                        <tr key={clause.number} data-policy-clause={clause.number}>
                          <th scope="row">{label}</th>
                          <td>{renderLinkedText(value.join("\n"))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                section.clauses.map((clause) => (
                  <div key={clause.number} className={styles.clause} data-policy-clause={clause.number}>
                    {clause.blocks.map((block, index) => block.type === "list" ? (
                      <ul key={index}>
                        {block.items.map((item) => <li key={item}>{renderLinkedText(item)}</li>)}
                      </ul>
                    ) : (
                      <p key={index}>{index === 0 ? `${clause.number}. ` : null}{renderLinkedText(block.text)}</p>
                    ))}
                  </div>
                ))
              )}
            </section>
          ))}
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
