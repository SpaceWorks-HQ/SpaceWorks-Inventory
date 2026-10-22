/**
 * The loan workflow: the single source of truth for loan state. Every UI
 * (member pages, desk, self-checkout, API) goes through these functions,
 * inside one interactive transaction each; never update Loan.status anywhere else.
 */
export { requestLoan, approveLoan, rejectLoan, cancelLoan, type RequestLine } from "./request";
export { issueLoan } from "./issue";
export { returnLoan, type ReturnLine } from "./return";
export { renewLoan, setDueDate } from "./renew";
export { selfCheckout } from "./selfCheckout";
export { resolveIncident } from "./incidents";
export type { Actor } from "./common";
