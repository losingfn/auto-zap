"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  type HomeContentInput,
  updateAdminHomeContent
} from "@/features/admin/content/management";
import { DEFAULT_HOME_CONTENT } from "@/features/content/public-home";

export async function updateHomeContentAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/content?saved=1";

  try {
    const input: HomeContentInput = {
      hero: {
        title: readText(formData, "heroTitle", DEFAULT_HOME_CONTENT.hero.title),
        subtitle: readText(formData, "heroSubtitle", DEFAULT_HOME_CONTENT.hero.subtitle),
        text: readText(formData, "heroText", DEFAULT_HOME_CONTENT.hero.text),
        highlights: [
          readText(formData, "heroHighlight1", DEFAULT_HOME_CONTENT.hero.highlights[0]),
          readText(formData, "heroHighlight2", DEFAULT_HOME_CONTENT.hero.highlights[1]),
          readText(formData, "heroHighlight3", DEFAULT_HOME_CONTENT.hero.highlights[2]),
          readText(formData, "heroHighlight4", DEFAULT_HOME_CONTENT.hero.highlights[3])
        ]
      },
      catalog: {
        eyebrow: readText(formData, "catalogEyebrow", DEFAULT_HOME_CONTENT.catalog.eyebrow),
        title: readText(formData, "catalogTitle", DEFAULT_HOME_CONTENT.catalog.title),
        text: readText(formData, "catalogText", DEFAULT_HOME_CONTENT.catalog.text)
      },
      benefits: {
        eyebrow: readText(formData, "benefitsEyebrow", DEFAULT_HOME_CONTENT.benefits.eyebrow),
        title: readText(formData, "benefitsTitle", DEFAULT_HOME_CONTENT.benefits.title),
        text: readText(formData, "benefitsText", DEFAULT_HOME_CONTENT.benefits.text),
        items: DEFAULT_HOME_CONTENT.benefits.items.map((item, index) => ({
          icon: item.icon,
          title: readText(formData, `benefitTitle${index}`, item.title),
          text: readText(formData, `benefitText${index}`, item.text)
        }))
      },
      about: {
        eyebrow: readText(formData, "aboutEyebrow", DEFAULT_HOME_CONTENT.about.eyebrow),
        title: readText(formData, "aboutTitle", DEFAULT_HOME_CONTENT.about.title),
        intro: readText(formData, "aboutIntro", DEFAULT_HOME_CONTENT.about.intro),
        text: readText(formData, "aboutText", DEFAULT_HOME_CONTENT.about.text)
      },
      orderParts: {
        title: readText(formData, "orderTitle", DEFAULT_HOME_CONTENT.orderParts.title),
        text: readText(formData, "orderText", DEFAULT_HOME_CONTENT.orderParts.text),
        primaryButton: readText(
          formData,
          "orderPrimaryButton",
          DEFAULT_HOME_CONTENT.orderParts.primaryButton
        ),
        secondaryButton: readText(
          formData,
          "orderSecondaryButton",
          DEFAULT_HOME_CONTENT.orderParts.secondaryButton
        )
      },
      vacancies: {
        eyebrow: readText(formData, "vacanciesEyebrow", DEFAULT_HOME_CONTENT.vacancies.eyebrow),
        title: readText(formData, "vacanciesTitle", DEFAULT_HOME_CONTENT.vacancies.title),
        text: readText(formData, "vacanciesText", DEFAULT_HOME_CONTENT.vacancies.text)
      },
      contacts: {
        eyebrow: readText(formData, "contactsEyebrow", DEFAULT_HOME_CONTENT.contacts.eyebrow),
        title: readText(formData, "contactsTitle", DEFAULT_HOME_CONTENT.contacts.title),
        text: readText(formData, "contactsText", DEFAULT_HOME_CONTENT.contacts.text)
      }
    };

    await updateAdminHomeContent(input, session.user.id);
  } catch {
    target = "/admin/content?error=1";
  }

  redirect(target);
}

function readText(formData: FormData, key: string, fallback: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || fallback;
}
