import { useRef, useState } from "react";
import {
  User,
  Shield,
  Globe,
  Bell,
  UserCog,
  LogOut,
  Camera,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Volume2,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
  Mail,
} from "lucide-react";
import { useSettings } from "@/features/settings/hooks/useSettings";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Icon size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 bg-white";
const btnPrimary =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-all shadow-md disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all disabled:opacity-50";

export default function SettingsPage() {
  const hook = useSettings();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (hook.loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return hook.t("settingsPage.security.never");
    return new Date(dateStr).toLocaleDateString(hook.currentLanguage === "es" ? "es-EC" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-gray-900">⚙️ {hook.t("settingsPage.title")}</h1>
        <p className="text-gray-500 mt-1">{hook.t("settingsPage.subtitle")}</p>
      </div>

      {/* Verification banner */}
      {hook.isLoggedIn && !hook.profile?.is_verified && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="p-2.5 bg-amber-100 rounded-xl shrink-0">
            <Mail size={22} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-800">{hook.t("settingsPage.account.notVerifiedTitle")}</h3>
            <p className="text-sm text-amber-700 mt-0.5">{hook.t("settingsPage.account.notVerifiedDesc")}</p>
          </div>
          <button
            onClick={hook.handleResendVerification}
            disabled={hook.resendingVerification}
            className={btnPrimary + " shrink-0 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"}
          >
            {hook.resendingVerification ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {hook.resendingVerification ? hook.t("settingsPage.account.sendingVerification") : hook.t("settingsPage.account.resendVerification")}
          </button>
        </div>
      )}

      {/* Profile */}
      {hook.isLoggedIn && (
        <SectionCard icon={User} title={hook.t("settingsPage.profile.title")} description={hook.t("settingsPage.profile.description")}>
          <div className="space-y-5">
            <div className="flex items-center gap-5">
              <div className="relative">
                {hook.thumbnailUrl ? (
                  <img src={hook.thumbnailUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-blue-200" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                    <User size={32} className="text-blue-400" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">{hook.t("settingsPage.profile.thumbnail")}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.email")}</label>
                <input className={inputClass + " bg-gray-50 cursor-not-allowed"} value={hook.profile?.email || ""} readOnly />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.role")}</label>
                <input className={inputClass + " bg-gray-50 cursor-not-allowed capitalize"} value={hook.profile?.role ? hook.t(`settingsPage.roles.${hook.profile.role}`) : ""} readOnly />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.firstName")}</label>
                <input className={inputClass} value={hook.firstName} onChange={(e) => hook.setFirstName(e.target.value)} placeholder={hook.t("settingsPage.profile.firstNamePlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.lastName")}</label>
                <input className={inputClass} value={hook.lastName} onChange={(e) => hook.setLastName(e.target.value)} placeholder={hook.t("settingsPage.profile.lastNamePlaceholder")} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.displayName")}</label>
                <input className={inputClass} value={hook.displayName} onChange={(e) => hook.setDisplayName(e.target.value)} placeholder={hook.t("settingsPage.profile.displayNamePlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.profile.phone")}</label>
                <input className={inputClass} value={hook.phone} onChange={(e) => hook.setPhone(e.target.value)} placeholder={hook.t("settingsPage.profile.phonePlaceholder")} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={hook.handleSaveProfile} disabled={hook.savingProfile} className={btnPrimary}>
                {hook.savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {hook.savingProfile ? hook.t("settingsPage.profile.saving") : hook.t("settingsPage.profile.saveProfile")}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Security */}
      {hook.isLoggedIn && (
        <SectionCard icon={Shield} title={hook.t("settingsPage.security.title")} description={hook.t("settingsPage.security.description")}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.security.newPassword")}</label>
                <input type={showPassword ? "text" : "password"} className={inputClass + " pr-10"} value={hook.newPassword} onChange={(e) => hook.setNewPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-600 mb-1">{hook.t("settingsPage.security.confirmPassword")}</label>
                <input type={showConfirm ? "text" : "password"} className={inputClass + " pr-10"} value={hook.confirmPassword} onChange={(e) => hook.setConfirmPassword(e.target.value)} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={hook.handleChangePassword} disabled={hook.savingPassword || !hook.newPassword} className={btnPrimary}>
                {hook.savingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {hook.savingPassword ? hook.t("settingsPage.security.updating") : hook.t("settingsPage.security.updatePassword")}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Language */}
      <SectionCard icon={Globe} title={hook.t("settingsPage.language.title")} description={hook.t("settingsPage.language.description")}>
        <div className="flex gap-3">
          <button onClick={() => hook.handleChangeLanguage("es")} className={`flex-1 p-4 rounded-xl border-2 transition-all ${hook.currentLanguage === "es" ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 hover:border-gray-300"}`}>
            <span className="text-2xl block mb-1">🇪🇸</span>
            <span className="font-medium text-gray-900">{hook.t("settingsPage.language.spanish")}</span>
          </button>
          <button onClick={() => hook.handleChangeLanguage("en")} className={`flex-1 p-4 rounded-xl border-2 transition-all ${hook.currentLanguage === "en" ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 hover:border-gray-300"}`}>
            <span className="text-2xl block mb-1">🇺🇸</span>
            <span className="font-medium text-gray-900">{hook.t("settingsPage.language.english")}</span>
          </button>
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title={hook.t("settingsPage.notifications.title")} description={hook.t("settingsPage.notifications.description")}>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <Eye size={20} className="text-blue-500" />
              <div>
                <p className="font-medium text-gray-900">{hook.t("settingsPage.notifications.visualAlerts")}</p>
                <p className="text-sm text-gray-500">{hook.t("settingsPage.notifications.visualAlertsDesc")}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition">
            <div className="flex items-center gap-3">
              <Volume2 size={20} className="text-blue-500" />
              <div>
                <p className="font-medium text-gray-900">{hook.t("settingsPage.notifications.voiceReading")}</p>
                <p className="text-sm text-gray-500">{hook.t("settingsPage.notifications.voiceReadingDesc")}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 italic flex items-center gap-1">
            <Info size={12} />
            {hook.currentLanguage === "es"
              ? "Estas opciones se pueden alternar desde el menú de accesibilidad en la barra lateral."
              : "These options can be toggled from the accessibility menu in the sidebar."}
          </p>
        </div>
      </SectionCard>

      {/* Role request (students only) */}
      {hook.profile?.role === "student" && (
        <SectionCard icon={UserCog} title={hook.t("settingsPage.roleRequest.title")} description={hook.t("settingsPage.roleRequest.description")}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 px-4 py-3 rounded-lg">
              <Info size={16} />
              {hook.t("settingsPage.roleRequest.currentRole")}: <strong className="capitalize">{hook.t(`settingsPage.roles.${hook.profile.role}`)}</strong>
            </div>
            {hook.profile.requested_role ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-lg">
                  <Loader2 size={16} className="animate-spin" />
                  {hook.t("settingsPage.roleRequest.pendingRequest")}: <strong className="capitalize">{hook.t(`settingsPage.roles.${hook.profile.requested_role}`)}</strong>
                </div>
                <button onClick={hook.handleCancelRoleRequest} className={btnSecondary}>
                  <XCircle size={16} /> {hook.t("settingsPage.roleRequest.cancelRequest")}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <select className={inputClass} value={hook.requestedRole} onChange={(e) => hook.setRequestedRole(e.target.value)}>
                  <option value="">{hook.t("settingsPage.roleRequest.selectRole")}</option>
                  <option value="teacher">{hook.t("settingsPage.roleRequest.teacher")}</option>
                </select>
                <button onClick={hook.handleRequestRole} disabled={hook.requestingRole || !hook.requestedRole} className={btnPrimary}>
                  {hook.requestingRole ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {hook.requestingRole ? hook.t("settingsPage.roleRequest.requesting") : hook.t("settingsPage.roleRequest.requestChange")}
                </button>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Account */}
      {hook.isLoggedIn && (
        <SectionCard icon={Info} title={hook.t("settingsPage.account.title")} description={hook.t("settingsPage.account.description")}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 px-4 py-3 rounded-lg">
                <p className="text-gray-500">{hook.t("settingsPage.account.createdAt")}</p>
                <p className="font-medium text-gray-900">{formatDate(hook.profile?.created_at)}</p>
              </div>
              <div className="bg-gray-50 px-4 py-3 rounded-lg">
                <p className="text-gray-500">{hook.t("settingsPage.account.verificationStatus")}</p>
                <p className="font-medium flex items-center gap-1">
                  {hook.profile?.is_verified ? (
                    <>
                      <CheckCircle size={16} className="text-emerald-500" />
                      <span className="text-emerald-700">{hook.t("settingsPage.account.verified")}</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} className="text-red-500" />
                      <span className="text-red-700">{hook.t("settingsPage.account.notVerified")}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="border-t pt-4">
              <button onClick={hook.handleSignOut} className={btnDanger}>
                <LogOut size={16} /> {hook.t("settingsPage.account.signOut")}
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
