import type { SettingsSection } from "@/lib/settings/sections";

/**
 * Plain-language labels and help for every space setting (client-safe).
 * `tests/unit/settings-fields.test.ts` checks that every field of every
 * section in lib/settings/sections.ts is described here.
 */
export type FieldKind = "text" | "email" | "textarea" | "switch" | "number" | "optionalNumber" | "money" | "choice";
export type ChoiceOption = { value: string; label: string; description?: string };
export type FormState = Record<string, string | boolean>;
export type FieldSpec = {
  key: string;
  label: string;
  help: string;
  kind: FieldKind;
  options?: readonly ChoiceOption[];
  /** Word after a number, e.g. "days". */
  unit?: string;
  /** Hide the row while it has no effect (its value is still saved). */
  showIf?: (form: FormState) => boolean;
};

const sw = (key: string, label: string, help: string): FieldSpec => ({ key, label, help, kind: "switch" });
const num = (key: string, label: string, help: string, unit?: string): FieldSpec => ({ key, label, help, kind: "number", unit });
const money = (key: string, label: string, help: string, showIf?: FieldSpec["showIf"]): FieldSpec => ({ key, label, help, kind: "money", showIf });

export const SECTION_DESCRIPTIONS: Record<SettingsSection, string> = {
  general: "Name, contact details, time zone and currency of this makerspace.",
  lending: "Whether members can borrow, for how long and how much at once.",
  eligibility: "Who may borrow, and when borrowing pauses on its own.",
  evidence: "What staff must record when items go out and come back. A QR scan and one photo are always required.",
  fees: "Deposits, rental and fees for borrowing. Leave everything at free for a free lending library.",
  notifications: "Which alerts staff receive in the app and by email.",
  network: "How this space works with the other makerspaces on this install.",
  inventory: "Stock-room rules for inventory managers: approvals, labels, reorder points and counts.",
};

export const SETTINGS_FIELDS: Record<SettingsSection, readonly FieldSpec[]> = {
  general: [
    { key: "name", label: "Space name", help: "Shown in the sidebar, on loan slips and on the public catalogue.", kind: "text" },
    { key: "tagline", label: "Tagline", help: "One short line under the name, e.g. \"Tools and parts for every maker\". Optional.", kind: "text" },
    { key: "address", label: "Address", help: "Where members collect and return items. Shown on loan slips. Optional.", kind: "textarea" },
    { key: "contactEmail", label: "Contact email", help: "Where members can reach the desk. Shown on emails and the public catalogue. Optional.", kind: "email" },
    { key: "timezone", label: "Time zone", help: "Due dates, reminders and reports use this zone, e.g. Asia/Kolkata or Europe/London.", kind: "text" },
    { key: "currency", label: "Currency", help: "Three-letter code such as INR or GBP. Every price, deposit and fee uses it.", kind: "text" },
    { key: "tagPrefix", label: "Asset tag prefix", help: "1–6 letters or digits printed before asset numbers, e.g. TSK gives TSK-000042. New tags only.", kind: "text" },
  ],
  lending: [
    sw("lendingEnabled", "Lending", "Members can borrow items marked lendable. Turn off to pause all new requests; items already out stay on loan."),
    sw("publicCatalogue", "Public catalogue", "Anyone with the link can see lendable items and whether they're available, without signing in. Stock counts and members stay private."),
    sw("selfCheckoutEnabled", "Self-checkout", "Members can scan and take items marked self-checkout without waiting for staff, with the same photo evidence."),
    num("defaultLoanDays", "Default loan length", "How long a loan lasts unless the item or its category sets its own length.", "days"),
    num("maxLoanDays", "Longest loan", "No loan can be set longer than this, even with renewals.", "days"),
    num("maxActiveLoans", "Active loans per member", "How many loans a member can have out at once. 0 means no limit.", "loans"),
    num("maxItemsOnLoan", "Items per member", "Most units a member can hold across all their loans. 0 means no limit.", "items"),
    num("maxRenewals", "Renewals per loan", "How many times a member can extend a loan themselves. 0 turns renewals off.", "renewals"),
    num("renewalDays", "Renewal length", "How many days each renewal adds to the due date.", "days"),
    num("reminderDaysBefore", "Reminder before due", "Email the borrower this many days before the due date. 0 sends it on the day.", "days"),
    num("overdueReminderDays", "Overdue reminders", "Repeat the overdue reminder every this many days until the items come back.", "days"),
  ],
  eligibility: [
    sw("selfJoin", "Anyone can join", "Signed-in people can join this space as a member from the public catalogue. Off means invitation only."),
    sw("requireVerifiedEmail", "Confirmed email needed", "Members must confirm their email address before they can borrow."),
    sw("requireMemberNumber", "Membership number needed", "Staff must record a membership number for a member before they can borrow."),
    sw("restrictWhenOverdue", "Pause borrowing when overdue", "A member with an overdue loan can't borrow more until it comes back. Lifts on its own."),
    sw("restrictOnIncident", "Pause borrowing after loss or damage", "A member with an unresolved lost or damaged item can't borrow more until it's resolved. Lifts on its own."),
  ],
  evidence: [
    num("minEvidencePhotos", "Photos at each handover", "How many photos staff take when items go out and when they come back (1 to 3).", "photos"),
    sw("requireContainer", "Pack loans in a container", "Every loan goes out in a QR-labelled bag or box that is scanned at issue and at return."),
    sw("requireIssueRemarks", "Remarks at issue", "Staff must write a note about the condition of items when they hand them over. Return remarks are always required."),
  ],
  fees: [
    {
      key: "depositMode", label: "Deposit", help: "A refundable amount collected before items go out and returned when they come back in good shape.", kind: "choice",
      options: [
        { value: "NONE", label: "No deposit", description: "Members borrow without paying anything upfront." },
        { value: "FIXED", label: "One deposit per loan", description: "The same amount for every loan, however many items." },
        { value: "PER_ITEM", label: "Deposit per item", description: "The amount below for each unit, unless the item sets its own." },
      ],
    },
    money("depositMinor", "Deposit amount", "Items and categories can set their own deposit.", (f) => f.depositMode !== "NONE"),
    {
      key: "rentalMode", label: "Rental", help: "A fee for using the item, kept by the space.", kind: "choice",
      options: [
        { value: "FREE", label: "Free", description: "No rental fee." },
        { value: "PER_DAY", label: "Per day", description: "Charged for each day of the loan." },
        { value: "PER_WEEK", label: "Per week", description: "Charged for each started week." },
        { value: "FLAT", label: "Flat fee", description: "One fee per loan." },
      ],
    },
    money("rentalMinor", "Rental amount", "Per item. Items and categories can set their own rental.", (f) => f.rentalMode !== "FREE"),
    money("lateFeePerDayMinor", "Late fee per day", "Charged for each day a loan is late, after the grace days. 0 means no late fee."),
    money("lateFeeCapMinor", "Late fee cap", "The most a single loan can be charged in late fees. 0 means no cap.", (f) => Number(f.lateFeePerDayMinor) > 0),
    num("lateFeeGraceDays", "Grace days", "Days after the due date before late fees start.", "days"),
    {
      key: "damageChargeMode", label: "Damage and loss charge", help: "What a member pays when an item comes back damaged or doesn't come back.", kind: "choice",
      options: [
        { value: "NONE", label: "No charge", description: "Staff resolve damage and losses without charging." },
        { value: "REPLACEMENT_COST", label: "Replacement cost", description: "The item's replacement cost, or its unit cost when none is set." },
        { value: "FIXED", label: "Fixed amount", description: "The same amount for every damaged or lost unit." },
      ],
    },
    money("damageChargeMinor", "Damage charge amount", "Charged per damaged or lost unit.", (f) => f.damageChargeMode === "FIXED"),
    sw("paymentBeforeIssue", "Pay before collecting", "Deposits and rental must be paid (or marked pay later) before staff can hand items over."),
    sw("payLaterEnabled", "Pay later", "Members can choose to pay later. Charges stay pending on their account until paid."),
  ],
  notifications: [
    sw("notifyStaffOnRequest", "New loan requests", "Staff get an alert when a member asks to borrow something that needs approval."),
    sw("notifyLowStock", "Low stock", "Inventory managers get an alert when an item falls to its reorder point."),
    num("overdueEscalateDays", "Escalate overdue loans", "Alert managers when a loan is this many days overdue. 0 turns escalation off.", "days"),
  ],
  network: [
    sw("acceptsTransfers", "Accept transfers", "Other spaces on this install can send stock here or ask to borrow from here. Off refuses new transfers from other spaces."),
    sw("shareStockWithSpaces", "Share stock list", "Staff of other spaces can see item names and available counts here when they request stock. Nothing else is shared."),
  ],
  inventory: [
    sw("internalTransferApproval", "Approve moves between locations", "Moving stock between locations of this space needs an inventory manager's approval first. Off approves them at once."),
    {
      key: "labelSize", label: "Label size", help: "The default size for printed QR labels.", kind: "choice",
      options: [
        { value: "SMALL", label: "Small", description: "For bins and small parts." },
        { value: "MEDIUM", label: "Medium", description: "For most tools and shelves." },
        { value: "LARGE", label: "Large", description: "For cabinets, rooms and big machines." },
      ],
    },
    sw("labelShowName", "Name on labels", "Print the item or location name under the QR code."),
    sw("labelShowLocation", "Location on labels", "Print the item's home location on its label."),
    { key: "defaultReorderPoint", label: "Default reorder point", help: "New items get this low-stock threshold unless they set their own. Leave blank for no default.", kind: "optionalNumber", unit: "units" },
    { key: "countVarianceThreshold", label: "Count check threshold", help: "Count lines that differ by more than this need a second person to post. Leave blank to always need a second person.", kind: "optionalNumber", unit: "units" },
  ],
};
