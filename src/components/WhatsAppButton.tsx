import { whatsappUrl } from "@/lib/whatsapp";

export function WhatsAppButton({
  phone,
  name,
  compact = false,
}: {
  phone: string;
  name: string;
  compact?: boolean;
}) {
  return (
    <a
      href={whatsappUrl(phone, name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`WhatsApp ${name}`}
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-1 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
          : "inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2 hover:bg-emerald-700 transition"
      }
    >
      <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
        <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.83a11.7 11.7 0 0 0 1.6 5.93L0 24l6.4-1.68a11.9 11.9 0 0 0 5.64 1.43h.01c6.54 0 11.83-5.3 11.83-11.83 0-3.16-1.23-6.13-3.36-8.44ZM12.05 21.5h-.01a9.66 9.66 0 0 1-4.93-1.35l-.35-.21-3.8 1 .98-3.7-.23-.38a9.62 9.62 0 0 1-1.48-5.06c0-5.32 4.34-9.65 9.66-9.65a9.6 9.6 0 0 1 6.83 2.83 9.6 9.6 0 0 1 2.83 6.83c0 5.32-4.33 9.65-9.65 9.65Zm5.55-7.23c-.3-.15-1.79-.88-2.07-.98-.27-.1-.47-.15-.67.15-.2.3-.78.98-.95 1.18-.18.2-.35.22-.65.07a8.27 8.27 0 0 1-2.43-1.5 9 9 0 0 1-1.68-2.09c-.18-.3 0-.46.13-.6.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.07 4.49.71.3 1.26.49 1.69.62.71.23 1.35.2 1.86.12.57-.08 1.79-.73 2.04-1.43.25-.71.25-1.31.17-1.44-.07-.13-.27-.2-.57-.35Z"/>
      </svg>
      {compact ? "WhatsApp" : "WhatsApp"}
    </a>
  );
}
