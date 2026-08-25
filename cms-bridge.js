/* =========================================================
   cms-bridge.js — Pont entre le site et Mon CMS
   ---------------------------------------------------------
   Ne s'active QUE si la page est affichee dans le cadre
   d'apercu de Mon CMS. Pour un visiteur normal, ce fichier
   ne fait strictement rien.

   Deux modes, pilotes depuis la barre de l'apercu :

     NAVIGATION (par defaut)
       Le client regarde son site normalement. Il scrolle,
       il clique sur ses liens. Rien ne s'allume.

     SELECTION
       Le survol eclaire les elements modifiables, le clic
       en choisit un. Les liens sont neutralises pour que
       le client ne quitte pas la page par megarde.

   A inclure en dernier, juste avant </body> :
       <script defer src="cms-bridge.js"></script>
   ========================================================= */
(function () {
  "use strict"

  // Page affichee normalement (pas dans un cadre) : on ne fait rien
  if (window.self === window.top) return

  var CMS_ORIGIN = "https://mon-cms-mnrd.vercel.app"

  /** Attributs poses sur les pages : leur valeur vaut "rubrique.champ" */
  var ATTRIBUTS = [
    "data-cms-text", "data-cms-html", "data-cms-img", "data-cms-bg",
    "data-cms-href", "data-cms-tel", "data-cms-mail", "data-cms-wa",
    "data-cms-gallery", "data-cms-list",
    // Zone cliquable dont le contenu est gere par le site lui-meme
    // (galerie avec visionneuse, carte, grille generee...)
    "data-cms-zone",
  ]
  var SELECTEUR = ATTRIBUTS.map(function (a) { return "[" + a + "]" }).join(",")

  var rubriques = []      // identifiants des rubriques
  var libelles = {}       // "hero" -> "Bannière principale"
  var champs = {}         // "tarifs.cotisations" -> "Cotisations & licences"

  var modeSelection = false
  var survole = null      // element sous le curseur
  var choisi = null       // element retenu par le client

  // -------------------------------------------------------
  // ENVOI VERS MON CMS
  // -------------------------------------------------------
  function envoyer(message) {
    message.source = "mon-cms-site"
    try {
      window.parent.postMessage(message, CMS_ORIGIN)
    } catch (e) {
      /* le cadre parent n'est pas Mon CMS : on ignore */
    }
  }

  // -------------------------------------------------------
  // TROUVER CE QUE VISE LE CLIENT
  // -------------------------------------------------------

  /** Renvoie le chemin "rubrique.champ" porte par un element */
  function cheminDe(el) {
    if (!el || !el.getAttribute) return null
    for (var i = 0; i < ATTRIBUTS.length; i++) {
      var v = el.getAttribute(ATTRIBUTS[i])
      if (v && v.indexOf(".") > 0 && rubriques.indexOf(v.split(".")[0]) !== -1) {
        return v
      }
    }
    return null
  }

  /** Distance entre un point et un rectangle (0 si le point est dedans) */
  function distance(r, x, y) {
    var dx = Math.max(r.left - x, 0, x - r.right)
    var dy = Math.max(r.top - y, 0, y - r.bottom)
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Element vise par le client.
   *
   * On remonte d'abord depuis l'element touche. Si le clic tombe dans
   * un espace vide (marge d'un bloc, interligne d'un tableau), on prend
   * l'element le plus proche du curseur, et le plus petit a egalite.
   * Viser a peu pres suffit donc.
   */
  function cibleDe(elementTouche, x, y) {
    var noeud = elementTouche
    while (noeud && noeud !== document.body) {
      if (cheminDe(noeud)) return noeud
      noeud = noeud.parentElement
    }

    if (typeof x !== "number") return null

    var candidats = document.querySelectorAll(SELECTEUR)
    var meilleur = null
    var meilleureDistance = Infinity
    var meilleureAire = Infinity

    for (var i = 0; i < candidats.length; i++) {
      var el = candidats[i]
      if (!cheminDe(el)) continue

      var r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue

      var d = distance(r, x, y)
      if (d > 120) continue

      var aire = r.width * r.height
      if (d < meilleureDistance - 1 ||
          (Math.abs(d - meilleureDistance) <= 1 && aire < meilleureAire)) {
        meilleureDistance = d
        meilleureAire = aire
        meilleur = el
      }
    }
    return meilleur
  }

  /** Nom lisible d'un element */
  function nomDe(el) {
    var chemin = cheminDe(el)
    if (!chemin) return ""
    return champs[chemin] || libelles[chemin.split(".")[0]] || chemin
  }

  /** Zone d'une rubrique, pour le defilement demande par l'editeur */
  function zoneDe(id) {
    return (
      document.querySelector('[data-cms="' + id + '"]') ||
      document.querySelector(
        '[data-cms-text^="' + id + '."], [data-cms-list^="' + id + '."], ' +
        '[data-cms-gallery^="' + id + '."], [data-cms-img^="' + id + '."], ' +
        '[data-cms-zone^="' + id + '."]'
      ) ||
      document.getElementById(id)
    )
  }

  // -------------------------------------------------------
  // HABILLAGE VISUEL
  // -------------------------------------------------------

  function creerCadre(couleur, fond, ombre) {
    var d = document.createElement("div")
    d.style.cssText = [
      "position:fixed",
      "z-index:2147483645",
      "pointer-events:none",
      "border:3px solid " + couleur,
      "border-radius:8px",
      "background:" + fond,
      ombre ? "box-shadow:0 0 0 9999px rgba(15,23,42,0.42)" : "",
      "transition:all .12s ease",
      "display:none",
    ].join(";")
    return d
  }

  // Cadre du survol : eclaire l'element et assombrit le reste
  var cadre = creerCadre("#1E5F8C", "rgba(30,95,140,0.06)", true)
  // Cadre du choix : reste en place, sans assombrir
  var cadreChoix = creerCadre("#15803D", "rgba(21,128,61,0.10)", false)
  cadreChoix.style.zIndex = "2147483644"

  var etiquette = document.createElement("div")
  etiquette.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "pointer-events:none",
    "background:#1E5F8C",
    "color:#fff",
    "font:600 13px/1.25 system-ui,-apple-system,sans-serif",
    "padding:8px 14px",
    "border-radius:8px",
    "white-space:nowrap",
    "box-shadow:0 4px 14px rgba(15,23,42,.45)",
    "display:none",
  ].join(";")

  function poser() {
    if (!document.body) return
    document.body.appendChild(cadre)
    document.body.appendChild(cadreChoix)
    document.body.appendChild(etiquette)
  }
  if (document.body) poser()
  else document.addEventListener("DOMContentLoaded", poser)

  function placer(boite, el) {
    var r = el.getBoundingClientRect()
    boite.style.display = "block"
    boite.style.top = r.top - 4 + "px"
    boite.style.left = r.left - 4 + "px"
    boite.style.width = r.width + 8 + "px"
    boite.style.height = r.height + 8 + "px"
    return r
  }

  function surligner(el, texte) {
    if (!el) return masquerSurvol()
    var r = placer(cadre, el)

    etiquette.textContent = texte
    etiquette.style.display = "block"
    etiquette.style.top = (r.top > 44 ? r.top - 40 : r.bottom + 10) + "px"
    etiquette.style.left = Math.max(8, r.left) + "px"
  }

  function masquerSurvol() {
    cadre.style.display = "none"
    etiquette.style.display = "none"
    survole = null
  }

  function montrerChoix() {
    if (choisi) placer(cadreChoix, choisi)
    else cadreChoix.style.display = "none"
  }

  // -------------------------------------------------------
  // CHANGEMENT DE MODE
  // -------------------------------------------------------
  function appliquerMode(actif) {
    modeSelection = actif
    document.documentElement.style.cursor = actif ? "crosshair" : ""
    if (!actif) {
      masquerSurvol()
      choisi = null
      cadreChoix.style.display = "none"
    }
  }

  // -------------------------------------------------------
  // SURVOL (ordinateur)
  // -------------------------------------------------------
  document.addEventListener("mousemove", function (e) {
    if (!modeSelection || !rubriques.length) return
    var el = cibleDe(e.target, e.clientX, e.clientY)
    if (el === survole) return
    survole = el
    if (!el) return masquerSurvol()
    surligner(el, "\u270F\uFE0F  " + nomDe(el))
  })

  document.addEventListener("mouseleave", function () {
    if (modeSelection) masquerSurvol()
  })

  window.addEventListener("scroll", function () {
    if (!modeSelection) return
    if (survole) surligner(survole, etiquette.textContent)
    montrerChoix()
  })

  window.addEventListener("resize", montrerChoix)

  // -------------------------------------------------------
  // APPUI (telephone) : pas de survol, on montre au contact
  // -------------------------------------------------------
  document.addEventListener(
    "touchstart",
    function (e) {
      if (!modeSelection || !rubriques.length) return
      var t = e.touches && e.touches[0]
      if (!t) return
      var el = cibleDe(t.target, t.clientX, t.clientY)
      if (!el) return
      survole = el
      surligner(el, "\u270F\uFE0F  " + nomDe(el))
    },
    { passive: true, capture: true }
  )

  // -------------------------------------------------------
  // CLIC : retenir l'element, sans quitter la page
  // -------------------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      if (!modeSelection || !rubriques.length) return

      // En mode selection, aucun lien ne doit emmener le client ailleurs
      e.preventDefault()
      e.stopPropagation()

      var el = cibleDe(e.target, e.clientX, e.clientY)
      if (!el) return

      var chemin = cheminDe(el)
      if (!chemin) return

      choisi = el
      montrerChoix()
      masquerSurvol()

      envoyer({
        type: "select",
        section: chemin.split(".")[0],
        field: chemin.split(".")[1],
        label: nomDe(el),
      })
    },
    true
  )

  // -------------------------------------------------------
  // MESSAGES VENUS DE MON CMS
  // -------------------------------------------------------
  window.addEventListener("message", function (e) {
    if (e.origin !== CMS_ORIGIN) return
    var d = e.data
    if (!d || d.source !== "mon-cms") return

    if (d.type === "mode") {
      appliquerMode(!!d.actif)
      return
    }

    if (d.type === "scrollTo") {
      var el =
        (d.field &&
          document.querySelector(
            ATTRIBUTS.map(function (a) {
              return "[" + a + '="' + d.section + "." + d.field + '"]'
            }).join(",")
          )) ||
        zoneDe(d.section)
      if (!el) return

      el.scrollIntoView({ behavior: "smooth", block: "center" })
      choisi = el
      montrerChoix()
      setTimeout(function () {
        if (!modeSelection) {
          choisi = null
          cadreChoix.style.display = "none"
        }
      }, 2200)
    }
  })

  // -------------------------------------------------------
  // CHARGEMENT DES NOMS DE RUBRIQUES ET DE CHAMPS
  // -------------------------------------------------------
  fetch("content.json?t=" + Date.now())
    .then(function (r) { return r.json() })
    .then(function (data) {
      rubriques = data.sections.map(function (s) {
        libelles[s.id] = s.label
        s.fields.forEach(function (f) {
          champs[s.id + "." + f.id] = f.label
        })
        return s.id
      })
      envoyer({ type: "ready", page: location.pathname })
    })
    .catch(function () {
      /* contenu injoignable : le pont reste inactif */
    })
})()
