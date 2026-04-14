(function () {
    var STORAGE_KEY = "castanier_cookie_consent_v1";
    var CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
    var inMemoryConsent = null;

    function safeParse(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function readConsent() {
        var raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return inMemoryConsent;
        }
        if (!raw) return null;

        var parsed = safeParse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        return {
            necessary: true,
            analytics: !!parsed.analytics,
            updatedAt: Number(parsed.updatedAt) || 0,
            version: 1
        };
    }

    function isConsentValid(consent) {
        if (!consent) return false;
        if (typeof consent.analytics !== "boolean") return false;
        if (!consent.updatedAt) return false;
        return Date.now() - consent.updatedAt <= CONSENT_MAX_AGE_MS;
    }

    function getEffectiveConsent() {
        var consent = readConsent();
        if (isConsentValid(consent)) return consent;

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            // Ignore storage errors and continue with no consent state.
        }
        inMemoryConsent = null;
        return null;
    }

    function applyConsent(consent) {
        var analyticsEnabled = !!(consent && consent.analytics);
        document.documentElement.setAttribute("data-cookie-analytics", analyticsEnabled ? "granted" : "denied");
    }

    function enableOptionalServices() {
        document.documentElement.setAttribute("data-optional-services", "enabled");
    }

    function disableOptionalServices() {
        document.documentElement.setAttribute("data-optional-services", "disabled");
    }

    function syncOptionalServices(consent) {
        if (consent && consent.analytics) {
            enableOptionalServices();
            return;
        }
        disableOptionalServices();
    }

    function saveConsent(analyticsEnabled) {
        var consent = {
            necessary: true,
            analytics: !!analyticsEnabled,
            updatedAt: Date.now(),
            version: 1
        };

        inMemoryConsent = consent;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
        } catch (error) {
            // Ignore storage errors and keep consent for current session only.
        }
        applyConsent(consent);
        syncOptionalServices(consent);
        window.dispatchEvent(new CustomEvent("cookieConsentUpdated", { detail: consent }));
        return consent;
    }

    function injectUi() {
        var markup =
            '<div id="cookieConsentBanner" class="fixed inset-x-0 bottom-0 z-[100] p-4">' +
                '<div class="mx-auto max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-2xl p-5 md:p-6">' +
                    '<p class="text-lg font-bold text-gray-900">Gestion des cookies</p>' +
                    '<p class="mt-2 text-sm text-gray-600">Nous utilisons des traceurs techniques indispensables au fonctionnement du site. Les cookies optionnels sont desactives par defaut et ne sont actives qu avec votre accord.</p>' +
                    '<p class="mt-2 text-sm text-gray-600">Consultez la <a href="cookies.html" class="underline hover:text-[#b32d2e]">Politique cookies</a>.</p>' +
                    '<div class="mt-4 flex flex-col sm:flex-row gap-2">' +
                        '<button type="button" id="cookieRejectAll" class="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:border-gray-400 transition">Tout refuser</button>' +
                        '<button type="button" id="cookieAcceptAll" class="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#b32d2e] text-white font-semibold hover:bg-red-800 transition">Tout accepter</button>' +
                        '<button type="button" id="cookieCustomize" class="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#b32d2e] text-[#b32d2e] font-semibold hover:bg-red-50 transition">Personnaliser</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="cookiePreferencesModal" class="fixed inset-0 z-[110] hidden" aria-hidden="true">' +
                '<div class="absolute inset-0 bg-black/40" id="cookiePrefsOverlay"></div>' +
                '<div class="relative min-h-screen flex items-center justify-center p-4">' +
                    '<div class="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl p-6">' +
                        '<div class="flex items-center justify-between gap-4">' +
                            '<h2 class="text-xl font-bold text-gray-900">Preferences cookies</h2>' +
                            '<button type="button" id="cookieClosePrefs" class="text-gray-500 hover:text-gray-900" aria-label="Fermer">X</button>' +
                        '</div>' +
                        '<p class="mt-3 text-sm text-gray-600">Vous pouvez modifier votre choix a tout moment.</p>' +
                        '<div class="mt-5 space-y-4">' +
                            '<div class="rounded-xl border border-gray-200 p-4">' +
                                '<p class="font-semibold text-gray-900">Cookies strictement necessaires</p>' +
                                '<p class="mt-1 text-sm text-gray-600">Toujours actifs. Ils permettent le fonctionnement du site et la memorisation de vos preferences.</p>' +
                            '</div>' +
                            '<label class="block rounded-xl border border-gray-200 p-4 cursor-pointer">' +
                                '<div class="flex items-start gap-3">' +
                                    '<input id="cookieAnalyticsCheckbox" type="checkbox" class="mt-1 h-4 w-4 accent-[#b32d2e]">' +
                                    '<span>' +
                                        '<span class="font-semibold text-gray-900">Cookies de mesure d audience</span>' +
                                        '<span class="block mt-1 text-sm text-gray-600">Permettent de mesurer la frequentation. Desactives par defaut.</span>' +
                                    '</span>' +
                                '</div>' +
                            '</label>' +
                        '</div>' +
                        '<div class="mt-6 flex flex-col sm:flex-row gap-2">' +
                            '<button type="button" id="cookieSavePrefs" class="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold hover:bg-[#b32d2e] transition">Enregistrer mes choix</button>' +
                            '<button type="button" id="cookieRefuseOptional" class="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:border-gray-400 transition">Refuser les cookies optionnels</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<button type="button" id="cookieSettingsFloatingButton" data-open-cookie-settings class="fixed bottom-4 left-4 z-[90] px-3 py-2 rounded-full bg-gray-900 text-white text-sm font-semibold shadow-lg hover:bg-[#b32d2e] transition">Cookies</button>';

        document.body.insertAdjacentHTML("beforeend", markup);
    }

    function init() {
        injectUi();

        var banner = document.getElementById("cookieConsentBanner");
        var modal = document.getElementById("cookiePreferencesModal");
        var analyticsCheckbox = document.getElementById("cookieAnalyticsCheckbox");
        var acceptAllBtn = document.getElementById("cookieAcceptAll");
        var rejectAllBtn = document.getElementById("cookieRejectAll");
        var customizeBtn = document.getElementById("cookieCustomize");
        var savePrefsBtn = document.getElementById("cookieSavePrefs");
        var refuseOptionalBtn = document.getElementById("cookieRefuseOptional");
        var closePrefsBtn = document.getElementById("cookieClosePrefs");
        var prefsOverlay = document.getElementById("cookiePrefsOverlay");

        function openPreferencesModal() {
            var currentConsent = getEffectiveConsent();
            analyticsCheckbox.checked = !!(currentConsent && currentConsent.analytics);
            modal.classList.remove("hidden");
            modal.setAttribute("aria-hidden", "false");
        }

        function closePreferencesModal() {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        }

        function hideBanner() {
            banner.classList.add("hidden");
        }

        function showBanner() {
            banner.classList.remove("hidden");
        }

        function applyAndClose(analyticsEnabled) {
            saveConsent(analyticsEnabled);
            hideBanner();
            closePreferencesModal();
        }

        var consent = getEffectiveConsent();
        applyConsent(consent);
        syncOptionalServices(consent);

        if (consent) {
            hideBanner();
        } else {
            showBanner();
        }

        acceptAllBtn.addEventListener("click", function () {
            applyAndClose(true);
        });

        rejectAllBtn.addEventListener("click", function () {
            applyAndClose(false);
        });

        customizeBtn.addEventListener("click", function () {
            openPreferencesModal();
        });

        savePrefsBtn.addEventListener("click", function () {
            applyAndClose(analyticsCheckbox.checked);
        });

        refuseOptionalBtn.addEventListener("click", function () {
            applyAndClose(false);
        });

        closePrefsBtn.addEventListener("click", closePreferencesModal);
        prefsOverlay.addEventListener("click", closePreferencesModal);

        document.addEventListener("click", function (event) {
            if (!event.target || typeof event.target.closest !== "function") return;
            var trigger = event.target.closest("[data-open-cookie-settings]");
            if (!trigger) return;
            openPreferencesModal();
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closePreferencesModal();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
