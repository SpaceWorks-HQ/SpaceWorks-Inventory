/**
 * The transfer workflow: the single source of truth for transfer state.
 * Each function runs in one interactive transaction and checks that the
 * acting space is the side that performs the step; callers check the
 * actor's role in that space first.
 */
export { requestTransfer, approveTransfer, rejectTransfer, cancelTransfer, assertSide, type TransferRequest } from "./request";
export { dispatchTransfer, type DispatchInput } from "./dispatch";
export { receiveTransfer, declareMissing, type ReceiveLine } from "./receive";
export { sendBack, receiveReturn } from "./returns";
export type { Actor } from "./common";
