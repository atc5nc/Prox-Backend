import type {
  CompleteBasket,
  EmailRetailerColumn,
  StapleGridRow,
} from "../_shared/staples/stapleGrid.ts";
import {
  formatComparisonUnit,
  formatUsd,
  formatWeekOfLabel,
  productImageKey,
} from "./helpers.ts";

// alston@joinprox.com must be a verified sender on the Resend account/domain.
export const FROM_ADDRESS = "Prox <alston@joinprox.com>";

/** Physical address required in the footer of a commercial email (CAN-SPAM). */
export const MAILING_ADDRESS = "2903 Lincoln Blvd, Santa Monica, CA 90405";

/**
 * Used only by preview sends. A real run never renders an email without a
 * winner — a recipient with no complete basket is skipped for the week.
 */
export const FALLBACK_SUBJECT = "Your weekly staples price check from Prox";

// Palette sampled from the shipped app icon and the /deals "Cheapest For You"
// card, so the email reads as the same product as the app:
//   #003221 icon background   #A4DC71 icon badge green
//   #003121 chart deep green  #E8F0E5 winner card  #E8A21C savings pill
//   #16201A chart ink border  #F4EBDD brand paper
const COLOR_PAGE = "#F4EBDD";
const COLOR_DARK = "#003221";
const COLOR_BADGE = "#A4DC71";
const COLOR_CARD = "#ffffff";
const COLOR_TEXT = "#211B16";
const COLOR_DEEP = "#003121";
const COLOR_WINNER_CARD = "#E8F0E5";
const COLOR_WINNER_MUTED = "#4A7A5A";
const COLOR_GOLD = "#E8A21C";
const COLOR_INK = "#16201A";
const COLOR_RULE = "#EAE2D3";
const COLOR_MUTED = "#6f665c";
const COLOR_TILE = "#FAF6EE";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** App illustration served by the email-assets function, per staple. */
const STAPLE_ILLUSTRATIONS: Record<string, string> = {
  "Chicken Breast": "staple-chicken.png",
  "Ground Beef": "staple-ground-beef.png",
  "Large Eggs": "staple-eggs.png",
  "Whole Milk": "staple-milk.png",
  "Cheddar Cheese": "staple-cheese.png",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type StaplesEmailContent = {
  firstName: string | null;
  zipCode: string;
  /** `YYYY-MM-DD` of the deal cycle's Wednesday. */
  periodKey: string;
  winner: CompleteBasket;
  runnerUp: CompleteBasket | null;
  savingsVsRunnerUp: number;
  /**
   * When the winner is a backfilled store: the recipient's own cheapest
   * complete retailer and how much more its basket costs than the winner's.
   */
  bestPreferredRetailer: string | null;
  savingsVsPreferred: number;
  /**
   * The table columns: the recipient's own complete retailers first, then any
   * nearby complete baskets backfilled to fill the remaining slots.
   */
  columns: EmailRetailerColumn[];
  rows: StapleGridRow[];
  /** staple+retailer → flyer product photo URL. See `productImageKey`. */
  productImages: Map<string, string>;
  /** Base URL of the email-assets function (logo, staple illustrations). */
  assetsBaseUrl: string;
  ctaUrl: string;
  unsubscribeUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Subject lines lead with the story of the week, not metadata:
 *  - a nearby store beat the shopper's own:  "Walmart beats Ralphs by $12.20 on your 5 staples"
 *  - their own store won a real comparison:  "Ralphs wins your week — 5 staples for $27.65"
 *  - only one store had everything:          "Your 5 staples: $27.65 at Ralphs this week"
 */
export function buildSubject(content: {
  winner: CompleteBasket;
  runnerUp: CompleteBasket | null;
  bestPreferredRetailer: string | null;
  savingsVsPreferred: number;
  columns: EmailRetailerColumn[];
}): string {
  const winnerColumn = content.columns.find(
    (column) => column.retailer === content.winner.retailer
  );
  const winnerIsPreferred = winnerColumn?.isPreferred ?? true;

  if (
    !winnerIsPreferred &&
    content.bestPreferredRetailer &&
    content.savingsVsPreferred > 0
  ) {
    return `${content.winner.retailer} beats ${content.bestPreferredRetailer} by ${formatUsd(content.savingsVsPreferred)} on your 5 staples`;
  }

  if (content.runnerUp) {
    return `${content.winner.retailer} wins your week — 5 staples for ${formatUsd(content.winner.total)}`;
  }

  return `Your 5 staples: ${formatUsd(content.winner.total)} at ${content.winner.retailer} this week`;
}

function buildGreetingName(firstName: string | null): string {
  return firstName ? `Hi ${firstName}` : "Hi there";
}

/** App-style letter badge, rendered as a table so every client draws it. */
function letterBadge(params: {
  letter: string;
  size: number;
  background: string;
  color: string;
  border: string;
  fontSize: number;
}): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>` +
    `<td align="center" bgcolor="${params.background}" style="width:${params.size}px;height:${params.size}px;background-color:${params.background};border:1.5px solid ${params.border};border-radius:999px;font-family:${FONT_STACK};font-size:${params.fontSize}px;font-weight:800;color:${params.color};line-height:1;">` +
    `${escapeHtml(params.letter)}` +
    `</td></tr></table>`
  );
}

function buildHeader(content: StaplesEmailContent): string {
  const winnerColumn = content.columns.find(
    (column) => column.retailer === content.winner.retailer
  );
  const winnerIsPreferred = winnerColumn?.isPreferred ?? true;
  const headline =
    content.columns.length > 1
      ? `${content.winner.retailer} wins your week`
      : "Your weekly basket, priced";
  const storeCount = content.columns.length;
  const storeNoun = storeCount === 1 ? "store" : "stores";
  const weekOf = formatWeekOfLabel(content.periodKey);

  return (
    `<td align="center" bgcolor="${COLOR_DARK}" style="background-color:${COLOR_DARK};border-radius:24px 24px 0 0;padding:34px 28px 28px 28px;">` +
    `<img src="${escapeHtml(content.assetsBaseUrl)}/logo.png" width="84" height="84" alt="Prox" style="display:block;width:84px;height:84px;border-radius:22px;" />` +
    `<p style="margin:22px 0 10px 0;font-family:${FONT_STACK};font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:${COLOR_BADGE};">Your weekly price check</p>` +
    `<h1 style="margin:0 0 12px 0;font-family:${FONT_STACK};font-size:30px;line-height:1.15;font-weight:900;color:#ffffff;">${escapeHtml(headline)}</h1>` +
    `<p style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:#CFE3C2;">` +
    `${escapeHtml(buildGreetingName(content.firstName))} &mdash; chicken, beef, eggs, milk &amp; cheese, priced at ${storeCount} ${storeNoun} near ${escapeHtml(content.zipCode)}.` +
    `</p>` +
    `<p style="margin:6px 0 0 0;font-family:${FONT_STACK};font-size:12px;color:#8FAF87;">Week of ${escapeHtml(weekOf)}</p>` +
    (winnerIsPreferred ? "" : "") +
    `</td>`
  );
}

function buildWinnerCard(content: StaplesEmailContent): string {
  const { winner, runnerUp, savingsVsRunnerUp } = content;

  const savingsPill =
    runnerUp && savingsVsRunnerUp > 0
      ? `<tr><td align="center" style="padding-top:14px;">` +
        `<span style="display:inline-block;background-color:${COLOR_GOLD};color:${COLOR_INK};font-family:${FONT_STACK};font-size:12.5px;font-weight:800;padding:8px 16px;border-radius:999px;">&#9733;&nbsp; Save ${escapeHtml(formatUsd(savingsVsRunnerUp))} vs ${escapeHtml(runnerUp.retailer)}</span>` +
        `</td></tr>`
      : "";

  const winnerColumn = content.columns.find(
    (column) => column.retailer === winner.retailer
  );
  const vsPreferred =
    winnerColumn && !winnerColumn.isPreferred &&
    content.bestPreferredRetailer && content.savingsVsPreferred > 0
      ? `<tr><td align="center" style="padding-top:12px;">` +
        `<p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${COLOR_DEEP};">That&#39;s <strong>${escapeHtml(formatUsd(content.savingsVsPreferred))} less</strong> than ${escapeHtml(content.bestPreferredRetailer)}, your usual store.</p>` +
        `</td></tr>`
      : "";

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${COLOR_WINNER_CARD};border:2px solid ${COLOR_INK};border-radius:18px;box-shadow:6px 6px 0 ${COLOR_INK};" bgcolor="${COLOR_WINNER_CARD}">` +
    `<tr><td align="center" style="padding:24px 20px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
    `<tr><td align="center" style="font-family:${FONT_STACK};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${COLOR_WINNER_MUTED};padding-bottom:12px;">Cheapest for you</td></tr>` +
    `<tr><td align="center">${letterBadge({ letter: winner.retailer.charAt(0).toUpperCase(), size: 40, background: COLOR_DARK, color: "#ffffff", border: COLOR_DARK, fontSize: 17 })}</td></tr>` +
    `<tr><td align="center" style="padding-top:8px;font-family:${FONT_STACK};font-size:23px;font-weight:900;color:${COLOR_DEEP};">${escapeHtml(winner.retailer)}</td></tr>` +
    `<tr><td align="center" style="padding-top:4px;font-family:${FONT_STACK};font-size:46px;font-weight:900;color:${COLOR_DEEP};letter-spacing:-1px;">${escapeHtml(formatUsd(winner.total))}</td></tr>` +
    `<tr><td align="center" style="padding-top:2px;font-family:${FONT_STACK};font-size:12px;color:${COLOR_WINNER_MUTED};">all 5 staples &middot; sizes normalized</td></tr>` +
    savingsPill +
    vsPreferred +
    `</table>` +
    `</td></tr></table>`
  );
}

function sectionTitle(title: string, subtitle: string): string {
  return (
    `<tr><td align="center" style="padding:34px 0 6px 0;font-family:${FONT_STACK};font-size:19px;font-weight:900;color:${COLOR_DEEP};">${title}</td></tr>` +
    `<tr><td align="center" style="padding:0 24px 16px 24px;font-family:${FONT_STACK};font-size:12.5px;line-height:1.55;color:${COLOR_MUTED};">${subtitle}</td></tr>`
  );
}

function buildGridTable(content: StaplesEmailContent): string {
  const { columns, rows, winner } = content;

  const headerCells = columns
    .map((column) => {
      const isWinner = column.retailer === winner.retailer;
      const badge = letterBadge({
        letter: column.retailer.charAt(0).toUpperCase(),
        size: 30,
        background: isWinner ? COLOR_DARK : "#F4ECD8",
        color: isWinner ? "#ffffff" : COLOR_INK,
        border: COLOR_INK,
        fontSize: 13,
      });
      const nearby = column.isPreferred
        ? ""
        : `<div style="font-size:9.5px;font-weight:600;color:${COLOR_MUTED};margin-top:2px;">nearby</div>`;
      const star = isWinner
        ? `<span style="color:${COLOR_GOLD};">&#9733;</span> `
        : "";
      return (
        `<th align="center" style="padding:10px 6px;font-family:${FONT_STACK};vertical-align:bottom;">` +
        badge +
        `<div style="font-size:12px;font-weight:800;color:${COLOR_DEEP};margin-top:6px;">${star}${escapeHtml(column.retailer)}</div>` +
        nearby +
        `</th>`
      );
    })
    .join("");

  const bodyRows = rows
    .map((row) => {
      const illustration = STAPLE_ILLUSTRATIONS[row.staple];
      const thumb = illustration
        ? `<img src="${escapeHtml(content.assetsBaseUrl)}/${illustration}" width="40" height="40" alt="" style="display:inline-block;width:40px;height:40px;border-radius:10px;vertical-align:middle;" />`
        : "";

      const cells = row.cells
        .map((entry) => {
          const unit = formatComparisonUnit(entry.cell.comparisonLabel);
          const lowestStyles = entry.isLowest
            ? `background-color:${COLOR_WINNER_CARD};border-radius:10px;`
            : "";
          const priceColor = entry.isLowest ? COLOR_DEEP : COLOR_TEXT;
          const priceWeight = entry.isLowest ? "900" : "500";
          return (
            `<td align="center" style="padding:6px 4px;font-family:${FONT_STACK};vertical-align:middle;">` +
            `<div style="${lowestStyles}padding:8px 4px;">` +
            `<div style="font-size:14.5px;font-weight:${priceWeight};color:${priceColor};line-height:1.2;">${escapeHtml(formatUsd(entry.cell.price))}</div>` +
            (unit ? `<div style="font-size:10px;color:${entry.isLowest ? COLOR_WINNER_MUTED : COLOR_MUTED};margin-top:1px;">${escapeHtml(unit)}</div>` : "") +
            `<div style="font-size:10px;color:${COLOR_MUTED};margin-top:3px;">${escapeHtml(formatUsd(entry.cell.packagePrice))}${entry.cell.packageSize ? ` &middot; ${escapeHtml(entry.cell.packageSize)}` : ""}</div>` +
            `</div>` +
            `</td>`
          );
        })
        .join("");

      return (
        `<tr>` +
        `<th align="left" style="padding:10px 6px 10px 0;border-top:1px solid ${COLOR_RULE};font-family:${FONT_STACK};vertical-align:middle;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td style="vertical-align:middle;">${thumb}</td>` +
        `<td style="vertical-align:middle;padding-left:8px;font-family:${FONT_STACK};font-size:12.5px;font-weight:700;color:${COLOR_TEXT};line-height:1.25;">${escapeHtml(row.staple)}</td>` +
        `</tr></table>` +
        `</th>` +
        cells.replace(/<td align="center" style="padding:6px 4px;/g, `<td align="center" style="border-top:1px solid ${COLOR_RULE};padding:6px 4px;`) +
        `</tr>`
      );
    })
    .join("");

  const totalCells = columns
    .map((column) => {
      const isWinner = column.retailer === winner.retailer;
      return (
        `<td align="center" style="padding:12px 4px;border-top:2px solid ${COLOR_INK};font-family:${FONT_STACK};font-size:15.5px;font-weight:900;color:${isWinner ? COLOR_DEEP : COLOR_TEXT};">` +
        `${isWinner ? `<span style="color:${COLOR_GOLD};">&#9733;</span> ` : ""}${escapeHtml(formatUsd(column.basket.total))}` +
        `</td>`
      );
    })
    .join("");

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">` +
    `<thead><tr><th style="font-family:${FONT_STACK};"></th>${headerCells}</tr></thead>` +
    `<tbody>` +
    bodyRows +
    `<tr>` +
    `<th align="left" style="padding:12px 6px 12px 0;border-top:2px solid ${COLOR_INK};font-family:${FONT_STACK};font-size:13px;font-weight:900;color:${COLOR_TEXT};">Basket total</th>` +
    totalCells +
    `</tr>` +
    `</tbody></table>`
  );
}

function buildBasketCards(content: StaplesEmailContent): string {
  const { winner } = content;

  const cards = winner.cells.map((cell, index) => {
    const staple = content.rows[index]?.staple ?? "";
    const photo = content.productImages.get(
      productImageKey(staple, winner.retailer)
    );
    const illustration = STAPLE_ILLUSTRATIONS[staple];
    const imageSrc = photo ?? (illustration ? `${content.assetsBaseUrl}/${illustration}` : null);
    const unit = formatComparisonUnit(cell.comparisonLabel);

    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1.5px solid ${COLOR_RULE};border-radius:14px;background-color:${COLOR_CARD};" bgcolor="${COLOR_CARD}">` +
      `<tr><td align="center" bgcolor="${COLOR_TILE}" style="background-color:${COLOR_TILE};border-radius:12px 12px 0 0;padding:14px;">` +
      (imageSrc
        ? `<img src="${escapeHtml(imageSrc)}" height="86" alt="${escapeHtml(cell.productName)}" style="display:block;height:86px;max-width:100%;" />`
        : letterBadge({ letter: staple.charAt(0), size: 56, background: COLOR_WINNER_CARD, color: COLOR_DEEP, border: COLOR_INK, fontSize: 22 })) +
      `</td></tr>` +
      `<tr><td style="padding:12px 14px 4px 14px;font-family:${FONT_STACK};font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${COLOR_WINNER_MUTED};">${escapeHtml(staple)}</td></tr>` +
      `<tr><td style="padding:0 14px;font-family:${FONT_STACK};font-size:12.5px;font-weight:700;line-height:1.35;color:${COLOR_TEXT};">${escapeHtml(cell.productName)}</td></tr>` +
      `<tr><td style="padding:8px 14px 14px 14px;font-family:${FONT_STACK};">` +
      `<span style="font-size:16px;font-weight:900;color:${COLOR_DEEP};">${escapeHtml(formatUsd(cell.price))}</span>` +
      (unit ? `<span style="font-size:11px;color:${COLOR_MUTED};">&nbsp;${escapeHtml(unit)}</span>` : "") +
      `<div style="font-size:10.5px;color:${COLOR_MUTED};margin-top:2px;">${escapeHtml(formatUsd(cell.packagePrice))} at the shelf${cell.packageSize ? ` &middot; ${escapeHtml(cell.packageSize)}` : ""}</div>` +
      `</td></tr>` +
      `</table>`
    );
  });

  // 2-up rows; a trailing odd card sits centered at half width.
  const rows: string[] = [];
  for (let index = 0; index < cards.length; index += 2) {
    const left = cards[index];
    const right = cards[index + 1];
    if (right) {
      rows.push(
        `<tr>` +
        `<td width="50%" style="padding:6px;vertical-align:top;">${left}</td>` +
        `<td width="50%" style="padding:6px;vertical-align:top;">${right}</td>` +
        `</tr>`
      );
    } else {
      rows.push(
        `<tr><td colspan="2" align="center" style="padding:6px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="50%" style="width:50%;"><tr><td>${left}</td></tr></table>` +
        `</td></tr>`
      );
    }
  }

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">` +
    rows.join("") +
    `</table>`
  );
}

/** Renders the subject, HTML body, and plain-text alternative for one recipient. */
export function renderStaplesEmail(content: StaplesEmailContent): RenderedEmail {
  const subject = buildSubject(content);
  const weekOf = formatWeekOfLabel(content.periodKey);

  const preheader =
    content.runnerUp && content.savingsVsRunnerUp > 0
      ? `The full 5-staple price check near ${content.zipCode} is inside — plus what the winning basket actually contains.`
      : `Your 5-staple price check near ${content.zipCode} is inside.`;

  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<meta name="color-scheme" content="light" />` +
    `<title>${escapeHtml(subject)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${COLOR_PAGE};" bgcolor="${COLOR_PAGE}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${COLOR_PAGE};" bgcolor="${COLOR_PAGE}">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">` +

    // Dark brand header with the real logo.
    `<tr>${buildHeader(content)}</tr>` +

    // White body panel.
    `<tr><td bgcolor="${COLOR_CARD}" style="background-color:${COLOR_CARD};border-radius:0 0 24px 24px;padding:28px 22px 30px 22px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">` +

    `<tr><td style="padding:0 4px;">${buildWinnerCard(content)}</td></tr>` +

    sectionTitle(
      "Every staple, side by side",
      `Green means cheapest for that item. Small print is the shelf price you&#39;d actually pay.`
    ) +
    `<tr><td>${buildGridTable(content)}</td></tr>` +

    sectionTitle(
      `Inside the ${escapeHtml(content.winner.retailer)} basket`,
      `The exact products behind the ${escapeHtml(formatUsd(content.winner.total))} total.`
    ) +
    `<tr><td>${buildBasketCards(content)}</td></tr>` +

    // CTA.
    `<tr><td align="center" style="padding:32px 0 6px 0;">` +
    `<a href="${escapeHtml(content.ctaUrl)}" style="display:inline-block;background-color:${COLOR_DARK};color:#ffffff;font-family:${FONT_STACK};font-size:15px;font-weight:800;text-decoration:none;padding:16px 36px;border-radius:999px;">See every deal in Prox</a>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding-top:10px;font-family:${FONT_STACK};font-size:11.5px;color:${COLOR_MUTED};">Fresh prices land every Wednesday.</td></tr>` +

    `</table>` +
    `</td></tr>` +

    // Centered footer on the brand paper.
    `<tr><td align="center" style="padding:26px 16px 6px 16px;">` +
    `<p style="margin:0 0 4px 0;font-family:${FONT_STACK};font-size:12px;font-weight:700;color:${COLOR_MUTED};text-align:center;">Sent by Prox</p>` +
    `<p style="margin:0 0 4px 0;font-family:${FONT_STACK};font-size:11.5px;color:${COLOR_MUTED};text-align:center;">${escapeHtml(MAILING_ADDRESS)}</p>` +
    `<p style="margin:0;font-family:${FONT_STACK};font-size:11.5px;text-align:center;">` +
    `<a href="${escapeHtml(content.unsubscribeUrl)}" style="color:${COLOR_MUTED};text-decoration:underline;">Unsubscribe from these weekly emails</a>` +
    `</p>` +
    `</td></tr>` +

    `</table>` +
    `</td></tr></table>` +
    `</body></html>`;

  const text = renderStaplesEmailText(content, weekOf);

  return { subject, html, text };
}

function renderStaplesEmailText(
  content: StaplesEmailContent,
  weekOf: string
): string {
  const lines: string[] = [];
  const storeCount = content.columns.length;

  lines.push(`${buildGreetingName(content.firstName)},`);
  lines.push("");
  lines.push(
    `Chicken, beef, eggs, milk & cheese - priced at ${storeCount} ${storeCount === 1 ? "store" : "stores"} near ${content.zipCode}, week of ${weekOf}.`
  );
  lines.push("");
  lines.push("CHEAPEST FOR YOU");
  lines.push(
    `${content.winner.retailer} - ${formatUsd(content.winner.total)} (all 5 staples, sizes normalized)`
  );

  if (content.runnerUp && content.savingsVsRunnerUp > 0) {
    lines.push(
      `Save ${formatUsd(content.savingsVsRunnerUp)} vs ${content.runnerUp.retailer}`
    );
  }

  const winnerColumn = content.columns.find(
    (column) => column.retailer === content.winner.retailer
  );
  if (
    winnerColumn && !winnerColumn.isPreferred &&
    content.bestPreferredRetailer && content.savingsVsPreferred > 0
  ) {
    lines.push(
      `That's ${formatUsd(content.savingsVsPreferred)} less than ${content.bestPreferredRetailer}, your usual store.`
    );
  }

  lines.push("");
  lines.push("EVERY STAPLE, SIDE BY SIDE");
  lines.push(
    "Normalized prices compare sizes fairly; the shelf price and size follow in parentheses."
  );
  lines.push("");

  for (const row of content.rows) {
    lines.push(row.staple);
    for (const entry of row.cells) {
      const unit = formatComparisonUnit(entry.cell.comparisonLabel);
      const normalized = unit
        ? `${formatUsd(entry.cell.price)} ${unit}`
        : formatUsd(entry.cell.price);
      const packageParts = [formatUsd(entry.cell.packagePrice)];
      if (entry.cell.packageSize) packageParts.push(entry.cell.packageSize);

      lines.push(
        `  ${entry.retailer}: ${normalized} (${packageParts.join(", ")})${entry.isLowest ? "  <- lowest" : ""}`
      );
    }
    lines.push("");
  }

  lines.push("BASKET TOTALS");
  for (const column of content.columns) {
    const marks = [
      column.retailer === content.winner.retailer ? "<- cheapest" : "",
      column.isPreferred ? "" : "(nearby)",
    ].filter(Boolean);
    lines.push(
      `  ${column.retailer}: ${formatUsd(column.basket.total)}${marks.length ? "  " + marks.join(" ") : ""}`
    );
  }

  lines.push("");
  lines.push(`INSIDE THE ${content.winner.retailer.toUpperCase()} BASKET`);
  content.winner.cells.forEach((cell, index) => {
    const staple = content.rows[index]?.staple ?? "";
    lines.push(
      `  ${staple}: ${cell.productName} - ${formatUsd(cell.packagePrice)}${cell.packageSize ? ` (${cell.packageSize})` : ""}`
    );
  });

  lines.push("");
  lines.push(`See every deal in Prox: ${content.ctaUrl}`);
  lines.push("");
  lines.push("Sent by Prox");
  lines.push(MAILING_ADDRESS);
  lines.push(`Unsubscribe: ${content.unsubscribeUrl}`);

  return lines.join("\n");
}
