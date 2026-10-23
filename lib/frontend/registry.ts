// Generated fixed endpoint allowlist.
import "server-only";
import { loadAccountPage as endpoint0 } from "@/lib/views/generated/account-page-loadAccountPage";
import { loadAdminMfaPage as endpoint1 } from "@/lib/views/generated/admin-mfa-page-loadAdminMfaPage";
import { loadAdminJobsPage as endpoint2 } from "@/lib/views/generated/admin-jobs-page-loadAdminJobsPage";
import { loadAdminLayout as endpoint3 } from "@/lib/views/generated/admin-layout-loadAdminLayout";
import { loadAdminOutboxPage as endpoint4 } from "@/lib/views/generated/admin-outbox-page-loadAdminOutboxPage";
import { loadAdminOverviewPage as endpoint5 } from "@/lib/views/generated/admin-page-loadAdminOverviewPage";
import { loadAdminSettingsPage as endpoint6 } from "@/lib/views/generated/admin-settings-page-loadAdminSettingsPage";
import { loadAdminSpacesPage as endpoint7 } from "@/lib/views/generated/admin-spaces-page-loadAdminSpacesPage";
import { loadAdminUsersPage as endpoint8 } from "@/lib/views/generated/admin-users-page-loadAdminUsersPage";
import { loadPublicCataloguePage as endpoint9 } from "@/lib/views/generated/c-spaceSlug-page-loadPublicCataloguePage";
import { loadInvitePage as endpoint10 } from "@/lib/views/generated/invite-token-page-loadInvitePage";
import { loadMagicLinkPage as endpoint11 } from "@/lib/views/generated/login-link-token-page-loadMagicLinkPage";
import { loadLoginPage as endpoint12 } from "@/lib/views/generated/login-page-loadLoginPage";
import { loadHomeRedirect as endpoint13 } from "@/lib/views/generated/page-loadHomeRedirect";
import { loadQrLandingPage as endpoint14 } from "@/lib/views/generated/q-code-page-loadQrLandingPage";
import { loadResetPasswordPage as endpoint15 } from "@/lib/views/generated/reset-password-token-page-loadResetPasswordPage";
import { loadAssetPage as endpoint16 } from "@/lib/views/generated/s-spaceSlug-assets-assetId-page-loadAssetPage";
import { loadAssetsPage as endpoint17 } from "@/lib/views/generated/s-spaceSlug-assets-page-loadAssetsPage";
import { loadAuditLogPage as endpoint18 } from "@/lib/views/generated/s-spaceSlug-audit-page-loadAuditLogPage";
import { loadCataloguePage as endpoint19 } from "@/lib/views/generated/s-spaceSlug-catalogue-page-loadCataloguePage";
import { loadSelfCheckoutPage as endpoint20 } from "@/lib/views/generated/s-spaceSlug-catalogue-self-checkout-page-loadSelfCheckoutPage";
import { loadCountPage as endpoint21 } from "@/lib/views/generated/s-spaceSlug-counts-countId-page-loadCountPage";
import { loadNewCountPage as endpoint22 } from "@/lib/views/generated/s-spaceSlug-counts-new-page-loadNewCountPage";
import { loadCountsPage as endpoint23 } from "@/lib/views/generated/s-spaceSlug-counts-page-loadCountsPage";
import { loadImportPage as endpoint24 } from "@/lib/views/generated/s-spaceSlug-import-page-loadImportPage";
import { loadEditItemPage as endpoint25 } from "@/lib/views/generated/s-spaceSlug-items-itemId-edit-page-loadEditItemPage";
import { loadItemPage as endpoint26 } from "@/lib/views/generated/s-spaceSlug-items-itemId-page-loadItemPage";
import { loadNewItemPage as endpoint27 } from "@/lib/views/generated/s-spaceSlug-items-new-page-loadNewItemPage";
import { loadItemsPage as endpoint28 } from "@/lib/views/generated/s-spaceSlug-items-page-loadItemsPage";
import { loadKitsPage as endpoint29 } from "@/lib/views/generated/s-spaceSlug-kits-page-loadKitsPage";
import { loadLabelsPage as endpoint30 } from "@/lib/views/generated/s-spaceSlug-labels-page-loadLabelsPage";
import { loadgenerateMetadata as endpoint31 } from "@/lib/views/generated/s-spaceSlug-layout-loadgenerateMetadata";
import { loadSpaceLayout as endpoint32 } from "@/lib/views/generated/s-spaceSlug-layout-loadSpaceLayout";
import { loadLoanPage as endpoint33 } from "@/lib/views/generated/s-spaceSlug-loans-loanId-page-loadLoanPage";
import { loadLoansPage as endpoint34 } from "@/lib/views/generated/s-spaceSlug-loans-page-loadLoansPage";
import { loadLocationsPage as endpoint35 } from "@/lib/views/generated/s-spaceSlug-locations-page-loadLocationsPage";
import { loadMembersPage as endpoint36 } from "@/lib/views/generated/s-spaceSlug-members-page-loadMembersPage";
import { loadMyLoanPage as endpoint37 } from "@/lib/views/generated/s-spaceSlug-my-loans-loanId-page-loadMyLoanPage";
import { loadMyLoansPage as endpoint38 } from "@/lib/views/generated/s-spaceSlug-my-loans-page-loadMyLoansPage";
import { loadNotificationsPage as endpoint39 } from "@/lib/views/generated/s-spaceSlug-notifications-page-loadNotificationsPage";
import { loadSpaceHomePage as endpoint40 } from "@/lib/views/generated/s-spaceSlug-page-loadSpaceHomePage";
import { loadPayPage as endpoint41 } from "@/lib/views/generated/s-spaceSlug-pay-paymentId-page-loadPayPage";
import { loadPurchasesPage as endpoint42 } from "@/lib/views/generated/s-spaceSlug-purchases-page-loadPurchasesPage";
import { loadReportsPage as endpoint43 } from "@/lib/views/generated/s-spaceSlug-reports-page-loadReportsPage";
import { loadScanPage as endpoint44 } from "@/lib/views/generated/s-spaceSlug-scan-page-loadScanPage";
import { loadIntegrationsSettingsPage as endpoint45 } from "@/lib/views/generated/s-spaceSlug-settings-integrations-page-loadIntegrationsSettingsPage";
import { loadInventorySettingsPage as endpoint46 } from "@/lib/views/generated/s-spaceSlug-settings-inventory-page-loadInventorySettingsPage";
import { loadSpaceSettingsPage as endpoint47 } from "@/lib/views/generated/s-spaceSlug-settings-page-loadSpaceSettingsPage";
import { loadPaymentSettingsPage as endpoint48 } from "@/lib/views/generated/s-spaceSlug-settings-payments-page-loadPaymentSettingsPage";
import { loadRolesPage as endpoint49 } from "@/lib/views/generated/s-spaceSlug-settings-roles-page-loadRolesPage";
import { loadSpaceSetupPage as endpoint50 } from "@/lib/views/generated/s-spaceSlug-setup-page-loadSpaceSetupPage";
import { loadStockMovementsPage as endpoint51 } from "@/lib/views/generated/s-spaceSlug-stock-movements-page-loadStockMovementsPage";
import { loadStockPage as endpoint52 } from "@/lib/views/generated/s-spaceSlug-stock-page-loadStockPage";
import { loadTransferPage as endpoint53 } from "@/lib/views/generated/s-spaceSlug-transfers-transferId-page-loadTransferPage";
import { loadNewTransferPage as endpoint54 } from "@/lib/views/generated/s-spaceSlug-transfers-new-page-loadNewTransferPage";
import { loadTransfersPage as endpoint55 } from "@/lib/views/generated/s-spaceSlug-transfers-page-loadTransfersPage";
import { loadSetupPage as endpoint56 } from "@/lib/views/generated/setup-page-loadSetupPage";
import { updateProfile as endpoint57 } from "@/app/actions/account";
import { changePassword as endpoint58 } from "@/app/actions/account";
import { beginMfaEnrollment as endpoint59 } from "@/app/actions/account";
import { confirmMfaEnrollment as endpoint60 } from "@/app/actions/account";
import { disableMfa as endpoint61 } from "@/app/actions/account";
import { signOutEverywhere as endpoint62 } from "@/app/actions/account";
import { verifyAdminMfa as endpoint63 } from "@/app/actions/admin";
import { updateInstanceSettingsAction as endpoint64 } from "@/app/actions/admin";
import { adminCreateSpace as endpoint65 } from "@/app/actions/admin";
import { adminSetUserDisabled as endpoint66 } from "@/app/actions/admin";
import { adminSetSpaceArchived as endpoint67 } from "@/app/actions/admin";
import { completeSetup as endpoint68 } from "@/app/actions/auth";
import { requestPasswordReset as endpoint69 } from "@/app/actions/auth";
import { requestMagicLink as endpoint70 } from "@/app/actions/auth";
import { resetPassword as endpoint71 } from "@/app/actions/auth";
import { acceptInviteWithNewAccount as endpoint72 } from "@/app/actions/auth";
import { acceptInviteAsCurrentUser as endpoint73 } from "@/app/actions/auth";
import { createItemAction as endpoint74 } from "@/app/actions/catalogue";
import { updateItemAction as endpoint75 } from "@/app/actions/catalogue";
import { setItemArchivedAction as endpoint76 } from "@/app/actions/catalogue";
import { uploadItemImagesAction as endpoint77 } from "@/app/actions/catalogue";
import { removeItemImageAction as endpoint78 } from "@/app/actions/catalogue";
import { reorderItemImagesAction as endpoint79 } from "@/app/actions/catalogue";
import { quickAddCategoryAction as endpoint80 } from "@/app/actions/catalogue";
import { quickAddUnitAction as endpoint81 } from "@/app/actions/catalogue";
import { createAssetsAction as endpoint82 } from "@/app/actions/catalogue";
import { updateAssetAction as endpoint83 } from "@/app/actions/catalogue";
import { saveLocationAction as endpoint84 } from "@/app/actions/catalogue";
import { setLocationArchivedAction as endpoint85 } from "@/app/actions/catalogue";
import { buildLocationsAction as endpoint86 } from "@/app/actions/catalogue";
import { saveKitAction as endpoint87 } from "@/app/actions/catalogue";
import { setKitArchivedAction as endpoint88 } from "@/app/actions/catalogue";
import { createContainersAction as endpoint89 } from "@/app/actions/catalogue";
import { setContainerArchivedAction as endpoint90 } from "@/app/actions/catalogue";
import { qrCodeAction as endpoint91 } from "@/app/actions/catalogue";
import { startCountAction as endpoint92 } from "@/app/actions/counts";
import { recordCountAction as endpoint93 } from "@/app/actions/counts";
import { addCountLineAction as endpoint94 } from "@/app/actions/counts";
import { scanCountAssetAction as endpoint95 } from "@/app/actions/counts";
import { refreshCountLineAction as endpoint96 } from "@/app/actions/counts";
import { submitCountAction as endpoint97 } from "@/app/actions/counts";
import { reopenCountAction as endpoint98 } from "@/app/actions/counts";
import { postCountAction as endpoint99 } from "@/app/actions/counts";
import { cancelCountAction as endpoint100 } from "@/app/actions/counts";
import { saveCountScheduleAction as endpoint101 } from "@/app/actions/counts";
import { setCountScheduleActiveAction as endpoint102 } from "@/app/actions/counts";
import { previewImportAction as endpoint103 } from "@/app/actions/import";
import { recheckImportAction as endpoint104 } from "@/app/actions/import";
import { applyImportAction as endpoint105 } from "@/app/actions/import";
import { loadSampleDataAction as endpoint106 } from "@/app/actions/import";
import { createApiKeyAction as endpoint107 } from "@/app/actions/integrations";
import { revokeApiKeyAction as endpoint108 } from "@/app/actions/integrations";
import { createWebhookAction as endpoint109 } from "@/app/actions/integrations";
import { updateWebhookAction as endpoint110 } from "@/app/actions/integrations";
import { setWebhookEnabledAction as endpoint111 } from "@/app/actions/integrations";
import { rotateWebhookSecretAction as endpoint112 } from "@/app/actions/integrations";
import { deleteWebhookAction as endpoint113 } from "@/app/actions/integrations";
import { sendWebhookTestAction as endpoint114 } from "@/app/actions/integrations";
import { retryWebhookDeliveryAction as endpoint115 } from "@/app/actions/integrations";
import { manageJobsAction as endpoint116 } from "@/app/actions/jobs";
import { approveLoanAction as endpoint117 } from "@/app/actions/loans";
import { rejectLoanAction as endpoint118 } from "@/app/actions/loans";
import { cancelLoanAction as endpoint119 } from "@/app/actions/loans";
import { issueLoanAction as endpoint120 } from "@/app/actions/loans";
import { returnLoanAction as endpoint121 } from "@/app/actions/loans";
import { renewLoanAction as endpoint122 } from "@/app/actions/loans";
import { setDueDateAction as endpoint123 } from "@/app/actions/loans";
import { resolveIncidentAction as endpoint124 } from "@/app/actions/loans";
import { requestLoanAction as endpoint125 } from "@/app/actions/loans";
import { selfCheckoutAction as endpoint126 } from "@/app/actions/loans";
import { renewMyLoanAction as endpoint127 } from "@/app/actions/loans";
import { cancelMyLoanAction as endpoint128 } from "@/app/actions/loans";
import { selfReturnAction as endpoint129 } from "@/app/actions/loans";
import { createInvitationAction as endpoint130 } from "@/app/actions/members";
import { resendInvitationAction as endpoint131 } from "@/app/actions/members";
import { revokeInvitationAction as endpoint132 } from "@/app/actions/members";
import { changeMemberRoleAction as endpoint133 } from "@/app/actions/members";
import { setMemberStatusAction as endpoint134 } from "@/app/actions/members";
import { removeMemberAction as endpoint135 } from "@/app/actions/members";
import { leaveSpaceAction as endpoint136 } from "@/app/actions/members";
import { setBorrowingAccessAction as endpoint137 } from "@/app/actions/members";
import { markNotificationsReadAction as endpoint138 } from "@/app/actions/notifications";
import { markSpaceNotificationsReadAction as endpoint139 } from "@/app/actions/notifications";
import { savePaymentSettingsAction as endpoint140 } from "@/app/actions/payments";
import { testPaymentConnectionAction as endpoint141 } from "@/app/actions/payments";
import { payNowAction as endpoint142 } from "@/app/actions/payments";
import { confirmRazorpayPaymentAction as endpoint143 } from "@/app/actions/payments";
import { payLaterAction as endpoint144 } from "@/app/actions/payments";
import { submitOfflinePaymentAction as endpoint145 } from "@/app/actions/payments";
import { markPayLaterAction as endpoint146 } from "@/app/actions/payments";
import { recordOfflinePaymentAction as endpoint147 } from "@/app/actions/payments";
import { reviewOfflinePaymentAction as endpoint148 } from "@/app/actions/payments";
import { waiveChargeAction as endpoint149 } from "@/app/actions/payments";
import { returnDepositAction as endpoint150 } from "@/app/actions/payments";
import { refundPaymentAction as endpoint151 } from "@/app/actions/payments";
import { retryRefundAction as endpoint152 } from "@/app/actions/payments";
import { createPurchaseAction as endpoint153 } from "@/app/actions/purchases";
import { addSuggestionAction as endpoint154 } from "@/app/actions/purchases";
import { movePurchaseAction as endpoint155 } from "@/app/actions/purchases";
import { receivePurchaseAction as endpoint156 } from "@/app/actions/purchases";
import { resolveScanAction as endpoint157 } from "@/app/actions/scan";
import { updateSettingsSection as endpoint158 } from "@/app/actions/settings";
import { uploadSpaceLogoAction as endpoint159 } from "@/app/actions/settings";
import { removeSpaceLogoAction as endpoint160 } from "@/app/actions/settings";
import { deleteSpaceAction as endpoint161 } from "@/app/actions/settings";
import { saveCategoryAction as endpoint162 } from "@/app/actions/settings";
import { deleteCategoryAction as endpoint163 } from "@/app/actions/settings";
import { saveUnitAction as endpoint164 } from "@/app/actions/settings";
import { deleteUnitAction as endpoint165 } from "@/app/actions/settings";
import { saveSupplierAction as endpoint166 } from "@/app/actions/settings";
import { setSupplierArchivedAction as endpoint167 } from "@/app/actions/settings";
import { saveLocationPlanAction as endpoint168 } from "@/app/actions/setup";
import { addCategoriesAction as endpoint169 } from "@/app/actions/setup";
import { addUnitAction as endpoint170 } from "@/app/actions/setup";
import { finishSetupAction as endpoint171 } from "@/app/actions/setup";
import { joinSpaceAction as endpoint172 } from "@/app/actions/spaces";
import { receiveStockAction as endpoint173 } from "@/app/actions/stock";
import { adjustStockAction as endpoint174 } from "@/app/actions/stock";
import { moveStockAction as endpoint175 } from "@/app/actions/stock";
import { quarantineStockAction as endpoint176 } from "@/app/actions/stock";
import { resolveQuarantineAction as endpoint177 } from "@/app/actions/stock";
import { changeAssetStateAction as endpoint178 } from "@/app/actions/stock";
import { moveAssetAction as endpoint179 } from "@/app/actions/stock";
import { requestTransferAction as endpoint180 } from "@/app/actions/transfers";
import { approveTransferAction as endpoint181 } from "@/app/actions/transfers";
import { rejectTransferAction as endpoint182 } from "@/app/actions/transfers";
import { cancelTransferAction as endpoint183 } from "@/app/actions/transfers";
import { dispatchTransferAction as endpoint184 } from "@/app/actions/transfers";
import { receiveTransferAction as endpoint185 } from "@/app/actions/transfers";
import { declareMissingAction as endpoint186 } from "@/app/actions/transfers";
import { sendBackAction as endpoint187 } from "@/app/actions/transfers";
import { receiveReturnAction as endpoint188 } from "@/app/actions/transfers";
export const viewReaders = Object.freeze({
"account-page:loadAccountPage": endpoint0,
"admin-mfa-page:loadAdminMfaPage": endpoint1,
"admin-jobs-page:loadAdminJobsPage": endpoint2,
"admin-layout:loadAdminLayout": endpoint3,
"admin-outbox-page:loadAdminOutboxPage": endpoint4,
"admin-page:loadAdminOverviewPage": endpoint5,
"admin-settings-page:loadAdminSettingsPage": endpoint6,
"admin-spaces-page:loadAdminSpacesPage": endpoint7,
"admin-users-page:loadAdminUsersPage": endpoint8,
"c-spaceSlug-page:loadPublicCataloguePage": endpoint9,
"invite-token-page:loadInvitePage": endpoint10,
"login-link-token-page:loadMagicLinkPage": endpoint11,
"login-page:loadLoginPage": endpoint12,
"page:loadHomeRedirect": endpoint13,
"q-code-page:loadQrLandingPage": endpoint14,
"reset-password-token-page:loadResetPasswordPage": endpoint15,
"s-spaceSlug-assets-assetId-page:loadAssetPage": endpoint16,
"s-spaceSlug-assets-page:loadAssetsPage": endpoint17,
"s-spaceSlug-audit-page:loadAuditLogPage": endpoint18,
"s-spaceSlug-catalogue-page:loadCataloguePage": endpoint19,
"s-spaceSlug-catalogue-self-checkout-page:loadSelfCheckoutPage": endpoint20,
"s-spaceSlug-counts-countId-page:loadCountPage": endpoint21,
"s-spaceSlug-counts-new-page:loadNewCountPage": endpoint22,
"s-spaceSlug-counts-page:loadCountsPage": endpoint23,
"s-spaceSlug-import-page:loadImportPage": endpoint24,
"s-spaceSlug-items-itemId-edit-page:loadEditItemPage": endpoint25,
"s-spaceSlug-items-itemId-page:loadItemPage": endpoint26,
"s-spaceSlug-items-new-page:loadNewItemPage": endpoint27,
"s-spaceSlug-items-page:loadItemsPage": endpoint28,
"s-spaceSlug-kits-page:loadKitsPage": endpoint29,
"s-spaceSlug-labels-page:loadLabelsPage": endpoint30,
"s-spaceSlug-layout:loadgenerateMetadata": endpoint31,
"s-spaceSlug-layout:loadSpaceLayout": endpoint32,
"s-spaceSlug-loans-loanId-page:loadLoanPage": endpoint33,
"s-spaceSlug-loans-page:loadLoansPage": endpoint34,
"s-spaceSlug-locations-page:loadLocationsPage": endpoint35,
"s-spaceSlug-members-page:loadMembersPage": endpoint36,
"s-spaceSlug-my-loans-loanId-page:loadMyLoanPage": endpoint37,
"s-spaceSlug-my-loans-page:loadMyLoansPage": endpoint38,
"s-spaceSlug-notifications-page:loadNotificationsPage": endpoint39,
"s-spaceSlug-page:loadSpaceHomePage": endpoint40,
"s-spaceSlug-pay-paymentId-page:loadPayPage": endpoint41,
"s-spaceSlug-purchases-page:loadPurchasesPage": endpoint42,
"s-spaceSlug-reports-page:loadReportsPage": endpoint43,
"s-spaceSlug-scan-page:loadScanPage": endpoint44,
"s-spaceSlug-settings-integrations-page:loadIntegrationsSettingsPage": endpoint45,
"s-spaceSlug-settings-inventory-page:loadInventorySettingsPage": endpoint46,
"s-spaceSlug-settings-page:loadSpaceSettingsPage": endpoint47,
"s-spaceSlug-settings-payments-page:loadPaymentSettingsPage": endpoint48,
"s-spaceSlug-settings-roles-page:loadRolesPage": endpoint49,
"s-spaceSlug-setup-page:loadSpaceSetupPage": endpoint50,
"s-spaceSlug-stock-movements-page:loadStockMovementsPage": endpoint51,
"s-spaceSlug-stock-page:loadStockPage": endpoint52,
"s-spaceSlug-transfers-transferId-page:loadTransferPage": endpoint53,
"s-spaceSlug-transfers-new-page:loadNewTransferPage": endpoint54,
"s-spaceSlug-transfers-page:loadTransfersPage": endpoint55,
"setup-page:loadSetupPage": endpoint56,
});
export const backendActions = Object.freeze({
"account:updateProfile": endpoint57,
"account:changePassword": endpoint58,
"account:beginMfaEnrollment": endpoint59,
"account:confirmMfaEnrollment": endpoint60,
"account:disableMfa": endpoint61,
"account:signOutEverywhere": endpoint62,
"admin:verifyAdminMfa": endpoint63,
"admin:updateInstanceSettingsAction": endpoint64,
"admin:adminCreateSpace": endpoint65,
"admin:adminSetUserDisabled": endpoint66,
"admin:adminSetSpaceArchived": endpoint67,
"auth:completeSetup": endpoint68,
"auth:requestPasswordReset": endpoint69,
"auth:requestMagicLink": endpoint70,
"auth:resetPassword": endpoint71,
"auth:acceptInviteWithNewAccount": endpoint72,
"auth:acceptInviteAsCurrentUser": endpoint73,
"catalogue:createItemAction": endpoint74,
"catalogue:updateItemAction": endpoint75,
"catalogue:setItemArchivedAction": endpoint76,
"catalogue:uploadItemImagesAction": endpoint77,
"catalogue:removeItemImageAction": endpoint78,
"catalogue:reorderItemImagesAction": endpoint79,
"catalogue:quickAddCategoryAction": endpoint80,
"catalogue:quickAddUnitAction": endpoint81,
"catalogue:createAssetsAction": endpoint82,
"catalogue:updateAssetAction": endpoint83,
"catalogue:saveLocationAction": endpoint84,
"catalogue:setLocationArchivedAction": endpoint85,
"catalogue:buildLocationsAction": endpoint86,
"catalogue:saveKitAction": endpoint87,
"catalogue:setKitArchivedAction": endpoint88,
"catalogue:createContainersAction": endpoint89,
"catalogue:setContainerArchivedAction": endpoint90,
"catalogue:qrCodeAction": endpoint91,
"counts:startCountAction": endpoint92,
"counts:recordCountAction": endpoint93,
"counts:addCountLineAction": endpoint94,
"counts:scanCountAssetAction": endpoint95,
"counts:refreshCountLineAction": endpoint96,
"counts:submitCountAction": endpoint97,
"counts:reopenCountAction": endpoint98,
"counts:postCountAction": endpoint99,
"counts:cancelCountAction": endpoint100,
"counts:saveCountScheduleAction": endpoint101,
"counts:setCountScheduleActiveAction": endpoint102,
"import:previewImportAction": endpoint103,
"import:recheckImportAction": endpoint104,
"import:applyImportAction": endpoint105,
"import:loadSampleDataAction": endpoint106,
"integrations:createApiKeyAction": endpoint107,
"integrations:revokeApiKeyAction": endpoint108,
"integrations:createWebhookAction": endpoint109,
"integrations:updateWebhookAction": endpoint110,
"integrations:setWebhookEnabledAction": endpoint111,
"integrations:rotateWebhookSecretAction": endpoint112,
"integrations:deleteWebhookAction": endpoint113,
"integrations:sendWebhookTestAction": endpoint114,
"integrations:retryWebhookDeliveryAction": endpoint115,
"jobs:manageJobsAction": endpoint116,
"loans:approveLoanAction": endpoint117,
"loans:rejectLoanAction": endpoint118,
"loans:cancelLoanAction": endpoint119,
"loans:issueLoanAction": endpoint120,
"loans:returnLoanAction": endpoint121,
"loans:renewLoanAction": endpoint122,
"loans:setDueDateAction": endpoint123,
"loans:resolveIncidentAction": endpoint124,
"loans:requestLoanAction": endpoint125,
"loans:selfCheckoutAction": endpoint126,
"loans:renewMyLoanAction": endpoint127,
"loans:cancelMyLoanAction": endpoint128,
"loans:selfReturnAction": endpoint129,
"members:createInvitationAction": endpoint130,
"members:resendInvitationAction": endpoint131,
"members:revokeInvitationAction": endpoint132,
"members:changeMemberRoleAction": endpoint133,
"members:setMemberStatusAction": endpoint134,
"members:removeMemberAction": endpoint135,
"members:leaveSpaceAction": endpoint136,
"members:setBorrowingAccessAction": endpoint137,
"notifications:markNotificationsReadAction": endpoint138,
"notifications:markSpaceNotificationsReadAction": endpoint139,
"payments:savePaymentSettingsAction": endpoint140,
"payments:testPaymentConnectionAction": endpoint141,
"payments:payNowAction": endpoint142,
"payments:confirmRazorpayPaymentAction": endpoint143,
"payments:payLaterAction": endpoint144,
"payments:submitOfflinePaymentAction": endpoint145,
"payments:markPayLaterAction": endpoint146,
"payments:recordOfflinePaymentAction": endpoint147,
"payments:reviewOfflinePaymentAction": endpoint148,
"payments:waiveChargeAction": endpoint149,
"payments:returnDepositAction": endpoint150,
"payments:refundPaymentAction": endpoint151,
"payments:retryRefundAction": endpoint152,
"purchases:createPurchaseAction": endpoint153,
"purchases:addSuggestionAction": endpoint154,
"purchases:movePurchaseAction": endpoint155,
"purchases:receivePurchaseAction": endpoint156,
"scan:resolveScanAction": endpoint157,
"settings:updateSettingsSection": endpoint158,
"settings:uploadSpaceLogoAction": endpoint159,
"settings:removeSpaceLogoAction": endpoint160,
"settings:deleteSpaceAction": endpoint161,
"settings:saveCategoryAction": endpoint162,
"settings:deleteCategoryAction": endpoint163,
"settings:saveUnitAction": endpoint164,
"settings:deleteUnitAction": endpoint165,
"settings:saveSupplierAction": endpoint166,
"settings:setSupplierArchivedAction": endpoint167,
"setup:saveLocationPlanAction": endpoint168,
"setup:addCategoriesAction": endpoint169,
"setup:addUnitAction": endpoint170,
"setup:finishSetupAction": endpoint171,
"spaces:joinSpaceAction": endpoint172,
"stock:receiveStockAction": endpoint173,
"stock:adjustStockAction": endpoint174,
"stock:moveStockAction": endpoint175,
"stock:quarantineStockAction": endpoint176,
"stock:resolveQuarantineAction": endpoint177,
"stock:changeAssetStateAction": endpoint178,
"stock:moveAssetAction": endpoint179,
"transfers:requestTransferAction": endpoint180,
"transfers:approveTransferAction": endpoint181,
"transfers:rejectTransferAction": endpoint182,
"transfers:cancelTransferAction": endpoint183,
"transfers:dispatchTransferAction": endpoint184,
"transfers:receiveTransferAction": endpoint185,
"transfers:declareMissingAction": endpoint186,
"transfers:sendBackAction": endpoint187,
"transfers:receiveReturnAction": endpoint188,
});
