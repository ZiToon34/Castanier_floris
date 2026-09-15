/* =========================================================
   cms-bridge.js — Pont entre le site et Mon CMS
   ---------------------------------------------------------
   Ne s'active QUE si la page est affichee dans le cadre
   d'apercu de Mon CMS. Pour un visiteur normal, ce fichier
   ne fait strictement rien.

   Deux modes, pilotes depuis la barre de l'apercu :

     NAVIGATION (par defaut)
       Le client regarde son site normalement. Il fait defiler,
       il suit ses liens. Rien ne s'allume.

     MODIFICATION
       Le survol eclaire les elements modifiables, le clic ou
       l'appui en choisit un. Les liens sont neutralises pour
       que le client ne quitte pas la page par megarde.

   A inclure en dernier, juste avant </body> :
       <script defer src="cms-bridge.js"></script>
   ========================================================= */
(function () {
  "use strict"

  // Page affichee normalement (pas dans un cadre) : on ne fait rien
  if (window.self === window.top) return

  /* -------------------------------------------------------
     Attributs poses sur les pages. Leur valeur vaut
     "rubrique.champ" : le prefixe donne la rubrique a ouvrir.
     data-cms-zone designe une zone cliquable dont le contenu
     est gere par le site lui-meme (galerie avec visionneuse,
     carte, grille generee...).
     ------------------------------------------------------- */
  var ATTRIBUTS = [
    "data-cms-text", "data-cms-html", "data-cms-img", "data-cms-bg",
    "data-cms-href", "data-cms-tel", "data-cms-mail", "data-cms-wa",
    "data-cms-gallery", "data-cms-list", "data-cms-src", "data-cms-zone",
  ]
  var SELECTEUR = ATTRIBUTS.map(function (a) { return "[" + a + "]" }).join(",")

  var rubriques = []   // identifiants des rubriques
  var libelles = {}    // "hero" -> "Bannière principale"
  var champs = {}      // "tarifs.cotisations" -> "Cotisations & licences"

  var modeSelection = false
  var survole = null   // element sous le curseur ou le doigt
  var choisi = null    // element retenu par le client

  // =======================================================
  // ENVOI VERS MON CMS
  // =======================================================

  /*
   * La cible est volontairement ouverte : le contenu se limite a un
   * nom de rubrique, et Mon CMS verifie de son cote que le message
   * vient bien de son propre cadre. Exiger une adresse exacte rendait
   * l'echange muet des que l'editeur changeait d'adresse.
   */
  function envoyer(message) {
    message.source = "mon-cms-site"
    try {
      window.parent.postMessage(message, "*")
    } catch (e) {
      /* le cadre parent n'est pas Mon CMS */
    }
  }

  // =======================================================
  // TROUVER CE QUE VISE LE CLIENT
  // =======================================================

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
   * On remonte d'abord depuis l'element touche. Si le geste tombe dans
   * un espace vide — marge d'un bloc, interligne d'un tableau — on prend
   * l'element le plus proche, et le plus petit a egalite. Viser a peu
   * pres suffit donc.
   */
  function cibleDe(depart, x, y) {
    var noeud = depart
    while (noeud && noeud !== document.body) {
      if (cheminDe(noeud)) return noeud
      noeud = noeud.parentElement
    }

    if (typeof x !== "number") return null

    var candidats = document.querySelectorAll(SELECTEUR)
    var meilleur = null
    var plusProche = Infinity
    var plusPetit = Infinity

    for (var i = 0; i < candidats.length; i++) {
      var el = candidats[i]
      if (!cheminDe(el)) continue

      var r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue

      var d = distance(r, x, y)
      if (d > 120) continue

      var aire = r.width * r.height
      if (d < plusProche - 1 || (Math.abs(d - plusProche) <= 1 && aire < plusPetit)) {
        plusProche = d
        plusPetit = aire
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
        ATTRIBUTS.map(function (a) {
          return "[" + a + '^="' + id + '."]'
        }).join(",")
      ) ||
      document.getElementById(id)
    )
  }

  // =======================================================
  // HABILLAGE VISUEL
  // =======================================================

  function creerCadre(couleur, fond, projecteur) {
    var d = document.createElement("div")
    d.style.cssText = [
      "position:fixed",
      "z-index:2147483645",
      "pointer-events:none",
      "border:3px solid " + couleur,
      "border-radius:8px",
      "background:" + fond,
      projecteur ? "box-shadow:0 0 0 9999px rgba(15,23,42,0.42)" : "",
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
    "position:fixed", "z-index:2147483647", "pointer-events:none",
    "background:#1E5F8C", "color:#fff",
    "font:600 13px/1.25 system-ui,-apple-system,sans-serif",
    "padding:8px 14px", "border-radius:8px", "white-space:nowrap",
    "box-shadow:0 4px 14px rgba(15,23,42,.45)",
    "display:none",
  ].join(";")

  // Bandeau d'etat, en haut de la page
  var bandeau = document.createElement("div")
  bandeau.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0",
    "z-index:2147483647", "pointer-events:none",
    "background:#1E5F8C", "color:#fff",
    "font:600 12px/1.3 system-ui,-apple-system,sans-serif",
    "padding:8px 12px", "text-align:center",
    "display:none",
  ].join(";")

  function poser() {
    if (!document.body) return false
    document.body.appendChild(cadre)
    document.body.appendChild(cadreChoix)
    document.body.appendChild(etiquette)
    document.body.appendChild(bandeau)
    return true
  }
  if (!poser()) document.addEventListener("DOMContentLoaded", poser)

  function afficherBandeau(texte, couleur, duree) {
    bandeau.textContent = texte
    bandeau.style.background = couleur
    bandeau.style.display = "block"
    if (duree) {
      setTimeout(function () {
        if (!modeSelection) bandeau.style.display = "none"
      }, duree)
    }
  }

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

  // =======================================================
  // CHANGEMENT DE MODE
  // =======================================================

  function appliquerMode(actif) {
    modeSelection = actif
    document.documentElement.style.cursor = actif ? "crosshair" : ""

    if (actif) {
      var zones = document.querySelectorAll(SELECTEUR).length
      if (zones > 0) {
        afficherBandeau("Touchez un élément pour le modifier", "#1E5F8C")
      } else {
        afficherBandeau("Aucun élément modifiable sur cette page", "#B45309")
      }
    } else {
      bandeau.style.display = "none"
      masquerSurvol()
      choisi = null
      cadreChoix.style.display = "none"
    }
  }

  // =======================================================
  // DESIGNATION D'UN ELEMENT
  // =======================================================

  function designer(el) {
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
  }

  // =======================================================
  // GESTES : souris, doigt et stylet au meme endroit
  // =======================================================

  var depart = null      // position du debut du geste
  var estUnDoigt = false

  document.addEventListener(
    "pointermove",
    function (e) {
      // Le survol n'a de sens qu'a la souris
      if (!modeSelection || !rubriques.length) return
      if (e.pointerType && e.pointerType !== "mouse") return

      var el = cibleDe(e.target, e.clientX, e.clientY)
      if (el === survole) return
      survole = el
      if (!el) return masquerSurvol()
      surligner(el, "\u270F\uFE0F  " + nomDe(el))
    },
    true
  )

  document.addEventListener(
    "pointerdown",
    function (e) {
      if (!modeSelection || !rubriques.length) return

      depart = { x: e.clientX, y: e.clientY }
      estUnDoigt = e.pointerType && e.pointerType !== "mouse"

      var el = cibleDe(e.target, e.clientX, e.clientY)
      if (!el) return
      survole = el
      surligner(el, "\u270F\uFE0F  " + nomDe(el))
    },
    true
  )

  document.addEventListener(
    "pointerup",
    function (e) {
      if (!modeSelection || !rubriques.length) return
      if (!depart) return

      var glissement = Math.sqrt(
        Math.pow(e.clientX - depart.x, 2) + Math.pow(e.clientY - depart.y, 2)
      )
      depart = null

      // Le doigt a glisse : c'etait un defilement, pas un choix
      if (estUnDoigt && glissement > 12) return masquerSurvol()

      var el = cibleDe(e.target, e.clientX, e.clientY)
      if (el) designer(el)
    },
    true
  )

  document.addEventListener("pointercancel", function () {
    depart = null
    if (modeSelection) masquerSurvol()
  })

  // Le clic ne sert plus qu'a empecher la navigation
  document.addEventListener(
    "click",
    function (e) {
      if (!modeSelection || !rubriques.length) return
      e.preventDefault()
      e.stopPropagation()
    },
    true
  )

  // Le cadre suit la page qui defile ou change de taille
  window.addEventListener("scroll", function () {
    if (!modeSelection) return
    if (survole) surligner(survole, etiquette.textContent)
    montrerChoix()
  })
  window.addEventListener("resize", montrerChoix)

  // =======================================================
  // MESSAGES VENUS DE MON CMS
  // =======================================================

  window.addEventListener("message", function (e) {
    // On identifie l'editeur par la signature de ses messages,
    // pas par son adresse : celle-ci varie selon le deploiement.
    var d = e.data
    if (!d || d.source !== "mon-cms") return

    if (d.type === "mode") {
      appliquerMode(!!d.actif)
      return
    }

    // Contenu pousse par l'editeur : affichage immediat
    if (d.type === "contenu") {
      if (typeof window.CMS_APPLIQUER === "function") {
        window.CMS_APPLIQUER({ sections: d.sections })
      }
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

  // =======================================================
  // CHARGEMENT DES NOMS DE RUBRIQUES ET DE CHAMPS
  // =======================================================

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

      // Le pont se signale brievement : sans ce message, c'est qu'il
      // n'a pas demarre dans le cadre.
      afficherBandeau(
        "Éditeur connecté · " +
          document.querySelectorAll(SELECTEUR).length +
          " éléments modifiables",
        "#15803D",
        4000
      )
    })
    .catch(function () {
      afficherBandeau("Contenu du site introuvable", "#B91C1C", 6000)
    })
})()
