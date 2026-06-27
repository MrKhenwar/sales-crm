const DEFAULT_TEMPLATE = "Hi {name}, this is from Sales CRM.";

export function whatsappUrl(phoneE164: string, leadName: string): string {
  const digits = phoneE164.replace(/[^\d]/g, "");
  const template = process.env.WHATSAPP_TEMPLATE || DEFAULT_TEMPLATE;
  const firstName = leadName.trim().split(/\s+/)[0] || "there";
  const text = template.replaceAll("{name}", firstName);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
