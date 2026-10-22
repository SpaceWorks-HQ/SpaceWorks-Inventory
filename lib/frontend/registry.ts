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
import { loadInvitePage as endpoint9 } from "@/lib/views/generated/invite-token-page-loadInvitePage";
import { loadMagicLinkPage as endpoint10 } from "@/lib/views/generated/login-link-token-page-loadMagicLinkPage";
import { loadLoginPage as endpoint11 } from "@/lib/views/generated/login-page-loadLoginPage";
import { loadHomeRedirect as endpoint12 } from "@/lib/views/generated/page-loadHomeRedirect";
import { loadResetPasswordPage as endpoint13 } from "@/lib/views/generated/reset-password-token-page-loadResetPasswordPage";
import { loadgenerateMetadata as endpoint14 } from "@/lib/views/generated/s-spaceSlug-layout-loadgenerateMetadata";
import { loadSpaceLayout as endpoint15 } from "@/lib/views/generated/s-spaceSlug-layout-loadSpaceLayout";
import { loadSpaceHomePage as endpoint16 } from "@/lib/views/generated/s-spaceSlug-page-loadSpaceHomePage";
import { loadSetupPage as endpoint17 } from "@/lib/views/generated/setup-page-loadSetupPage";
import { updateProfile as endpoint18 } from "@/app/actions/account";
import { changePassword as endpoint19 } from "@/app/actions/account";
import { beginMfaEnrollment as endpoint20 } from "@/app/actions/account";
import { confirmMfaEnrollment as endpoint21 } from "@/app/actions/account";
import { disableMfa as endpoint22 } from "@/app/actions/account";
import { signOutEverywhere as endpoint23 } from "@/app/actions/account";
import { verifyAdminMfa as endpoint24 } from "@/app/actions/admin";
import { updateInstanceSettingsAction as endpoint25 } from "@/app/actions/admin";
import { adminCreateSpace as endpoint26 } from "@/app/actions/admin";
import { adminSetUserDisabled as endpoint27 } from "@/app/actions/admin";
import { adminSetSpaceArchived as endpoint28 } from "@/app/actions/admin";
import { createApiTokenAction as endpoint29 } from "@/app/actions/apiTokens";
import { revokeApiTokenAction as endpoint30 } from "@/app/actions/apiTokens";
import { completeSetup as endpoint31 } from "@/app/actions/auth";
import { requestPasswordReset as endpoint32 } from "@/app/actions/auth";
import { requestMagicLink as endpoint33 } from "@/app/actions/auth";
import { resetPassword as endpoint34 } from "@/app/actions/auth";
import { acceptInviteWithNewAccount as endpoint35 } from "@/app/actions/auth";
import { acceptInviteAsCurrentUser as endpoint36 } from "@/app/actions/auth";
import { manageJobsAction as endpoint37 } from "@/app/actions/jobs";
import { createInvitationAction as endpoint38 } from "@/app/actions/members";
import { resendInvitationAction as endpoint39 } from "@/app/actions/members";
import { revokeInvitationAction as endpoint40 } from "@/app/actions/members";
import { changeMemberRoleAction as endpoint41 } from "@/app/actions/members";
import { setMemberStatusAction as endpoint42 } from "@/app/actions/members";
import { removeMemberAction as endpoint43 } from "@/app/actions/members";
import { leaveSpaceAction as endpoint44 } from "@/app/actions/members";
import { setBorrowingAccessAction as endpoint45 } from "@/app/actions/members";
import { markNotificationsReadAction as endpoint46 } from "@/app/actions/notifications";
import { updateSettingsSection as endpoint47 } from "@/app/actions/settings";
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
"invite-token-page:loadInvitePage": endpoint9,
"login-link-token-page:loadMagicLinkPage": endpoint10,
"login-page:loadLoginPage": endpoint11,
"page:loadHomeRedirect": endpoint12,
"reset-password-token-page:loadResetPasswordPage": endpoint13,
"s-spaceSlug-layout:loadgenerateMetadata": endpoint14,
"s-spaceSlug-layout:loadSpaceLayout": endpoint15,
"s-spaceSlug-page:loadSpaceHomePage": endpoint16,
"setup-page:loadSetupPage": endpoint17,
});
export const backendActions = Object.freeze({
"account:updateProfile": endpoint18,
"account:changePassword": endpoint19,
"account:beginMfaEnrollment": endpoint20,
"account:confirmMfaEnrollment": endpoint21,
"account:disableMfa": endpoint22,
"account:signOutEverywhere": endpoint23,
"admin:verifyAdminMfa": endpoint24,
"admin:updateInstanceSettingsAction": endpoint25,
"admin:adminCreateSpace": endpoint26,
"admin:adminSetUserDisabled": endpoint27,
"admin:adminSetSpaceArchived": endpoint28,
"apiTokens:createApiTokenAction": endpoint29,
"apiTokens:revokeApiTokenAction": endpoint30,
"auth:completeSetup": endpoint31,
"auth:requestPasswordReset": endpoint32,
"auth:requestMagicLink": endpoint33,
"auth:resetPassword": endpoint34,
"auth:acceptInviteWithNewAccount": endpoint35,
"auth:acceptInviteAsCurrentUser": endpoint36,
"jobs:manageJobsAction": endpoint37,
"members:createInvitationAction": endpoint38,
"members:resendInvitationAction": endpoint39,
"members:revokeInvitationAction": endpoint40,
"members:changeMemberRoleAction": endpoint41,
"members:setMemberStatusAction": endpoint42,
"members:removeMemberAction": endpoint43,
"members:leaveSpaceAction": endpoint44,
"members:setBorrowingAccessAction": endpoint45,
"notifications:markNotificationsReadAction": endpoint46,
"settings:updateSettingsSection": endpoint47,
});
