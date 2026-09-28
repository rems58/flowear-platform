# Entraîner une IA dans un domaine (Teinty en skincare, par exemple)

On n'entraîne pas le modèle lui-même : ça coûte cher, ça fige les connaissances et ça
ne se corrige pas. On entraîne l'IA par **quatre leviers**, tous dans son dossier
`src/apps/<slug>/`, sans toucher au cœur. Une IA forte dans son domaine = les quatre
bien remplis.

## 1. La persona (le « qui »)

`manifest.ts` → `persona.system`. C'est le métier, la méthode et le ton. Pour Teinty :
« Tu es une conseillère skincare formée à la cosmétologie... tu raisonnes en trois
temps : type de peau, problème principal, routine minimale... tu ne prescris jamais, tu
renvoies vers un dermatologue pour... ». Ajouter `boundaries` : ce qu'elle refuse.

Règle : décrire une façon de raisonner, pas une liste de sujets. Le modèle sait déjà ce
qu'est le rétinol ; il ne sait pas comment TOI tu veux qu'il conseille.

## 2. La base de connaissances (le « quoi », le plus gros levier)

Dossier `src/apps/<slug>/knowledge/`, fichiers Markdown, un titre par sujet précis.
À chaque question, les passages les plus proches sont injectés dans le prompt, et l'IA
peut fouiller le reste avec le tool `search_knowledge`. Tout est lexical, local, gratuit.

Ce qui marche : des faits, des chiffres, des règles, des pièges, des protocoles.
`## Rétinol et peau sensible` → « commencer à 0,1 %, deux soirs par semaine, jamais
avec un acide le même soir, crème par-dessus ». Dix fichiers de vingt sections valent
mieux qu'un fichier de cent pages. Le titre compte autant que le texte.

Sources pour Teinty : ingrédients et concentrations, routines par type de peau et par
problème, incompatibilités, ordre d'application, erreurs fréquentes, produits par budget,
vocabulaire marketing à décoder. Écrit à la main, ou généré puis relu : c'est ton
« jugement » qui fait la différence, pas le volume.

Pour désactiver : `knowledge: { enabled: false }` dans le manifeste. `topK` règle le
nombre de passages injectés (3 par défaut).

## 3. Les tools spécifiques (le « faire »)

`src/apps/<slug>/tools/*.ts` avec `defineTool`, enregistrés dans le manifeste
(`tools.enabled`). Pour Teinty : `analyse_routine` (prend la liste de produits, renvoie
conflits et ordre), `fiche_ingredient`, plus tard `price_lookup` avec la recherche web.
Un tool = une capacité que le texte seul ne donne pas.

## 4. L'onboarding (le « pour qui »)

`onboarding.questions` : trois questions qui changent réellement la réponse. Teinty :
type de peau, problème principal, budget mensuel. Le profil est injecté dans chaque
réponse comme source fiable.

## Ce que le cœur fait déjà pour toutes les IA

- Mémoire persistante : profil, souvenirs (notés par l'IA, extraits automatiquement après
  chaque échange par le petit modèle, ou ajoutés par la personne), productions. Page
  `/<slug>/memoire` pour corriger ou oublier. Tout est réinjecté dans le prompt.
- Dictée vocale dans le composeur (API Web Speech du navigateur, aucun serveur).
- Repli entre fournisseurs, quotas, sécurité, cartes fiche et comparatif.

## Recette : créer Teinty

1. `src/apps/teinty/manifest.ts` : copier `remy/manifest.ts`, changer slug, nom, brand,
   persona, questions, `access: 'public'`.
2. `src/apps/teinty/knowledge/*.md` : dix fichiers, un sujet par section.
3. `src/apps/registry.ts` : une ligne.
4. Tester dix vraies questions de skincare, lire les passages injectés (admin, phase 3),
   compléter la base là où l'IA a été vague.
5. Répéter le point 4 chaque semaine avec les questions réelles des utilisateurs :
   c'est ça, l'entraînement continu.
