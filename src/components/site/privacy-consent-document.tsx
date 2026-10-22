import type { ReactNode } from "react";
import { analyticsConsentText } from "@/features/privacy/consent-content";
import policy from "@/app/privacy/privacy.module.css";
import styles from "./privacy-consent-document.module.css";

const paragraphs = analyticsConsentText.trim().split(/\n\s*\n/);

function linkedText(text: string): ReactNode {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[.;,]+$/, "");
    return <span key={index}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</span>;
  });
}

/** Page-only rendering of the same approved source; numbering and wording remain literal. */
export function PrivacyConsentDocument() {
  const sections: { number: number; heading: string; content: ReactNode[] }[] = [];
  for (let index = 1; index < paragraphs.length; index++) {
    const paragraph = paragraphs[index];
    if (/^\d+\. [А-ЯЁ]/.test(paragraph)) {
      sections.push({ number: parseInt(paragraph, 10), heading: paragraph, content: [] });
      continue;
    }
    let block: ReactNode;
    if (/^\d+\)/.test(paragraph)) {
      const items = [paragraph];
      while (/^\d+\)/.test(paragraphs[index + 1] ?? "")) items.push(paragraphs[++index]);
      block = <ol className={styles.literalList}>{items.map(item => <li key={item}>{linkedText(item)}</li>)}</ol>;
    } else if (paragraph.startsWith("— ")) {
      block = <ul className={styles.literalList}>{paragraph.split("\n").map(item => <li key={item}>{item}</li>)}</ul>;
    } else {
      block = <p>{linkedText(paragraph)}</p>;
    }
    sections[sections.length - 1].content.push(<div key={index} className={policy.clause}>{block}</div>);
  }
  return <article className={`${policy.document} ${styles.document}`} aria-labelledby="analytics-consent-title" data-consent-text>
    <h1 id="analytics-consent-title">{paragraphs[0]}</h1>
    {sections.map(section => <section key={section.number} aria-labelledby={`consent-section-${section.number}`}>
      <h2 id={`consent-section-${section.number}`}>{section.heading}</h2>
      {section.content}
    </section>)}
  </article>;
}
