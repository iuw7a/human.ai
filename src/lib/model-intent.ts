/**
 * The composer shows ONE locked pill ("Humi Auto"): the app — not the user —
 * decides whether a prompt is a chat message or an image request.
 *
 * This module is that decision. It is shared by the client (to switch the UI
 * while typing) and by the chat route (to resolve the literal `"auto"` slug),
 * so the browser and the server never disagree about which model runs.
 *
 * Honest limits: this is a small, explicit keyword check — not a classifier.
 * It only counts a request to *create* a picture. Merely mentioning an image
 * ("I cannot open the picture you sent", "summarise this image") stays a text
 * turn. Anything long (a pasted brief) is never auto-routed.
 */

export const IMAGE_MODEL_ID = "humi.1-images";
export const AUTO_MODEL_ID = "auto";

/** Verbs that ask for something to be made / drawn. */
const CREATE =
  /(draw|sketch|paint|render|illustrate|design|generate|create|make|zeichne|zeichnen|mal mir|mal ein|erstell|erstellen|generier|generiere|entwirf|entwerfe|ارسم|إرسم|ارسمل|ارسملي|صمم|صممي|اعمل|اعملي|سويلي|سوّيلي|اصنع|أنشئ|انشئ|ولد)/i;

/** The thing that is being asked for. */
const SUBJECT =
  /(image|picture|photo|photograph|selfie|logo|poster|icon|illustration|drawing|sketch|wallpaper|sticker|thumbnail|portrait|avatar|bild|foto|plakat|zeichnung|صورة|صوره|رسمة|رسم|لوجو|شعار|بوستر|ملصق|خلفية|افتار)/i;

/** "a photo of …", "ein Bild von …", "صورة …" — a request without a verb. */
const NAMED =
  /(^\s*(a|an|the)\s+[\w-]*\s*(image|picture|photo|photograph|portrait|illustration|drawing|logo|poster|sticker)\b)|(^\s*(ein|eine|einen)\s+[\w-]*\s*(bild|foto|porträt|zeichnung|illustration|logo|poster)\b)|(^\s*(صورة|صوره|رسمة)\s)/i;

/** "draw a conclusion / a line / a table" is not a picture. */
const NOT_A_PICTURE =
  /(draw|sketch|design|render)[^.\n]{0,30}(conclusion|comparison|distinction|line|table|diagram|border|plan)/i;

/** Would this prompt generate an image? Used for UI hints and for "auto". */
export function looksLikeImageRequest(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 400) return false;
  if (NOT_A_PICTURE.test(t)) return false;
  // Verb and subject have to appear in the same sentence, so
  // "make a plan. that image is big" does not count.
  for (const sentence of t.split(/[.!?؟\n;؛]+/)) {
    const s = sentence.trim();
    if (s && CREATE.test(s) && SUBJECT.test(s)) return true;
  }
  return NAMED.test(t);
}
