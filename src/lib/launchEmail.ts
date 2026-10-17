/**
 * Launch/update email: "everything new in Human AI" (Arabic, RTL).
 * Red floral theme + Humi avatar. Table layout + inline styles for clients.
 * Every feature carries its own button — no provider/API names are exposed.
 */

const BASE = "https://www.usehuman.de";
const RED = "#e5484d";

function feature(title: string, text: string, btn: string, href: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;background:#111114;border:1px solid #232329;border-radius:14px;"><tr><td style="padding:14px 16px;"><div style="font-size:15px;font-weight:bold;color:#ffffff;">${title}</div><div style="margin-top:4px;font-size:13px;line-height:22px;color:#b6b6bd;">${text}</div><div style="margin-top:10px;"><a href="${href}" style="display:inline-block;background:${RED};color:#ffffff;font-size:13px;font-weight:bold;text-decoration:none;padding:9px 24px;border-radius:999px;">${btn}</a></div></td></tr></table>`;
}

/** Full HTML body for the "what's new in Human AI" broadcast. */
export function launchUpdateHtml(): { subject: string; html: string } {
  const subject = "Human AI: صور، صوت، فيديو — كل شي جديد بمنتج واحد";
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#08080a;">
<div style="background:#08080a;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#0c0c0f;border:1px solid #232329;border-radius:20px;overflow:hidden;">
<tr><td style="padding:8px 0 0 0;text-align:center;"><div style="height:3px;background:linear-gradient(to left,#e5484d,#ff7a7a);"></div></td></tr>
<tr><td style="padding:28px 28px 8px 28px;text-align:center;">
<img src="${BASE}/humi.png" alt="Humi" width="84" height="84" style="border-radius:50%;display:block;margin:0 auto;border:2px solid ${RED};">
<div style="margin-top:12px;font-size:22px;font-weight:bold;letter-spacing:6px;color:#ffffff;">HUMAN <span style="color:${RED};">AI</span></div>
<div style="margin-top:6px;font-size:13px;color:#ff8a8a;">🌺 مع Humi — كل شي جديد 🌺</div>
</td></tr>
<tr><td style="padding:12px 28px 4px 28px;">
<p style="font-size:14px;line-height:24px;color:#d8d8de;">مرحباً،<br>هاي رسالة وحدة تجمع لك <b style="color:#ffffff;">كل شي صار جديد بـ Human AI</b> بالفترة الأخيرة — كل ميزة بزرها directly:</p>
${feature("🌺 Speed — الموديل السريع", "نموذج الدردشة الأساسي: سريع، يفهم الصور، ويجاوبك بلغتك — عربي، ألماني أو إنجليزي. صفحة جديدة لكل محادثة.", "افتح الشات", `${BASE}/chat/new`)}
${feature("🌸 humi.1 images — توليد الصور", "اوصف الصورة بالكلام وتحصل عليها فوراً داخل الشات. ولو سألت الموديل النصي عن الصور، يعطيك زر تحويل مباشر لموديل الصور.", "جرّب الصور", `${BASE}/chat/new`)}
${feature("🌺 Text2Voice — صوت من النص", "اختر من 6 أصوات طبيعية (عربي/ألماني/إنجليزي)، اكتب حتى 120 حرف (~5 ثواني)، واسمع النتيجة وحمّلها. كل حساب يبدأ بـ <b>10 توكنز مجانية</b> — ولو خلصت تطلب توكنز إضافية بزر واحد والأدمن يوافق.", "افتح Text2Voice", `${BASE}/text2voice`)}
${feature("🌸 فيديو من النص", "حوّل أي نص لفيديو مع تعليق صوتي، أو ولّد مشاهد سينمائية بالذكاء الاصطناعي — كلها من مكان واحد.", "جرّب الفيديو", `${BASE}/chat/new`)}
${feature("🌺 مفاتيح API بصلاحيات", "من صفحة API Keys تطلع مفتاح بصلاحية محددة: شات فقط، صور فقط، أو الاثنين.", "صفحة API Keys", `${BASE}/platform/dash/apikey`)}
${feature("🌸 بحث الويب والحماية", "زر البحث صار بيدك تشغله وتطفيه من شريط الكتابة. والتحيات مثل «مرحبا» تنجاب مباشرة بدون بحث. وأي محاولة انتحال أو تسريب لتعليمات النظام تنرفض تلقائياً.", "افتح الشات", `${BASE}/chat/new`)}
${feature("🌺 Sham AI — شريكنا الجديد", "مشروع شريك جديد قيد الإطلاق — تابعنا.", "زور Sham AI", `https://sham.ai.usehuman.de`)}
</td></tr>
<tr><td style="padding:8px 28px 24px 28px;text-align:center;">
<a href="${BASE}/chat/new" style="display:inline-block;background:${RED};color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 34px;border-radius:999px;">🌺 جرّب Human AI الآن</a>
<div style="margin-top:14px;"><a href="${BASE}/text2voice" style="color:#ff8a8a;font-size:13px;text-decoration:underline;">أو جرّب Text2Voice مباشرة</a></div>
</td></tr>
<tr><td style="padding:0 28px 28px 28px;">
<p style="font-size:11px;line-height:19px;color:#71717a;">وصلك هذا البريد لأن عنوانك موجود بقاعدة بياناتنا — غالباً من استخدامك لتطبيقاتنا ومشاريعنا السابقة مثل <b>Barada Code</b>. إذا ما تريد رسائل مستقبلية، رد علينا بكلمة «إلغاء» وسنزيل عنوانك.</p>
</td></tr>
</table>
</div>
</body></html>`;
  return { subject, html };
}

/** Invitation variant for a single guest (e.g. Ahmad): same news, invite framing + signup CTA. */
export function inviteHtml(): { subject: string; html: string } {
  const base = launchUpdateHtml();
  const inviteBanner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;background:#1a0d0d;border:1px solid ${RED};border-radius:14px;"><tr><td style="padding:14px 16px;text-align:center;"><div style="font-size:16px;font-weight:bold;color:#ffffff;">🌺 أنت مدعو لتجربة Human AI 🌺</div><div style="margin-top:4px;font-size:13px;line-height:22px;color:#d8d8de;">هذه دعوة شخصية لك: حساب مجاني، 10 أصوات Text2Voice هدية، وكل الميزات الجديدة بالأسفل. سجّل بالإيميل هذا بدقيقة واحدة.</div><div style="margin-top:10px;"><a href="${BASE}/signup" style="display:inline-block;background:${RED};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:11px 30px;border-radius:999px;">اقبل الدعوة — سجّل مجاناً</a></div></td></tr></table>`;
  const html = base.html.replace(
    `<p style="font-size:14px;line-height:24px;color:#d8d8de;">مرحباً،`,
    `${inviteBanner}<p style="font-size:14px;line-height:24px;color:#d8d8de;">مرحباً،`
  );
  return { subject: "دعوة: جرّب Human AI — صور، صوت، فيديو بحساب مجاني", html };
}
