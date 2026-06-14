export type EmailLayoutInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  tenantName?: string;
  bodyHtml: string;
  cta?: {
    label: string;
    href: string;
  };
  footerNote?: string;
};

const BRAND = {
  bg: "#ffffff",
  surface: "#fafafa",
  foreground: "#171717",
  muted: "#737373",
  border: "#e5e5e5",
  primary: "#171717",
  primaryText: "#fafafa",
  accent: "#f4f4f5",
  warningBg: "#fff7ed",
  warningBorder: "#fdba74",
  criticalBg: "#fef2f2",
  criticalBorder: "#fca5a5",
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmailLayout(input: EmailLayoutInput) {
  const tenant = input.tenantName ? escapeHtml(input.tenantName) : "";
  const preheader = escapeHtml(input.preheader);
  const eyebrow = escapeHtml(input.eyebrow);
  const title = escapeHtml(input.title);
  const footer = escapeHtml(
    input.footerNote ??
      "JobComplaint — canal seguro de denúncias com trilha de auditoria imutável.",
  );

  const ctaBlock = input.cta
    ? `<tr>
        <td style="padding:28px 32px 8px 32px;text-align:center;">
          <a href="${input.cta.href}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.primaryText};text-decoration:none;font-size:14px;font-weight:600;line-height:1;padding:12px 24px;border-radius:6px;">
            ${escapeHtml(input.cta.label)}
          </a>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.foreground};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND.primary};padding:20px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="color:${BRAND.primaryText};font-size:15px;font-weight:700;letter-spacing:-0.02em;">
                      &#128737; JobComplaint
                    </td>
                    <td align="right" style="color:#d4d4d4;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.12em;text-transform:uppercase;">
                      LGPD
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 10px 0;font-size:11px;line-height:1.4;color:${BRAND.muted};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.14em;text-transform:uppercase;">
                  ${eyebrow}
                </p>
                <h1 style="margin:0 0 ${tenant ? "8px" : "0"} 0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.03em;color:${BRAND.foreground};">
                  ${title}
                </h1>
                ${
                  tenant
                    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${tenant}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.65;color:${BRAND.foreground};">
                ${input.bodyHtml}
              </td>
            </tr>
            ${ctaBlock}
            <tr>
              <td style="padding:24px 32px 28px 32px;border-top:1px solid ${BRAND.border};background:${BRAND.accent};">
                <p style="margin:0;font-size:11px;line-height:1.55;color:${BRAND.muted};">
                  ${footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailParagraph(text: string) {
  return `<p style="margin:0 0 16px 0;">${text}</p>`;
}

export function emailMetaTable(rows: Array<{ label: string; value: string }>) {
  const items = rows
    .map(
      (row) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};font-size:11px;color:${BRAND.muted};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.08em;text-transform:uppercase;width:38%;vertical-align:top;">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.foreground};vertical-align:top;">
          ${escapeHtml(row.value)}
        </td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px 0;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:6px;padding:4px 16px;">
    ${items}
  </table>`;
}

export function emailNoticeBox(text: string, tone: "default" | "warning" | "critical" = "default") {
  const palette =
    tone === "critical"
      ? { bg: BRAND.criticalBg, border: BRAND.criticalBorder }
      : tone === "warning"
        ? { bg: BRAND.warningBg, border: BRAND.warningBorder }
        : { bg: BRAND.accent, border: BRAND.border };

  return `<div style="margin:0 0 16px 0;padding:14px 16px;background:${palette.bg};border:1px solid ${palette.border};border-left:4px solid ${BRAND.primary};border-radius:6px;font-size:14px;line-height:1.55;color:${BRAND.foreground};">
    ${text}
  </div>`;
}
