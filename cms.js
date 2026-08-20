/* =========================================================
   cms.js — Moteur de contenu de Mon CMS
   ---------------------------------------------------------
   Le contenu du site vient du fichier content.json. Chaque
   element de la page indique ce qu'il doit afficher grace a
   un attribut, sans aucun code specifique a la page :

     data-cms-text="rubrique.champ"     texte simple
     data-cms-html="rubrique.champ"     texte pouvant contenir du HTML
     data-cms-img="rubrique.champ"      photo (attribut src)
     data-cms-bg="rubrique.champ"       photo en image de fond
     data-cms-href="rubrique.champ"     adresse d'un lien
     data-cms-tel="rubrique.champ"      lien telephone (tel:)
     data-cms-mail="rubrique.champ"     lien email (mailto:)
     data-cms-wa="rubrique.champ"       lien WhatsApp
     data-cms-gallery="rubrique.champ"  galerie de photos
     data-cms-list="rubrique.champ"     liste de lignes

   Pour les listes, data-cms-list-style precise la mise en forme :
     tarif      ligne intitule / prix (page Infos)
     offre      element de liste avec prix a droite
     etiquette  petite pastille
     paragraphe une ligne de texte par element
     check      puce avec intitule en gras suivi d'une explication
     etape      bloc titre + explication
     faq        question repliable
     carte      encadre titre + texte
   ========================================================= */

/*
 * Le depot est indique sur la balise qui charge ce fichier :
 *   <script defer src="cms.js" data-cms-repo="ZiToon34/geysse"></script>
 *
 * Le meme cms.js sert ainsi a tous les sites, sans modification.
 * Sans cet attribut, les fichiers sont lus depuis le site lui-meme.
 */
const BALISE = document.querySelector("script[data-cms-repo]")
const DEPOT = BALISE ? BALISE.dataset.cmsRepo : null
const BRANCHE = (BALISE && BALISE.dataset.cmsBranch) || "main"

const RAW = (chemin) =>
  DEPOT
    ? `https://raw.githubusercontent.com/${DEPOT}/${BRANCHE}/${chemin}?t=${Date.now()}`
    : `${chemin}?t=${Date.now()}`

/** Adresse publique d'une photo du dossier images/ */
function img(fichier) {
  return RAW(`images/${fichier}`)
}

let CMS = null

/**
 * Lit une valeur du content.json a partir d'un chemin "rubrique.champ".
 * Renvoie undefined si la rubrique ou le champ n'existe pas.
 */
function valeur(chemin) {
  if (!CMS || !chemin) return undefined
  const [rubriqueId, champId] = chemin.split(".")
  const rubrique = CMS.sections.find((s) => s.id === rubriqueId)
  if (!rubrique) return undefined
  const champ = rubrique.fields.find((f) => f.id === champId)
  return champ ? champ.value : undefined
}

/** Echappe le texte avant insertion dans du HTML genere */
function echapper(texte) {
  const d = document.createElement("div")
  d.textContent = texte == null ? "" : String(texte)
  return d.innerHTML
}

/** Numero au format international, pour les liens WhatsApp */
function numeroInternational(tel) {
  return String(tel).replace(/[^0-9]/g, "").replace(/^0/, "33")
}

// ---------------------------------------------------------
// APPLICATION DU CONTENU
// ---------------------------------------------------------

function appliquerTextes() {
  document.querySelectorAll("[data-cms-text]").forEach((el) => {
    const v = valeur(el.dataset.cmsText)
    if (v !== undefined && v !== "") el.textContent = v
  })

  document.querySelectorAll("[data-cms-html]").forEach((el) => {
    const v = valeur(el.dataset.cmsHtml)
    if (v !== undefined && v !== "") el.innerHTML = v
  })
}

function appliquerImages() {
  document.querySelectorAll("[data-cms-img]").forEach((el) => {
    const v = valeur(el.dataset.cmsImg)
    if (v) el.src = img(v)
  })

  document.querySelectorAll("[data-cms-bg]").forEach((el) => {
    const v = valeur(el.dataset.cmsBg)
    if (v) el.style.backgroundImage = `url('${img(v)}')`
  })
}

function appliquerLiens() {
  document.querySelectorAll("[data-cms-href]").forEach((el) => {
    const v = valeur(el.dataset.cmsHref)
    if (v) el.href = v
  })

  document.querySelectorAll("[data-cms-tel]").forEach((el) => {
    const v = valeur(el.dataset.cmsTel)
    if (v) el.href = `tel:${String(v).replace(/[^0-9+]/g, "")}`
  })

  document.querySelectorAll("[data-cms-mail]").forEach((el) => {
    const v = valeur(el.dataset.cmsMail)
    if (v) el.href = `mailto:${v}`
  })

  document.querySelectorAll("[data-cms-wa]").forEach((el) => {
    const v = valeur(el.dataset.cmsWa)
    if (!v) return
    const message = valeur("page_contact.wa_message") || ""
    el.href =
      `https://wa.me/${numeroInternational(v)}` +
      (message ? `?text=${encodeURIComponent(message)}` : "")
  })
}

function appliquerGaleries() {
  document.querySelectorAll("[data-cms-gallery]").forEach((el) => {
    const photos = valeur(el.dataset.cmsGallery)
    if (!Array.isArray(photos) || photos.length === 0) return

    const alt = el.dataset.cmsAlt || "Photo"
    el.innerHTML = photos
      .map(
        (p, i) =>
          `<img src="${img(p)}" alt="${echapper(alt)} ${i + 1}" loading="lazy" decoding="async">`
      )
      .join("")
  })
}

function appliquerListes() {
  document.querySelectorAll("[data-cms-list]").forEach((el) => {
    const lignes = valeur(el.dataset.cmsList)
    if (!Array.isArray(lignes)) return

    const style = el.dataset.cmsListStyle || "offre"

    el.innerHTML = lignes
      .map((ligne) => {
        const intitule = echapper(ligne.label || "")
        const val = echapper(ligne.valeur || "")

        if (style === "tarif") {
          return `<div class="tarif-item"><span>${intitule}</span><span>${val}</span></div>`
        }
        if (style === "check") {
          // <li><strong>Titre</strong> — description</li>
          return `<li><strong>${intitule}</strong>${val ? ` \u2014 ${val}` : ""}</li>`
        }
        if (style === "etape") {
          // Bloc numerote : titre + explication
          return `<div class="gg-step"><h3>${intitule}</h3><p>${val}</p></div>`
        }
        if (style === "faq") {
          // Question repliable
          return `<details><summary>${intitule}</summary><p>${val}</p></details>`
        }
        if (style === "carte") {
          return `<div class="gg-card"><h3>${intitule}</h3><p>${val}</p></div>`
        }
        if (style === "etiquette") {
          return `<span class="spec-tag">${intitule}</span>`
        }
        if (style === "paragraphe") {
          return `<p>${intitule}${val ? ` <strong>${val}</strong>` : ""}</p>`
        }
        // style "offre" par defaut
        return `<li>${intitule}${val ? `<span>${val}</span>` : ""}</li>`
      })
      .join("")
  })
}

/** Applique tout le contenu a la page */
function appliquerContenu() {
  appliquerTextes()
  appliquerImages()
  appliquerLiens()
  appliquerGaleries()
  appliquerListes()
}

// ---------------------------------------------------------
// CHARGEMENT
// ---------------------------------------------------------

async function chargerCMS() {
  try {
    const reponse = await fetch(RAW("content.json"))
    CMS = await reponse.json()

    // Accessible depuis la page pour les cas particuliers
    window.CMS_DATA = CMS

    appliquerContenu()
  } catch (err) {
    // Le site garde alors les textes ecrits dans le HTML
    console.warn("Contenu non charge", err)
  } finally {
    // Signal conserve pour la compatibilite avec les scripts existants
    document.dispatchEvent(new Event("cms:ready"))
  }
}

chargerCMS()
