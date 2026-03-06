import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { register as apiRegister } from "@/shared/lib/auth";
import { toast } from "react-hot-toast";
import { Mail } from "lucide-react";
import type { ApiError } from "@/shared/lib/api";

type Props = { textSizeLarge: boolean; highContrast: boolean };

export default function Register({ highContrast = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    confirmEmail: "",
    password: "",
    confirmPassword: "",
    phone: "",
    role: "student",
    terms: false,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailSent, setEmailSent] = useState(false);

  const set = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = t("register.errors.required.firstName");
    if (!form.lastName.trim()) e.lastName = t("register.errors.required.lastName");
    if (!form.email.trim()) e.email = t("register.errors.required.email");
    if (!form.password) e.password = t("register.errors.required.password");
    if (form.password.length < 6) e.password = t("register.errors.invalid.password");
    if (form.email !== form.confirmEmail) e.confirmEmail = t("register.errors.mismatch.email");
    if (form.password !== form.confirmPassword) e.confirmPassword = t("register.errors.mismatch.password");
    if (!form.terms) e.terms = t("register.errors.required.terms");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const requestedRole = form.role === "teacher" ? "teacher" : undefined;
      await apiRegister({
        email: form.email,
        password: form.password,
        display_name: `${form.firstName} ${form.lastName}`,
        role: form.role === "teacher" ? "student" : form.role,
        phone: form.phone || undefined,
        requested_role: requestedRole,
      });
      toast.success(t("register.success"));
      if (requestedRole === "teacher") {
        toast(t("register.teacherPendingApproval"), { duration: 5000 });
      }
      setEmailSent(true);
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const input = (field: string, type = "text", placeholder = "") => (
    <div>
      <label className={`block font-semibold mb-1 ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
        {t(`register.${field}`)}
      </label>
      <input
        type={type}
        value={(form as Record<string, any>)[field] as string}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder || t(`register.placeholders.${field}`)}
        className={`w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 ${
          highContrast ? "bg-gray-800 text-white border-yellow-400 focus:ring-yellow-400" : "border-gray-300 focus:ring-indigo-500"
        } ${errors[field] ? "border-red-500" : ""}`}
      />
      {errors[field] && <p className="text-red-500 text-sm mt-1">{errors[field]}</p>}
    </div>
  );

  return (
    <div className={`flex items-center justify-center min-h-screen p-4 transition-colors duration-300 ${highContrast ? "bg-black text-white" : "bg-gray-50"}`}>
      <div className={`${highContrast ? "bg-gray-900 border-2 border-white" : "bg-white shadow-2xl"} rounded-2xl w-full max-w-lg p-6 sm:p-8`}>

        {emailSent ? (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Mail className={`w-16 h-16 ${highContrast ? "text-yellow-400" : "text-indigo-600"}`} />
            </div>
            <h2 className={`text-2xl font-bold ${highContrast ? "text-yellow-400" : "text-indigo-700"}`}>
              {t("register.verifyEmail.title")}
            </h2>
            <p className={highContrast ? "text-gray-300" : "text-gray-600"}>
              {t("register.verifyEmail.description", { email: form.email })}
            </p>
            <p className={`text-sm ${highContrast ? "text-gray-400" : "text-gray-500"}`}>
              {t("register.verifyEmail.checkSpam")}
            </p>
            <button
              onClick={() => navigate("/login")}
              className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
            >
              {t("register.verifyEmail.goToLogin")}
            </button>
          </div>
        ) : (
        <>
        <h2 className={`text-3xl font-bold text-center mb-6 ${highContrast ? "text-yellow-400" : "text-indigo-700"}`}>
          {t("register.title")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {input("firstName")}
            {input("lastName")}
          </div>
          {input("email", "email")}
          {input("confirmEmail", "email")}
          {input("password", "password")}
          {input("confirmPassword", "password")}
          {input("phone", "tel")}

          {/* Role */}
          <div>
            <label className={`block font-semibold mb-1 ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
              {t("register.role")}
            </label>
            <select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${highContrast ? "bg-gray-800 text-white border-yellow-400" : "border-gray-300"}`}
            >
              <option value="student">{t("register.roles.student")}</option>
              <option value="teacher">{t("register.roles.teacher")}</option>
            </select>
            {form.role === "teacher" && (
              <p className="text-amber-600 text-sm mt-1">{t("register.teacherApprovalNote")}</p>
            )}
          </div>

          {/* Terms */}
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(e) => set("terms", e.target.checked)}
              className={`h-4 w-4 rounded ${highContrast ? "accent-yellow-400" : "accent-indigo-600"}`}
            />
            <span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>{t("register.terms")}</span>
          </label>
          {errors.terms && <p className="text-red-500 text-sm">{errors.terms}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${loading ? "opacity-60 cursor-not-allowed" : ""} ${highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
          >
            {loading ? t("register.buttons.creating") : t("register.buttons.create")}
          </button>

          <div className="text-center">
            <a href="/login" className={`text-sm font-medium hover:underline ${highContrast ? "text-yellow-400" : "text-indigo-600"}`}>
              {t("register.buttons.haveAccount")}
            </a>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
