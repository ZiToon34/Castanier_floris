/* =========================================================
   cms-bridge.js — Pont entre le site et Mon CMS
   ---------------------------------------------------------
   Ne s'active QUE si la page est affichee dans le cadre
   d'apercu de Mon CMS. Pour un visiteur normal, ce fichier
   ne fait strictement rien.

   Deux fonctions :
     1. Le client clique sur un element de son site
        -> Mon CMS ouvre le champ correspondant
     2. Le client ouvre une rubrique dans Mon CMS
        -> le site fait defiler jusqu'a la zone concernee

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
  ]
  var SELECTEUR = ATTRIBUTS.map(function (a) { return "[" + a + "]" }).join(",")

  var rubriques = []   // identifiants des rubriques
  var libelles = {}    // "hero" -> "Bannière principale"
  var champs = {}      // "tarifs.cotisations" -> "Cotisations & licences"

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
   * On remonte d'abord depuis l'element touche : c'est le cas le plus
   * frequent et le plus sur. Si le clic tombe dans un espace vide
   * (marge d'un bloc, interligne d'un tableau), on choisit alors
   * l'element le PLUS PROCHE du curseur, et le plus petit en cas
   * d'egalite. Le client obtient ainsi toujours ce qu'il visait,
   * sans avoir a placer sa souris au pixel pres.
   */
  function cibleDe(elementTouche, x, y) {
    // 1. Chaine des parents
    var noeud = elementTouche
    while (noeud && noeud !== document.body) {
      if (cheminDe(noeud)) return noeud
      noeud = noeud.parentElement
    }

    // 2. Le plus proche geometriquement
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
      // hors de l'ecran : le client ne peut pas l'avoir vise
      if (r.bottom < 0 || r.top > window.innerHeight) continue

      var d = distance(r, x, y)
      if (d > 120) continue

      var aire = r.width * r.height
      if (d < meilleureDistance - 1 || (Math.abs(d - meilleureDistance) <= 1 && aire < meilleureAire)) {
        meilleureDistance = d
        meilleureAire = aire
        meilleur = el
      }
    }
    return meilleur
  }

  /** Nom lisible d'un element vise */
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
        '[data-cms-gallery^="' + id + '."], [data-cms-img^="' + id + '."]'
      ) ||
      document.getElementById(id)
    )
  }

  // -------------------------------------------------------
  // HABILLAGE VISUEL
  // -------------------------------------------------------

  // Le cadre eclaire l'element vise et assombrit tout le reste
  var cadre = document.createElement("div")
  cadre.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    "border:3px solid #1E5F8C",
    "border-radius:8px",
    "background:rgba(30,95,140,0.06)",
    "box-shadow:0 0 0 9999px rgba(15,23,42,0.42)",
    "transition:all .12s ease",
    "display:none",
  ].join(";")

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

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(cadre)
    document.body.appendChild(etiquette)
  })
  if (document.body) {
    document.body.appendChild(cadre)
    document.body.appendChild(etiquette)
  }

  var derniereCible = null

  function surligner(el, texte) {
    if (!el) return masquer()
    var r = el.getBoundingClientRect()

    cadre.style.display = "block"
    cadre.style.top = r.top - 4 + "px"
    cadre.style.left = r.left - 4 + "px"
    cadre.style.width = r.width + 8 + "px"
    cadre.style.height = r.height + 8 + "px"

    etiquette.textContent = texte
    etiquette.style.display = "block"
    etiquette.style.top = (r.top > 44 ? r.top - 40 : r.bottom + 10) + "px"
    etiquette.style.left = Math.max(8, r.left) + "px"

    el.style.cursor = "pointer"
  }

  function masquer() {
    cadre.style.display = "none"
    etiquette.style.display = "none"
    if (derniereCible) derniereCible.style.cursor = ""
    derniereCible = null
  }

  /** Eclair vert : le choix du client est pris en compte */
  function confirmer(el, nom) {
    if (!el) return
    surligner(el, "\u2714\uFE0F  " + nom)
    cadre.style.borderColor = "#15803D"
    cadre.style.background = "rgba(21,128,61,0.12)"
    setTimeout(function () {
      cadre.style.borderColor = "#1E5F8C"
      cadre.style.background = "rgba(30,95,140,0.06)"
      masquer()
    }, 550)
  }

  // -------------------------------------------------------
  // SURVOL (ordinateur)
  // -------------------------------------------------------
  document.addEventListener("mousemove", function (e) {
    if (!rubriques.length) return
    var el = cibleDe(e.target, e.clientX, e.clientY)
    if (el === derniereCible) return
    if (derniereCible) derniereCible.style.cursor = ""
    derniereCible = el
    if (!el) return masquer()
    surligner(el, "\u270F\uFE0F  Cliquez pour modifier \u00B7 " + nomDe(el))
  })

  document.addEventListener("mouseleave", masquer)
  window.addEventListener("scroll", function () {
    if (derniereCible) surligner(derniereCible, etiquette.textContent)
  })

  // -------------------------------------------------------
  // APPUI (telephone) : pas de survol, on montre des le contact
  // -------------------------------------------------------
  document.addEventListener(
    "touchstart",
    function (e) {
      if (!rubriques.length) return
      var t = e.touches && e.touches[0]
      if (!t) return
      if (t.target.closest && t.target.closest("a[href]")) return

      var el = cibleDe(t.target, t.clientX, t.clientY)
      if (!el) return
      derniereCible = el
      surligner(el, "\u270F\uFE0F  Modifier \u00B7 " + nomDe(el))
    },
    { passive: true, capture: true }
  )

  // -------------------------------------------------------
  // CLIC : ouvrir le champ dans Mon CMS
  // -------------------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      if (!rubriques.length) return
      // Un lien reste un lien : le client navigue dans son site
      if (e.target.closest && e.target.closest("a[href]")) return

      var el = cibleDe(e.target, e.clientX, e.clientY)
      if (!el) return

      var chemin = cheminDe(el)
      if (!chemin) return

      confirmer(el, nomDe(el))
      envoyer({
        type: "select",
        section: chemin.split(".")[0],
        field: chemin.split(".")[1],
      })
    },
    true
  )

  // -------------------------------------------------------
  // RECEPTION : Mon CMS demande de defiler vers une rubrique
  // -------------------------------------------------------
  window.addEventListener("message", function (e) {
    if (e.origin !== CMS_ORIGIN) return
    var d = e.data
    if (!d || d.source !== "mon-cms") return

    if (d.type === "scrollTo") {
      // On vise le champ precis s'il est fourni, la rubrique sinon
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
      surligner(el, "\u270F\uFE0F  " + nomDe(el))
      setTimeout(masquer, 1600)
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
