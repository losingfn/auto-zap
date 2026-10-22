import Image from "next/image";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons/lucide";
import { PurchaseListNavigationLink } from "@/components/purchase-list/purchase-list-navigation-link";
import { publicBrandLogoSrc } from "@/config/public-brand";
import { getPublicHomeContent, type PublicHomeContent } from "@/features/content/public-home";
import styles from "./public-footer.module.css";
import { DesktopFooterBrand } from "./public-footer-brand";
import { PrivacyPolicyLink } from "./privacy-navigation";
import { PrivacySettingsTrigger } from "@/features/privacy/privacy-provider";

export async function PublicFooter({ content }: { content?: PublicHomeContent }) {
  const data = content ?? (await getPublicHomeContent());

  return (
    <footer id="footer" aria-label={data.brand.name} className={`${styles.root} border-t border-white/10 bg-[#0B1220] py-7 sm:py-10`}>
      <div className={styles.desktop}>
        <div className={styles.main}>
          <DesktopFooterBrand className={styles.brand}>
            <div className={styles.brandHeading}>
              <Image
                src={publicBrandLogoSrc}
                alt=""
                width={64}
                height={64}
                sizes="64px"
                className={styles.logo}
              />
              <p className={styles.brandName}>
                Автозапчасти<br />на Салтыкова-Щедрина
              </p>
            </div>
          </DesktopFooterBrand>
          <nav aria-label="Навигация в подвале сайта" className={styles.navigation}>
            <p className={styles.heading}>Навигация</p>
            <div className={styles.links}>
              <Link href="/#catalog" className={`${styles.link} ${styles.navigationLink}`}>
                Каталог<ChevronRightIcon className={styles.chevron} />
              </Link>
              <Link href="/#reviews" className={`${styles.link} ${styles.navigationLink}`}>
                Отзывы<ChevronRightIcon className={styles.chevron} />
              </Link>
              <Link href="/#contacts" className={`${styles.link} ${styles.navigationLink}`}>
                Контакты<ChevronRightIcon className={styles.chevron} />
              </Link>
              <Link href="/#vacancies" className={`${styles.link} ${styles.navigationLink}`}>
                Вакансии<ChevronRightIcon className={styles.chevron} />
              </Link>
              <div className={styles.purchaseRow}>
                <PurchaseListNavigationLink className={`${styles.link} ${styles.navigationLink} ${styles.purchaseList}`} />
                <ChevronRightIcon className={styles.chevron} />
              </div>
            </div>
          </nav>
          <div className={styles.privacy}>
            <p className={styles.heading}>Конфиденциальность</p>
            <div className={styles.privacyLinks}>
              <PrivacyPolicyLink className={`${styles.link} ${styles.privacyRow}`}>
                <span className={styles.desktopPrivacyText}>Политика обработки персональных данных</span><ChevronRightIcon className={`${styles.chevron} ${styles.trailingChevron}`} />
                <span className={styles.mobilePrivacyText}>Политика обработки персональных <span className={styles.linkEnding}>данных<ChevronRightIcon className={`${styles.chevron} ${styles.inlineChevron}`} /></span></span>
              </PrivacyPolicyLink>
              <PrivacySettingsTrigger className={`${styles.link} ${styles.privacyRow}`}>
                <span className={styles.desktopPrivacyText}>Настройки конфиденциальности</span><ChevronRightIcon className={`${styles.chevron} ${styles.trailingChevron}`} />
                <span className={styles.mobilePrivacyText}>Настройки <span className={styles.linkEnding}>конфиденциальности<ChevronRightIcon className={`${styles.chevron} ${styles.inlineChevron}`} /></span></span>
              </PrivacySettingsTrigger>
            </div>
          </div>
        </div>
        <div className={styles.utility}>
          <div className={styles.legal}>
            <p>
              <span>© 2026 Автозапчасти на Салтыкова-Щедрина</span>{" "}
              <span aria-hidden="true">·</span>{" "}
              <span>ИП Корженков В. Е.</span>{" "}
              <span aria-hidden="true">·</span>{" "}
              <span>ИНН 507800025699</span>{" "}
              <span aria-hidden="true">·</span>{" "}
              <span>ОГРНИП 304501033700132</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
