/* =========================================================
   cms-bridge.js — Pont entre le site et Mon CMS
   ---------------------------------------------------------
   Ne s'active QUE si la page est affichee dans le cadre
   d'apercu de Mon CMS. Pour un visiteur normal, ce fichier
   ne fait strictement rien.

   Deux fonctions :
     1. Le client clique sur une zone du site
        -> Mon CMS ouvre la rubrique correspondante
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

  /** Identifiants des rubriques, lus depuis content.json */
  var rubriques = []

  /** Libelles lisibles des rubriques, pour l'etiquette de survol */
  var libelles = {}

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
  // TROUVER LA RUBRIQUE D'UN ELEMENT
  // -------------------------------------------------------

  /**
   * Deduit la rubrique d'un noeud.
   * Priorite au marqueur explicite data-cms, sinon on cherche
   * un identifiant prefixe par le nom d'une rubrique
   * (ex. "hero-titre" appartient a la rubrique "hero").
   */
  function rubriqueDuNoeud(noeud) {
    if (noeud.hasAttribute && noeud.hasAttribute("data-cms")) {
      return noeud.getAttribute("data-cms")
    }

    // Le noeud porte lui-meme une liaison : "tarifs.cotisations" -> "tarifs"
    var propre = liaisonDuNoeud(noeud)
    if (propre) return propre

    // Sinon, une liaison est peut-etre presente a l'interieur
    if (noeud.querySelector) {
      var dedans = noeud.querySelector(SELECTEUR_LIAISONS)
      if (dedans) {
        var trouvee = liaisonDuNoeud(dedans)
        if (trouvee) return trouvee
      }
    }

    // Ancienne methode : identifiants prefixes par le nom de la rubrique
    for (var i = 0; i < rubriques.length; i++) {
      var id = rubriques[i]
      if (noeud.id === id) return id
      if (
        noeud.querySelector &&
        noeud.querySelector('[id^="' + id + '-"], [id^="' + id + '_"]')
      ) {
        return id
      }
    }
    return null
  }

  /**
   * Attributs poses sur les pages pour indiquer quel champ afficher.
   * Leur valeur est de la forme "rubrique.champ" : le prefixe donne
   * donc directement la rubrique a ouvrir.
   */
  var ATTRIBUTS_LIAISON = "data-cms-text,data-cms-html,data-cms-img,data-cms-bg,data-cms-href,data-cms-tel,data-cms-mail,data-cms-wa,data-cms-gallery,data-cms-list".split(",")
  var SELECTEUR_LIAISONS = "[data-cms-text],[data-cms-html],[data-cms-img],[data-cms-bg],[data-cms-href],[data-cms-tel],[data-cms-mail],[data-cms-wa],[data-cms-gallery],[data-cms-list]"

  /** Renvoie la rubrique portee par un noeud, via ses attributs de liaison */
  function liaisonDuNoeud(noeud) {
    if (!noeud || !noeud.getAttribute) return null
    for (var i = 0; i < ATTRIBUTS_LIAISON.length; i++) {
      var v = noeud.getAttribute(ATTRIBUTS_LIAISON[i])
      if (v && v.indexOf(".") > 0) {
        var rubrique = v.split(".")[0]
        if (rubriques.indexOf(rubrique) !== -1) return rubrique
      }
    }
    return null
  }

  /** Remonte depuis l'element clique jusqu'a trouver une rubrique */
  function rubriqueDe(element) {
    var noeud = element
    while (noeud && noeud !== document.body) {
      var trouvee = rubriqueDuNoeud(noeud)
      if (trouvee) return trouvee
      noeud = noeud.parentElement
    }
    return null
  }

  /** Retrouve la zone visible correspondant a une rubrique */
  function zoneDe(id) {
    var marquee = document.querySelector('[data-cms="' + id + '"]')
    if (marquee) return marquee

    var repere =
      document.querySelector('[data-cms-text^="' + id + '."], ' +
                             '[data-cms-list^="' + id + '."], ' +
                             '[data-cms-gallery^="' + id + '."], ' +
                             '[data-cms-img^="' + id + '."]') ||
      document.getElementById(id) ||
      document.querySelector('[id^="' + id + '-"], [id^="' + id + '_"]')
    if (!repere) return null

    return repere.closest("section, header, footer, article") || repere
  }

  // -------------------------------------------------------
  // SURLIGNAGE AU SURVOL
  // -------------------------------------------------------
  // Le cadre eclaire la zone survolee et assombrit tout le reste
  // grace a une ombre portee demesuree (effet projecteur).
  var cadre = document.createElement("div")
  cadre.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    "border:3px solid #1E5F8C",
    "border-radius:8px",
    "background:rgba(30,95,140,0.06)",
    "box-shadow:0 0 0 9999px rgba(15,23,42,0.42)",
    "transition:all .14s ease",
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

  var derniereZone = null

  function surligner(zone, nom) {
    if (!zone) return masquer()
    var r = zone.getBoundingClientRect()
    cadre.style.display = "block"
    cadre.style.top = r.top + "px"
    cadre.style.left = r.left + "px"
    cadre.style.width = r.width + "px"
    cadre.style.height = r.height + "px"

    etiquette.textContent = nom
    etiquette.style.display = "block"
    // L'etiquette se place au-dessus, ou dedans si la zone touche le haut
    etiquette.style.top = (r.top > 44 ? r.top - 40 : r.top + 10) + "px"
    etiquette.style.left = Math.max(8, r.left + 8) + "px"

    // La zone devient cliquable a l'oeil : curseur en forme de main
    zone.style.cursor = "pointer"
  }

  function masquer() {
    cadre.style.display = "none"
    etiquette.style.display = "none"
    if (derniereZone) derniereZone.style.cursor = ""
  }

  document.addEventListener("mouseover", function (e) {
    var id = rubriqueDe(e.target)
    if (!id) {
      derniereZone = null
      return masquer()
    }
    var zone = zoneDe(id)
    if (zone === derniereZone) return
    derniereZone = zone
    surligner(zone, "\u270F\uFE0F  Cliquez pour modifier \u00B7 " + (libelles[id] || id))
  })

  document.addEventListener("mouseleave", masquer)
  window.addEventListener("scroll", function () {
    if (derniereZone) surligner(derniereZone, etiquette.textContent)
  })

  /** Eclair vert de confirmation : la zone choisie clignote une fois */
  function confirmer(zone, nom) {
    if (!zone) return
    surligner(zone, "\u2714\uFE0F  " + nom)
    cadre.style.borderColor = "#15803D"
    cadre.style.background = "rgba(21,128,61,0.12)"
    setTimeout(function () {
      cadre.style.borderColor = "#1E5F8C"
      cadre.style.background = "rgba(30,95,140,0.06)"
      masquer()
    }, 550)
  }

  // -------------------------------------------------------
  // CLIC : ouvrir la rubrique dans Mon CMS
  // -------------------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      // Un lien reste un lien : on laisse le client naviguer dans son site
      if (e.target.closest && e.target.closest("a[href]")) return

      var id = rubriqueDe(e.target)
      if (!id) return

      confirmer(zoneDe(id), libelles[id] || id)
      envoyer({ type: "select", section: id })
    },
    true
  )

  // -------------------------------------------------------
  // ECRANS TACTILES
  // Il n'y a pas de survol sur telephone : on montre la zone
  // des que le doigt se pose, avant meme le relachement.
  // -------------------------------------------------------
  document.addEventListener(
    "touchstart",
    function (e) {
      var cible = e.touches && e.touches[0] ? e.touches[0].target : e.target
      if (!cible || !cible.closest) return
      if (cible.closest("a[href]")) return

      var id = rubriqueDe(cible)
      if (!id) return

      var zone = zoneDe(id)
      derniereZone = zone
      surligner(zone, "\u270F\uFE0F  Modifier \u00B7 " + (libelles[id] || id))
    },
    { passive: true, capture: true }
  )

  // -------------------------------------------------------
  // RECEPTION : Mon CMS demande de defiler vers une rubrique
  // -------------------------------------------------------
  window.addEventListener("message", function (e) {
    if (e.origin !== CMS_ORIGIN) return
    var d = e.data
    if (!d || d.source !== "mon-cms") return

    if (d.type === "scrollTo") {
      var zone = zoneDe(d.section)
      if (!zone) return
      zone.scrollIntoView({ behavior: "smooth", block: "center" })
      surligner(zone, "\u270F\uFE0F  Cliquez pour modifier \u00B7 " + (libelles[d.section] || d.section))
      setTimeout(masquer, 2200)
    }
  })

  // -------------------------------------------------------
  // DEMARRAGE : on lit content.json pour connaitre les rubriques
  // -------------------------------------------------------
  fetch("content.json?t=" + Date.now())
    .then(function (r) {
      return r.json()
    })
    .then(function (data) {
      rubriques = data.sections.map(function (s) {
        libelles[s.id] = s.label
        return s.id
      })
      envoyer({ type: "ready", page: location.pathname })
    })
    .catch(function () {
      /* content.json introuvable : le pont reste inactif */
    })
})()
